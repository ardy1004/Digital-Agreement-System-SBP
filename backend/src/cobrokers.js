import { Hono } from 'hono';

// Perjanjian Kerja Sama Co-Broker: SBP memegang listing & seluruh leads,
// co-broker mengantar dan mendampingi calon pembeli survei lokasi.
//
// Pola sama dengan referrals.js, dengan pengaman yang belum ada di sana:
//   - endpoint publik memakai ALLOWLIST (publicCobroker), bukan SELECT *;
//   - catatan internal (internal_note) terpisah dari klausul yang dicetak;
//   - PDF gagal tersimpan → TTD ditolak (bukan "signed tanpa PDF");
//   - klaim TTD kondisional, dua klik bersamaan tidak sama-sama "berhasil".

// Versi teks pasal untuk perjanjian BARU (lihat CobrokerDocument.jsx).
const TEMPLATE_VERSION_SEKARANG = 1;

// Skema bagi hasil (dikunci server — persen tidak bisa dikirim dari luar)
const SKEMA = {
  deal_1: 1,          // 1% dari harga deal penjualan
  belah_semangka: 50, // 50% dari total nilai fee yang didapat SBP
};

const TEKS_PANJANG_MAKS = 4000;

// Field yang diisi admin saat membuat / mengedit draft
const EDITABLE_FIELDS = [
  'sbp_name', 'sbp_company', 'sbp_address', 'sbp_contact', 'sbp_description',
  'partner_name', 'partner_nik', 'partner_address', 'partner_contact', 'partner_office',
  'additional_clause', 'internal_note',
];

// Kolom yang BOLEH dilihat co-broker (endpoint publik /token & /sign).
// ALLOWLIST: kolom baru tidak ikut terkirim sebelum sengaja ditambahkan.
// Yang sengaja tidak ada: token, internal_note, document_snapshot,
// signer_ip, signer_user_agent, pdf_url (key R2).
const PUBLIC_FIELDS = [
  'id', 'agreement_number', 'status', 'template_version',
  'share_scheme', 'share_percent',
  'sbp_name', 'sbp_company', 'sbp_address', 'sbp_contact', 'sbp_description',
  'partner_name', 'partner_nik', 'partner_address', 'partner_contact', 'partner_office',
  'additional_clause', 'sent_at', 'signed_at',
];

function publicCobroker(row) {
  const out = Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, row[k] ?? null]));
  out.has_pdf = Boolean(row.pdf_url);
  return out;
}

function teks(v, maks = 500) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, maks) : null;
}

// Body admin → { kolom } atau { error }
function normalisasi(body) {
  const skema = body?.share_scheme;
  if (!Object.hasOwn(SKEMA, skema)) {
    return { error: 'Pilih skema bagi hasil: 1% dari harga deal atau belah semangka 50%' };
  }

  const kolom = Object.fromEntries(EDITABLE_FIELDS.map((f) => [
    f,
    teks(body[f], f === 'additional_clause' || f === 'internal_note' ? TEKS_PANJANG_MAKS : 500),
  ]));
  kolom.partner_nik = kolom.partner_nik ? kolom.partner_nik.replace(/[\s.-]/g, '') : null;

  if (!kolom.sbp_name) return { error: 'Nama Pihak Pertama wajib diisi' };
  if (!kolom.partner_name) return { error: 'Nama co-broker wajib diisi' };
  if (!/^\d{16}$/.test(kolom.partner_nik || '')) return { error: 'NIK co-broker harus 16 angka' };

  kolom.share_scheme = skema;
  kolom.share_percent = SKEMA[skema];
  return { kolom };
}

const cobrokers = new Hono();

// List (admin)
cobrokers.get('/', async (c) => {
  const status = c.req.query('status');
  const result = status
    ? await c.env.DB.prepare('SELECT * FROM cobroker_agreements WHERE status = ? ORDER BY created_at DESC').bind(status).all()
    : await c.env.DB.prepare('SELECT * FROM cobroker_agreements ORDER BY created_at DESC').all();
  return c.json({ success: true, data: result.results });
});

