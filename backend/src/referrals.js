import { Hono } from 'hono';

// Komposisi fee (dikunci): [referal, agent SBP, kantor SBP]
const REFERRAL_SPLITS = {
  buyer: [30, 20, 50],
  seller: [20, 30, 50],
};

// Field yang diisi admin saat membuat / mengedit draft
const EDITABLE_FIELDS = [
  'sbp_name', 'sbp_company', 'sbp_address', 'sbp_contact', 'sbp_description',
  'partner_name', 'partner_nik', 'partner_address', 'partner_contact',
  'additional_clause',
];

// Isian per item leads (opsional, bisa lebih dari satu) — sama dengan LEAD_FIELDS di frontend
const LEAD_KEYS = {
  buyer: ['name', 'contact', 'need'],
  seller: ['title', 'address', 'land_area', 'building_area', 'legal', 'owner_name', 'owner_contact'],
};

// Ambil hanya key yang dikenal, buang item yang kosong semua; null jika tidak ada leads
function normalizeLeads(type, leads) {
  if (!Array.isArray(leads)) return null;
  const keys = LEAD_KEYS[type];
  const clean = leads
    .map((lead) => Object.fromEntries(keys.map((k) => [k, String(lead?.[k] ?? '').trim()])))
    .filter((lead) => keys.some((k) => lead[k]));
  return clean.length ? JSON.stringify(clean) : null;
}

const referrals = new Hono();

// List all referral agreements
referrals.get('/', async (c) => {
  const { env } = c;
  const status = c.req.query('status');

  if (status) {
    const result = await env.DB.prepare('SELECT * FROM referral_agreements WHERE status = ? ORDER BY created_at DESC').bind(status).all();
    return c.json({ success: true, data: result.results });
  }

  const result = await env.DB.prepare('SELECT * FROM referral_agreements ORDER BY created_at DESC').all();
  return c.json({ success: true, data: result.results });
});

// Get by token (for signing page) - didefinisikan sebelum /:id
referrals.get('/token/:token', async (c) => {
  const { env } = c;
  const token = c.req.param('token');

  const result = await env.DB.prepare('SELECT * FROM referral_agreements WHERE token = ?').bind(token).first();

  if (!result) {
    return c.json({ success: false, error: 'Agreement not found or link expired' }, 404);
  }

  return c.json({ success: true, data: result });
});

// Get single referral agreement by ID
referrals.get('/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const result = await env.DB.prepare('SELECT * FROM referral_agreements WHERE id = ?').bind(id).first();

  if (!result) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  return c.json({ success: true, data: result });
});

// Create new referral agreement
referrals.post('/', async (c) => {
  const { env } = c;
  const body = await c.req.json();

  const split = REFERRAL_SPLITS[body.referral_type];
  if (!split) {
    return c.json({ success: false, error: 'Jenis referal tidak valid' }, 400);
  }
  if (!body.partner_name || !body.partner_nik) {
    return c.json({ success: false, error: 'Nama dan NIK mitra referal wajib diisi' }, 400);
  }

  const id = crypto.randomUUID();
  const token = generateSecureToken();
  const agreementNumber = await generateReferralNumber(env);
  const values = EDITABLE_FIELDS.map((f) => body[f] || null);

  await env.DB.prepare(`
    INSERT INTO referral_agreements (
      id, token, agreement_number, status,
      referral_type, referral_percent, agent_percent, office_percent, leads,
      ${EDITABLE_FIELDS.join(', ')}
    ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ${EDITABLE_FIELDS.map(() => '?').join(', ')})
  `).bind(
    id, token, agreementNumber,
    body.referral_type, split[0], split[1], split[2],
    normalizeLeads(body.referral_type, body.leads),
    ...values
  ).run();

  return c.json({ success: true, data: { id, token, agreement_number: agreementNumber } });
});

