export function formatCurrency(amount) {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

// D1 datetime('now') menghasilkan 'YYYY-MM-DD HH:MM:SS' dalam UTC TANPA zona.
// new Date() membacanya sebagai waktu LOKAL → jam meleset 7 jam di WIB.
export function parseWaktuDb(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const punyaZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(punyaZona ? s : s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

const ZONA_WIB = 'Asia/Jakarta';

export function formatDate(dateString) {
  const date = parseWaktuDb(dateString);
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA_WIB,
  }).format(date);
}

export function formatDateTime(dateString) {
  const date = parseWaktuDb(dateString);
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: ZONA_WIB,
  }).format(date) + ' WIB';
}

export function getStatusBadge(status) {
  const map = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
    sent: { label: 'Terkirim', color: 'bg-blue-100 text-blue-700' },
    signed: { label: 'Ditandatangani', color: 'bg-green-100 text-green-700' },
  };
  return map[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
}

export function getTypeLabel(type) {
  return { commission: 'Komisi', margin: 'Margin' }[type] || type;
}

export function getTaxByLabel(v) {
  return { seller: 'Penjual', buyer: 'Pembeli', agent: 'Agen' }[v] || v;
}

export function getNotaryByLabel(v) {
  return { seller: 'Penjual', buyer: 'Pembeli', split: 'Dibagi', agent: 'Agen' }[v] || v;
}

export function getCurrentDateIndonesian() {
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const now = new Date();
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// Nomor WA untuk tautan wa.me: hanya angka, awalan 0 → 62. Kosong → null.
export function nomorWa(kontak) {
  const angka = String(kontak || '').replace(/\D/g, '');
  if (!angka) return null;
  if (angka.startsWith('62')) return angka;
  if (angka.startsWith('0')) return '62' + angka.slice(1);
  if (angka.startsWith('8')) return '62' + angka;
  return angka;
}