// Halaman TTD (publik) — didefinisikan sebelum /:id
cobrokers.get('/token/:token', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM cobroker_agreements WHERE token = ?').bind(c.req.param('token')).first();
  if (!row) return c.json({ success: false, error: 'Perjanjian tidak ditemukan atau link sudah tidak berlaku' }, 404);
  return c.json({ success: true, data: publicCobroker(row) });
});

// Detail (admin) — lengkap, termasuk token & catatan internal
cobrokers.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM cobroker_agreements WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: 'Perjanjian tidak ditemukan' }, 404);
  return c.json({ success: true, data: row });
});

cobrokers.post('/', async (c) => {
  const { env } = c;
  const hasil = normalisasi(await c.req.json());
  if (hasil.error) return c.json({ success: false, error: hasil.error }, 400);

  const id = crypto.randomUUID();
  const token = generateSecureToken();
  const agreementNumber = await generateCobrokerNumber(env);
  const kolom = {
    id, token, agreement_number: agreementNumber, status: 'draft',
    template_version: TEMPLATE_VERSION_SEKARANG,
    ...hasil.kolom,
  };
  const nama = Object.keys(kolom);

  await env.DB.prepare(
    `INSERT INTO cobroker_agreements (${nama.join(', ')}) VALUES (${nama.map(() => '?').join(', ')})`,
  ).bind(...nama.map((k) => kolom[k])).run();

  return c.json({ success: true, data: { id, token, agreement_number: agreementNumber } });
});

// Edit — hanya selama draft
cobrokers.put('/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const hasil = normalisasi(await c.req.json());
  if (hasil.error) return c.json({ success: false, error: hasil.error }, 400);

  // Draf belum pernah dikirim → aman dinaikkan ke versi teks terbaru
  const kolom = { template_version: TEMPLATE_VERSION_SEKARANG, ...hasil.kolom };
  const nama = Object.keys(kolom);
  const res = await env.DB.prepare(
    `UPDATE cobroker_agreements SET ${nama.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now')
     WHERE id = ? AND status = 'draft'`,
  ).bind(...nama.map((k) => kolom[k]), id).run();

  if (!res.meta?.changes) {
    const ada = await env.DB.prepare('SELECT status FROM cobroker_agreements WHERE id = ?').bind(id).first();
    return ada
      ? c.json({ success: false, error: 'Perjanjian yang sudah dikirim tidak bisa diubah' }, 400)
      : c.json({ success: false, error: 'Perjanjian tidak ditemukan' }, 404);
  }
  return c.json({ success: true });
});

cobrokers.post('/:id/send', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const row = await env.DB.prepare('SELECT * FROM cobroker_agreements WHERE id = ?').bind(id).first();

  if (!row) return c.json({ success: false, error: 'Perjanjian tidak ditemukan' }, 404);
  if (row.status !== 'draft') return c.json({ success: false, error: 'Perjanjian sudah dikirim atau ditandatangani' }, 400);

  await env.DB.prepare(`
    UPDATE cobroker_agreements SET status = 'sent', sent_at = datetime('now'),
    document_snapshot = ?, updated_at = datetime('now') WHERE id = ? AND status = 'draft'
  `).bind(JSON.stringify(row), id).run();

  return c.json({ success: true, data: { token: row.token, signing_url: '/cobrokers/sign/' + row.token } });
});

