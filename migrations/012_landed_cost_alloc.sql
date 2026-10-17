-- 012: Landed cost yang aman dihitung ulang.
-- Masalah sebelumnya: setiap kali tombol Kalkulasi ditekan, biaya dialokasikan
-- LAGI ke stocks.avg_cost (double count) dan tidak ada jejak alokasinya.
-- Tabel ini menyimpan alokasi + nilai avg_cost sebelum diubah, sehingga
-- hitung ulang = kembalikan dulu ke nilai semula, baru terapkan yang baru.

CREATE TABLE IF NOT EXISTS landed_cost_allocations (
  id SERIAL PRIMARY KEY,
  landed_cost_id INT REFERENCES landed_costs(id) ON DELETE CASCADE,
  product_id INT,
  warehouse_id INT,
  qty DECIMAL(18,4),
  base DECIMAL(18,2),
  share DECIMAL(12,6),
  extra DECIMAL(18,2),
  per_unit DECIMAL(18,6),
  avg_cost_before DECIMAL(18,4),
  qty_before DECIMAL(18,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lca_landed ON landed_cost_allocations(landed_cost_id);
CREATE INDEX IF NOT EXISTS idx_lca_product ON landed_cost_allocations(product_id);

ALTER TABLE landed_costs ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE landed_costs ADD COLUMN IF NOT EXISTS journal_entry_id INT;
ALTER TABLE landed_costs ADD COLUMN IF NOT EXISTS notes TEXT;
