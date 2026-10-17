-- 013: simpan avg_cost SESUDAH alokasi pada baris alokasi landed cost.
-- Sebelumnya hanya avg_cost_before yang dicatat, sehingga UI/ekspor tidak bisa
-- menampilkan "sebelum -> sesudah" tanpa menebak dari nilai stok saat ini.

ALTER TABLE landed_cost_allocations ADD COLUMN IF NOT EXISTS avg_cost_after DECIMAL(18,4);
