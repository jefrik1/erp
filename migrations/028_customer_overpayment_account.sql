-- 028: akun Uang Muka Pelanggan (kelebihan bayar POS) — dipakai backfill F16.
INSERT INTO accounts (code, name, type) VALUES ('2-1400', 'Uang Muka Pelanggan (Kelebihan Bayar)', 'LIABILITY')
ON CONFLICT (code) DO NOTHING;
