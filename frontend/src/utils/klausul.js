// Teks pasal dokumen perjanjian VERSI 2 (template_version >= 2).
// Satu sumber untuk Pasal 3c/7a (hasil bersih), Pasal 4/7c (pajak),
// Pasal 5/7d (notaris) dan Pasal 8 (ahli waris) — supaya isi dokumen selalu
// sama dengan pilihan di form. Versi 1 (perjanjian lama) TIDAK memakai file ini:
// teksnya dibekukan di AgreementDocument agar perjanjian yang sudah terkirim
// tidak berubah diam-diam.
//
// Draf — sebaiknya ditinjau notaris rekanan.

export function adalahAhliWaris(agreement) {
  return agreement?.owner_mode === 'ahli_waris';
}

function pihakKedua(agreement) {
  return adalahAhliWaris(agreement) ? 'Pihak Kedua (para ahli waris)' : 'Pihak Kedua (Pemilik)';
}

const AGEN_DARI_MARGIN = 'Pihak Pertama (Agen) dan dibayarkan dari selisih harga';

function penanggungPajak(agreement) {
  return {
    agent: AGEN_DARI_MARGIN,
    seller: pihakKedua(agreement),
    buyer: 'pembeli',
  }[agreement?.tax_by] || AGEN_DARI_MARGIN;
}

function penanggungNotaris(agreement) {
  return {
    agent: AGEN_DARI_MARGIN,
    seller: pihakKedua(agreement),
    buyer: 'pembeli',
    split: 'penjual dan pembeli sesuai kesepakatan',
  }[agreement?.notary_by] || AGEN_DARI_MARGIN;
}

// Pasal 3c & 7a. "Tanpa potongan" hanya menyebut biaya yang memang ditanggung Agen.
export function teksHasilBersih(agreement, nettPrice) {
  const subjek = adalahAhliWaris(agreement)
    ? 'Pihak Kedua, yaitu seluruh ahli waris secara bersama-sama,'
    : 'Pihak Kedua';
  const potongan = [
    (agreement?.tax_by ?? 'agent') === 'agent' && 'pajak penjual',
    (agreement?.notary_by ?? 'agent') === 'agent' && 'biaya notaris/PPAT',
  ].filter(Boolean);
  return `${subjek} menerima hasil bersih sebesar ${nettPrice} secara utuh` +
    (potongan.length ? `, tanpa potongan ${potongan.join(' maupun ')}` : '');
}

// Pasal 4 — dipersempit ke pajak PENJUAL. Versi 1 berbunyi "biaya-biaya yang
// timbul dari transaksi", yang secara harfiah ikut mencakup biaya pembeli.
export function teksPajak(agreement) {
  return `Pajak penjual (PPh atas pengalihan hak atas tanah dan/atau bangunan) ditanggung oleh ${penanggungPajak(agreement)}.`;
}

// Pasal 5
export function teksNotaris(agreement) {
  return agreement?.notary_by === 'split'
    ? `Biaya notaris/PPAT ditanggung bersama oleh ${penanggungNotaris(agreement)}.`
    : `Biaya notaris/PPAT ditanggung oleh ${penanggungNotaris(agreement)}.`;
}

// Pasal 7c & 7d (ringkas)
export function butirPajak(agreement) {
  return {
    agent: 'Pajak penjual ditanggung Pihak Pertama (Agen) dari selisih harga',
    seller: `Pajak penjual ditanggung ${pihakKedua(agreement)}`,
    buyer: 'Pajak penjual ditanggung pembeli',
  }[agreement?.tax_by] || 'Pajak penjual ditanggung Pihak Pertama (Agen) dari selisih harga';
}

export function butirNotaris(agreement) {
  return {
    agent: 'Biaya notaris ditanggung Pihak Pertama (Agen) dari selisih harga',
    seller: `Biaya notaris ditanggung ${pihakKedua(agreement)}`,
    buyer: 'Biaya notaris ditanggung pembeli',
    split: 'Biaya notaris ditanggung bersama oleh penjual dan pembeli sesuai kesepakatan',
  }[agreement?.notary_by] || 'Biaya notaris ditanggung Pihak Pertama (Agen) dari selisih harga';
}

// PASAL 8 — hanya perjanjian ahli waris. Mengembalikan daftar butir (a, b, c…).
export function butirAhliWaris(agreement, signers) {
  const pewaris = agreement?.decedent_name || 'pewaris';
  const skw = agreement?.heir_letter_number
    ? ` berdasarkan Surat Keterangan Waris Nomor ${agreement.heir_letter_number}`
    : '';
  const rekeningLengkap = agreement?.payout_bank && agreement?.payout_account_number && agreement?.payout_account_holder;
  const perwakilan = (signers || []).find((s) => s.id && s.id === agreement?.representative_signer_id);

  return [
    `Para ahli waris menyatakan bahwa mereka adalah seluruh ahli waris yang sah dari ${pewaris}${skw}. ` +
      'Apabila di kemudian hari terdapat ahli waris lain yang tidak tercantum dalam perjanjian ini, hal tersebut sepenuhnya menjadi tanggung jawab Pihak Kedua.',
    (rekeningLengkap
      ? `Hasil bersih dibayarkan sekaligus ke rekening ${agreement.payout_bank} Nomor ${agreement.payout_account_number} atas nama ${agreement.payout_account_holder} yang telah disepakati oleh seluruh ahli waris. `
      : 'Hasil bersih dibayarkan sekaligus ke rekening yang disepakati secara tertulis oleh seluruh ahli waris. ') +
      'Pembagian hasil bersih di antara para ahli waris menjadi urusan dan tanggung jawab Pihak Kedua sendiri.',
    perwakilan &&
      `Para ahli waris menunjuk ${perwakilan.name} sebagai perwakilan untuk komunikasi dan negosiasi dengan Pihak Pertama. ` +
      'Persetujuan atas penjualan tetap memerlukan persetujuan seluruh ahli waris.',
  ].filter(Boolean);
}