// TTD co-broker: rekening + persetujuan + PDF (dibuat di browser)
cobrokers.post('/sign/:token', async (c) => {
  const { env } = c;
  const token = c.req.param('token');
  const body = await c.req.json();
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';

  const row = await env.DB.prepare('SELECT * FROM cobroker_agreements WHERE token = ?').bind(token).first();
  if (!row) return c.json({ success: false, error: 'Perjanjian tidak ditemukan atau link sudah tidak berlaku' }, 404);
  if (row.status === 'signed') return c.json({ success: false, error: 'Perjanjian ini sudah ditandatangani' }, 400);
  if (row.status !== 'sent') return c.json({ success: false, error: 'Perjanjian belum dikirim untuk ditandatangani' }, 400);

  const bankName = teks(body.bank_name, 100);
  const bankAccountNumber = teks(body.bank_account_number, 50);
  const bankAccountHolder = teks(body.bank_account_holder, 200);
  if (!bankName || !bankAccountNumber || !bankAccountHolder) {
    return c.json({ success: false, error: 'Data rekening wajib diisi lengkap' }, 400);
  }
  if (body.consent_accepted !== true) {
    return c.json({ success: false, error: 'Semua pernyataan wajib dicentang' }, 400);
  }
  if (typeof body.pdf_base64 !== 'string' || !body.pdf_base64) {
    return c.json({ success: false, error: 'Dokumen PDF tidak ditemukan' }, 400);
  }

  let pdfBuffer;
  try {
    pdfBuffer = base64ToArrayBuffer(body.pdf_base64);
  } catch {
    return c.json({ success: false, error: 'Dokumen PDF tidak valid' }, 400);
  }

  // PDF disimpan DULU. Gagal → TTD ditolak supaya co-broker bisa mencoba lagi;
  // perjanjian "signed" tanpa PDF tidak bisa dibuat ulang (TTD tidak disimpan terpisah).
  const now = new Date();
  const pdfKey = 'cobrokers/' + now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + row.id + '.pdf';
  try {
    await env.R2.put(pdfKey, pdfBuffer, { httpMetadata: { contentType: 'application/pdf' } });
  } catch (e) {
    console.error('R2 upload failed:', e);
    return c.json({ success: false, error: 'Dokumen gagal disimpan. Silakan coba lagi.' }, 500);
  }

  const klaim = await env.DB.prepare(`
    UPDATE cobroker_agreements SET
      status = 'signed', signed_at = datetime('now'),
      bank_name = ?, bank_account_number = ?, bank_account_holder = ?,
      consent_accepted = 1,
      signer_name = partner_name, signer_nik = partner_nik,
      signer_ip = ?, signer_user_agent = ?, pdf_url = ?,
      updated_at = datetime('now')
    WHERE token = ? AND status = 'sent'
  `).bind(bankName, bankAccountNumber, bankAccountHolder, ip, userAgent, pdfKey, token).run();

  if (!klaim.meta?.changes) {
    return c.json({ success: false, error: 'Perjanjian ini sudah ditandatangani' }, 400);
  }

  const baru = await env.DB.prepare('SELECT * FROM cobroker_agreements WHERE token = ?').bind(token).first();
  return c.json({ success: true, data: publicCobroker(baru) });
});

// Unduh PDF (publik per id, sama seperti owner & referral: id = UUID acak)
cobrokers.get('/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    "SELECT pdf_url, agreement_number FROM cobroker_agreements WHERE id = ? AND status = 'signed'",
  ).bind(id).first();
  if (!row?.pdf_url) return c.json({ success: false, error: 'PDF tidak ditemukan' }, 404);

  try {
    const object = await c.env.R2.get(row.pdf_url);
    if (!object) return c.json({ success: false, error: 'File PDF tidak ditemukan di penyimpanan' }, 404);
    const namaFile = 'co-broker-' + String(row.agreement_number || id).replace(/[^A-Za-z0-9-]+/g, '-') + '.pdf';
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${namaFile}"`,
      },
    });
  } catch {
    return c.json({ success: false, error: 'Gagal mengambil PDF' }, 500);
  }
});

function generateSecureToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateCobrokerNumber(env) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const count = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM cobroker_agreements WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?",
  ).bind(String(year), month).first();
  const seq = String((count?.count || 0) + 1).padStart(4, '0');
  return 'SBP/COB/' + year + '/' + month + '/' + seq;
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

export default cobrokers;
