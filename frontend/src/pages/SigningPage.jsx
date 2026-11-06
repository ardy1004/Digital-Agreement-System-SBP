import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agreementApi } from '../utils/api';
import { IMAGE_URLS, imageUrlToBase64 } from '../utils/referral';
import { renderPdfBase64 } from '../utils/pdf';
import { formatDateTime } from '../utils/format';
import AgreementDocument from '../components/AgreementDocument';
import { daftarPenandaTangan, labelPenandaTangan } from '../utils/signers';
import { Loader2, Eraser, CheckCircle, ArrowDown } from 'lucide-react';

// Gambar diambil lewat /img-proxy di origin sendiri (Vite proxy saat dev,
// Worker di production) supaya html2canvas tidak kena CORS.

const kartu = {
  width: 794,
  maxWidth: '100%',
  boxSizing: 'border-box',
  background: 'white',
  padding: 20,
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
};

export default function SigningPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sigCanvasRef = useRef(null);
  const docRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  // Waktu TTD saya, dicetak di kotak saya saat PDF dibuat (server mencatat waktu resminya)
  const [waktuSaya, setWaktuSaya] = useState(null);
  const [images, setImages] = useState({ logo: null, materai: null, agentSignature: null });
  const [imagesReady, setImagesReady] = useState(false);

  const queryKey = ['agreement-token', token];
  const { data: agreement, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => agreementApi.getByToken(token).then((r) => r.data.data),
    enabled: !!token,
    retry: 0,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      imageUrlToBase64(IMAGE_URLS.logo),
      imageUrlToBase64(IMAGE_URLS.materai),
      imageUrlToBase64(IMAGE_URLS.agentSignature),
    ]).then(([logo, materai, agentSignature]) => {
      if (!cancelled) {
        setImages({ logo, materai, agentSignature });
        setImagesReady(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const signers = daftarPenandaTangan(agreement, agreement?.signers);
  const me = signers.find((s) => s.id && s.id === agreement?.me_id) || null;
  const total = signers.length;
  const banyak = total > 1;
  const idxSaya = me ? signers.indexOf(me) : -1;
  const belum = signers.filter((s) => s.status !== 'signed');
  const sayaSudah = me?.status === 'signed';

  const clearSignature = () => {
    sigCanvasRef.current?.clear();
    setHasSignature(false);
  };

  const handleEnd = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      setHasSignature(true);
    }
  };

  const keKotakSaya = () => {
    if (me) document.getElementById(`ttd-${me.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSign = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      alert('Silakan tanda tangan terlebih dahulu');
      return;
    }

    // Ambil referensi elemen SEKARANG, sebelum state berubah
    const docElement = docRef.current;
    if (!docElement || !me) {
      alert('Dokumen belum siap, silakan tunggu sebentar lalu coba lagi.');
      return;
    }

    setIsProcessing(true);

    try {
      // Kanvas penuh (bukan dipangkas) → saat ditampilkan ulang, posisinya
      // tepat sama di atas materai.
      const signaturePng = sigCanvasRef.current.getCanvas().toDataURL('image/png');

      // PDF final hanya dibuat oleh penanda tangan TERAKHIR — berisi semua TTD.
      const terakhir = belum.length === 1 && belum[0].id === me.id;

      setWaktuSaya(new Date());
      await new Promise((r) => setTimeout(r, 150));

      const pdfBase64 = terakhir
        ? await renderPdfBase64(docElement, { nomor: agreement.agreement_number })
        : undefined;

      const res = await agreementApi.sign(token, {
        signature_png: signaturePng,
        seen_version: agreement.seen_version,
        pdf_base64: pdfBase64,
      });

      // Halaman sukses memakai query yang sama; isi dari respons supaya ia tidak
      // sempat merender data sebelum TTD.
      if (res.data?.data) queryClient.setQueryData(queryKey, res.data.data);
      navigate(`/success/${token}`);
    } catch (err) {
      setWaktuSaya(null);
      setIsProcessing(false);
      if (err.response?.status === 409) {
        // Pihak lain baru saja TTD: muat ulang supaya TTD-nya ikut terlihat.
        // Coretan di kanvas tetap ada — cukup periksa lalu konfirmasi lagi.
        alert(err.response.data?.error || 'Pihak lain baru saja menandatangani. Dokumen dimuat ulang.');
        await queryClient.invalidateQueries({ queryKey });
        return;
      }
      console.error('Signing error:', err);
      alert(err.response?.data?.error || 'Terjadi kesalahan saat memproses dokumen. Silakan coba lagi.');
    }
  };

  if (isLoading || !imagesReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: 48, height: 48, animation: 'spin 1s linear infinite', color: '#2563eb', margin: '0 auto 16px' }} />
          <p style={{ color: '#4b5563' }}>Memuat dokumen...</p>
        </div>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ color: '#dc2626', fontSize: 24, fontWeight: 'bold' }}>!</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Link Tidak Valid</h2>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>{error?.response?.data?.error || 'Dokumen tidak ditemukan.'}</p>
          <a href="/" style={{ display: 'inline-block', padding: '8px 24px', background: '#2563eb', color: 'white', borderRadius: 8, textDecoration: 'none' }}>Kembali ke Beranda</a>
        </div>
      </div>
    );
  }

  if (agreement?.status === 'signed') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle style={{ width: 32, height: 32, color: '#16a34a' }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Dokumen Sudah Ditandatangani</h2>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>Perjanjian ini telah ditandatangani sebelumnya.</p>
          <a href={`/success/${token}`} style={{ display: 'inline-block', padding: '8px 24px', background: '#2563eb', color: 'white', borderRadius: 8, textDecoration: 'none' }}>Lihat Status</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', padding: '32px 16px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* Tengah di layar lebar; di HP mulai dari kiri agar dokumen 794px tidak terpotong di sisi kiri */
        .sign-column > * { margin-left: auto; margin-right: auto; }`}</style>

      {/* Overlay loading — dokumen tetap di-mount di DOM agar docRef tidak null */}
      {isProcessing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{ textAlign: 'center', background: 'white', padding: '40px 48px', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <Loader2 style={{ width: 56, height: 56, animation: 'spin 1s linear infinite', color: '#2563eb', margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Sedang memproses dokumen</h2>
            <p style={{ color: '#4b5563', fontSize: 13 }}>Mohon tunggu, jangan tutup halaman ini...</p>
          </div>
        </div>
      )}

      <div className="sign-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>

        {/* ====== INFO PENANDA TANGAN (TIDAK MASUK PDF) ====== */}
        {sayaSudah ? (
          <div style={{ ...kartu, marginBottom: 20, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>
              Tanda tangan Anda sudah tersimpan ({formatDateTime(me.signed_at)}).
            </p>
            <p style={{ color: '#15803d', fontSize: 13 }}>
              Menunggu tanda tangan: {belum.map((s) => s.name).join(', ')}. PDF perjanjian tersedia setelah semua pihak menandatangani.
            </p>
          </div>
        ) : banyak && (
          <div style={{ ...kartu, marginBottom: 20, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <p style={{ color: '#1e3a8a', marginBottom: 6 }}>
              Anda menandatangani sebagai <strong>{me.name}</strong> ({labelPenandaTangan(agreement, total, idxSaya)}).
            </p>
            <p style={{ color: '#1d4ed8', fontSize: 13, marginBottom: 12 }}>
              {total - belum.length} dari {total} pihak sudah menandatangani. Tanda tangan pihak lain yang sudah tersimpan terlihat di dokumen.
            </p>
            <button onClick={keKotakSaya} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>
              <ArrowDown style={{ width: 16, height: 16 }} /> Ke kotak tanda tangan saya
            </button>
          </div>
        )}

        {/* ====== A4 DOCUMENT (ONLY THIS GOES TO PDF) ====== */}
        <AgreementDocument
          docRef={docRef}
          agreement={agreement}
          signers={signers}
          images={images}
          meId={sayaSudah ? null : me.id}
          sigCanvasRef={sigCanvasRef}
          onEnd={handleEnd}
          waktuSaya={waktuSaya}
        />

        {/* ====== UI CONTROLS (NOT IN PDF) ====== */}
        {!sayaSudah && (
          <div style={{ ...kartu, marginTop: 24, padding: 24 }}>
            <p style={{ textAlign: 'center', color: '#666', marginBottom: 16, fontSize: 11 }}>
              {banyak
                ? `Silakan tanda tangani di atas materai pada kotak bernama ${me.name}`
                : 'Silakan tanda tangani di atas materai'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <button onClick={clearSignature} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11,
              }}>
                <Eraser style={{ width: 16, height: 16 }} /> Hapus
              </button>
              <button onClick={handleSign} disabled={!hasSignature || isProcessing} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
                background: hasSignature ? '#2563eb' : '#93c5fd', color: 'white', border: 'none', borderRadius: 8,
                cursor: hasSignature ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600,
              }}>
                <CheckCircle style={{ width: 16, height: 16 }} /> Konfirmasi Tanda Tangan
              </button>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 9, marginTop: 24, paddingBottom: 16 }}>
          CV Salam Bumi Property &copy; {new Date().getFullYear()} | Dokumen ini dilindungi oleh sistem digital agreement
        </p>
      </div>
    </div>
  );
}
