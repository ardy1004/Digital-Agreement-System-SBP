import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cobrokerApi } from '../../utils/api';
import { IMAGE_URLS, imageUrlToBase64 } from '../../utils/referral';
import { renderPdfBase64 } from '../../utils/pdf';
import { PERNYATAAN_COBROKER } from '../../utils/cobroker';
import CobrokerDocument from '../../components/CobrokerDocument';
import { Loader2, Eraser, CheckCircle, AlertTriangle, ArrowDown } from 'lucide-react';

// Halaman TTD co-broker: isi rekening → centang pernyataan → TTD di atas
// materai → Kirim. PDF dibuat di browser dari CobrokerDocument (hanya elemen
// itu yang masuk PDF) lalu disimpan server ke R2.

const TAHUN = new Date().getFullYear();

const kartu = {
  width: 794, maxWidth: '100%', boxSizing: 'border-box', background: 'white',
  padding: 24, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontFamily: 'system-ui, sans-serif',
};

function normalisasiNama(s) {
  return (s || '').toUpperCase().replace(/[^A-Z]/g, '');
}

function Layar({ ikon, warna, judul, teks, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ width: 64, height: 64, background: warna, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          {ikon}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>{judul}</h2>
        <p style={{ color: '#4b5563', marginBottom: 16 }}>{teks}</p>
        {children}
      </div>
    </div>
  );
}

