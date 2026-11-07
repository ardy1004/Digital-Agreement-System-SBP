import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { basicAuth } from 'hono/basic-auth';
import referrals from './referrals.js';
import {
  normalisasiPihakKedua, insertSignerStatements, ambilSigners, publicSigner,
  snapshotSigner, hitungProgres, validasiSignature,
} from './signers.js';

// Versi teks pasal untuk perjanjian BARU. Perjanjian lama tetap di versinya
// (lihat migrasi 0006) — teks yang sudah dikirim tidak boleh berubah diam-diam.
const TEMPLATE_VERSION_SEKARANG = 2;

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Jalur yang boleh dibuka tanpa password: halaman & API tanda tangan, aset, proxy gambar.
// Endpoint PDF per-id tetap publik: id berupa UUID acak dan penanda tangan sudah
// menerimanya dari endpoint token (dipakai tombol "Unduh PDF" di halaman sukses).
const PUBLIC_PATHS = [
  /^\/(sign|success)\/[^/]+\/?$/,
  /^\/referrals\/(sign|success)\/[^/]+\/?$/,
  /^\/assets\//,
  /^\/img-proxy\//,
  /^\/(favicon|icons)\.svg$/,
  /^\/api\/health$/,
  /^\/api\/(agreements|referrals)\/(token|sign)\/[^/]+$/,
  /^\/api\/(agreements|referrals)\/[^/]+\/pdf$/,
];

const isLocalHost = (host) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host || '');

// Password admin (Basic Auth) untuk dashboard, form, dan API admin
app.use('*', async (c, next) => {
  if (PUBLIC_PATHS.some((re) => re.test(c.req.path))) return next();

  const password = c.env.ADMIN_PASSWORD;
  if (!password) {
    // Lokal (npm run dev) boleh tanpa password; di production fail-closed
    if (isLocalHost(new URL(c.req.url).host)) return next();
    return c.text('Password admin belum diatur (ADMIN_PASSWORD).', 503);
  }

  return basicAuth({ username: 'admin', password, realm: 'SBP Perjanjian' })(c, next);
});

// Gambar logo / materai / tanda tangan SBP lewat origin sendiri, karena
// images.salambumi.xyz tidak mengirim header CORS (sama seperti proxy di vite.config.js)
app.get('/img-proxy/*', async (c) => {
  const file = new URL(c.req.url).pathname.replace(/^\/img-proxy\//, '');
  if (!file || file.includes('..')) {
    return c.text('Not found', 404);
  }

  const upstream = await fetch('https://images.salambumi.xyz/materai/' + file, {
    headers: { Referer: 'https://images.salambumi.xyz' },
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });

  if (!upstream.ok) {
    return c.text('Image not found', upstream.status);
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Daftar perjanjian + progres TTD (untuk badge "2/3 TTD" di Dashboard)
const SELECT_DAFTAR = `
  SELECT a.*,
    (SELECT COUNT(*) FROM agreement_signers s WHERE s.agreement_id = a.id) AS signer_total,
    (SELECT COUNT(*) FROM agreement_signers s WHERE s.agreement_id = a.id AND s.status = 'signed') AS signer_signed
  FROM agreements a`;

app.get('/api/agreements', async (c) => {
  const { env } = c;
  const status = c.req.query('status');

  const result = status
    ? await env.DB.prepare(SELECT_DAFTAR + ' WHERE a.status = ? ORDER BY a.created_at DESC').bind(status).all()
    : await env.DB.prepare(SELECT_DAFTAR + ' ORDER BY a.created_at DESC').all();
  return c.json({ success: true, data: result.results });
});

// Detail untuk admin: lengkap, termasuk token & TTD tiap penanda tangan
app.get('/api/agreements/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const result = await env.DB.prepare('SELECT * FROM agreements WHERE id = ?').bind(id).first();

  if (!result) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  const signers = await ambilSigners(env.DB, id);
  return c.json({ success: true, data: { ...result, signers } });
});

// Halaman TTD: token = link milik SATU penanda tangan
app.get('/api/agreements/token/:token', async (c) => {
  const { env } = c;
  const data = await muatUntukToken(env, c.req.param('token'));

  if (!data) {
    return c.json({ success: false, error: 'Agreement not found or link expired' }, 404);
  }

  return c.json({ success: true, data: tampilanPenandaTangan(data) });
});

// Create new agreement (+ semua penanda tangan, atomik)
app.post('/api/agreements', async (c) => {
  const { env } = c;
  const body = await c.req.json();

  const hasil = normalisasiPihakKedua(body);
  if (hasil.error) return c.json({ success: false, error: hasil.error }, 400);

  const id = crypto.randomUUID();
  const token = generateSecureToken();
  const agreementNumber = await generateAgreementNumber(env);
  const signerIds = hasil.signers.map(() => crypto.randomUUID());

  const kolom = {
    id, token, status: 'draft', agreement_number: agreementNumber,
    template_version: TEMPLATE_VERSION_SEKARANG,
    ...kolomDariBody(body),
    ...kolomPihakKedua(hasil, signerIds, null),
  };
  const nama = Object.keys(kolom);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO agreements (${nama.join(', ')}) VALUES (${nama.map(() => '?').join(', ')})`,
    ).bind(...nama.map((k) => kolom[k])),
    ...insertSignerStatements(env.DB, id, hasil.signers, token, generateSecureToken, signerIds),
  ]);

  return c.json({ success: true, data: { id, token, agreement_number: agreementNumber } });
});

// Update agreement (only if draft) — daftar penanda tangan diganti seluruhnya
app.put('/api/agreements/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await env.DB.prepare('SELECT status, token, shared_token FROM agreements WHERE id = ?').bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ success: false, error: 'Cannot edit agreement after sending' }, 400);
  }

  const hasil = normalisasiPihakKedua(body);
  if (hasil.error) return c.json({ success: false, error: hasil.error }, 400);

  // Draf belum pernah dikirim → aman dinaikkan ke versi teks terbaru
  const signerIds = hasil.signers.map(() => crypto.randomUUID());
  const kolom = {
    template_version: TEMPLATE_VERSION_SEKARANG,
    ...kolomDariBody(body),
    ...kolomPihakKedua(hasil, signerIds, existing.shared_token),
  };
  const nama = Object.keys(kolom);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE agreements SET ${nama.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now')
       WHERE id = ? AND status = 'draft'`,
    ).bind(...nama.map((k) => kolom[k]), id),
    env.DB.prepare('DELETE FROM agreement_signers WHERE agreement_id = ?').bind(id),
    ...insertSignerStatements(env.DB, id, hasil.signers, existing.token, generateSecureToken, signerIds),
  ]);

  return c.json({ success: true });
});

