-- 014: dokumen penambahan / pengurangan / opname stok.
-- Sebelumnya stok hanya bertambah lewat GRN (harus bikin PO dulu) dan endpoint
-- /inventory/adjustment tidak dipakai UI mana pun serta tidak mencatat dokumen.
-- Tabel ini menjadi tempat resmi input stok manual dengan jejak lengkap.

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id SERIAL PRIMARY KEY,
  adjustment_number VARCHAR(30) UNIQUE NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id INT REFERENCES warehouses(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('IN','OUT','SET')),
  reason VARCHAR(40) NOT NULL,
  reference_no VARCHAR(60),
  note TEXT,
  total_value DECIMAL(18,2) DEFAULT 0,
  created_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id SERIAL PRIMARY KEY,
  adjustment_id INT REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id INT,
  qty DECIMAL(18,4) NOT NULL,
  unit_cost DECIMAL(18,2) DEFAULT 0,
  qty_before DECIMAL(18,4),
  qty_after DECIMAL(18,4),
  batch_no VARCHAR(50),
  expired_date DATE
);

CREATE INDEX IF NOT EXISTS idx_stock_adj_date ON stock_adjustments(adjustment_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_type ON stock_adjustments(type);
CREATE INDEX IF NOT EXISTS idx_stock_adj_items ON stock_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stocks_lookup ON stocks(product_id, warehouse_id);
