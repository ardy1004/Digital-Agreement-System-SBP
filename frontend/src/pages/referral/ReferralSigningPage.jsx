import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SignatureCanvas from 'react-signature-canvas';
import { referralApi } from '../../utils/api';
import { getCurrentDateIndonesian } from '../../utils/format';
import {
  CONSENT_ITEMS, IMAGE_URLS, PERCENT_WORDS,
  getReferralTypeLabel, imageUrlToBase64, generatePdfBase64, getLeads,
} from '../../utils/referral';
import { Loader2, Eraser, CheckCircle, AlertTriangle } from 'lucide-react';

// Gaya dokumen A4 — mengikuti SigningPage.jsx (perjanjian owner)
const S = {
  page: {
    width: 794,
    minHeight: 1123,
    padding: 40,
    background: 'white',
    fontFamily: "'Times New Roman', serif",
    fontSize: '12pt',
    lineHeight: 1.5,
    color: '#1a1a1a',
    position: 'relative',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  layer: { position: 'relative', zIndex: 1 },
  heading: { fontWeight: 'bold', fontSize: 11, margin: '12px 0 6px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 },
  para: { textAlign: 'justify', position: 'relative', zIndex: 1 },
  list: { paddingLeft: 24, position: 'relative', zIndex: 1 },
  item: { textIndent: -12, marginBottom: 2 },
  cell: { border: '1px solid #333', padding: '2px 10px' },
};

function normalizeName(s) {
  return (s || '').toUpperCase().replace(/[^A-Z]/g, '');
}

function Watermark() {
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) rotate(-45deg)',
      fontSize: 48, color: 'rgba(0,0,0,0.03)', fontWeight: 'bold',
      whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 0,
    }}>
      SBP Digital Agreement System
    </div>
  );
}

function Footer({ page, total }) {
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 40, right: 40,
      textAlign: 'center', fontSize: 8, color: '#999',
      borderTop: '1px solid #e5e7eb', paddingTop: 8, zIndex: 1,
    }}>
      Dokumen ini dibuat secara digital melalui SBP Digital Agreement System — Halaman {page} dari {total}
    </div>
  );
}

function CheckBox({ checked }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, border: '1.5px solid #333', marginRight: 8,
      fontSize: 11, fontWeight: 'bold', lineHeight: 1, flexShrink: 0, marginTop: 4,
    }}>
      {checked ? '✓' : ''}
    </span>
  );
}

