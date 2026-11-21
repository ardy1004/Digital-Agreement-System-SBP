import { Hono } from 'hono';
import { validasiSignature } from './signers.js';

// Kuitansi digital: booking fee / tanda jadi / DP / pelunasan.
//
// Penerima dana:
//   'sbp'     → SBP penerima (TTD tersimpan otomatis). Klien TTD bila diminta.
//   'pemilik' → pemilik penerima dan WAJIB TTD lewat link sendiri; SBP "Mengetahui".
//
// Pengaman (pola cobrokers.js):
//   - endpoint publik ALLOWLIST; harga dibuang bila show_price = 0 (skema margin);
//   - nomor diberikan saat dikirim (draf tidak membuat nomor bolong);
//   - tidak bisa diedit setelah dikirim → dibatalkan (void), tidak dihapus;
//   - klaim TTD kondisional; penanda tangan TERAKHIR membuat PDF; PDF gagal → TTD ditolak.

const TEMPLATE_VERSION_SEKARANG = 1;

const MODE_PENERIMA = ['sbp', 'pemilik'];
const JENIS = ['booking_fee', 'tanda_jadi', 'dp', 'pelunasan', 'lainnya'];
const BERKETENTUAN = new Set(['booking_fee', 'tanda_jadi', 'dp']);
const WAJIB_MASA_BERLAKU = new Set(['booking_fee', 'tanda_jadi']);
const METODE = ['transfer', 'tunai'];
const CARA_BELI = ['tunai_keras', 'tunai_bertahap', 'kpr'];
const BILA_BATAL = ['hangus', 'kembali_penuh', 'kembali_potong'];
const BILA_KPR = ['kembali_penuh', 'kembali_potong'];
const NOMINAL_MAKS = 999_999_999_999_999; // < 1.000 triliun (batas terbilang)

const KOLOM_ADMIN = [
  'receiver_mode', 'require_payer_sign', 'show_price',
  'sbp_name', 'sbp_company', 'sbp_address', 'sbp_contact',
  'payer_name', 'payer_nik', 'payer_contact', 'payer_address', 'buyer_name',
  'owner_name', 'owner_nik', 'owner_contact', 'owner_address',
  'payment_type', 'payment_type_other', 'amount', 'received_date', 'method',
  'dest_bank', 'dest_account_number', 'dest_account_holder', 'sender_bank', 'transfer_ref',
  'listing_code', 'property_type', 'property_address', 'land_area', 'building_area', 'legal',
  'deal_price', 'paid_before', 'purchase_method',
  'valid_until', 'settlement_deadline', 'counts_toward_price',
  'buyer_cancel', 'buyer_cancel_deduction', 'kpr_rejected', 'kpr_rejected_deduction',
  'seller_cancel_refund_days', 'additional_note', 'internal_note',
];

// Kolom yang BOLEH dilihat penanda tangan (endpoint publik /token & /sign).
// ALLOWLIST. Sengaja tidak ada: internal_note, void_reason, token, IP/user agent,
// payer_contact/owner_contact, proof_key (→ has_bukti), pdf_url (→ has_pdf),
// document_snapshot. deal_price & paid_before dibuang bila show_price = 0.
const KOLOM_PUBLIK = [
  'id', 'nomor', 'status', 'template_version', 'verify_token',
  'receiver_mode', 'require_payer_sign', 'show_price',
  'sbp_name', 'sbp_company', 'sbp_address', 'sbp_contact',
  'payer_name', 'payer_nik', 'payer_address', 'buyer_name',
  'owner_name', 'owner_nik', 'owner_address',
  'payment_type', 'payment_type_other', 'amount', 'received_date', 'method',
  'dest_bank', 'dest_account_number', 'dest_account_holder', 'sender_bank', 'transfer_ref',
  'listing_code', 'property_type', 'property_address', 'land_area', 'building_area', 'legal',
  'deal_price', 'paid_before', 'purchase_method',
  'valid_until', 'settlement_deadline', 'counts_toward_price',
  'buyer_cancel', 'buyer_cancel_deduction', 'kpr_rejected', 'kpr_rejected_deduction',
  'seller_cancel_refund_days', 'additional_note',
  'payer_signature_png', 'payer_signed_at', 'owner_signature_png', 'owner_signed_at',
  'sent_at', 'signed_at', 'void_at', 'created_at',
];

