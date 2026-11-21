// Kuitansi digital — konstanta & helper bersama halaman admin, TTD, verifikasi.
// Nilai yang valid dijaga backend/src/kuitansi.js (normalisasiKuitansi).
import QRCode from 'qrcode';
import { SBP_BAWAAN } from './cobroker';
import { formatCurrency } from './format';

export { SBP_BAWAAN };

export const JENIS_PEMBAYARAN = [
  { value: 'booking_fee', label: 'Booking Fee', kalimat: 'booking fee' },
  { value: 'tanda_jadi', label: 'Tanda Jadi', kalimat: 'tanda jadi' },
  { value: 'dp', label: 'Uang Muka (DP)', kalimat: 'uang muka (DP)' },
  { value: 'pelunasan', label: 'Pelunasan', kalimat: 'pelunasan' },
  { value: 'lainnya', label: 'Lainnya', kalimat: '' },
];

// Jenis yang punya bagian Ketentuan & default "minta klien TTD"
export const BERKETENTUAN = ['booking_fee', 'tanda_jadi', 'dp'];
export const WAJIB_MASA_BERLAKU = ['booking_fee', 'tanda_jadi'];

export function adaKetentuan(k) {
  return BERKETENTUAN.includes(k?.payment_type);
}

export function labelJenis(k) {
  if (k?.payment_type === 'lainnya') return k.payment_type_other || 'Lainnya';
  return JENIS_PEMBAYARAN.find((j) => j.value === k?.payment_type)?.label || '-';
}

export function kalimatJenis(k) {
  if (k?.payment_type === 'lainnya') return (k.payment_type_other || 'pembayaran').toLowerCase();
  return JENIS_PEMBAYARAN.find((j) => j.value === k?.payment_type)?.kalimat || 'pembayaran';
}

export const METODE = [
  { value: 'transfer', label: 'Transfer bank' },
  { value: 'tunai', label: 'Tunai' },
];

export const CARA_BELI = [
  { value: 'tunai_keras', label: 'Tunai keras' },
  { value: 'tunai_bertahap', label: 'Tunai bertahap' },
  { value: 'kpr', label: 'KPR' },
];

export const BILA_BATAL = [
  { value: 'hangus', label: 'Hangus seluruhnya' },
  { value: 'kembali_penuh', label: 'Dikembalikan penuh' },
  { value: 'kembali_potong', label: 'Dikembalikan, dipotong…' },
];

export const BILA_KPR = [
  { value: 'kembali_penuh', label: 'Dikembalikan penuh' },
  { value: 'kembali_potong', label: 'Dikembalikan, dipotong…' },
];

export function labelOpsi(daftar, value) {
  return daftar.find((o) => o.value === value)?.label || '-';
}

export function rp(n) {
  return n === null || n === undefined || n === '' ? '-' : formatCurrency(Number(n)).replace(/\u00a0/g, ' ');
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// 'YYYY-MM-DD' → '21 November 2026' (tanpa zona waktu — tanggal kalender murni)
export function tanggalIndo(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : '-';
}

// Tanggal hari ini di WIB sebagai 'YYYY-MM-DD' (nilai awal input tanggal)
export function hariIniWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Penanda tangan yang diperlukan kuitansi ini
export function perluTtd(k) {
  return { klien: Number(k?.require_payer_sign) === 1, pemilik: k?.receiver_mode === 'pemilik' };
}

// Dihitung sebagai bagian harga? (jenis tanpa ketentuan = selalu dihitung)
export function dihitungKeHarga(k) {
  return adaKetentuan(k) ? Number(k?.counts_toward_price) === 1 : true;
}

export function sisaPembayaran(k) {
  if (!k?.deal_price) return null;
  return Number(k.deal_price) - Number(k.paid_before || 0) - (dihitungKeHarga(k) ? Number(k.amount || 0) : 0);
}

export function urlVerifikasi(verifyToken) {
  return `${window.location.origin}/kuitansi/v/${verifyToken}`;
}

// Foto bukti transfer → JPEG data URL, sisi terpanjang maks 1600 px.
// Batas server ±2 MB (MAKS_GAMBAR_CHARS); kualitas diturunkan bila masih besar.
const SISI_MAKS = 1600;
const MAKS_CHARS = 2_700_000;

export async function kompresGambar(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('File bukan gambar yang bisa dibaca'));
      el.src = url;
    });
    const skala = Math.min(1, SISI_MAKS / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * skala);
    canvas.height = Math.round(img.naturalHeight * skala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const hasil = canvas.toDataURL('image/jpeg', q);
      if (hasil.length <= MAKS_CHARS) return hasil;
    }
    throw new Error('Gambar terlalu besar walau sudah dikompres');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function qrDataUrl(teks) {
  return QRCode.toDataURL(teks, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
}
