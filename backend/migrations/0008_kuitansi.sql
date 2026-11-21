-- Kuitansi digital: booking fee / tanda jadi / DP / pelunasan.
-- Hanya CREATE ... IF NOT EXISTS → aman dijalankan ulang. Skema lengkap
-- (mode penerima pemilik + bukti transfer) dibuat sekaligus supaya tidak
-- perlu ALTER di kemudian hari.
CREATE TABLE IF NOT EXISTS kuitansi (
  id TEXT PRIMARY KEY,
  -- Diberikan saat dikirim/diterbitkan (draf belum bernomor)
  nomor TEXT,
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | sent | signed | void
  template_version INTEGER NOT NULL DEFAULT 1,
  void_at TEXT,
  void_reason TEXT,
  -- Token halaman verifikasi publik (QR di PDF)
  verify_token TEXT NOT NULL,

  receiver_mode TEXT NOT NULL,                   -- 'sbp' | 'pemilik'
  require_payer_sign INTEGER NOT NULL DEFAULT 1,
  -- 0 → harga deal & sisa tidak dicetak DAN tidak dikirim ke endpoint publik
  show_price INTEGER NOT NULL DEFAULT 1,

  sbp_name TEXT,
  sbp_company TEXT,
  sbp_address TEXT,
  sbp_contact TEXT,

  -- Penyetor (klien)
  payer_name TEXT,
  payer_nik TEXT,
  payer_contact TEXT,
  payer_address TEXT,
  buyer_name TEXT,

  -- Pemilik (mode penerima pemilik)
  owner_name TEXT,
  owner_nik TEXT,
  owner_contact TEXT,
  owner_address TEXT,

  -- Pembayaran (rupiah = INTEGER)
  payment_type TEXT NOT NULL,                    -- booking_fee | tanda_jadi | dp | pelunasan | lainnya
  payment_type_other TEXT,
  amount INTEGER NOT NULL,
  received_date TEXT NOT NULL,                   -- YYYY-MM-DD
  method TEXT NOT NULL,                          -- transfer | tunai
  dest_bank TEXT,
  dest_account_number TEXT,
  dest_account_holder TEXT,
  sender_bank TEXT,
  transfer_ref TEXT,
  proof_key TEXT,                                -- foto bukti transfer di R2

  -- Properti
  listing_code TEXT,
  property_type TEXT,
  property_address TEXT,
  land_area TEXT,
  building_area TEXT,
  legal TEXT,
  deal_price INTEGER,
  paid_before INTEGER NOT NULL DEFAULT 0,
  purchase_method TEXT,                          -- tunai_keras | tunai_bertahap | kpr

  -- Ketentuan (booking fee / tanda jadi / DP)
  valid_until TEXT,
  settlement_deadline TEXT,
  counts_toward_price INTEGER,
  buyer_cancel TEXT,                             -- hangus | kembali_penuh | kembali_potong
  buyer_cancel_deduction INTEGER,
  kpr_rejected TEXT,                             -- kembali_penuh | kembali_potong
  kpr_rejected_deduction INTEGER,
  seller_cancel_refund_days INTEGER,
  additional_note TEXT,                          -- dicetak
  internal_note TEXT,                            -- TIDAK pernah dicetak / dikirim publik

  -- Tanda tangan penyetor (klien)
  payer_token TEXT,
  payer_signature_png TEXT,
  payer_signed_at TEXT,
  payer_ip TEXT,
  payer_user_agent TEXT,
  payer_statement_at TEXT,

  -- Tanda tangan pemilik (mode penerima pemilik)
  owner_token TEXT,
  owner_signature_png TEXT,
  owner_signed_at TEXT,
  owner_ip TEXT,
  owner_user_agent TEXT,

  pdf_url TEXT,
  document_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  signed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kuitansi_nomor ON kuitansi(nomor);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kuitansi_verify ON kuitansi(verify_token);
CREATE INDEX IF NOT EXISTS idx_kuitansi_payer_token ON kuitansi(payer_token);
CREATE INDEX IF NOT EXISTS idx_kuitansi_owner_token ON kuitansi(owner_token);
CREATE INDEX IF NOT EXISTS idx_kuitansi_status ON kuitansi(status);