// Kolom ringan untuk daftar Dashboard (tanpa PNG tanda tangan & snapshot)
const KOLOM_DAFTAR = [
  'id', 'nomor', 'status', 'receiver_mode', 'require_payer_sign',
  'payer_name', 'owner_name', 'payment_type', 'payment_type_other', 'amount',
  'method', 'dest_bank', 'dest_account_number', 'dest_account_holder',
  'payer_token', 'owner_token', 'payer_signed_at', 'owner_signed_at',
  'created_at', 'sent_at', 'signed_at', 'void_at',
];

// ── Normalisasi ─────────────────────────────────────────────────────────

function teks(v, maks = 300) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, maks) : null;
}

// "10.000.000" / 10000000 → 10000000; kosong → null; tidak sah → NaN
function rupiah(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/[^\d]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : NaN;
}

function tanggal(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

function bit(v, bawaan) {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  return bawaan;
}

function nik(v) {
  const t = teks(v, 40);
  return t ? t.replace(/[\s.-]/g, '') : null;
}

// Body admin → { kolom } | { error }
export function normalisasiKuitansi(body) {
  const b = body || {};
  const k = {};

  k.receiver_mode = b.receiver_mode;
  if (!MODE_PENERIMA.includes(k.receiver_mode)) return { error: 'Pilih penerima dana: SBP atau pemilik' };
  const modePemilik = k.receiver_mode === 'pemilik';

  k.payment_type = b.payment_type;
  if (!JENIS.includes(k.payment_type)) return { error: 'Pilih jenis pembayaran' };
  k.payment_type_other = k.payment_type === 'lainnya' ? teks(b.payment_type_other, 100) : null;
  if (k.payment_type === 'lainnya' && !k.payment_type_other) return { error: 'Isi keterangan jenis pembayaran' };
  const berketentuan = BERKETENTUAN.has(k.payment_type);

  k.require_payer_sign = bit(b.require_payer_sign, berketentuan ? 1 : 0);
  k.show_price = bit(b.show_price, modePemilik ? 0 : 1);

  for (const f of ['sbp_name', 'sbp_company', 'sbp_address', 'sbp_contact']) k[f] = teks(b[f]);
  if (!k.sbp_name) return { error: 'Nama Pihak SBP wajib diisi' };

  k.payer_name = teks(b.payer_name, 200);
  k.payer_nik = nik(b.payer_nik);
  k.payer_contact = teks(b.payer_contact, 50);
  k.payer_address = teks(b.payer_address);
  k.buyer_name = teks(b.buyer_name, 200);
  if (!k.payer_name) return { error: 'Nama penyetor wajib diisi' };
  if (k.payer_nik && !/^\d{16}$/.test(k.payer_nik)) return { error: 'NIK penyetor harus 16 angka' };
  if (k.require_payer_sign && !k.payer_contact) return { error: 'No. HP penyetor wajib diisi (untuk mengirim link tanda tangan)' };

  if (modePemilik) {
    k.owner_name = teks(b.owner_name, 200);
    k.owner_nik = nik(b.owner_nik);
    k.owner_contact = teks(b.owner_contact, 50);
    k.owner_address = teks(b.owner_address);
    if (!k.owner_name) return { error: 'Nama pemilik wajib diisi' };
    if (!k.owner_contact) return { error: 'No. HP pemilik wajib diisi (untuk mengirim link tanda tangan)' };
    if (k.owner_nik && !/^\d{16}$/.test(k.owner_nik)) return { error: 'NIK pemilik harus 16 angka' };
  } else {
    k.owner_name = k.owner_nik = k.owner_contact = k.owner_address = null;
  }

  k.amount = rupiah(b.amount);
  if (!k.amount || Number.isNaN(k.amount) || k.amount > NOMINAL_MAKS) return { error: 'Nominal pembayaran tidak valid' };
  k.received_date = tanggal(b.received_date);
  if (!k.received_date) return { error: 'Tanggal diterima tidak valid' };

  k.method = b.method;
  if (!METODE.includes(k.method)) return { error: 'Pilih metode pembayaran' };
  const transfer = k.method === 'transfer';
  k.dest_bank = transfer ? teks(b.dest_bank, 100) : null;
  k.dest_account_number = transfer ? teks(b.dest_account_number, 50) : null;
  k.dest_account_holder = transfer ? teks(b.dest_account_holder, 200) : null;
  k.sender_bank = transfer ? teks(b.sender_bank, 100) : null;
  k.transfer_ref = transfer ? teks(b.transfer_ref, 100) : null;
  if (transfer && !(k.dest_bank && k.dest_account_number && k.dest_account_holder)) {
    return { error: 'Rekening tujuan (bank, nomor, atas nama) wajib diisi untuk transfer' };
  }

  k.listing_code = teks(b.listing_code, 50);
  k.property_type = teks(b.property_type, 200);
  k.property_address = teks(b.property_address, 500);
  k.land_area = teks(b.land_area, 30);
  k.building_area = teks(b.building_area, 30);
  k.legal = teks(b.legal, 50);
  if (!k.property_type || !k.property_address) return { error: 'Jenis dan alamat properti wajib diisi' };

  k.purchase_method = b.purchase_method;
  if (!CARA_BELI.includes(k.purchase_method)) return { error: 'Pilih cara pembelian' };

  // Ketentuan
  if (berketentuan) {
    k.valid_until = tanggal(b.valid_until);
    if (WAJIB_MASA_BERLAKU.has(k.payment_type) && !k.valid_until) return { error: 'Tanggal "berlaku sampai" wajib diisi' };
    if (k.valid_until && k.valid_until < k.received_date) return { error: 'Tanggal "berlaku sampai" tidak boleh sebelum tanggal diterima' };
    k.settlement_deadline = tanggal(b.settlement_deadline);
    k.counts_toward_price = bit(b.counts_toward_price, 1);

    k.buyer_cancel = b.buyer_cancel;
    if (!BILA_BATAL.includes(k.buyer_cancel)) return { error: 'Pilih ketentuan bila klien membatalkan' };
    k.buyer_cancel_deduction = k.buyer_cancel === 'kembali_potong' ? rupiah(b.buyer_cancel_deduction) : null;
    if (k.buyer_cancel === 'kembali_potong' && !(k.buyer_cancel_deduction > 0 && k.buyer_cancel_deduction < k.amount)) {
      return { error: 'Potongan bila klien batal harus lebih dari 0 dan kurang dari nominal' };
    }

    if (k.purchase_method === 'kpr') {
      k.kpr_rejected = b.kpr_rejected;
      if (!BILA_KPR.includes(k.kpr_rejected)) return { error: 'Pilih ketentuan bila KPR ditolak bank' };
      k.kpr_rejected_deduction = k.kpr_rejected === 'kembali_potong' ? rupiah(b.kpr_rejected_deduction) : null;
      if (k.kpr_rejected === 'kembali_potong' && !(k.kpr_rejected_deduction > 0 && k.kpr_rejected_deduction < k.amount)) {
        return { error: 'Potongan bila KPR ditolak harus lebih dari 0 dan kurang dari nominal' };
      }
    } else {
      k.kpr_rejected = k.kpr_rejected_deduction = null;
    }

    const hari = Number(b.seller_cancel_refund_days ?? 7);
    if (!Number.isInteger(hari) || hari < 1 || hari > 90) return { error: 'Batas pengembalian dana harus 1–90 hari kerja' };
    k.seller_cancel_refund_days = hari;
  } else {
    k.valid_until = k.settlement_deadline = k.counts_toward_price = null;
    k.buyer_cancel = k.buyer_cancel_deduction = k.kpr_rejected = k.kpr_rejected_deduction = null;
    k.seller_cancel_refund_days = null;
  }

  // Harga & sisa
  k.deal_price = rupiah(b.deal_price);
  k.paid_before = rupiah(b.paid_before) || 0;
  if (Number.isNaN(k.deal_price) || Number.isNaN(k.paid_before)) return { error: 'Harga / pembayaran sebelumnya tidak valid' };
  if (k.show_price && !k.deal_price) return { error: 'Isi harga deal, atau matikan "Cetak harga deal & sisa pembayaran"' };
  const dihitung = berketentuan ? k.counts_toward_price === 1 : true;
  if (k.deal_price && k.deal_price < k.paid_before + (dihitung ? k.amount : 0)) {
    return { error: 'Harga deal lebih kecil dari total yang sudah dibayar' };
  }

  k.additional_note = teks(b.additional_note, 2000);
  k.internal_note = teks(b.internal_note, 2000);

  return { kolom: k };
}

// ── Tampilan publik ────────────────────────────────────────────────────

function perluTtd(row) {
  return { payer: row.require_payer_sign === 1, owner: row.receiver_mode === 'pemilik' };
}

function publik(row, role) {
  const out = Object.fromEntries(KOLOM_PUBLIK.map((k) => [k, row[k] ?? null]));
  if (!row.show_price) {
    out.deal_price = null;
    out.paid_before = null;
  }
  const perlu = perluTtd(row);
  out.role = role;
  out.perlu_klien = perlu.payer;
  out.perlu_pemilik = perlu.owner;
  out.has_pdf = Boolean(row.pdf_url);
  out.has_bukti = Boolean(row.proof_key);
  return out;
}

// "Budi Santoso" → "Bu** Sa*****"
export function samarkan(nama) {
  return String(nama || '').trim().split(/\s+/).filter(Boolean)
    .map((k) => (k.length <= 2 ? k[0] + '*' : k.slice(0, 2) + '*'.repeat(k.length - 2))).join(' ');
}

// ── Utilitas ───────────────────────────────────────────────────────────

function token(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Tahun/bulan WIB untuk nomor & key R2
function bulanWib() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return { y: String(d.getUTCFullYear()), m: String(d.getUTCMonth() + 1).padStart(2, '0') };
}

function base64KeBuffer(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

// Simpan PDF; gagal → null
async function simpanPdf(env, row, pdfBase64) {
  if (typeof pdfBase64 !== 'string' || !pdfBase64) return { error: 'Dokumen PDF tidak ditemukan', status: 400 };
  let buf;
  try {
    buf = base64KeBuffer(pdfBase64);
  } catch {
    return { error: 'Dokumen PDF tidak valid', status: 400 };
  }
  const { y, m } = bulanWib();
  const key = row.pdf_url || `kuitansi/${y}/${m}/${row.id}.pdf`;
  try {
    await env.R2.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } });
    return { key };
  } catch (e) {
    console.error('R2 upload failed:', e);
    return { error: 'Dokumen gagal disimpan. Silakan coba lagi.', status: 500 };
  }
}

