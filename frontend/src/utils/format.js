export function formatCurrency(amount) {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
}

export function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
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