// Update referral agreement (only if draft)
referrals.put('/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await env.DB.prepare('SELECT status FROM referral_agreements WHERE id = ?').bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ success: false, error: 'Cannot edit agreement after sending' }, 400);
  }

  const split = REFERRAL_SPLITS[body.referral_type];
  if (!split) {
    return c.json({ success: false, error: 'Jenis referal tidak valid' }, 400);
  }

  await env.DB.prepare(`
    UPDATE referral_agreements SET
      referral_type = ?, referral_percent = ?, agent_percent = ?, office_percent = ?, leads = ?,
      ${EDITABLE_FIELDS.map((f) => `${f} = ?`).join(', ')},
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.referral_type, split[0], split[1], split[2],
    normalizeLeads(body.referral_type, body.leads),
    ...EDITABLE_FIELDS.map((f) => body[f] || null),
    id
  ).run();

  return c.json({ success: true });
});

// Send referral agreement
referrals.post('/:id/send', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const existing = await env.DB.prepare('SELECT * FROM referral_agreements WHERE id = ?').bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ success: false, error: 'Agreement already sent or signed' }, 400);
  }

  const snapshot = JSON.stringify(existing);

  await env.DB.prepare(`
    UPDATE referral_agreements SET status = 'sent', sent_at = datetime('now'),
    document_snapshot = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(snapshot, id).run();

  return c.json({
    success: true,
    data: {
      token: existing.token,
      signing_url: '/referrals/sign/' + existing.token,
    },
  });
});

// Sign referral agreement (mitra mengisi rekening + persetujuan + tanda tangan)
referrals.post('/sign/:token', async (c) => {
  const { env } = c;
  const token = c.req.param('token');
  const body = await c.req.json();
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';

  const existing = await env.DB.prepare('SELECT * FROM referral_agreements WHERE token = ?').bind(token).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found or link expired' }, 404);
  }

  if (existing.status === 'signed') {
    return c.json({ success: false, error: 'This agreement has already been signed' }, 400);
  }

  if (existing.status !== 'sent') {
    return c.json({ success: false, error: 'Invalid agreement state' }, 400);
  }

  const bankName = (body.bank_name || '').trim();
  const bankAccountNumber = (body.bank_account_number || '').trim();
  const bankAccountHolder = (body.bank_account_holder || '').trim();

  if (!bankName || !bankAccountNumber || !bankAccountHolder) {
    return c.json({ success: false, error: 'Data rekening wajib diisi lengkap' }, 400);
  }

  if (body.consent_accepted !== true) {
    return c.json({ success: false, error: 'Persetujuan wajib dicentang' }, 400);
  }

  if (!body.pdf_base64) {
    return c.json({ success: false, error: 'Dokumen PDF tidak ditemukan' }, 400);
  }

  // Upload PDF to R2
  const pdfBuffer = base64ToArrayBuffer(body.pdf_base64);
  const now = new Date();
  const pdfKey = 'referrals/' + now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + existing.id + '.pdf';

  try {
    await env.R2.put(pdfKey, pdfBuffer, {
      httpMetadata: { contentType: 'application/pdf' },
    });
  } catch (e) {
    // If R2 fails, still save the agreement but without PDF URL
    console.error('R2 upload failed:', e);
  }

  await env.DB.prepare(`
    UPDATE referral_agreements SET
      status = 'signed',
      signed_at = datetime('now'),
      bank_name = ?,
      bank_account_number = ?,
      bank_account_holder = ?,
      consent_accepted = 1,
      signer_name = ?,
      signer_nik = ?,
      signer_ip = ?,
      signer_user_agent = ?,
      pdf_url = ?,
      updated_at = datetime('now')
    WHERE token = ? AND status = 'sent'
  `).bind(
    bankName, bankAccountNumber, bankAccountHolder,
    existing.partner_name, existing.partner_nik, ip, userAgent, pdfKey, token
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM referral_agreements WHERE token = ?').bind(token).first();

  return c.json({ success: true, data: updated });
});

// Download PDF
referrals.get('/:id/pdf', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const agreement = await env.DB.prepare('SELECT pdf_url FROM referral_agreements WHERE id = ? AND status = ?').bind(id, 'signed').first();

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
        'Content-Disposition': 'attachment; filename="referal-' + id + '.pdf"',
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Error retrieving PDF' }, 500);
  }
});

function generateSecureToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function generateReferralNumber(env) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const count = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM referral_agreements WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?"
  ).bind(String(year), month).first();
  const seq = String((count?.count || 0) + 1).padStart(4, '0');
  return 'SBP/REF/' + year + '/' + month + '/' + seq;
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export default referrals;