async function muatToken(env, tkn) {
  const row = await env.DB.prepare('SELECT * FROM kuitansi WHERE payer_token = ? OR owner_token = ?').bind(tkn, tkn).first();
  if (!row) return null;
  return { row, role: row.payer_token === tkn ? 'payer' : 'owner' };
}

const kuitansi = new Hono();

// ── Admin ──────────────────────────────────────────────────────────────

kuitansi.get('/', async (c) => {
  const r = await c.env.DB.prepare(`SELECT ${KOLOM_DAFTAR.join(', ')} FROM kuitansi ORDER BY created_at DESC`).all();
  return c.json({ success: true, data: r.results });
});

// ── Publik (didefinisikan sebelum /:id) ────────────────────────────────

kuitansi.get('/token/:token', async (c) => {
  const hasil = await muatToken(c.env, c.req.param('token'));
  if (!hasil) return c.json({ success: false, error: 'Kuitansi tidak ditemukan atau link sudah tidak berlaku' }, 404);
  return c.json({ success: true, data: publik(hasil.row, hasil.role) });
});

// Foto bukti transfer untuk halaman TTD (dirender ke lampiran PDF)
kuitansi.get('/token/:token/bukti', async (c) => {
  const hasil = await muatToken(c.env, c.req.param('token'));
  return (hasil && await kirimBukti(c.env, hasil.row.proof_key))
    || c.json({ success: false, error: 'Bukti transfer tidak ada' }, 404);
});