export default function CobrokerSigningPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sigCanvasRef = useRef(null);
  const docRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [images, setImages] = useState({ logo: null, materai: null, agentSignature: null });
  const [imagesReady, setImagesReady] = useState(false);
  const [bank, setBank] = useState({ bank_name: '', bank_account_number: '', bank_account_holder: '' });
  const [consents, setConsents] = useState(() => PERNYATAAN_COBROKER.map(() => false));
  const [submitError, setSubmitError] = useState('');

  const queryKey = ['cobroker-token', token];
  const { data: cb, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => cobrokerApi.getByToken(token).then((r) => r.data.data),
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

  const clearSignature = () => {
    sigCanvasRef.current?.clear();
    setHasSignature(false);
  };

  const handleEnd = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) setHasSignature(true);
  };

  const handleBankChange = (e) => {
    const { name, value } = e.target;
    setBank((p) => ({ ...p, [name]: value }));
  };

  const toggleConsent = (i) => setConsents((p) => p.map((v, idx) => (idx === i ? !v : v)));

  const bankComplete = Boolean(bank.bank_name.trim() && bank.bank_account_number.trim() && bank.bank_account_holder.trim());
  const allConsented = consents.every(Boolean);
  const canSubmit = bankComplete && allConsented && hasSignature && !isProcessing;
  const nameMismatch = bank.bank_account_holder.trim()
    && normalisasiNama(bank.bank_account_holder) !== normalisasiNama(cb?.partner_name);

  const keKotakTtd = () => document.getElementById('ttd-cobroker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const handleSign = async () => {
    if (!bankComplete) { alert('Silakan lengkapi data rekening terlebih dahulu'); return; }
    if (!allConsented) { alert('Silakan centang semua pernyataan'); return; }
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) { alert('Silakan tanda tangan terlebih dahulu'); return; }

    const docElement = docRef.current;
    if (!docElement) { alert('Dokumen belum siap, silakan tunggu sebentar lalu coba lagi.'); return; }

    setIsProcessing(true);
    setSubmitError('');
    try {
      await new Promise((r) => setTimeout(r, 100));
      const pdfBase64 = await renderPdfBase64(docElement, { nomor: cb.agreement_number });
      const res = await cobrokerApi.sign(token, {
        bank_name: bank.bank_name.trim(),
        bank_account_number: bank.bank_account_number.trim(),
        bank_account_holder: bank.bank_account_holder.trim(),
        consent_accepted: true,
        pdf_base64: pdfBase64,
      });
      // Halaman sukses memakai query yang sama → isi dari respons
      if (res.data?.data) queryClient.setQueryData(queryKey, res.data.data);
      navigate(`/cobrokers/success/${token}`);
    } catch (err) {
      console.error('Signing error:', err);
      setSubmitError(err.response?.data?.error || 'Terjadi kesalahan saat memproses dokumen. Silakan coba lagi.');
      setIsProcessing(false);
    }
  };

  if (isLoading || !imagesReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: 48, height: 48, animation: 'spin 1s linear infinite', color: '#2563eb', margin: '0 auto 16px' }} />
          <p style={{ color: '#4b5563' }}>Memuat dokumen...</p>
        </div>
        <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (error || !cb) {
    return (
      <Layar ikon={<span style={{ color: '#dc2626', fontSize: 24, fontWeight: 'bold' }}>!</span>} warna="#fee2e2"
        judul="Link Tidak Valid" teks={error?.response?.data?.error || 'Dokumen tidak ditemukan.'} />
    );
  }

  if (cb.status === 'signed') {
    return (
      <Layar ikon={<CheckCircle style={{ width: 32, height: 32, color: '#16a34a' }} />} warna="#dcfce7"
        judul="Dokumen Sudah Ditandatangani" teks="Perjanjian ini telah ditandatangani sebelumnya.">
        <a href={`/cobrokers/success/${token}`} style={{ display: 'inline-block', padding: '8px 24px', background: '#2563eb', color: 'white', borderRadius: 8, textDecoration: 'none' }}>Lihat Status</a>
      </Layar>
    );
  }

  if (cb.status !== 'sent') {
    return (
      <Layar ikon={<span style={{ color: '#6b7280', fontSize: 24, fontWeight: 'bold' }}>…</span>} warna="#f3f4f6"
        judul="Dokumen Belum Siap" teks="Perjanjian ini belum dikirim untuk ditandatangani." />
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: 14, boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 };

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', padding: '32px 16px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* Tengah di layar lebar; di HP mulai dari kiri agar dokumen 794px tidak terpotong di sisi kiri */
        .sign-column > * { margin-left: auto; margin-right: auto; }`}</style>

      {/* Overlay loading — dokumen tetap di-mount agar docRef tidak null */}
      {isProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ textAlign: 'center', background: 'white', padding: '40px 48px', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <Loader2 style={{ width: 56, height: 56, animation: 'spin 1s linear infinite', color: '#2563eb', margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Sedang memproses dokumen</h2>
            <p style={{ color: '#4b5563', fontSize: 13 }}>Mohon tunggu, jangan tutup halaman ini...</p>
          </div>
        </div>
      )}

      <div className="sign-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 24 }}>

        {/* ====== LANGKAH 1-2: REKENING & PERNYATAAN (TIDAK MASUK PDF) ====== */}
        <div style={kartu}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Perjanjian Kerja Sama Co-Broker</h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            Halo <strong>{cb.partner_name}</strong>, silakan baca dokumen di bawah sampai selesai, lalu:
            (1) isi data rekening untuk pembayaran bagi hasil, (2) centang semua pernyataan,
            (3) tanda tangan di atas materai di bagian akhir dokumen, dan (4) tekan <strong>Kirim</strong>.
          </p>

          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>1. Data Rekening</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 8 }}>
            <div>
              <label style={labelStyle} htmlFor="bank_name">Nama Bank *</label>
              <input id="bank_name" name="bank_name" value={bank.bank_name} onChange={handleBankChange} placeholder="Contoh: BCA" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="bank_account_number">No. Rekening *</label>
              <input id="bank_account_number" name="bank_account_number" value={bank.bank_account_number} onChange={handleBankChange} inputMode="numeric" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="bank_account_holder">Atas Nama *</label>
              <input id="bank_account_holder" name="bank_account_holder" value={bank.bank_account_holder} onChange={handleBankChange} style={inputStyle} />
            </div>
          </div>
          {nameMismatch && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 8 }}>
              <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
              <span>Nama pemilik rekening berbeda dengan nama di perjanjian (<strong>{cb.partner_name}</strong>). Pastikan rekening sudah benar.</span>
            </div>
          )}

          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: '16px 0 8px' }}>2. Pernyataan</div>
          {PERNYATAAN_COBROKER.map((t, i) => (
            <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#374151', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={consents[i]} onChange={() => toggleConsent(i)} data-pernyataan={i}
                style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
              <span>{t}</span>
            </label>
          ))}

          <button onClick={keKotakTtd} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 16px',
            background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            <ArrowDown style={{ width: 16, height: 16 }} /> Ke kotak tanda tangan
          </button>
        </div>

        {/* ====== DOKUMEN A4 (HANYA INI YANG MASUK PDF) ====== */}
        <CobrokerDocument
          docRef={docRef}
          data={cb}
          bank={bank}
          consents={consents}
          images={images}
          aktif
          sigCanvasRef={sigCanvasRef}
          onEnd={handleEnd}
        />

        {/* ====== KONTROL (TIDAK MASUK PDF) ====== */}
        <div style={kartu}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ color: bankComplete ? '#16a34a' : '#9ca3af' }}>{bankComplete ? '✓' : '○'} Data rekening lengkap</span>
            <span style={{ color: allConsented ? '#16a34a' : '#9ca3af' }}>{allConsented ? '✓' : '○'} Semua pernyataan dicentang</span>
            <span style={{ color: hasSignature ? '#16a34a' : '#9ca3af' }}>{hasSignature ? '✓' : '○'} Tanda tangan di atas materai</span>
          </div>
          {submitError && <p style={{ textAlign: 'center', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{submitError}</p>}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button onClick={clearSignature} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            }}>
              <Eraser style={{ width: 16, height: 16 }} /> Hapus Tanda Tangan
            </button>
            <button onClick={handleSign} disabled={!canSubmit} data-aksi="kirim-ttd" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
              background: canSubmit ? '#2563eb' : '#93c5fd', color: 'white', border: 'none', borderRadius: 8,
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
            }}>
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
