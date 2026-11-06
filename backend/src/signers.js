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

// Statement INSERT untuk env.DB.batch(). Penanda tangan #1 memakai token
// perjanjian — link lama / tombol "Salin Link" lama tetap menunjuk orang yang benar.
export function insertSignerStatements(db, agreementId, signers, tokenPertama, buatToken) {
  return signers.map((s, i) => db.prepare(`
    INSERT INTO agreement_signers (id, agreement_id, urutan, token, name, nik, address, contact, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), agreementId, i + 1, i === 0 ? tokenPertama : buatToken(),
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
