import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { kuitansiApi } from '../../utils/api';
import { IMAGE_URLS, imageUrlToBase64 } from '../../utils/referral';
import { renderPdfBase64 } from '../../utils/pdf';
import { formatDateTime } from '../../utils/format';
import { adaKetentuan, labelJenis, rp, urlVerifikasi, qrDataUrl } from '../../utils/kuitansi';
import KuitansiDocument from '../../components/KuitansiDocument';
import { Loader2, Eraser, CheckCircle, ArrowDown, Ban } from 'lucide-react';

// Halaman TTD kuitansi. Satu halaman untuk dua peran (ditentukan token):
//   payer : klien (penyetor) — menyetujui ketentuan / data pembayaran
//   owner : pemilik (penerima, mode penerima pemilik) — menyatakan sudah menerima uang
// Penanda tangan TERAKHIR membuat PDF final berisi semua tanda tangan.

const TAHUN = new Date().getFullYear();

const kartu = {
  width: 794, maxWidth: '100%', boxSizing: 'border-box', background: 'white', padding: 24,
  borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontFamily: 'system-ui, sans-serif',
};
const tombol = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};

function Layar({ ikon, warna, judul, teks, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ width: 64, height: 64, background: warna, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>{ikon}</div>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>{judul}</h2>
        <p style={{ color: '#4b5563', marginBottom: 16 }}>{teks}</p>
        {children}
      </div>
    </div>
  );
}