kuitansi.get('/verify/:vt', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT * FROM kuitansi WHERE verify_token = ? AND nomor IS NOT NULL',
  ).bind(c.req.param('vt')).first();
  if (!row) return c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  return c.json({
    success: true,
    data: {
      nomor: row.nomor,
      status: row.status,
      payment_type: row.payment_type,
      payment_type_other: row.payment_type_other,
      amount: row.amount,
      received_date: row.received_date,
      property_type: row.property_type,
      property_address: row.property_address,
      listing_code: row.listing_code,
      receiver_mode: row.receiver_mode,
      penerima: row.receiver_mode === 'pemilik' ? samarkan(row.owner_name) : (row.sbp_company || 'CV Salam Bumi Property'),
      penyetor: samarkan(row.payer_name),
      sent_at: row.sent_at,
      signed_at: row.signed_at,
      void_at: row.void_at,
    },
  });
});

kuitansi.post('/sign/:token', async (c) => {
  const { env } = c;
  const hasil = await muatToken(env, c.req.param('token'));
  if (!hasil) return c.json({ success: false, error: 'Kuitansi tidak ditemukan atau link sudah tidak berlaku' }, 404);
  const { row, role } = hasil;
  const body = await c.req.json();

  if (row.status === 'void') return c.json({ success: false, error: 'Kuitansi ini sudah dibatalkan' }, 400);
  if (row.status === 'signed') return c.json({ success: false, error: 'Kuitansi ini sudah lengkap ditandatangani' }, 400);
  if (row.status !== 'sent') return c.json({ success: false, error: 'Kuitansi belum dikirim' }, 400);

  const perlu = perluTtd(row);
  const lain = role === 'payer' ? 'owner' : 'payer';
  if (!perlu[role]) return c.json({ success: false, error: 'Link ini tidak memerlukan tanda tangan' }, 400);
  if (row[`${role}_signed_at`]) return c.json({ success: false, error: 'Anda sudah menandatangani kuitansi ini' }, 400);

  const salah = validasiSignature(body.signature_png);
  if (salah) return c.json({ success: false, error: salah }, 400);
  if (body.statement !== true) return c.json({ success: false, error: 'Pernyataan wajib dicentang' }, 400);

  const lainSudah = Boolean(row[`${lain}_signed_at`]);
  if (perlu[lain] && Boolean(body.other_signed) !== lainSudah) return konflik(c);
  const terakhir = !perlu[lain] || lainSudah;

  let pdfKey = null;
  if (terakhir) {
    const simpan = await simpanPdf(env, row, body.pdf_base64);
    if (simpan.error) return c.json({ success: false, error: simpan.error }, simpan.status);
    pdfKey = simpan.key;
  }

  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const ua = c.req.header('User-Agent') || 'unknown';
  const set = [
    `${role}_signature_png = ?`, `${role}_signed_at = datetime('now')`, `${role}_ip = ?`, `${role}_user_agent = ?`,
    ...(role === 'payer' ? ["payer_statement_at = datetime('now')"] : []),
    ...(terakhir ? ["status = 'signed'", "signed_at = datetime('now')", 'pdf_url = ?'] : []),
    "updated_at = datetime('now')",
  ];
  const klaim = await env.DB.prepare(`
    UPDATE kuitansi SET ${set.join(', ')}
    WHERE id = ? AND status = 'sent' AND ${role}_signed_at IS NULL
      AND (${lain}_signed_at IS NOT NULL) = ?
  `).bind(body.signature_png, ip, ua, ...(terakhir ? [pdfKey] : []), row.id, lainSudah ? 1 : 0).run();

  if (!klaim.meta?.changes) return konflik(c);

  const baru = await env.DB.prepare('SELECT * FROM kuitansi WHERE id = ?').bind(row.id).first();
  return c.json({ success: true, data: publik(baru, role) });
});

