// Penanda tangan Pihak Kedua (tabel agreement_signers, migrasi 0005):
// pemilik tunggal, para ahli waris, atau pemilik bersama. Satu link per orang.

export const MAKS_PENANDA_TANGAN = 10;
// TTD kanvas 430×180 PNG transparan biasanya < 30 KB; batas longgar tapi tegas.
export const MAKS_SIGNATURE_CHARS = 200 * 1024;
const PREFIKS_PNG = 'data:image/png;base64,';

const FIELDS = ['name', 'nik', 'address', 'contact', 'description'];

// Validasi + rapikan daftar penanda tangan dari body admin.
// Klien lama (tanpa `signers`) → satu penanda tangan dari kolom party1_*.
export function normalisasiSigners(body) {
  const mentah = Array.isArray(body?.signers) && body.signers.length
    ? body.signers
    : [{
        name: body?.party1_name, nik: body?.party1_nik, address: body?.party1_address,
        contact: body?.party1_contact, description: body?.party1_description,
      }];

  if (mentah.length > MAKS_PENANDA_TANGAN) {
    return { error: `Maksimal ${MAKS_PENANDA_TANGAN} penanda tangan` };
  }

  const signers = mentah.map((s) => {
    const o = Object.fromEntries(FIELDS.map((k) => [k, String(s?.[k] ?? '').trim()]));
    o.nik = o.nik.replace(/[\s.-]/g, '');
    return o;
  });

  for (const [i, s] of signers.entries()) {
    const siapa = signers.length > 1 ? `penanda tangan ${i + 1}` : 'pemilik';
    if (!s.name) return { error: `Nama ${siapa} wajib diisi` };
    if (!/^\d{16}$/.test(s.nik)) return { error: `NIK ${siapa} harus 16 angka` };
  }
  if (new Set(signers.map((s) => s.nik)).size !== signers.length) {
    return { error: 'NIK tidak boleh sama antar penanda tangan' };
  }
  return { signers };
}

const PILIHAN_PAJAK = ['seller', 'buyer', 'agent'];
const PILIHAN_NOTARIS = ['seller', 'buyer', 'split', 'agent'];
const teks = (v) => (String(v ?? '').trim() || null);

// Validasi + rapikan semua isian Pihak Kedua untuk create/update draf.
//   tunggal    : tepat 1 penanda tangan, TTD lewat link pribadi
//   ahli_waris : 2–10 penanda tangan, nama pewaris opsional,
//                TTD lewat satu link bersama (default) atau link per orang
// Klien tanpa owner_mode (format lama) → ditebak dari jumlah penanda tangan.
export function normalisasiPihakKedua(body) {
  const hasil = normalisasiSigners(body);
  if (hasil.error) return hasil;
  const { signers } = hasil;

  const ownerMode = body?.owner_mode === 'ahli_waris' || (body?.owner_mode === undefined && signers.length > 1)
    ? 'ahli_waris' : 'tunggal';

  if (ownerMode === 'tunggal' && signers.length !== 1) {
    return { error: 'Perjanjian pemilik tunggal hanya untuk 1 penanda tangan' };
  }
  if (ownerMode === 'ahli_waris' && signers.length < 2) {
    return { error: 'Perjanjian ahli waris minimal 2 ahli waris' };
  }

  if (body?.type !== 'margin') {
    return { error: 'Skema Komisi belum tersedia — teks pasal komisi belum ditentukan' };
  }
  if (!PILIHAN_PAJAK.includes(body?.tax_by)) return { error: 'Pilihan pembayar pajak tidak valid' };
  if (!PILIHAN_NOTARIS.includes(body?.notary_by)) return { error: 'Pilihan penanggung notaris tidak valid' };

  if (ownerMode === 'tunggal') {
    return {
      signers, ownerMode, signMode: 'pribadi',
      decedentName: null, payoutBank: null, payoutAccountNumber: null, payoutAccountHolder: null,
      heirLetterNumber: null, representativeIndex: null,
    };
  }

  // Opsional: dokumen menentukan "ahli waris" dari owner_mode, bukan dari
  // nama ini (lihat pihakAhliWaris di frontend/src/utils/signers.js).
  const decedentName = teks(body.decedent_name);

  let representativeIndex = null;
  if (body.representative_index !== undefined && body.representative_index !== null && body.representative_index !== '') {
    representativeIndex = Number(body.representative_index);
    if (!Number.isInteger(representativeIndex) || representativeIndex < 0 || representativeIndex >= signers.length) {
      return { error: 'Perwakilan ahli waris tidak valid' };
    }
  }

  return {
    signers,
    ownerMode,
    signMode: body.sign_mode === 'pribadi' ? 'pribadi' : 'bersama',
    decedentName,
    payoutBank: teks(body.payout_bank),
    payoutAccountNumber: teks(body.payout_account_number),
    payoutAccountHolder: teks(body.payout_account_holder),
    heirLetterNumber: teks(body.heir_letter_number),
    representativeIndex,
  };
}

// Statement INSERT untuk env.DB.batch(). Penanda tangan #1 memakai token
// perjanjian — link lama / tombol "Salin Link" lama tetap menunjuk orang yang benar.
// `ids` dibuat pemanggil supaya perwakilan bisa dirujuk dalam batch yang sama.
export function insertSignerStatements(db, agreementId, signers, tokenPertama, buatToken, ids) {
  return signers.map((s, i) => db.prepare(`
    INSERT INTO agreement_signers (id, agreement_id, urutan, token, name, nik, address, contact, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    ids?.[i] || crypto.randomUUID(), agreementId, i + 1, i === 0 ? tokenPertama : buatToken(),
    s.name, s.nik, s.address || null, s.contact || null, s.description || null,
  ));
}

export async function ambilSigners(db, agreementId) {
  const r = await db.prepare(
    'SELECT * FROM agreement_signers WHERE agreement_id = ? ORDER BY urutan',
  ).bind(agreementId).all();
  return r.results || [];
}

// Yang boleh dilihat penanda tangan LAIN. Tanpa token (= link orang itu),
// tanpa IP/user agent. NIK & alamat memang tercetak di dokumen bersama.
export function publicSigner(row) {
  return {
    id: row.id,
    urutan: row.urutan,
    name: row.name,
    nik: row.nik,
    address: row.address,
    contact: row.contact,
    description: row.description,
    status: row.status,
    signed_at: row.signed_at,
    signature_png: row.status === 'signed' ? row.signature_png || null : null,
  };
}

// Salinan untuk document_snapshot: tanpa token & tanpa gambar TTD.
export function snapshotSigner(row) {
  const { token, signature_png, ...rest } = row;
  return rest;
}

export function hitungProgres(signers) {
  const total = signers.length;
  const signed = signers.filter((s) => s.status === 'signed').length;
  return { total, signed };
}

export function validasiSignature(png) {
  if (typeof png !== 'string' || !png.startsWith(PREFIKS_PNG)) {
    return 'Gambar tanda tangan tidak valid';
  }
  if (png.length > MAKS_SIGNATURE_CHARS) return 'Gambar tanda tangan terlalu besar';
  return null;
}
