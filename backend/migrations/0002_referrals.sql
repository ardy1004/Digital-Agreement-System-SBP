-- Perjanjian Kerja Sama Referal (tabel terpisah dari agreements)
CREATE TABLE IF NOT EXISTS referral_agreements (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  agreement_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',

  -- Jenis referal & komposisi fee (diisi server dari referral_type)
  referral_type TEXT NOT NULL,
  referral_percent REAL NOT NULL,
  agent_percent REAL NOT NULL,
  office_percent REAL NOT NULL,

  -- Pihak Pertama (SBP)
  sbp_name TEXT,
  sbp_company TEXT,
  sbp_address TEXT,
  sbp_contact TEXT,
  sbp_description TEXT,

  -- Pihak Kedua (Mitra Referal) - data KTP
  partner_name TEXT,
  partner_nik TEXT,
  partner_address TEXT,
  partner_contact TEXT,

  -- Leads Pembeli
  lead_buyer_name TEXT,
  lead_buyer_contact TEXT,
  lead_buyer_need TEXT,

  -- Leads Penjual
  lead_property_title TEXT,
  lead_property_address TEXT,
  lead_property_land_area TEXT,
  lead_property_building_area TEXT,
  lead_property_legal TEXT,
  lead_owner_name TEXT,
  lead_owner_contact TEXT,

  additional_clause TEXT,

  -- Diisi mitra saat tanda tangan
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

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  signed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_referral_agreements_token ON referral_agreements(token);
CREATE INDEX IF NOT EXISTS idx_referral_agreements_status ON referral_agreements(status);
