-- Mode Pemilik Tunggal / Ahli Waris, satu link bersama, versi template.
-- Hanya ADD COLUMN + INDEX: tidak ada baris yang diubah atau dihapus.
-- Tidak idempoten (ALTER) — jalankan sekali.

-- 'tunggal' | 'ahli_waris'
ALTER TABLE agreements ADD COLUMN owner_mode TEXT NOT NULL DEFAULT 'tunggal';

-- Cara TTD ahli waris: 'bersama' (satu link untuk semua) | 'pribadi' (link per orang)
ALTER TABLE agreements ADD COLUMN sign_mode TEXT NOT NULL DEFAULT 'pribadi';

-- Token link bersama. TIDAK PERNAH dikirim ke endpoint publik: pemegang link
-- per orang (mode ketat) tidak boleh bisa mendapatkan link bersama.
ALTER TABLE agreements ADD COLUMN shared_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agreements_shared_token ON agreements(shared_token);

-- Versi teks pasal. Dokumen dirender dari kode saat dibuka, jadi tanpa versi
-- mengubah teks pasal = diam-diam mengubah isi perjanjian yang SUDAH terkirim.
-- Semua perjanjian yang ada = 1 (teks lama, tidak berubah); yang baru = 2.
ALTER TABLE agreements ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1;

-- Rekening bersama penerima hasil bersih (ahli waris), opsional
ALTER TABLE agreements ADD COLUMN payout_bank TEXT;
ALTER TABLE agreements ADD COLUMN payout_account_number TEXT;
ALTER TABLE agreements ADD COLUMN payout_account_holder TEXT;

-- No. Surat Keterangan Waris, opsional
ALTER TABLE agreements ADD COLUMN heir_letter_number TEXT;

-- Ahli waris yang ditunjuk sebagai perwakilan komunikasi, opsional
ALTER TABLE agreements ADD COLUMN representative_signer_id TEXT;

-- Jejak audit per tanda tangan
ALTER TABLE agreement_signers ADD COLUMN sign_method TEXT;   -- 'bersama' | 'pribadi'
ALTER TABLE agreement_signers ADD COLUMN statement_at TEXT;  -- waktu pernyataan identitas dicentang