export default function ReferralSigningPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const sigCanvasRef = useRef(null);
  const page1Ref = useRef(null);
  const page2Ref = useRef(null);
  const page3Ref = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [images, setImages] = useState({ logo: null, materai: null, agentSignature: null });
  const [imagesReady, setImagesReady] = useState(false);
  const [bank, setBank] = useState({ bank_name: '', bank_account_number: '', bank_account_holder: '' });
  const [consents, setConsents] = useState(() => CONSENT_ITEMS.map(() => false));
  const [submitError, setSubmitError] = useState('');

  const { data: referral, isLoading, error } = useQuery({
    queryKey: ['referral-token', token],
    queryFn: () => referralApi.getByToken(token).then((r) => r.data.data),
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
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      setHasSignature(true);
    }
  };

  const handleBankChange = (e) => {
    const { name, value } = e.target;
    setBank((p) => ({ ...p, [name]: value }));
  };

  const toggleConsent = (i) => setConsents((p) => p.map((v, idx) => (idx === i ? !v : v)));

  const leads = getLeads(referral);
  const hasLeads = leads.length > 0;
  const totalPages = hasLeads ? 3 : 2;

  const bankComplete = bank.bank_name.trim() && bank.bank_account_number.trim() && bank.bank_account_holder.trim();
  const allConsented = consents.every(Boolean);
  const canSubmit = bankComplete && allConsented && hasSignature && !isProcessing;
  const nameMismatch = bank.bank_account_holder.trim()
    && normalizeName(bank.bank_account_holder) !== normalizeName(referral?.partner_name);

  const handleSign = async () => {
    if (!bankComplete) { alert('Silakan lengkapi data rekening terlebih dahulu'); return; }
    if (!allConsented) { alert('Silakan centang semua pernyataan persetujuan'); return; }
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      alert('Silakan tanda tangan terlebih dahulu');
      return;
    }

    // Halaman 3 (Lampiran) hanya ada jika ada data leads / properti
    const pages = [page1Ref.current, page2Ref.current, ...(hasLeads ? [page3Ref.current] : [])];
    if (pages.some((p) => !p)) {
      alert('Dokumen belum siap, silakan tunggu sebentar lalu coba lagi.');
      return;
    }

    setIsProcessing(true);
    setSubmitError('');

    try {
      await new Promise((r) => setTimeout(r, 100));
      const pdfBase64 = await generatePdfBase64(pages);

      await referralApi.sign(token, {
        bank_name: bank.bank_name.trim(),
        bank_account_number: bank.bank_account_number.trim(),
        bank_account_holder: bank.bank_account_holder.trim(),
        consent_accepted: true,
        pdf_base64: pdfBase64,
      });

      navigate(`/referrals/success/${token}`);
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
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !referral) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ color: '#dc2626', fontSize: 24, fontWeight: 'bold' }}>!</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Link Tidak Valid</h2>
          <p style={{ color: '#4b5563' }}>{error?.response?.data?.error || 'Dokumen tidak ditemukan.'}</p>
        </div>
      </div>
    );
  }

  if (referral.status === 'signed') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle style={{ width: 32, height: 32, color: '#16a34a' }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Dokumen Sudah Ditandatangani</h2>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>Perjanjian ini telah ditandatangani sebelumnya.</p>
          <a href={`/referrals/success/${token}`} style={{ display: 'inline-block', padding: '8px 24px', background: '#2563eb', color: 'white', borderRadius: 8, textDecoration: 'none' }}>Lihat Status</a>
        </div>
      </div>
    );
  }

  if (referral.status !== 'sent') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Dokumen Belum Siap</h2>
          <p style={{ color: '#4b5563' }}>Perjanjian ini belum dikirim untuk ditandatangani.</p>
        </div>
      </div>
    );
  }

  const today = getCurrentDateIndonesian();
  const isBuyer = referral.referral_type === 'buyer';
  const pct = referral.referral_percent;
  const blank = '....................................';

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: 14, boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 };

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', padding: '32px 16px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Overlay loading — dokumen tetap di-mount di DOM agar ref tidak null */}
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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        {/* ====== LANGKAH 1: DATA REKENING & PERSETUJUAN (NOT IN PDF) ====== */}
        <div style={{ width: 794, maxWidth: '100%', background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Perjanjian Kerja Sama Referal</h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            Halo <strong>{referral.partner_name}</strong>, silakan baca dokumen di bawah, lalu:
            (1) isi data rekening untuk pembayaran Fee Referal, (2) centang semua pernyataan,
            (3) tanda tangan di atas materai pada halaman 2, dan (4) tekan <strong>Kirim</strong>.
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
              <span>Nama pemilik rekening berbeda dengan nama di perjanjian (<strong>{referral.partner_name}</strong>). Pastikan rekening sudah benar.</span>
            </div>
          )}

          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: '16px 0 8px' }}>2. Pernyataan Persetujuan</div>
          {CONSENT_ITEMS.map((text, i) => (
            <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#374151', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={consents[i]} onChange={() => toggleConsent(i)} style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
              <span>{text}</span>
            </label>
          ))}
        </div>

        {/* ====== HALAMAN 1 (MASUK PDF) ====== */}
        <div ref={page1Ref} style={S.page}>
          <Watermark />

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, ...S.layer }}>
            {images.logo ? (
              <img src={images.logo} alt="SBP"
                style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #1e40af' }} />
            ) : (
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: '#1e40af',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 'bold', fontSize: 12, flexShrink: 0, border: '2px solid #1e40af',
              }}>SBP</div>
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1e40af' }}>CV Salam Bumi Property</div>
              <div style={{ fontSize: 9, color: '#666', lineHeight: 1.4 }}>
                Jl Pajajaran, Catur Tunggal, Depok, Sleman | 0813-9127-8889<br />
                salambumiproperty@gmail.com | salambumi.xyz
              </div>
            </div>
          </div>

          <div style={{ borderTop: '3px solid #1e40af', margin: '4px 0 2px 0', ...S.layer }} />
          <div style={{ borderTop: '1px solid #1e40af', margin: '0 0 20px 0', ...S.layer }} />

          {/* TITLE */}
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 4px 0', ...S.layer }}>
            SURAT PERJANJIAN KERJA SAMA<br />REFERAL PROPERTI
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 20, ...S.layer }}>
            Nomor: {referral.agreement_number}
          </div>

          <div style={{ ...S.para, marginBottom: 12 }}>
            Pada hari ini, <strong>{today}</strong>, telah dibuat dan disepakati Perjanjian Kerja Sama Referal Properti antara Pihak Pertama dan Pihak Kedua sebagai berikut:
          </div>

          {/* PIHAK PERTAMA */}
          <div style={S.heading}>DATA PIHAK PERTAMA (SBP)</div>
          <div style={S.list}>
            <div style={S.item}>a. Nama : {referral.sbp_name}</div>
            <div style={S.item}>b. Perusahaan : {referral.sbp_company}</div>
            <div style={S.item}>c. Alamat : {referral.sbp_address}</div>
            <div style={S.item}>d. Telepon : {referral.sbp_contact}</div>
            {referral.sbp_description && <div style={S.item}>e. Keterangan : {referral.sbp_description}</div>}
          </div>

          {/* PIHAK KEDUA */}
          <div style={S.heading}>DATA PIHAK KEDUA (MITRA REFERAL)</div>
          <div style={S.list}>
            <div style={S.item}>a. Nama : {referral.partner_name}</div>
            <div style={S.item}>b. NIK : {referral.partner_nik}</div>
            <div style={S.item}>c. Alamat : {referral.partner_address || '-'}</div>
            <div style={S.item}>d. No. HP : {referral.partner_contact || '-'}</div>
          </div>

          {/* PASAL 1 */}
          <div style={S.heading}>PASAL 1 - RUANG LINGKUP</div>
          <div style={S.para}>
            Perjanjian ini merupakan kerja sama <strong>{getReferralTypeLabel(referral.referral_type)}</strong>, yaitu{' '}
              {isBuyer
              ? 'Pihak Kedua memberikan informasi dan/atau data calon pembeli properti kepada Pihak Pertama, dan selanjutnya Pihak Pertama memproses informasi tersebut hingga terjadi transaksi jual beli properti.'
              : 'Pihak Kedua memberikan informasi dan/atau data properti yang akan dijual kepada Pihak Pertama, dan selanjutnya Pihak Pertama memproses pemasaran properti tersebut hingga terjadi transaksi jual beli (AJB).'}
            {hasLeads && (isBuyer
              ? ' Data calon pembeli yang diberikan pada saat perjanjian ini dibuat tercantum dalam Lampiran perjanjian ini.'
              : ' Data properti yang diberikan pada saat perjanjian ini dibuat tercantum dalam Lampiran perjanjian ini.')}
          </div>

          {/* PASAL 2 */}
          <div style={S.heading}>PASAL 2 - FEE REFERAL</div>
          <div style={S.para}>
            Apabila informasi yang diberikan Pihak Kedua menghasilkan transaksi, maka total nilai fee yang didapat SBP dari transaksi tersebut dibagi dengan komposisi sebagai berikut:
          </div>
          <table style={{ borderCollapse: 'collapse', margin: '8px 0 8px 24px', fontSize: '11pt', ...S.layer }}>
            <tbody>
              <tr style={{ background: '#f3f4f6' }}>
                <td style={{ ...S.cell, fontWeight: 'bold' }}>Penerima</td>
                <td style={{ ...S.cell, fontWeight: 'bold', textAlign: 'center' }}>Persentase</td>
              </tr>
              <tr style={{ background: '#eff6ff' }}>
                <td style={{ ...S.cell, fontWeight: 'bold' }}>Mitra Referal (Pihak Kedua)</td>
                <td style={{ ...S.cell, fontWeight: 'bold', textAlign: 'center' }}>{referral.referral_percent}%</td>
              </tr>
              <tr>
                <td style={S.cell}>Agent SBP</td>
                <td style={{ ...S.cell, textAlign: 'center' }}>{referral.agent_percent}%</td>
              </tr>
              <tr>
                <td style={S.cell}>Kantor SBP</td>
                <td style={{ ...S.cell, textAlign: 'center' }}>{referral.office_percent}%</td>
              </tr>
            </tbody>
          </table>
          <div style={S.para}>
            Dengan demikian, Pihak Kedua berhak atas Fee Referal sebesar <strong>{pct}% ({PERCENT_WORDS[pct] || pct} persen) dari total nilai fee yang didapat SBP</strong>.
          </div>

          <Footer page={1} total={totalPages} />
        </div>

        {/* ====== HALAMAN 2 (MASUK PDF) ====== */}
        <div ref={page2Ref} style={S.page}>
          <Watermark />

          {/* PASAL 3 */}
          <div style={{ ...S.heading, marginTop: 0 }}>PASAL 3 - PEMBAYARAN FEE REFERAL</div>
          <div style={S.list}>
            <div style={S.item}>a. Fee Referal dibayarkan setelah transaksi selesai (AJB) dan fee telah diterima oleh SBP.</div>
            <div style={S.item}>b. Fee Referal dibayarkan melalui transfer ke rekening Pihak Kedua berikut:</div>
          </div>
          <table style={{ borderCollapse: 'collapse', margin: '4px 0 8px 36px', fontSize: '11pt', ...S.layer }}>
            <tbody>
              <tr><td style={{ padding: '2px 12px 2px 0' }}>Nama Bank</td><td>: <strong>{bank.bank_name || blank}</strong></td></tr>
              <tr><td style={{ padding: '2px 12px 2px 0' }}>No. Rekening</td><td>: <strong>{bank.bank_account_number || blank}</strong></td></tr>
              <tr><td style={{ padding: '2px 12px 2px 0' }}>Atas Nama</td><td>: <strong>{bank.bank_account_holder || blank}</strong></td></tr>
            </tbody>
          </table>
          <div style={S.list}>
            <div style={S.item}>c. Apabila transaksi tidak terjadi atau batal, Pihak Kedua tidak berhak atas Fee Referal.</div>
          </div>

          {/* PASAL 4 */}
          <div style={S.heading}>PASAL 4 - KEWAJIBAN PIHAK KEDUA</div>
          <div style={S.list}>
            <div style={S.item}>a. Memberikan informasi dan data yang benar kepada Pihak Pertama.</div>
            <div style={S.item}>b. Tidak menghubungi atau bertransaksi langsung dengan pihak terkait atas objek referal ini tanpa melalui Pihak Pertama.</div>
            <div style={S.item}>c. Menjaga kerahasiaan seluruh informasi terkait transaksi ini.</div>
          </div>

          {/* PASAL 5 (opsional) */}
          {referral.additional_clause && (
            <>
              <div style={S.heading}>PASAL 5 - KETENTUAN TAMBAHAN</div>
              <div style={{ ...S.para, whiteSpace: 'pre-wrap' }}>{referral.additional_clause}</div>
            </>
          )}

          {/* PERNYATAAN */}
          <div style={S.heading}>PERNYATAAN PIHAK KEDUA</div>
          <div style={S.list}>
            {CONSENT_ITEMS.map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 4, marginLeft: -12 }}>
                <CheckBox checked={consents[i]} />
                <span style={{ textAlign: 'justify' }}>{text}</span>
              </div>
            ))}
          </div>

          {/* PENUTUP */}
          <div style={{ ...S.para, margin: '20px 0' }}>
            Demikian Surat Perjanjian Kerja Sama Referal Properti ini dibuat dan ditandatangani secara digital oleh kedua belah pihak dalam keadaan sadar dan tanpa paksaan, serta berlaku sejak tanggal ditandatangani.
          </div>

          {/* ====== TANDA TANGAN — disalin dari SigningPage.jsx ====== */}
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 40, position: 'relative', zIndex: 1, overflow: 'visible' }}>

            {/* KOLOM KIRI — PIHAK PERTAMA (SBP) */}
            <div style={{ width: '42%', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK PERTAMA</div>
              <div style={{ fontSize: 10, marginBottom: 8 }}>(SBP)</div>
              <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                {images.agentSignature ? (
                  <img src={images.agentSignature} alt="Tanda Tangan SBP" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ borderBottom: '1px solid #333', width: '80%' }} />
                )}
              </div>
              <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{referral.sbp_name}</div>
              <div style={{ fontSize: 9, color: '#666' }}>{referral.sbp_company}</div>
            </div>

            <div style={{ width: '16%' }} />

            {/* KOLOM KANAN — PIHAK KEDUA (MITRA REFERAL) */}
            <div style={{ width: '42%', textAlign: 'center', position: 'relative', overflow: 'visible' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK KEDUA</div>
              <div style={{ fontSize: 10, marginBottom: 8 }}>(Mitra Referal)</div>

              <div style={{ position: 'relative', width: '100%', height: 120, marginBottom: 8, overflow: 'visible' }}>
                {images.materai && (
                  <img src={images.materai} alt="Materai"
                    style={{
                      width: 160, height: 'auto', display: 'block', pointerEvents: 'none',
                      position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-110%)', zIndex: 10,
                    }} />
                )}
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#1a1a1a"
                  canvasProps={{
                    width: 430,
                    height: 180,
                    style: {
                      position: 'absolute', top: '-60px', left: '-130px',
                      width: 'calc(100% + 130px)', height: 'calc(100% + 60px)',
                      zIndex: 20, cursor: 'crosshair', background: 'transparent',
                    },
                  }}
                  onEnd={handleEnd}
                />
              </div>

              <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{referral.partner_name}</div>
              <div style={{ fontSize: 9, color: '#666' }}>NIK: {referral.partner_nik}</div>
            </div>
          </div>

          <Footer page={2} total={totalPages} />
        </div>

        {/* ====== HALAMAN 3 — LAMPIRAN (MASUK PDF, hanya jika ada data) ====== */}
        {hasLeads && (
          <div ref={page3Ref} style={S.page}>
            <Watermark />
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, ...S.layer }}>
              LAMPIRAN
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 20, ...S.layer }}>
              {isBuyer ? 'Data Calon Pembeli' : 'Data Properti'} — Perjanjian Nomor: {referral.agreement_number}
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '10pt', lineHeight: 1.4, ...S.layer }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {(isBuyer
                    ? ['No', 'Nama Calon Pembeli', 'No. HP', 'Properti yang Dicari']
                    : ['No', 'Jenis Properti', 'Alamat', 'LT / LB (m²)', 'Legalitas', 'Pemilik']
                  ).map((h) => <th key={h} style={{ ...S.cell, padding: '4px 6px', textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const cells = isBuyer
                    ? [lead.name, lead.contact, lead.need]
                    : [lead.title, lead.address, `${lead.land_area || '-'} / ${lead.building_area || '-'}`, lead.legal,
                      [lead.owner_name, lead.owner_contact].filter(Boolean).join(' — ')];
                  return (
                    <tr key={i}>
                      <td style={{ ...S.cell, padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>{i + 1}</td>
                      {cells.map((v, j) => (
                        <td key={j} style={{ ...S.cell, padding: '4px 6px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{v || '-'}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Footer page={3} total={totalPages} />
          </div>
        )}

        {/* ====== UI CONTROLS (NOT IN PDF) ====== */}
        <div style={{ width: 794, maxWidth: '100%', background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ color: bankComplete ? '#16a34a' : '#9ca3af' }}>{bankComplete ? '✓' : '○'} Data rekening lengkap</span>
            <span style={{ color: allConsented ? '#16a34a' : '#9ca3af' }}>{allConsented ? '✓' : '○'} Semua pernyataan dicentang</span>
            <span style={{ color: hasSignature ? '#16a34a' : '#9ca3af' }}>{hasSignature ? '✓' : '○'} Tanda tangan di atas materai (halaman 2)</span>
          </div>
          {submitError && (
            <p style={{ textAlign: 'center', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{submitError}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button onClick={clearSignature} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            }}>
              <Eraser style={{ width: 16, height: 16 }} /> Hapus Tanda Tangan
            </button>
            <button onClick={handleSign} disabled={!canSubmit} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
              background: canSubmit ? '#2563eb' : '#93c5fd', color: 'white', border: 'none', borderRadius: 8,
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
            }}>
              <CheckCircle style={{ width: 16, height: 16 }} /> Kirim
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 9, paddingBottom: 16 }}>
          CV Salam Bumi Property &copy; {new Date().getFullYear()} | Dokumen ini dilindungi oleh sistem digital agreement
        </p>
      </div>
    </div>
  );
}
