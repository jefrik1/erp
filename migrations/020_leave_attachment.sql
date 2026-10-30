-- 020: lampiran surat dokter untuk izin sakit
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_path VARCHAR(255);
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(160);
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_mime VARCHAR(80);
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_size INT;
