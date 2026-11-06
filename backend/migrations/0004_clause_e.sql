-- Pasal 7 poin e: ketentuan tambahan yang diisi MANUAL oleh admin dan TAMPIL
-- di dokumen yang ditandatangani pemilik. Kosong = poin e tidak dicetak.
--
-- Sengaja kolom baru, BUKAN memakai additional_clause: kolom itu dipakai admin
-- sebagai catatan internal (harga nett, selisih untuk fee broker). Mencetaknya
-- ke dokumen pemilik = membocorkan margin agen.
ALTER TABLE agreements ADD COLUMN clause_e TEXT;
