-- 027: Alur kerja industri material & baja (Phase 2).
-- Dual UOM (catch-weight) + toleransi SNI, jembatan timbang, drop-ship/cross-warehouse,
-- FEFO kadaluarsa. Semua idempoten.

-- ── 1. Dual UOM / catch-weight pada dokumen ─────────────────────────────────
ALTER TABLE grn_details ADD COLUMN IF NOT EXISTS secondary_qty_actual NUMERIC(18,3);
ALTER TABLE grn_details ADD COLUMN IF NOT EXISTS secondary_qty_theoretical NUMERIC(18,3);
ALTER TABLE grn_details ADD COLUMN IF NOT EXISTS weight_variance_pct NUMERIC(8,3);
ALTER TABLE grn_details ADD COLUMN IF NOT EXISTS hold_status VARCHAR(20);
ALTER TABLE grn_details ADD COLUMN IF NOT EXISTS manufactured_date DATE;

ALTER TABLE do_details ADD COLUMN IF NOT EXISTS qty_shipped NUMERIC(18,3);
ALTER TABLE do_details ADD COLUMN IF NOT EXISTS qty_delivered_pod NUMERIC(18,3);
ALTER TABLE do_details ADD COLUMN IF NOT EXISTS qty_rejected_pod NUMERIC(18,3);
ALTER TABLE do_details ADD COLUMN IF NOT EXISTS secondary_qty_actual NUMERIC(18,3);
ALTER TABLE do_details ADD COLUMN IF NOT EXISTS secondary_qty_theoretical NUMERIC(18,3);
ALTER TABLE do_details ADD COLUMN IF NOT EXISTS weight_variance_pct NUMERIC(8,3);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS secondary_qty_actual NUMERIC(18,3);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS secondary_qty_theoretical NUMERIC(18,3);

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS manufactured_date DATE;

-- ── 2. Jembatan timbang (weighbridge) ──────────────────────────────────────
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS gross_kg NUMERIC(18,3);
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS tare_kg NUMERIC(18,3);
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS net_kg NUMERIC(18,3);
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(20);
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS signature_hmac VARCHAR(128);
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'UNBOUND';
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS bound_at TIMESTAMP;
ALTER TABLE scale_readings ADD COLUMN IF NOT EXISTS bound_by INT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_scale_readings_ref ON scale_readings (reference_type, reference_id);

-- ── 3. Fulfillment: drop-ship & cross-warehouse ────────────────────────────
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) DEFAULT 'STOCK';
ALTER TABLE so_details ADD COLUMN IF NOT EXISTS source_warehouse_id INT REFERENCES warehouses(id);
ALTER TABLE so_details ADD COLUMN IF NOT EXISTS qty_shipped NUMERIC(18,3) DEFAULT 0;
ALTER TABLE so_details ADD COLUMN IF NOT EXISTS qty_invoiced NUMERIC(18,3) DEFAULT 0;
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS is_dropship BOOLEAN DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS source_so_id INT REFERENCES sales_orders(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) DEFAULT 'STOCK';

-- ── 4. Berat per produk untuk guard ODOL & hitung teoretis ────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12,4);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_payload_kg NUMERIC(12,2);
UPDATE vehicles SET max_payload_kg = COALESCE(capacity_weight_kg, capacity_ton * 1000)
 WHERE max_payload_kg IS NULL AND (capacity_weight_kg IS NOT NULL OR capacity_ton IS NOT NULL);

-- Berat teoretis bar baja dari spesifikasi SNI bila products.weight_kg belum diisi.
UPDATE products p SET weight_kg = s.theoretical_weight_per_bar
  FROM product_steel_specs s
 WHERE s.product_id = p.id AND COALESCE(p.weight_kg,0) = 0 AND COALESCE(s.theoretical_weight_per_bar,0) > 0;

-- ── 5. Tabel tiket selisih in-transit (POD) ────────────────────────────────
CREATE TABLE IF NOT EXISTS do_discrepancies (
  id SERIAL PRIMARY KEY,
  do_id INT REFERENCES delivery_orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty_rejected NUMERIC(18,3) NOT NULL,
  resolution VARCHAR(30),
  notes TEXT,
  resolved_by INT REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── 6. Akun pendukung (persediaan dalam perjalanan, susut potong baja) ────
INSERT INTO accounts (code, name, type)
SELECT v.code, v.name, v.type FROM (VALUES
  ('1-1210','Persediaan Dalam Perjalanan','ASSET'),
  ('5-1350','Susut Potong Baja','EXPENSE')
) AS v(code,name,type)
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.code = v.code);