// Send agreement
app.post('/api/agreements/:id/send', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const existing = await env.DB.prepare('SELECT * FROM agreements WHERE id = ?').bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ success: false, error: 'Agreement already sent or signed' }, 400);
  }

  const signers = await ambilSigners(env.DB, id);
  if (!signers.length) {
    return c.json({ success: false, error: 'Belum ada penanda tangan' }, 400);
  }

  const snapshot = JSON.stringify({ ...existing, signers: signers.map(snapshotSigner) });

  await env.DB.prepare(`
    UPDATE agreements SET status = 'sent', sent_at = datetime('now'),
    document_snapshot = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(snapshot, id).run();

  return c.json({
    success: true,
    data: {
      token: existing.token,
      // Ahli waris + link bersama → link yang dibagikan adalah link bersama
      signing_url: '/sign/' + (existing.sign_mode === 'bersama' && existing.shared_token ? existing.shared_token : existing.token),
    }
  });
});

// Sign agreement — satu penanda tangan per request.
// Body: { signature_png, seen_version, pdf_base64? } — pdf_base64 wajib bila
// penanda tangan ini yang TERAKHIR (PDF final berisi semua TTD).
app.post('/api/agreements/sign/:token', async (c) => {
  const { env } = c;
  const token = c.req.param('token');
  const body = await c.req.json();
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';

  const data = await muatUntukToken(env, token);

  if (!data) {
    return c.json({ success: false, error: 'Agreement not found or link expired' }, 404);
  }

  const { agreement, signers, linkMode } = data;

  // Link bersama: penanda tangan memilih namanya sendiri di halaman TTD
  const me = linkMode === 'bersama'
    ? signers.find((s) => s.id === body.signer_id)
    : data.me;

  if (agreement.status === 'signed') {
    return c.json({ success: false, error: 'This agreement has already been signed' }, 400);
  }

  if (agreement.status !== 'sent') {
    return c.json({ success: false, error: 'Invalid agreement state' }, 400);
  }

  if (!me) {
    return c.json({ success: false, error: 'Pilih nama Anda terlebih dahulu' }, 400);
  }

  if (me.status === 'signed') {
    return c.json({ success: false, error: 'Anda sudah menandatangani perjanjian ini' }, 400);
  }

  // Pernyataan identitas wajib di link bersama (satu-satunya pengaman bahwa
  // yang memilih nama memang orangnya) dan di perjanjian ahli waris versi baru.
  const wajibPernyataan = linkMode === 'bersama' ||
    (agreement.owner_mode === 'ahli_waris' && agreement.template_version >= 2);
  if (wajibPernyataan && body.statement !== true) {
    return c.json({ success: false, error: 'Pernyataan identitas wajib dicentang' }, 400);
  }

  // Tab yang terbuka SEBELUM fitur ini dideploy mengirim format lama
  // ({ signer_name, signer_nik, pdf_base64 }). Sah hanya untuk 1 penanda tangan:
  // TTD-nya ada di PDF, tidak perlu disimpan terpisah.
  const formatLama = body.signature_png === undefined && signers.length === 1;
  let signature = null;
  let seen = 0;

  if (!formatLama) {
    const salah = validasiSignature(body.signature_png);
    if (salah) return c.json({ success: false, error: salah }, 400);
    signature = body.signature_png;
    seen = Number(body.seen_version);
    if (!Number.isInteger(seen) || seen < 0) {
      return c.json({ success: false, error: 'Versi dokumen tidak valid' }, 400);
    }
  }

  const { signed: sudahTtd } = hitungProgres(signers);
  if (seen !== sudahTtd) return konflikVersi(c);

  const terakhir = signers.filter((s) => s.status !== 'signed').length === 1;
  if (terakhir && !body.pdf_base64) {
    return c.json({ success: false, error: 'Dokumen PDF tidak ditemukan' }, 400);
  }

  // Klaim atomik: gagal bila orang lain menandatangani di antara saat halaman
  // dibuka dan sekarang — PDF final tidak boleh kehilangan satu TTD pun.
  const klaim = await env.DB.prepare(`
    UPDATE agreement_signers SET
      status = 'signed', signature_png = ?, signed_at = datetime('now'),
      signer_ip = ?, signer_user_agent = ?,
      sign_method = ?, statement_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
    WHERE id = ? AND status = 'pending'
      AND (SELECT COUNT(*) FROM agreement_signers WHERE agreement_id = ? AND status = 'signed') = ?
  `).bind(
    signature, ip, userAgent,
    linkMode, body.statement === true ? 1 : 0,
    me.id, agreement.id, seen,
  ).run();

  if (!klaim.meta?.changes) return konflikVersi(c);

  if (terakhir) {
    const pdfKey = await simpanPdf(env, agreement, body.pdf_base64);
    const semua = await ambilSigners(env.DB, agreement.id);
    await env.DB.prepare(`
      UPDATE agreements SET
        status = 'signed',
        signed_at = datetime('now'),
        signer_name = ?,
        signer_nik = ?,
        signer_ip = ?,
        signer_user_agent = ?,
        pdf_url = ?,
        updated_at = datetime('now')
      WHERE id = ? AND status = 'sent'
    `).bind(
      semua.map((s) => s.name).join(', '), semua.map((s) => s.nik).join(', '),
      ip, userAgent, pdfKey, agreement.id
    ).run();
  }

  // Di link bersama `me` tidak tersimpan di token → kembalikan orang yang baru TTD
  const baru = await muatUntukToken(env, token);
  const meBaru = baru.signers.find((s) => s.id === me.id) || baru.me;
  return c.json({ success: true, data: tampilanPenandaTangan({ ...baru, me: meBaru }) });
});

// Buat ulang PDF dari TTD yang tersimpan (admin) — cadangan bila browser
// penanda tangan terakhir gagal membuat PDF atau unggahan R2 gagal.
app.post('/api/agreements/:id/regenerate-pdf', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const body = await c.req.json();

  const agreement = await env.DB.prepare('SELECT * FROM agreements WHERE id = ?').bind(id).first();
  if (!agreement) return c.json({ success: false, error: 'Agreement not found' }, 404);

  if (agreement.status !== 'signed') {
    return c.json({ success: false, error: 'PDF hanya bisa dibuat ulang setelah semua pihak menandatangani' }, 400);
  }

  const signers = await ambilSigners(env.DB, id);
  if (signers.some((s) => !s.signature_png)) {
    return c.json({
      success: false,
      error: 'Tanda tangan perjanjian ini tidak tersimpan terpisah (dibuat sebelum fitur multi penanda tangan), jadi PDF-nya tidak bisa dibuat ulang.',
    }, 400);
  }

  if (!body.pdf_base64) return c.json({ success: false, error: 'Dokumen PDF tidak ditemukan' }, 400);

  const pdfKey = await simpanPdf(env, agreement, body.pdf_base64);
  if (!pdfKey) return c.json({ success: false, error: 'Gagal menyimpan PDF' }, 500);

  await env.DB.prepare("UPDATE agreements SET pdf_url = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(pdfKey, id).run();

  return c.json({ success: true });
});

// Download PDF
app.get('/api/agreements/:id/pdf', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const agreement = await env.DB.prepare('SELECT pdf_url FROM agreements WHERE id = ? AND status = ?').bind(id, 'signed').first();

  if (!agreement || !agreement.pdf_url) {
    return c.json({ success: false, error: 'PDF not found' }, 404);
  }

  try {
    const object = await env.R2.get(agreement.pdf_url);

    if (!object) {
      return c.json({ success: false, error: 'PDF file not found in storage' }, 404);
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="agreement-' + id + '.pdf"',
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Error retrieving PDF' }, 500);
  }
});

// Perjanjian Kerja Sama Referal
app.route('/api/referrals', referrals);

// API yang tidak dikenal → 404 JSON (bukan halaman React)
app.all('/api/*', (c) => c.json({ success: false, error: 'Not found' }, 404));

// Selain API: sajikan frontend (build Vite); alamat halaman React jatuh ke index.html
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// Kolom yang BOLEH dilihat penanda tangan (endpoint publik /token & /sign).
// ALLOWLIST, bukan blocklist: kolom baru tidak ikut terkirim sebelum sengaja
// ditambahkan di sini. Yang sengaja tidak ada:
//   additional_clause  — catatan internal (harga nett, selisih fee broker)
//   document_snapshot  — salinan baris lengkap, termasuk catatan internal
//   token              — link TTD; di perjanjian multi penanda tangan = link orang lain
//   shared_token       — link bersama; pemegang link per orang (mode ketat) tidak boleh mendapatkannya
//   signer_ip / signer_user_agent / pdf_url (key R2)
const PUBLIC_AGREEMENT_FIELDS = [
  'id', 'agreement_number', 'status', 'type', 'fee_percent', 'net_owner_price',
  'tax_by', 'notary_by', 'clause_e', 'decedent_name',
  'owner_mode', 'sign_mode', 'template_version',
  'payout_bank', 'payout_account_number', 'payout_account_holder',
  'heir_letter_number', 'representative_signer_id',
  'property_title', 'property_land_area', 'property_building_area',
  'property_legal', 'property_address', 'property_maps',
  'party1_name', 'party1_nik', 'party1_address', 'party1_contact', 'party1_description',
  'party2_name', 'party2_company', 'party2_address', 'party2_contact', 'party2_description',
  'duration', 'is_exclusive', 'sent_at', 'signed_at', 'signer_name',
];

function publicAgreement(row) {
  if (!row) return null;
  const out = Object.fromEntries(PUBLIC_AGREEMENT_FIELDS.map((k) => [k, row[k] ?? null]));
  out.has_pdf = Boolean(row.pdf_url);
  return out;
}

// Token → { me, agreement, signers, linkMode }.
//   'pribadi' : token milik SATU penanda tangan (penanda tangan #1 memakai token
//               perjanjian, lihat migrasi 0005) → me = orang itu
//   'bersama' : agreements.shared_token (ahli waris, satu link untuk semua)
//               → me = null; penanda tangan memilih namanya di halaman TTD
async function muatUntukToken(env, token) {
  let me = await env.DB.prepare('SELECT * FROM agreement_signers WHERE token = ?').bind(token).first();
  let agreement;
  let linkMode = 'pribadi';

  if (me) {
    agreement = await env.DB.prepare('SELECT * FROM agreements WHERE id = ?').bind(me.agreement_id).first();
  } else {
    agreement = await env.DB.prepare(
      "SELECT * FROM agreements WHERE shared_token = ? AND sign_mode = 'bersama'",
    ).bind(token).first();
    me = null;
    linkMode = 'bersama';
  }
  if (!agreement) return null;

  const signers = await ambilSigners(env.DB, agreement.id);
  return { me, agreement, signers, linkMode };
}

// Respons publik halaman TTD. seen_version = jumlah yang sudah TTD saat dimuat;
// dikirim balik saat TTD untuk deteksi tabrakan.
function tampilanPenandaTangan({ me, agreement, signers, linkMode }) {
  const { total, signed } = hitungProgres(signers);
  return {
    ...publicAgreement(agreement),
    signers: signers.map(publicSigner),
    me_id: me?.id ?? null,
    link_mode: linkMode,
    seen_version: signed,
    signer_total: total,
    signer_signed: signed,
  };
}

function konflikVersi(c) {
  return c.json({
    success: false,
    code: 'VERSION_CONFLICT',
    error: 'Pihak lain baru saja menandatangani perjanjian ini. Dokumen dimuat ulang — silakan periksa, lalu tanda tangan lagi.',
  }, 409);
}

// Simpan PDF ke R2. Key lama dipakai ulang bila ada (buat ulang PDF menimpa).
// Gagal → null: perjanjian tetap tersimpan, PDF bisa dibuat ulang dari admin.
async function simpanPdf(env, agreement, pdfBase64) {
  const now = new Date();
  const pdfKey = agreement.pdf_url ||
    'agreements/' + now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + agreement.id + '.pdf';
  try {
    await env.R2.put(pdfKey, base64ToArrayBuffer(pdfBase64), {
      httpMetadata: { contentType: 'application/pdf' },
    });
    return pdfKey;
  } catch (e) {
    console.error('R2 upload failed:', e);
    return null;
  }
}

// Kolom perjanjian yang diisi admin (create & update draf). undefined → null
// karena D1 menolak bind undefined.
function kolomDariBody(body) {
  const kolom = {
    type: body.type,
    fee_percent: body.fee_percent || null,
    net_owner_price: body.net_owner_price || null,
    tax_by: body.tax_by,
    notary_by: body.notary_by,
    additional_clause: body.additional_clause || null,
    clause_e: normalisasiKlausulE(body.clause_e),
    property_title: body.property_title,
    property_land_area: body.property_land_area,
    property_building_area: body.property_building_area,
    property_legal: body.property_legal,
    property_address: body.property_address,
    property_maps: body.property_maps || null,
    party2_name: body.party2_name,
    party2_company: body.party2_company || null,
    party2_address: body.party2_address,
    party2_contact: body.party2_contact,
    party2_description: body.party2_description || null,
    duration: body.duration || '90',
    is_exclusive: body.is_exclusive || 'false',
  };
  for (const k of Object.keys(kolom)) if (kolom[k] === undefined) kolom[k] = null;
  return kolom;
}

// Kolom Pihak Kedua dari hasil normalisasiPihakKedua().
// party1_* = cermin penanda tangan #1, supaya Dashboard & kode yang membaca
// party1_name tetap benar. Sumber kebenaran: tabel agreement_signers.
// shared_token hanya ada untuk ahli waris + link bersama; token lama dipakai
// ulang saat draf diedit supaya link bersama yang sudah disalin tetap sama.
function kolomPihakKedua(hasil, signerIds, sharedTokenLama) {
  const s = hasil.signers[0];
  const bersama = hasil.ownerMode === 'ahli_waris' && hasil.signMode === 'bersama';
  return {
    party1_name: s.name,
    party1_nik: s.nik,
    party1_address: s.address || null,
    party1_contact: s.contact || null,
    party1_description: s.description || null,
    owner_mode: hasil.ownerMode,
    sign_mode: hasil.signMode,
    shared_token: bersama ? (sharedTokenLama || generateSecureToken()) : null,
    decedent_name: hasil.decedentName,
    payout_bank: hasil.payoutBank,
    payout_account_number: hasil.payoutAccountNumber,
    payout_account_holder: hasil.payoutAccountHolder,
    heir_letter_number: hasil.heirLetterNumber,
    representative_signer_id: hasil.representativeIndex === null ? null : signerIds[hasil.representativeIndex],
  };
}

// Pasal 7 poin e: teks manual admin, tampil di dokumen pemilik. Kosong → null
// (poin e tidak dicetak). Awalan "e." yang ikut diketik dibuang supaya tidak
// tercetak "e. e. …".
function normalisasiKlausulE(nilai) {
  if (typeof nilai !== 'string') return null;
  const teks = nilai.trim().replace(/^e\s*[.)]\s+/i, '').trim();
  return teks ? teks.slice(0, 2000) : null;
}

function generateSecureToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function generateAgreementNumber(env) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const count = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM agreements WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?"
  ).bind(String(year), month).first();
  const seq = String((count?.count || 0) + 1).padStart(4, '0');
  return 'SBP/' + year + '/' + month + '/' + seq;
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export default app;
