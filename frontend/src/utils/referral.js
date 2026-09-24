import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Komposisi fee (dikunci) — sama dengan backend/src/referrals.js
export const REFERRAL_SPLITS = {
  buyer: { referral: 30, agent: 20, office: 50 },
  seller: { referral: 20, agent: 30, office: 50 },
};

export function getReferralTypeLabel(type) {
  return { buyer: 'Referal Pembeli', seller: 'Referal Penjual' }[type] || type;
}

export const LEGAL_OPTIONS = [
  { value: 'SHM', label: 'Sertifikat Hak Milik (SHM)' },
  { value: 'HGB', label: 'Hak Guna Bangunan (HGB)' },
  { value: 'SHGB', label: 'SHGB' },
  { value: 'Girik', label: 'Girik' },
  { value: 'AJB', label: 'AJB' },
];

// Isian per item leads (opsional, bisa lebih dari satu) — key sama dengan LEAD_KEYS di backend
export const LEAD_FIELDS = {
  buyer: [
    { key: 'name', label: 'Nama Calon Pembeli' },
    { key: 'contact', label: 'No. HP Calon Pembeli' },
    { key: 'need', label: 'Properti yang Dicari / Diminati', multiline: true, placeholder: 'Contoh: Rumah di Sleman, 3 kamar, budget sekitar Rp 1 M' },
  ],
  seller: [
    { key: 'title', label: 'Jenis Properti', wide: true, placeholder: 'Contoh: Rumah 2 lantai, Tanah pekarangan' },
    { key: 'address', label: 'Alamat Properti', wide: true },
    { key: 'land_area', label: 'Luas Tanah (m²)' },
    { key: 'building_area', label: 'Luas Bangunan (m²)' },
    { key: 'legal', label: 'Legalitas', options: LEGAL_OPTIONS },
    { key: 'owner_name', label: 'Nama Pemilik Properti' },
    { key: 'owner_contact', label: 'No. HP Pemilik Properti' },
  ],
};

export function getLeadTitle(type) {
  return type === 'buyer' ? 'Data Leads Pembeli' : 'Data Properti';
}

export function emptyLead(type) {
  return Object.fromEntries(LEAD_FIELDS[type].map((f) => [f.key, '']));
}

export function isLeadEmpty(lead) {
  return Object.values(lead).every((v) => !String(v || '').trim());
}

// Daftar leads dari kolom JSON `leads` (kosong jika tidak ada)
export function getLeads(referral) {
  try {
    const leads = JSON.parse(referral?.leads || '[]');
    return Array.isArray(leads) ? leads : [];
  } catch {
    return [];
  }
}

export const PERCENT_WORDS = { 20: 'dua puluh', 30: 'tiga puluh', 50: 'lima puluh' };

export const CONSENT_ITEMS = [
  'Saya menyatakan bahwa data dan informasi yang saya berikan adalah benar.',
  'Saya menyetujui besaran Fee Referal dan komposisi pembagian fee sebagaimana tercantum dalam perjanjian ini.',
  'Saya tidak akan menghubungi atau bertransaksi langsung dengan pihak terkait atas objek referal ini tanpa melalui SBP.',
  'Saya akan menjaga kerahasiaan seluruh informasi terkait transaksi ini.',
];

// Gambar diambil lewat /img-proxy di origin sendiri (Vite proxy saat dev, Worker di production)
export const IMAGE_URLS = {
  logo: '/img-proxy/fav.webp',
  materai: '/img-proxy/hg.png',
  agentSignature: '/img-proxy/gsd-removebg-preview%20-%20Copy.png',
};

export async function imageUrlToBase64(url) {
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

// Render beberapa elemen halaman A4 ke satu PDF (base64).
// Setiap elemen dimulai di halaman PDF baru; logika per halaman sama seperti SigningPage.jsx.
export async function generatePdfBase64(pageElements) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  let firstPage = true;

  const nextPage = () => {
    if (!firstPage) pdf.addPage();
    firstPage = false;
  };

  for (const el of pageElements) {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 15000,
    });

    const imgW = canvas.width;
    const imgH = canvas.height;
    const printW = pdfW;
    const printH = (imgH / imgW) * printW;

    if (printH <= pdfH + 0.5) {
      nextPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, printW, Math.min(printH, pdfH), undefined, 'FAST');
    } else {
      // Halaman lebih panjang dari A4 (mis. klausul tambahan panjang) — potong ke beberapa halaman
      let yPos = 0;
      while (yPos < printH) {
        const sliceH = Math.min(pdfH, printH - yPos);
        const srcY = (yPos / printH) * imgH;
        const srcH = (sliceH / printH) * imgH;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgW;
        pageCanvas.height = srcH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);

        nextPage();
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, printW, sliceH, undefined, 'FAST');
        yPos += pdfH;
      }
    }
  }

  return pdf.output('datauristring').split(',')[1];
}