// ── Admin per id ───────────────────────────────────────────────────────

kuitansi.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM kuitansi WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  return c.json({ success: true, data: row });
});

kuitansi.post('/', async (c) => {
  const hasil = normalisasiKuitansi(await c.req.json());
  if (hasil.error) return c.json({ success: false, error: hasil.error }, 400);

  const kolom = {
    id: crypto.randomUUID(), status: 'draft', template_version: TEMPLATE_VERSION_SEKARANG,
    verify_token: token(16), ...hasil.kolom,
  };
  const nama = Object.keys(kolom);
  await c.env.DB.prepare(
    `INSERT INTO kuitansi (${nama.join(', ')}) VALUES (${nama.map(() => '?').join(', ')})`,
  ).bind(...nama.map((k) => kolom[k])).run();

  return c.json({ success: true, data: { id: kolom.id } });
});

kuitansi.put('/:id', async (c) => {
  const id = c.req.param('id');
  const hasil = normalisasiKuitansi(await c.req.json());
  if (hasil.error) return c.json({ success: false, error: hasil.error }, 400);

  const kolom = { template_version: TEMPLATE_VERSION_SEKARANG, ...hasil.kolom };
  const nama = KOLOM_ADMIN.concat('template_version');
  const res = await c.env.DB.prepare(
    `UPDATE kuitansi SET ${nama.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now')
     WHERE id = ? AND status = 'draft'`,
  ).bind(...nama.map((k) => kolom[k] ?? null), id).run();

  if (!res.meta?.changes) {
    const ada = await c.env.DB.prepare('SELECT status FROM kuitansi WHERE id = ?').bind(id).first();
    return ada
      ? c.json({ success: false, error: 'Kuitansi yang sudah dikirim tidak bisa diubah. Batalkan lalu buat yang baru.' }, 400)
      : c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  }
  return c.json({ success: true });
});

