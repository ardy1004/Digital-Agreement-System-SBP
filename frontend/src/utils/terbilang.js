// Angka → kata bahasa Indonesia, untuk kolom "Terbilang" kuitansi.
// Mendukung sampai 999 triliun (batas NOMINAL_MAKS di backend/src/kuitansi.js).

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function bawahSeribu(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} puluh${n % 10 ? ' ' + SATUAN[n % 10] : ''}`;
  const ratus = n < 200 ? 'seratus' : `${SATUAN[Math.floor(n / 100)]} ratus`;
  return n % 100 ? `${ratus} ${bawahSeribu(n % 100)}` : ratus;
}

const SKALA = [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']];

export function terbilang(angka) {
  let n = Math.floor(Number(angka));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'nol';
  const bagian = [];
  for (const [nilai, nama] of SKALA) {
    if (n >= nilai) {
      const q = Math.floor(n / nilai);
      n -= q * nilai;
      bagian.push(nilai === 1e3 && q === 1 ? 'seribu' : `${bawahSeribu(q)} ${nama}`);
    }
  }
  if (n) bagian.push(bawahSeribu(n));
  return bagian.join(' ');
}

// "Sepuluh juta rupiah"
export function terbilangRupiah(angka) {
  const t = terbilang(angka);
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)} rupiah` : '';
}
