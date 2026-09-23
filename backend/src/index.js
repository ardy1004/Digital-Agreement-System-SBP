import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { basicAuth } from 'hono/basic-auth';
import referrals from './referrals.js';

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

// List all agreements
app.get('/api/agreements', async (c) => {
  const { env } = c;
  const status = c.req.query('status');

  let query = 'SELECT * FROM agreements ORDER BY created_at DESC';

  if (status) {
    query = 'SELECT * FROM agreements WHERE status = ? ORDER BY created_at DESC';
    const result = await env.DB.prepare(query).bind(status).all();
    return c.json({ success: true, data: result.results });
  }

  const result = await env.DB.prepare(query).all();
  return c.json({ success: true, data: result.results });
});

// Get single agreement by ID
app.get('/api/agreements/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');

  const result = await env.DB.prepare('SELECT * FROM agreements WHERE id = ?').bind(id).first();

  if (!result) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  return c.json({ success: true, data: result });
});

// Get agreement by token
app.get('/api/agreements/token/:token', async (c) => {
  const { env } = c;
  const token = c.req.param('token');

  const result = await env.DB.prepare('SELECT * FROM agreements WHERE token = ?').bind(token).first();

  if (!result) {
    return c.json({ success: false, error: 'Agreement not found or link expired' }, 404);
  }

  return c.json({ success: true, data: result });
});

// Create new agreement
app.post('/api/agreements', async (c) => {
  const { env } = c;
  const body = await c.req.json();

  const id = crypto.randomUUID();
  const token = generateSecureToken();
  const agreementNumber = await generateAgreementNumber(env);

  await env.DB.prepare(`
    INSERT INTO agreements (
      id, token, status, type, fee_percent, net_owner_price, tax_by, notary_by,
      additional_clause, property_title, property_land_area, property_building_area,
      property_legal, property_address, property_maps,
      party1_name, party1_nik, party1_address, party1_contact, party1_description,
      party2_name, party2_company, party2_address, party2_contact, party2_description,
      duration, is_exclusive, agreement_number
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, token,
    body.type, body.fee_percent || null, body.net_owner_price || null,
    body.tax_by, body.notary_by, body.additional_clause || null,
    body.property_title, body.property_land_area, body.property_building_area,
    body.property_legal, body.property_address, body.property_maps || null,
    body.party1_name, body.party1_nik, body.party1_address, body.party1_contact, body.party1_description || null,
    body.party2_name, body.party2_company || null, body.party2_address, body.party2_contact, body.party2_description || null,
    body.duration || '90', body.is_exclusive || 'false',
    agreementNumber
  ).run();

  return c.json({ success: true, data: { id, token, agreement_number: agreementNumber } });
});

// Update agreement (only if draft)
app.put('/api/agreements/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await env.DB.prepare('SELECT status FROM agreements WHERE id = ?').bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ success: false, error: 'Cannot edit agreement after sending' }, 400);
  }

  await env.DB.prepare(`
    UPDATE agreements SET
      type = ?, fee_percent = ?, net_owner_price = ?, tax_by = ?, notary_by = ?,
      additional_clause = ?, property_title = ?, property_land_area = ?,
      property_building_area = ?, property_legal = ?, property_address = ?,
      property_maps = ?, party1_name = ?, party1_nik = ?, party1_address = ?,
      party1_contact = ?, party1_description = ?, party2_name = ?,
      party2_company = ?, party2_address = ?, party2_contact = ?,
      party2_description = ?, duration = ?, is_exclusive = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.type, body.fee_percent || null, body.net_owner_price || null,
    body.tax_by, body.notary_by, body.additional_clause || null,
    body.property_title, body.property_land_area, body.property_building_area,
    body.property_legal, body.property_address, body.property_maps || null,
    body.party1_name, body.party1_nik, body.party1_address, body.party1_contact,
    body.party1_description || null, body.party2_name, body.party2_company || null,
    body.party2_address, body.party2_contact, body.party2_description || null,
    body.duration || '90', body.is_exclusive || 'false',
    id
  ).run();

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

  const snapshot = JSON.stringify(existing);

  await env.DB.prepare(`
    UPDATE agreements SET status = 'sent', sent_at = datetime('now'),
    document_snapshot = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(snapshot, id).run();

  return c.json({
    success: true,
    data: {
      token: existing.token,
      signing_url: '/sign/' + existing.token
    }
  });
});

// Sign agreement
app.post('/api/agreements/sign/:token', async (c) => {
  const { env } = c;
  const token = c.req.param('token');
  const body = await c.req.json();
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';

  const existing = await env.DB.prepare('SELECT * FROM agreements WHERE token = ?').bind(token).first();

  if (!existing) {
    return c.json({ success: false, error: 'Agreement not found or link expired' }, 404);
  }

  if (existing.status === 'signed') {
    return c.json({ success: false, error: 'This agreement has already been signed' }, 400);
  }

  if (existing.status !== 'sent') {
    return c.json({ success: false, error: 'Invalid agreement state' }, 400);
  }

  // Upload PDF to R2
  const pdfBuffer = base64ToArrayBuffer(body.pdf_base64);
  const now = new Date();
  const pdfKey = 'agreements/' + now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + existing.id + '.pdf';

  try {
    await env.R2.put(pdfKey, pdfBuffer, {
      httpMetadata: { contentType: 'application/pdf' },
    });
  } catch (e) {
    // If R2 fails, still save the agreement but without PDF URL
    console.error('R2 upload failed:', e);
  }

  // Update database
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
    WHERE token = ? AND status = 'sent'
  `).bind(
    body.signer_name, body.signer_nik, ip, userAgent, pdfKey, token
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM agreements WHERE token = ?').bind(token).first();

  return c.json({ success: true, data: updated });
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
