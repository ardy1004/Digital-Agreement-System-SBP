// Penanda tangan Pihak Kedua (pemilik / para ahli waris / pemilik bersama).
// Data dari tabel agreement_signers (lihat backend/src/signers.js).

// Daftar penanda tangan; fallback ke kolom party1_* untuk data yang (secara
// teori) belum punya baris penanda tangan.
export function daftarPenandaTangan(agreement, signers) {
  if (Array.isArray(signers) && signers.length) return signers;
  return [{
    id: null,
    urutan: 1,
    name: agreement?.party1_name,
    nik: agreement?.party1_nik,
    address: agreement?.party1_address,
    contact: agreement?.party1_contact,
    description: agreement?.party1_description,
    status: agreement?.status === 'signed' ? 'signed' : 'pending',
    signed_at: agreement?.signed_at,
    signature_png: null,
  }];
}

// Pihak Kedua = para ahli waris (bukan pemilik bersama)?
// - owner_mode 'ahli_waris': perjanjian sejak migrasi 0006 (nama pewaris opsional).
// - decedent_name terisi: perjanjian ahli waris SEBELUM 0006 — migrasi itu tidak
//   mengisi owner_mode, jadi baris lama tercatat 'tunggal'. Syarat ini wajib tetap
//   ada, kalau tidak dokumen lama berubah menjadi "para pemilik".
// Tanpa keduanya + lebih dari 1 penanda tangan = pemilik bersama (hanya data lama).
export function pihakAhliWaris(agreement) {
  return agreement?.owner_mode === 'ahli_waris' || Boolean(agreement?.decedent_name);
}

export function labelPenandaTangan(agreement, total, i) {
  if (total <= 1) return 'Pemilik';
  return pihakAhliWaris(agreement) ? `Ahli Waris ${i + 1}` : `Pemilik ${i + 1}`;
}
