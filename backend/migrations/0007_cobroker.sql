-- Perjanjian Kerja Sama Co-Broker (bagi hasil pendampingan survei).
-- Tabel terpisah dari agreements & referral_agreements. Hanya CREATE ... IF NOT
-- EXISTS → aman dijalankan ulang (berbeda dengan 0006 yang berisi ALTER).
CREATE TABLE IF NOT EXISTS cobroker_agreements (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  agreement_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  -- Versi teks pasal. Perjanjian terkirim dirender ulang dari kode, jadi
  -- mengubah teks = naikkan versi, jangan ubah teks versi lama.
  template_version INTEGER NOT NULL DEFAULT 1,

  -- Skema bagi hasil (dipilih admin, persen diisi server):
  --   'deal_1'         → 1% dari harga deal penjualan
  --   'belah_semangka' → 50% dari total nilai fee yang didapat SBP
  share_scheme TEXT NOT NULL,
  share_percent REAL NOT NULL,

  -- Pihak Pertama (SBP)
  sbp_name TEXT,
  sbp_company TEXT,
  sbp_address TEXT,
  sbp_contact TEXT,
  sbp_description TEXT,

  -- Pihak Kedua (Co-Broker) - data KTP
  partner_name TEXT,
  partner_nik TEXT,
  partner_address TEXT,
  partner_contact TEXT,
  partner_office TEXT,

  -- Dicetak di dokumen sebagai Pasal 10 (bila diisi)
  additional_clause TEXT,
  -- TIDAK PERNAH dicetak & tidak pernah dikirim ke endpoint publik
  internal_note TEXT,

  -- Diisi co-broker saat tanda tangan
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_holder TEXT,
  consent_accepted INTEGER DEFAULT 0,

  -- Jejak tanda tangan
  signer_name TEXT,
  signer_nik TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  pdf_url TEXT,
  document_snapshot TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  signed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cobroker_agreements_token ON cobroker_agreements(token);
CREATE INDEX IF NOT EXISTS idx_cobroker_agreements_status ON cobroker_agreements(status);
