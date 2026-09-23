-- Drop old table and recreate with new schema
DROP TABLE IF EXISTS agreements;

CREATE TABLE agreements (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  type TEXT NOT NULL,
  fee_percent REAL,
  net_owner_price REAL,
  tax_by TEXT,
  notary_by TEXT,
  additional_clause TEXT,
  pdf_url TEXT,
  signed_at TEXT,
  signer_name TEXT,
  signer_nik TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  document_snapshot TEXT,

  -- Property
  property_title TEXT,
  property_land_area TEXT,
  property_building_area TEXT,
  property_legal TEXT,
  property_address TEXT,
  property_maps TEXT,

  -- Pihak Pertama (Owner)
  party1_name TEXT,
  party1_nik TEXT,
  party1_address TEXT,
  party1_contact TEXT,
  party1_description TEXT,

  -- Pihak Kedua (Agent)
  party2_name TEXT,
  party2_company TEXT,
  party2_address TEXT,
  party2_contact TEXT,
  party2_description TEXT,

  -- Scheme
  duration TEXT DEFAULT '90',
  is_exclusive TEXT DEFAULT 'false',

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  agreement_number TEXT
);

CREATE INDEX idx_agreements_token ON agreements(token);
CREATE INDEX idx_agreements_status ON agreements(status);
