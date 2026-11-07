// Perjanjian Kerja Sama Co-Broker — konstanta bersama halaman admin & TTD.
// Persen skema dikunci di backend/src/cobrokers.js (SKEMA); di sini hanya label.

export const SKEMA_COBROKER = [
  {
    value: 'deal_1',
    persen: 1,
    label: '1% dari harga deal',
    desc: 'Bagi hasil 1% dari harga deal penjualan',
    contoh: 'Contoh: harga deal Rp 6 M → co-broker menerima Rp 60 jt',
  },
  {
    value: 'belah_semangka',
    persen: 50,
    label: 'Belah semangka 50%',
    desc: '50% dari total nilai fee yang didapat SBP',
    contoh: 'Contoh: total fee SBP Rp 100 jt → co-broker menerima Rp 50 jt',
  },
];

export function labelSkema(value) {
  return SKEMA_COBROKER.find((s) => s.value === value)?.label || value || '-';
}

// Dicentang co-broker saat TTD dan tercetak di dokumen (bagian Pernyataan)
export const PERNYATAAN_COBROKER = [
  'Data yang saya berikan adalah benar.',
  'Saya menyetujui besaran bagi hasil sebagaimana tercantum dalam perjanjian ini.',
  'Saya memahami bahwa seluruh data dan kontak penjual maupun pembeli adalah hak milik Salam Bumi Property, dan saya tidak akan menyalahgunakannya.',
  'Saya tidak akan bertransaksi langsung atau menerima uang dari penjual maupun pembeli.',
];

// Pihak Pertama bawaan (sama dengan form referal)
export const SBP_BAWAAN = {
  sbp_name: 'Ardy Salam',
  sbp_company: 'CV Salam Bumi Property',
  sbp_address: 'Jl Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office)',
  sbp_contact: '0813-9127-8889',
  sbp_description: 'Bertindak untuk dan atas nama perusahaan',
};