// Kirim / siapkan terbit: beri nomor + token penanda tangan yang diperlukan
kuitansi.post('/:id/send', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const row = await env.DB.prepare('SELECT * FROM kuitansi WHERE id = ?').bind(id).first();
  if (!row) return c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  if (row.status !== 'draft') return c.json({ success: false, error: 'Kuitansi sudah dikirim atau dibatalkan' }, 400);

  const perlu = perluTtd(row);
  const payerToken = perlu.payer ? token() : null;
  const ownerToken = perlu.owner ? token() : null;
  const { y, m } = bulanWib();
  const awalan = `SBP/KWT/${y}/${m}/`;

  for (let coba = 0; coba < 3; coba++) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM kuitansi WHERE nomor LIKE ?').bind(awalan + '%').first();
    const nomor = awalan + String((n?.n || 0) + 1 + coba).padStart(4, '0');
    try {
      const res = await env.DB.prepare(`
        UPDATE kuitansi SET status = 'sent', nomor = ?, sent_at = datetime('now'),
          payer_token = ?, owner_token = ?, document_snapshot = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'draft'
      `).bind(nomor, payerToken, ownerToken, JSON.stringify({ ...row, nomor }), id).run();
      if (!res.meta?.changes) return c.json({ success: false, error: 'Kuitansi sudah dikirim' }, 400);
      const baru = await env.DB.prepare('SELECT * FROM kuitansi WHERE id = ?').bind(id).first();
      return c.json({ success: true, data: baru });
    } catch (e) {
      if (!/UNIQUE/i.test(String(e?.message || e))) throw e;
    }
  }
  return c.json({ success: false, error: 'Gagal memberi nomor kuitansi, coba lagi' }, 500);
});

// Terbitkan tanpa tanda tangan pihak luar (penerima SBP + klien tidak TTD):
// PDF dibuat di halaman admin.
kuitansi.post('/:id/terbitkan', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const row = await env.DB.prepare('SELECT * FROM kuitansi WHERE id = ?').bind(id).first();
  if (!row) return c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  if (row.status !== 'sent') return c.json({ success: false, error: 'Kuitansi belum dikirim atau sudah final' }, 400);
  const perlu = perluTtd(row);
  if (perlu.payer || perlu.owner) return c.json({ success: false, error: 'Kuitansi ini menunggu tanda tangan, tidak bisa diterbitkan langsung' }, 400);

  const body = await c.req.json();
  const simpan = await simpanPdf(env, row, body.pdf_base64);
  if (simpan.error) return c.json({ success: false, error: simpan.error }, simpan.status);

  const res = await env.DB.prepare(`
    UPDATE kuitansi SET status = 'signed', signed_at = datetime('now'), pdf_url = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'sent'
  `).bind(simpan.key, id).run();
  if (!res.meta?.changes) return c.json({ success: false, error: 'Kuitansi sudah final' }, 400);
  return c.json({ success: true });
});

