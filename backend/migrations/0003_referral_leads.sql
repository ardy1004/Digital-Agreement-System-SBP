-- Data leads / properti referal jadi opsional & bisa lebih dari satu.
-- Disimpan sebagai JSON array; kolom lead_* lama dibiarkan (tidak dipakai lagi).
ALTER TABLE referral_agreements ADD COLUMN leads TEXT;
