-- Penanda tangan Pihak Kedua: pemilik tunggal, para ahli waris, atau pemilik
-- bersama. Satu baris per orang, masing-masing dengan link (token) SENDIRI —
-- link bersama berarti siapa pun pemegangnya bisa TTD di kotak orang lain.
--
-- Aman dijalankan ulang: CREATE ... IF NOT EXISTS dan backfill bersyarat.
-- ALTER (tidak idempoten) sengaja paling akhir.

CREATE TABLE IF NOT EXISTS agreement_signers (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  urutan INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  nik TEXT NOT NULL,
  address TEXT,
  contact TEXT,
  description TEXT,                         -- Keterangan / hubungan dengan pewaris
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | signed
  signature_png TEXT,                       -- data:image/png;base64,... (maks ±200 KB)
  signed_at TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (agreement_id, urutan)
);

CREATE INDEX IF NOT EXISTS idx_signers_agreement ON agreement_signers(agreement_id);

-- Backfill: setiap perjanjian lama = 1 penanda tangan. Token = token perjanjian,
-- supaya link WA yang SUDAH terkirim tetap berlaku. Perjanjian lama yang sudah
-- ditandatangani tidak punya signature_png (TTD-nya hanya ada di PDF) — wajar.
INSERT INTO agreement_signers (
  id, agreement_id, urutan, token, name, nik, address, contact, description,
  status, signed_at, signer_ip, signer_user_agent
)
SELECT
  lower(hex(randomblob(16))), a.id, 1, a.token,
  COALESCE(a.party1_name, ''), COALESCE(a.party1_nik, ''),
  a.party1_address, a.party1_contact, a.party1_description,
  CASE WHEN a.status = 'signed' THEN 'signed' ELSE 'pending' END,
  a.signed_at, a.signer_ip, a.signer_user_agent
FROM agreements a
WHERE NOT EXISTS (SELECT 1 FROM agreement_signers s WHERE s.agreement_id = a.id);

-- Nama pewaris (Alm./Almh.), opsional. Kosong + banyak penanda tangan = pemilik bersama.
ALTER TABLE agreements ADD COLUMN decedent_name TEXT;
