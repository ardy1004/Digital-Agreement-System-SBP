import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { agreementApi } from '../utils/api';
import { formatCurrency, getCurrentDateIndonesian } from '../utils/format';
import { Loader2, Eraser, CheckCircle } from 'lucide-react';

// Gunakan proxy path (/img-proxy) agar fetch tidak kena CORS restriction browser.
// Vite dev server meneruskan /img-proxy/* ke https://images.salambumi.xyz/materai/*
// di production (Cloudflare Pages / hosting), gambar di-embed via fetch server-side
// atau CORS sudah allow origin production domain.
const isDev = import.meta.env.DEV;

const IMAGE_URLS = {
  logo: isDev
    ? '/img-proxy/fav.webp'
    : 'https://images.salambumi.xyz/materai/fav.webp',
  materai: isDev
    ? '/img-proxy/hg.png'
    : 'https://images.salambumi.xyz/materai/hg.png',
  agentSignature: isDev
    ? '/img-proxy/gsd-removebg-preview%20-%20Copy.png'
    : 'https://images.salambumi.xyz/materai/gsd-removebg-preview%20-%20Copy.png',
};

async function imageUrlToBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('fetchImageAsBase64 failed for', url, e);
    return null;
  }
}

export default function SigningPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const sigCanvasRef = useRef(null);
  const docRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [images, setImages] = useState({ logo: null, materai: null, agentSignature: null });
  const [imagesReady, setImagesReady] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agreement-token', token],
    queryFn: () => agreementApi.getByToken(token).then((r) => r.data.data),
    enabled: !!token,
    retry: 0,
  });

  const agreement = data;

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

  const handleSign = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      alert('Silakan tanda tangan terlebih dahulu');
      return;
    }

    // Ambil referensi elemen SEKARANG, sebelum state berubah & elemen di-unmount
    const docElement = docRef.current;
    if (!docElement) {
      alert('Dokumen belum siap, silakan tunggu sebentar lalu coba lagi.');
      return;
    }

    setIsProcessing(true);

    try {
      // Capture canvas SEBELUM render ulang mengubah DOM
      // docElement sudah di-capture di atas, jadi aman meski isProcessing = true
      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(docElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();   // 210 mm
      const pdfH = pdf.internal.pageSize.getHeight();  // 297 mm
      const imgW = canvas.width;
      const imgH = canvas.height;

      // Gambar langsung di-stretch penuh lebar halaman A4 (210mm).
      // Tinggi dihitung proporsional agar rasio aspek terjaga.
      const printW = pdfW;                         // 210 mm — full lebar
      const printH = (imgH / imgW) * printW;       // tinggi proporsional

      if (printH <= pdfH) {
        // Dokumen muat dalam satu halaman — tambahkan di tengah vertikal
        const offsetY = (pdfH - printH) / 2;
        pdf.addImage(imgData, 'PNG', 0, offsetY, printW, printH);
      } else {
        // Dokumen lebih panjang dari satu halaman — bagi ke beberapa halaman
        let yPos = 0;
        while (yPos < printH) {
          const sliceH = Math.min(pdfH, printH - yPos);
          // Canvas slice untuk halaman ini
          const srcY = (yPos / printH) * imgH;
          const srcH = (sliceH / printH) * imgH;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = imgW;
          pageCanvas.height = srcH;
          const ctx = pageCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);
          const pageData = pageCanvas.toDataURL('image/png');

          if (yPos > 0) pdf.addPage();
          pdf.addImage(pageData, 'PNG', 0, 0, printW, sliceH);
          yPos += pdfH;
        }
      }

      const pdfBase64 = pdf.output('datauristring').split(',')[1];

      await agreementApi.sign(token, {
        signer_name: agreement.party1_name,
        signer_nik: agreement.party1_nik,
        pdf_base64: pdfBase64,
      });

      navigate(`/success/${token}`);
    } catch (err) {
      console.error('Signing error:', err);
      alert('Terjadi kesalahan saat memproses dokumen. Silakan coba lagi.');
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
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ color: '#dc2626', fontSize: 24, fontWeight: 'bold' }}>!</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Link Tidak Valid</h2>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>{error.response?.data?.error || 'Dokumen tidak ditemukan.'}</p>
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

  const today = getCurrentDateIndonesian();
  const nettPrice = formatCurrency(agreement?.net_owner_price || 5000000000);

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', padding: '32px 16px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

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
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* ====== A4 DOCUMENT (ONLY THIS GOES TO PDF) ====== */}
        <div
          ref={docRef}
          id="document-content"
          style={{
            width: 794,
            minHeight: 1123,
            padding: 40,
            background: 'white',
            fontFamily: "'Times New Roman', serif",
            fontSize: '12pt',
            lineHeight: 1.6,
            color: '#1a1a1a',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Watermark */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
            fontSize: 48,
            color: 'rgba(0,0,0,0.03)',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 0,
          }}>
            SBP Digital Agreement System
          </div>

          {/* ====== HEADER ====== */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, position: 'relative', zIndex: 1 }}>
            {images.logo ? (
              <img
                src={images.logo}
                alt="SBP"
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '2px solid #1e40af',
                }}
              />
            ) : (
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: 12,
                flexShrink: 0,
                border: '2px solid #1e40af',
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

          {/* Double Line Separator */}
          <div style={{ borderTop: '3px solid #1e40af', margin: '4px 0 2px 0', position: 'relative', zIndex: 1 }} />
          <div style={{ borderTop: '1px solid #1e40af', margin: '0 0 20px 0', position: 'relative', zIndex: 1 }} />

          {/* ====== TITLE ====== */}
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 4px 0', position: 'relative', zIndex: 1 }}>
            SURAT PERJANJIAN KERJASAMA<br />PEMASARAN PROPERTI
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 20, position: 'relative', zIndex: 1 }}>
            Nomor: {agreement?.agreement_number || 'SBP/2026/03/0001'}
          </div>

          {/* ====== PEMBUKA ====== */}
          <div style={{ textAlign: 'justify', marginBottom: 12, position: 'relative', zIndex: 1 }}>
            Pada hari ini, <strong>{today}</strong>, telah dibuat dan disepakati perjanjian kerjasama antara Pihak Pertama dan Pihak Kedua sebagai berikut:
          </div>

          {/* ====== PIHAK PERTAMA (AGEN) ====== */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>
            DATA PIHAK PERTAMA (AGEN)
          </div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>
            Yang bertindak sebagai <strong>Pihak Pertama</strong> dalam perjanjian ini adalah:
          </div>
          <div style={{ paddingLeft: 24, position: 'relative', zIndex: 1 }}>
            <div style={{ textIndent: -12, marginBottom: 4 }}>a. Nama : {agreement?.party2_name || 'Ardy Salam'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>b. Perusahaan : {agreement?.party2_company || 'CV Salam Bumi Property'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>c. Alamat : {agreement?.party2_address || 'Jl Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office)'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>d. Telepon : {agreement?.party2_contact || '0813-9127-8889'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>e. Keterangan : {agreement?.party2_description || 'Bertindak untuk dan atas nama perusahaan'}</div>
          </div>

          {/* ====== PIHAK KEDUA (PEMILIK) ====== */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>
            DATA PIHAK KEDUA (PEMILIK)
          </div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>
            Yang bertindak sebagai <strong>Pihak Kedua</strong> dalam perjanjian ini adalah:
          </div>
          <div style={{ paddingLeft: 24, position: 'relative', zIndex: 1 }}>
            <div style={{ textIndent: -12, marginBottom: 4 }}>a. Nama : {agreement?.party1_name || 'IR. DJONI HERDIWAN, MM'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>b. NIK : {agreement?.party1_nik || '3173052309680009'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>c. Alamat : {agreement?.party1_address || 'Jl Anggrek No.27 RT 001/009, Kebon Jeruk, Jakarta Barat'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>d. Telepon : {agreement?.party1_contact || '0813-9127-8889'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>e. Keterangan : {agreement?.party1_description || 'Bertindak sebagai salah satu ahli waris dan/atau perwakilan ahli waris yang sah'}</div>
          </div>

          {/* PASAL 1 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 1 - OBJEK PERJANJIAN</div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>Properti yang menjadi objek perjanjian kerjasama pemasaran ini adalah sebagai berikut:</div>
          <div style={{ paddingLeft: 24, position: 'relative', zIndex: 1 }}>
            <div style={{ textIndent: -12, marginBottom: 4 }}>a. Jenis Properti : {agreement?.property_title || 'Rumah Induk 4 Kamar + 16 Kamar Kost'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>b. Alamat : {agreement?.property_address || 'Jl. Komp. Yadara, Tambak Bayan, Caturtunggal, Depok, Sleman, DIY 55281'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>c. Luas Tanah : {agreement?.property_land_area || '939'} m²</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>d. Luas Bangunan : {agreement?.property_building_area || '806'} m²</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>e. Legalitas : {agreement?.property_legal || 'SHM'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>f. Harga Nett Pemilik : {nettPrice}</div>
          </div>

          {/* PASAL 2 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 2 - SKEMA PERJANJIAN</div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>Kedua belah pihak sepakat untuk mengadakan perjanjian kerjasama pemasaran properti dengan ketentuan sebagai berikut:</div>
          <div style={{ paddingLeft: 24, position: 'relative', zIndex: 1 }}>
            <div style={{ textIndent: -12, marginBottom: 4 }}>a. Jenis Skema : {agreement?.type === 'margin' ? 'Margin' : 'Komisi'}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>b. Harga Bersih Pemilik : {nettPrice}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>c. Selisih harga jual menjadi hak Pihak Pertama (Agen)</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>d. Durasi : {agreement?.duration || '90'} hari kalender sejak tanggal ditandatangani</div>
          </div>

          {/* PASAL 3 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 3 - HAK DAN KEWAJIBAN</div>
          <div style={{ paddingLeft: 24, position: 'relative', zIndex: 1 }}>
            <div style={{ textIndent: -12, marginBottom: 4 }}>a. Pihak Kedua memberikan hak pemasaran eksklusif kepada Pihak Pertama</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>b. Pihak Pertama bertanggung jawab atas pemasaran properti</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>c. Pihak Kedua menerima hasil bersih sebesar {nettPrice}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>d. Selisih harga menjadi hak Pihak Pertama (Agen)</div>
          </div>

          {/* PASAL 4 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 4 - KEWAJIBAN PAJAK</div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>Biaya-biaya yang timbul dari transaksi ini menjadi tanggung jawab Pihak Pertama (Agen).</div>

          {/* PASAL 5 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 5 - KEWAJIBAN NOTARIS</div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>Biaya notaris dan pengurusan dokumen menjadi tanggung jawab Pihak Pertama (Agen).</div>

          {/* PASAL 6 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 6 - JANGKA WAKTU</div>
          <div style={{ textAlign: 'justify', position: 'relative', zIndex: 1 }}>
            Perjanjian ini berlaku selama {agreement?.duration || '90'} hari kalender terhitung sejak tanggal ditandatangani oleh kedua belah pihak. Apabila dalam jangka waktu tersebut properti belum terjual, perjanjian ini dapat diperpanjang berdasarkan kesepakatan tertulis kedua belah pihak.
          </div>

          {/* PASAL 7 */}
          <div style={{ fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>PASAL 7 - KETENTUAN TAMBAHAN</div>
          <div style={{ paddingLeft: 24, position: 'relative', zIndex: 1 }}>
            <div style={{ textIndent: -12, marginBottom: 4 }}>a. Pihak Kedua menerima hasil bersih sebesar {nettPrice}</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>b. Selisih harga menjadi hak Pihak Pertama (Agen)</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>c. Pajak penjual ditanggung Pihak Pertama (Agen)</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>d. Biaya notaris ditanggung Pihak Pertama (Agen)</div>
            <div style={{ textIndent: -12, marginBottom: 4 }}>e. Bonus Rp 10.000.000 (Sepuluh Juta Rupiah) diberikan kepada Pihak Kedua dari margin setelah transaksi selesai</div>
          </div>

          {/* PENUTUP */}
          <div style={{ textAlign: 'justify', margin: '20px 0', position: 'relative', zIndex: 1 }}>
            Demikian Surat Perjanjian Kerjasama Pemasaran Properti ini dibuat dalam rangkap 2 (dua) bermaterai cukup, masing-masing untuk Pihak Pertama dan Pihak Kedua, dan berlaku sejak tanggal ditandatangani oleh kedua belah pihak.
          </div>

          {/* ====== TANDA TANGAN ====== */}
          {/*
            Layout 3 zona (flex row, align-items: flex-end agar garis nama sejajar bawah):
            [KIRI 42% — Agen] [TENGAH 16% — Materai] [KANAN 42% — Pemilik]
            Materai di kolom tengah, sedikit geser ke kanan (justify-content: flex-end).
            Tinggi area signature KIRI dan KANAN sama persis (120px) → selalu sejajar.
          */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            marginTop: 40,
            position: 'relative',
            zIndex: 1,
            overflow: 'visible',
          }}>

            {/* ── KOLOM KIRI — PIHAK PERTAMA (AGEN) ── */}
            <div style={{ width: '42%', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK PERTAMA</div>
              <div style={{ fontSize: 10, marginBottom: 8 }}>(Agen)</div>

              {/* Area gambar tanda tangan agen — tinggi sama dengan canvas pemilik (120px) */}
              <div style={{
                width: '100%',
                height: 120,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
              }}>
                {images.agentSignature ? (
                  <img
                    src={images.agentSignature}
                    alt="Tanda Tangan Agen"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ borderBottom: '1px solid #333', width: '80%' }} />
                )}
              </div>

              <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>
                {agreement?.party2_name || 'Ardy Salam'}
              </div>
              <div style={{ fontSize: 9, color: '#666' }}>{agreement?.party2_company || 'CV Salam Bumi Property'}</div>
            </div>

            {/* ── KOLOM TENGAH — (spacer, materai dipindah ke kolom kanan) ── */}
            <div style={{ width: '16%' }} />

            {/* ── KOLOM KANAN — PIHAK KEDUA (PEMILIK) ── */}
            <div style={{ width: '42%', textAlign: 'center', position: 'relative', overflow: 'visible' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK KEDUA</div>
              <div style={{ fontSize: 10, marginBottom: 8 }}>(Pemilik)</div>

              {/* Area tanda tangan: materai di bawah canvas, canvas di atas sebagai overlay */}
              <div style={{ position: 'relative', width: '100%', height: 120, marginBottom: 8, overflow: 'visible' }}>

                {/* Materai — di dalam kolom kanan, zIndex di bawah canvas agar bisa ditimpa tanda tangan */}
                {images.materai && (
                  <img
                    src={images.materai}
                    alt="Materai"
                    style={{
                      width: 160,
                      height: 'auto',
                      display: 'block',
                      pointerEvents: 'none',
                      position: 'absolute',
                      bottom: 0,
                      left: '50%',
                      transform: 'translateX(-110%)',
                      zIndex: 10,
                    }}
                  />
                )}

                {/* Canvas tanda tangan — di atas materai */}
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#1a1a1a"
                  canvasProps={{
                    width: 430,
                    height: 180,
                    style: {
                      position: 'absolute',
                      top: '-60px',
                      left: '-130px',
                      width: 'calc(100% + 130px)',
                      height: 'calc(100% + 60px)',
                      zIndex: 20,
                      cursor: 'crosshair',
                      background: 'transparent',
                    },
                  }}
                  onEnd={handleEnd}
                />
              </div>

              <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>
                {agreement?.party1_name || 'IR. DJONI HERDIWAN, MM'}
              </div>
              <div style={{ fontSize: 9, color: '#666' }}>NIK: {agreement?.party1_nik || '3173052309680009'}</div>
            </div>

          </div>

          {/* Footer */}
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: 40,
            right: 40,
            textAlign: 'center',
            fontSize: 8,
            color: '#999',
            borderTop: '1px solid #e5e7eb',
            paddingTop: 8,
            zIndex: 1,
          }}>
            Dokumen ini dibuat secara digital melalui SBP Digital Agreement System
          </div>
        </div>

        {/* ====== UI CONTROLS (NOT IN PDF) ====== */}
        <div style={{
          width: 794,
          background: 'white',
          marginTop: 24,
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        }}>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: 16, fontSize: 11 }}>
            Silakan tanda tangani di atas materai
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button onClick={clearSignature} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11,
            }}>
              <Eraser style={{ width: 16, height: 16 }} /> Hapus
            </button>
            <button onClick={handleSign} disabled={!hasSignature} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
              background: hasSignature ? '#2563eb' : '#93c5fd', color: 'white', border: 'none', borderRadius: 8,
              cursor: hasSignature ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600,
            }}>
              <CheckCircle style={{ width: 16, height: 16 }} /> Konfirmasi Tanda Tangan
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 9, marginTop: 24, paddingBottom: 16 }}>
          CV Salam Bumi Property &copy; {new Date().getFullYear()} | Dokumen ini dilindungi oleh sistem digital agreement
        </p>
      </div>
    </div>
  );
}