kuitansi.post('/:id/batal', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const alasan = teks(body?.alasan, 500);
  if (!alasan) return c.json({ success: false, error: 'Alasan pembatalan wajib diisi' }, 400);

  const res = await c.env.DB.prepare(`
    UPDATE kuitansi SET status = 'void', void_at = datetime('now'), void_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND status != 'void'
  `).bind(alasan, id).run();
  if (!res.meta?.changes) return c.json({ success: false, error: 'Kuitansi tidak ditemukan atau sudah dibatalkan' }, 400);
  return c.json({ success: true });
});

// ── Bukti transfer (foto, dikompres di browser) ────────────────────────

const POLA_GAMBAR = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAKS_GAMBAR_CHARS = 2_800_000; // ±2 MB biner

async function kirimBukti(env, key) {
  const obj = key ? await env.R2.get(key) : null;
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  });
}

kuitansi.post('/:id/bukti', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const row = await env.DB.prepare('SELECT id, status, proof_key FROM kuitansi WHERE id = ?').bind(id).first();
  if (!row) return c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  if (row.status !== 'draft') return c.json({ success: false, error: 'Bukti transfer hanya bisa diubah selama draf' }, 400);

  const body = await c.req.json();
  const m = typeof body?.data_url === 'string' && body.data_url.length <= MAKS_GAMBAR_CHARS ? POLA_GAMBAR.exec(body.data_url) : null;
  if (!m) return c.json({ success: false, error: 'Gambar tidak valid atau terlalu besar (maks ±2 MB)' }, 400);

  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const key = `kuitansi/bukti/${id}.${ext}`;
  try {
    await env.R2.put(key, base64KeBuffer(m[2]), { httpMetadata: { contentType: `image/${m[1]}` } });
  } catch (e) {
    console.error('R2 upload failed:', e);
    return c.json({ success: false, error: 'Gagal menyimpan gambar' }, 500);
  }
  if (row.proof_key && row.proof_key !== key) await env.R2.delete(row.proof_key).catch(() => {});
  await env.DB.prepare("UPDATE kuitansi SET proof_key = ?, updated_at = datetime('now') WHERE id = ?").bind(key, id).run();
  return c.json({ success: true });
});

kuitansi.delete('/:id/bukti', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const row = await env.DB.prepare('SELECT status, proof_key FROM kuitansi WHERE id = ?').bind(id).first();
  if (!row) return c.json({ success: false, error: 'Kuitansi tidak ditemukan' }, 404);
  if (row.status !== 'draft') return c.json({ success: false, error: 'Bukti transfer hanya bisa diubah selama draf' }, 400);
  if (row.proof_key) await env.R2.delete(row.proof_key).catch(() => {});
  await env.DB.prepare("UPDATE kuitansi SET proof_key = NULL, updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

kuitansi.get('/:id/bukti', async (c) => {
  const row = await c.env.DB.prepare('SELECT proof_key FROM kuitansi WHERE id = ?').bind(c.req.param('id')).first();
  return (await kirimBukti(c.env, row?.proof_key)) || c.json({ success: false, error: 'Bukti transfer tidak ada' }, 404);
});

// Unduh PDF (publik per id, sama seperti dokumen lain: id = UUID acak)
kuitansi.get('/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare("SELECT pdf_url, nomor FROM kuitansi WHERE id = ? AND status IN ('signed', 'void')").bind(id).first();
  if (!row?.pdf_url) return c.json({ success: false, error: 'PDF tidak ditemukan' }, 404);
  const obj = await c.env.R2.get(row.pdf_url);
  if (!obj) return c.json({ success: false, error: 'File PDF tidak ditemukan di penyimpanan' }, 404);
  const namaFile = 'kuitansi-' + String(row.nomor || id).replace(/[^A-Za-z0-9-]+/g, '-') + '.pdf';
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${namaFile}"` },
  });
});

function konflik(c) {
  return c.json({
    success: false,
    code: 'VERSION_CONFLICT',
    error: 'Pihak lain baru saja menandatangani kuitansi ini. Dokumen dimuat ulang — silakan periksa, lalu tanda tangan lagi.',
  }, 409);
}

export default kuitansi;