export default function KuitansiSigningPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sigCanvasRef = useRef(null);
  const docRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [setuju, setSetuju] = useState(false);
  const [waktuSaya, setWaktuSaya] = useState(null);
  const [aset, setAset] = useState(null); // { images, qr, bukti }
  const [galat, setGalat] = useState('');

  const queryKey = ['kuitansi-token', token];
  const { data: k, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => kuitansiApi.getByToken(token).then((r) => r.data.data),
    enabled: !!token,
    retry: 0,
  });

  const verifyToken = k?.verify_token;
  const adaBukti = Boolean(k?.has_bukti);

  // Gambar sebagai base64 supaya html2canvas tidak kena CORS / gambar belum termuat
  useEffect(() => {
    if (!verifyToken) return undefined;
    let batal = false;
    Promise.all([
      imageUrlToBase64(IMAGE_URLS.logo),
      imageUrlToBase64(IMAGE_URLS.materai),
      imageUrlToBase64(IMAGE_URLS.agentSignature),
      qrDataUrl(urlVerifikasi(verifyToken)),
      adaBukti ? imageUrlToBase64(kuitansiApi.buktiUrlToken(token)) : null,
    ]).then(([logo, materai, agentSignature, qr, bukti]) => {
      if (!batal) setAset({ images: { logo, materai, agentSignature }, qr, bukti });
    });
    return () => { batal = true; };
  }, [token, verifyToken, adaBukti]);

  const handleEnd = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) setHasSignature(true);
  };
  const hapusTtd = () => {
    sigCanvasRef.current?.clear();
    setHasSignature(false);
  };
  const keKotak = () => sigCanvasRef.current?.getCanvas()?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (isLoading || (k && !aset && k.status === 'sent')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: 48, height: 48, animation: 'spin 1s linear infinite', color: '#2563eb', margin: '0 auto 16px' }} />
          <p style={{ color: '#4b5563' }}>Memuat kuitansi...</p>
        </div>
        <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (error || !k) {
    return <Layar ikon={<span style={{ color: '#dc2626', fontSize: 24, fontWeight: 'bold' }}>!</span>} warna="#fee2e2"
      judul="Link Tidak Valid" teks={error?.response?.data?.error || 'Kuitansi tidak ditemukan.'} />;
  }

  if (k.status === 'void') {
    return <Layar ikon={<Ban style={{ width: 30, height: 30, color: '#dc2626' }} />} warna="#fee2e2"
      judul="Kuitansi Dibatalkan" teks={`Kuitansi ${k.nomor || ''} sudah dibatalkan dan tidak berlaku lagi. Silakan hubungi Salam Bumi Property.`} />;
  }

  if (k.status === 'signed') {
    return (
      <Layar ikon={<CheckCircle style={{ width: 32, height: 32, color: '#16a34a' }} />} warna="#dcfce7"
        judul="Kuitansi Sudah Lengkap" teks="Kuitansi ini sudah ditandatangani semua pihak.">
        <a href={`/kuitansi/success/${token}`} style={{ display: 'inline-block', padding: '8px 24px', background: '#2563eb', color: 'white', borderRadius: 8, textDecoration: 'none' }}>Lihat & Unduh PDF</a>
      </Layar>
    );
  }

  const role = k.role;
  const saya = role === 'payer'
    ? { nama: k.payer_name, sudah: k.payer_signed_at }
    : { nama: k.owner_name, sudah: k.owner_signed_at };
  const lainPerlu = role === 'payer' ? k.perlu_pemilik : k.perlu_klien;
  const lainSudah = Boolean(role === 'payer' ? k.owner_signed_at : k.payer_signed_at);
  const namaLain = role === 'payer' ? `${k.owner_name} (pemilik)` : `${k.payer_name} (penyetor)`;

  if (saya.sudah) {
    return (
      <Layar ikon={<CheckCircle style={{ width: 32, height: 32, color: '#16a34a' }} />} warna="#dcfce7"
        judul="Tanda Tangan Anda Sudah Tersimpan"
        teks={`Ditandatangani ${formatDateTime(saya.sudah)}. ${lainPerlu && !lainSudah ? `Menunggu tanda tangan ${namaLain}; PDF tersedia setelah semua pihak menandatangani.` : ''}`} />
    );
  }

  const pernyataan = role === 'owner'
    ? `Saya, ${k.owner_name}, menyatakan telah menerima uang sejumlah ${rp(k.amount)} dari ${k.payer_name} sebagaimana tercantum dalam kuitansi ini.`
    : adaKetentuan(k)
      ? `Saya, ${k.payer_name}, telah membaca dan menyetujui ketentuan dalam kuitansi ini.`
      : `Saya, ${k.payer_name}, menyatakan data pembayaran dalam kuitansi ini benar.`;
  const bisaKirim = hasSignature && setuju && !isProcessing;

  const kirim = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) { alert('Silakan tanda tangan terlebih dahulu'); return; }
    if (!setuju) { alert('Centang pernyataan terlebih dahulu'); return; }
    const docEl = docRef.current;
    if (!docEl) { alert('Dokumen belum siap, coba lagi.'); return; }

    setIsProcessing(true);
    setGalat('');
    try {
      const signaturePng = sigCanvasRef.current.getCanvas().toDataURL('image/png');
      const terakhir = !lainPerlu || lainSudah;
      setWaktuSaya(new Date());
      await new Promise((r) => setTimeout(r, 150));
      const pdf = terakhir ? await renderPdfBase64(docEl, { nomor: k.nomor }) : undefined;
      const res = await kuitansiApi.sign(token, {
        signature_png: signaturePng, statement: true, other_signed: lainSudah, pdf_base64: pdf,
      });
      if (res.data?.data) queryClient.setQueryData(queryKey, res.data.data);
      navigate(`/kuitansi/success/${token}`);
    } catch (err) {
      setWaktuSaya(null);
      setIsProcessing(false);
      if (err.response?.status === 409) {
        // Pihak lain baru saja TTD → muat ulang; coretan di kanvas tetap ada
        alert(err.response.data?.error || 'Pihak lain baru saja menandatangani. Dokumen dimuat ulang.');
        await queryClient.invalidateQueries({ queryKey });
        return;
      }
      setGalat(err.response?.data?.error || 'Terjadi kesalahan saat memproses kuitansi. Silakan coba lagi.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', padding: '32px 16px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sign-column > * { margin-left: auto; margin-right: auto; }`}</style>

      {isProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ textAlign: 'center', background: 'white', padding: '40px 48px', borderRadius: 16 }}>
            <Loader2 style={{ width: 56, height: 56, animation: 'spin 1s linear infinite', color: '#2563eb', margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Sedang memproses kuitansi</h2>
            <p style={{ color: '#4b5563', fontSize: 13 }}>Mohon tunggu, jangan tutup halaman ini...</p>
          </div>
        </div>
      )}

      <div className="sign-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 24 }}>
        <div style={kartu}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
            Kuitansi {labelJenis(k)} — {rp(k.amount)}
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Halo <strong>{saya.nama}</strong>, silakan baca kuitansi di bawah, centang pernyataan, lalu tanda tangan
            {role === 'owner' ? ' di atas materai pada kotak Penerima' : ' pada kotak Penyetor'} dan tekan <strong>Kirim</strong>.
            {lainPerlu && (lainSudah
              ? ` ${namaLain} sudah menandatangani.`
              : ` ${namaLain} juga akan menandatangani lewat link-nya sendiri.`)}
          </p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#1f2937' }}>
            <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} data-pernyataan="kuitansi"
              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
            <span>{pernyataan}</span>
          </label>
          <button onClick={keKotak} style={{ ...tombol, marginTop: 12, background: '#2563eb', color: 'white', padding: '8px 16px' }}>
            <ArrowDown style={{ width: 16, height: 16 }} /> Ke kotak tanda tangan
          </button>
        </div>

        <KuitansiDocument
          docRef={docRef}
          data={k}
          images={aset.images}
          qr={aset.qr}
          buktiSrc={aset.bukti}
          aktif={role}
          sigCanvasRef={sigCanvasRef}
          onEnd={handleEnd}
          waktuSaya={waktuSaya}
        />

        <div style={kartu}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ color: setuju ? '#16a34a' : '#9ca3af' }}>{setuju ? '✓' : '○'} Pernyataan dicentang</span>
            <span style={{ color: hasSignature ? '#16a34a' : '#9ca3af' }}>{hasSignature ? '✓' : '○'} Tanda tangan</span>
          </div>
          {galat && <p style={{ textAlign: 'center', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{galat}</p>}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button onClick={hapusTtd} style={{ ...tombol, background: '#f3f4f6', color: '#374151', fontWeight: 400 }}>
              <Eraser style={{ width: 16, height: 16 }} /> Hapus
            </button>
            <button onClick={kirim} disabled={!bisaKirim} data-aksi="kirim-ttd"
              style={{ ...tombol, background: bisaKirim ? '#2563eb' : '#93c5fd', color: 'white', cursor: bisaKirim ? 'pointer' : 'not-allowed' }}>
              <CheckCircle style={{ width: 16, height: 16 }} /> Kirim
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 9, paddingBottom: 16 }}>
          CV Salam Bumi Property &copy; {TAHUN} | Dokumen ini dilindungi oleh sistem digital agreement
        </p>
      </div>
    </div>
  );
}
