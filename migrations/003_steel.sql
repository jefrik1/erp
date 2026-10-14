-- v3.0 STEEL MODULE — Phase 1: Foundation
-- Atribut lengkap baja & besi, multi satuan, pricing dinamis

-- ========== STEEL SPECIFICATIONS ==========
CREATE TABLE IF NOT EXISTS product_steel_specs (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  steel_type VARCHAR(30) CHECK (steel_type IN ('BETON_POLOS','BETON_ULIR','PROFIL_WF','HOLLOW','PIPA','PLAT','OTHER')),
  diameter_mm DECIMAL(10,2),
  dimension_2_mm DECIMAL(10,2),
  standard_length_mm INT DEFAULT 12000,
  weight_per_meter_kg DECIMAL(10,4) NOT NULL,
  theoretical_weight_per_bar DECIMAL(12,3) GENERATED ALWAYS AS (weight_per_meter_kg * standard_length_mm / 1000) STORED,
  grade VARCHAR(30),
  sni_mark BOOLEAN DEFAULT false,
  mill_origin VARCHAR(100),
  surface_treatment VARCHAR(30) DEFAULT 'PLAIN',
  tolerance_pct DECIMAL(5,2) DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

-- ========== MULTI UNIT CONVERSIONS ==========
CREATE TABLE IF NOT EXISTS product_steel_conversions (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  from_unit VARCHAR(20),
  to_unit VARCHAR(20),
  factor DECIMAL(20,6) NOT NULL,
  rounding_rule VARCHAR(20) DEFAULT 'ROUND',
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  UNIQUE(product_id, from_unit, to_unit)
);

-- ========== DYNAMIC STEEL PRICING ==========
CREATE TABLE IF NOT EXISTS steel_price_history (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  price_type VARCHAR(30) CHECK (price_type IN ('SELL','COST','FLOOR','BUY')),
  price_per_kg DECIMAL(15,2),
  price_per_bar DECIMAL(15,2),
  price_per_meter DECIMAL(15,2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  source VARCHAR(50),
  created_by BIGINT REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== PRICE LOCKS (PRE-ORDER) ==========
CREATE TABLE IF NOT EXISTS steel_price_locks (
  id BIGSERIAL PRIMARY KEY,
  so_id BIGINT REFERENCES sales_orders(id),
  customer_id BIGINT REFERENCES customers(id),
  product_id BIGINT REFERENCES products(id),
  qty_locked DECIMAL(15,3) NOT NULL,
  qty_fulfilled DECIMAL(15,3) DEFAULT 0,
  locked_price_per_unit DECIMAL(15,2) NOT NULL,
  locked_at TIMESTAMP DEFAULT NOW(),
  valid_until DATE NOT NULL,
  dp_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FULFILLED','EXPIRED','CANCELLED')),
  created_by BIGINT REFERENCES users(id)
);

-- ========== STEEL BATCHES (Traceability) ==========
CREATE TABLE IF NOT EXISTS steel_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_number VARCHAR(50) UNIQUE NOT NULL,
  product_id BIGINT REFERENCES products(id),
  grn_id BIGINT REFERENCES goods_receipts(id),
  supplier_id BIGINT REFERENCES suppliers(id),
  heat_number VARCHAR(50),
  mill_certificate_url VARCHAR(255),
  production_date DATE,
  received_date DATE,
  qty_bars_received INT,
  qty_bars_remaining INT,
  weight_kg_theoretical DECIMAL(18,3),
  weight_kg_actual DECIMAL(18,3),
  quality_check_status VARCHAR(20) DEFAULT 'PENDING' CHECK (quality_check_status IN ('PENDING','PASSED','FAILED','PARTIAL')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== CUTTING ORDERS ==========
CREATE TABLE IF NOT EXISTS cutting_orders (
  id BIGSERIAL PRIMARY KEY,
  cutting_number VARCHAR(30) UNIQUE NOT NULL,
  so_id BIGINT REFERENCES sales_orders(id),
  so_detail_id BIGINT REFERENCES so_details(id),
  product_id BIGINT REFERENCES products(id),
  qty_source_bars INT NOT NULL,
  source_length_mm INT NOT NULL,
  status VARCHAR(30) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  total_cut_length_mm INT,
  total_remnant_length_mm INT,
  waste_length_mm INT,
  cutting_cost DECIMAL(15,2) DEFAULT 0,
  assigned_to BIGINT REFERENCES users(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cutting_order_items (
  id BIGSERIAL PRIMARY KEY,
  cutting_order_id BIGINT REFERENCES cutting_orders(id) ON DELETE CASCADE,
  cut_length_mm INT NOT NULL,
  qty_pcs INT NOT NULL,
  sequence_no INT,
  actual_output_qty INT,
  actual_length_mm INT
);

CREATE TABLE IF NOT EXISTS cutting_order_outputs (
  id BIGSERIAL PRIMARY KEY,
  cutting_order_id BIGINT REFERENCES cutting_orders(id) ON DELETE CASCADE,
  output_type VARCHAR(20) CHECK (output_type IN ('PRODUCT','REMNANT','WASTE')),
  length_mm INT,
  qty_pcs INT,
  weight_kg DECIMAL(12,3),
  remnant_id BIGINT,
  photo_url VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== REMNANT INVENTORY ==========
CREATE TABLE IF NOT EXISTS remnants (
  id BIGSERIAL PRIMARY KEY,
  remnant_code VARCHAR(30) UNIQUE NOT NULL,
  parent_product_id BIGINT REFERENCES products(id),
  source_type VARCHAR(20) CHECK (source_type IN ('CUTTING','RETURN','SPLIT')),
  source_reference_id BIGINT,
  length_mm INT NOT NULL,
  weight_kg DECIMAL(12,3),
  weight_actual_kg DECIMAL(12,3),
  condition VARCHAR(30) DEFAULT 'NEW' CHECK (condition IN ('NEW','SLIGHT_RUST','PROJECT_SURPLUS','DAMAGED')),
  warehouse_id BIGINT REFERENCES warehouses(id),
  bin_id BIGINT REFERENCES bin_locations(id),
  status VARCHAR(20) DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','SOLD','SCRAPPED')),
  cost_value DECIMAL(15,2),
  asking_price_per_kg DECIMAL(15,2),
  created_date DATE DEFAULT CURRENT_DATE,
  age_days INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remnant_movements (
  id BIGSERIAL PRIMARY KEY,
  remnant_id BIGINT REFERENCES remnants(id) ON DELETE CASCADE,
  movement_type VARCHAR(30) CHECK (movement_type IN ('CREATED','RESERVED','SOLD','CUT','SCRAPPED')),
  reference_type VARCHAR(50),
  reference_id BIGINT,
  qty_change DECIMAL(12,3),
  movement_date TIMESTAMP DEFAULT NOW(),
  created_by BIGINT REFERENCES users(id),
  notes TEXT
);

-- ========== RETUR EKS PROYEK ==========
CREATE TABLE IF NOT EXISTS project_surplus_returns (
  id BIGSERIAL PRIMARY KEY,
  return_number VARCHAR(30) UNIQUE NOT NULL,
  original_so_id BIGINT REFERENCES sales_orders(id),
  original_invoice_id BIGINT REFERENCES invoices(id),
  customer_id BIGINT REFERENCES customers(id),
  return_date DATE DEFAULT CURRENT_DATE,
  condition VARCHAR(30) CHECK (condition IN ('GOOD','SLIGHT_RUST','DAMAGED')),
  original_price DECIMAL(15,2),
  adjustment_pct DECIMAL(5,2),
  buyback_price DECIMAL(15,2),
  total_value DECIMAL(15,2),
  settlement_type VARCHAR(20) CHECK (settlement_type IN ('CASH','CREDIT_NOTE','EXCHANGE')),
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','COMPLETED')),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMP,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_surplus_items (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT REFERENCES project_surplus_returns(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  qty_bars INT,
  weight_kg DECIMAL(15,3),
  new_sku_created VARCHAR(50),
  new_batch_id BIGINT REFERENCES steel_batches(id)
);

-- ========== SCALE READINGS (Integration) ==========
CREATE TABLE IF NOT EXISTS scale_readings (
  id BIGSERIAL PRIMARY KEY,
  reference_type VARCHAR(50),
  reference_id BIGINT,
  scale_device_id VARCHAR(50),
  reading_kg DECIMAL(15,3),
  reading_timestamp TIMESTAMP,
  theoretical_kg DECIMAL(15,3),
  variance_kg DECIMAL(15,3) GENERATED ALWAYS AS (reading_kg - theoretical_kg) STORED,
  variance_pct DECIMAL(5,2) GENERATED ALWAYS AS ((reading_kg - theoretical_kg) / NULLIF(theoretical_kg, 0) * 100) STORED,
  accepted_by BIGINT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_steel_specs_product ON product_steel_specs(product_id);
CREATE INDEX IF NOT EXISTS idx_steel_specs_type_diameter ON product_steel_specs(steel_type, diameter_mm);
CREATE INDEX IF NOT EXISTS idx_steel_conversion_product ON product_steel_conversions(product_id, from_unit, to_unit);
CREATE INDEX IF NOT EXISTS idx_steel_price_product_date ON steel_price_history(product_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_price_lock_so_status ON steel_price_locks(so_id, status);
CREATE INDEX IF NOT EXISTS idx_price_lock_customer ON steel_price_locks(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_steel_batch_product ON steel_batches(product_id, qty_bars_remaining);
CREATE INDEX IF NOT EXISTS idx_steel_batch_grn ON steel_batches(grn_id);
CREATE INDEX IF NOT EXISTS idx_cutting_so ON cutting_orders(so_id, status);
CREATE INDEX IF NOT EXISTS idx_cutting_status_date ON cutting_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_remnant_parent_status ON remnants(parent_product_id, status, length_mm);
CREATE INDEX IF NOT EXISTS idx_remnant_age ON remnants(status, created_date);
CREATE INDEX IF NOT EXISTS idx_remnant_movements_remnant ON remnant_movements(remnant_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_surplus_return_customer ON project_surplus_returns(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_scale_reference ON scale_readings(reference_type, reference_id);

-- ========== SEED DATA: Master Besi ==========
-- Assume products, categories, units, suppliers sudah ada

-- Kategorisasi besi (jika belum ada)
INSERT INTO product_categories (code, name) VALUES ('BESI_BETON', 'Besi Beton') ON CONFLICT DO NOTHING;
INSERT INTO product_categories (code, name) VALUES ('BESI_PROFIL', 'Besi Profil') ON CONFLICT DO NOTHING;
INSERT INTO product_categories (code, name) VALUES ('BESI_HOLLOW', 'Besi Hollow') ON CONFLICT DO NOTHING;
INSERT INTO product_categories (code, name) VALUES ('BESI_PIPA', 'Pipa Besi') ON CONFLICT DO NOTHING;

-- Master Besi (10 SKU sample)
INSERT INTO products (category_id, sku, name, base_unit_id, min_stock, reorder_point, is_active) 
SELECT 
  (SELECT id FROM product_categories WHERE code = 'BESI_BETON'),
  'BESI-BETON-06-SNI',
  'Besi Beton 6mm SNI BjTS 35',
  (SELECT id FROM units WHERE code = 'BTG'),
  50, 100, true
ON CONFLICT DO NOTHING;

INSERT INTO products (category_id, sku, name, base_unit_id, min_stock, reorder_point, is_active) 
SELECT 
  (SELECT id FROM product_categories WHERE code = 'BESI_BETON'),
  'BESI-BETON-08-SNI',
  'Besi Beton 8mm SNI BjTS 40',
  (SELECT id FROM units WHERE code = 'BTG'),
  100, 150, true
ON CONFLICT DO NOTHING;

INSERT INTO products (category_id, sku, name, base_unit_id, min_stock, reorder_point, is_active) 
SELECT 
  (SELECT id FROM product_categories WHERE code = 'BESI_BETON'),
  'BESI-BETON-10-SNI',
  'Besi Beton 10mm SNI BjTS 40',
  (SELECT id FROM units WHERE code = 'BTG'),
  200, 300, true
ON CONFLICT DO NOTHING;

INSERT INTO products (category_id, sku, name, base_unit_id, min_stock, reorder_point, is_active) 
SELECT 
  (SELECT id FROM product_categories WHERE code = 'BESI_BETON'),
  'BESI-BETON-13-SNI',
  'Besi Beton 13mm SNI BjTS 40',
  (SELECT id FROM units WHERE code = 'BTG'),
  150, 200, true
ON CONFLICT DO NOTHING;

INSERT INTO products (category_id, sku, name, base_unit_id, min_stock, reorder_point, is_active) 
SELECT 
  (SELECT id FROM product_categories WHERE code = 'BESI_BETON'),
  'BESI-BETON-16-SNI',
  'Besi Beton 16mm SNI BjTS 40',
  (SELECT id FROM units WHERE code = 'BTG'),
  80, 120, true
ON CONFLICT DO NOTHING;

-- Steel Specs untuk besi beton (konversi berat teoritis)
INSERT INTO product_steel_specs (product_id, steel_type, diameter_mm, standard_length_mm, weight_per_meter_kg, grade, sni_mark, mill_origin) 
SELECT id, 'BETON_ULIR', 6, 12000, 0.2223, 'BjTS 35', true, 'Krakatau Steel'
FROM products WHERE sku = 'BESI-BETON-06-SNI'
ON CONFLICT DO NOTHING;

INSERT INTO product_steel_specs (product_id, steel_type, diameter_mm, standard_length_mm, weight_per_meter_kg, grade, sni_mark, mill_origin) 
SELECT id, 'BETON_ULIR', 8, 12000, 0.3950, 'BjTS 40', true, 'Krakatau Steel'
FROM products WHERE sku = 'BESI-BETON-08-SNI'
ON CONFLICT DO NOTHING;

INSERT INTO product_steel_specs (product_id, steel_type, diameter_mm, standard_length_mm, weight_per_meter_kg, grade, sni_mark, mill_origin) 
SELECT id, 'BETON_ULIR', 10, 12000, 0.6165, 'BjTS 40', true, 'Krakatau Steel'
FROM products WHERE sku = 'BESI-BETON-10-SNI'
ON CONFLICT DO NOTHING;

INSERT INTO product_steel_specs (product_id, steel_type, diameter_mm, standard_length_mm, weight_per_meter_kg, grade, sni_mark, mill_origin) 
SELECT id, 'BETON_ULIR', 13, 12000, 1.0380, 'BjTS 40', true, 'Krakatau Steel'
FROM products WHERE sku = 'BESI-BETON-13-SNI'
ON CONFLICT DO NOTHING;

INSERT INTO product_steel_specs (product_id, steel_type, diameter_mm, standard_length_mm, weight_per_meter_kg, grade, sni_mark, mill_origin) 
SELECT id, 'BETON_ULIR', 16, 12000, 1.5760, 'BjTS 40', true, 'Krakatau Steel'
FROM products WHERE sku = 'BESI-BETON-16-SNI'
ON CONFLICT DO NOTHING;

-- Konversi multi unit untuk setiap SKU besi
-- Batang ↔ Kg
INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'BTG', 'KG', 2.668, true FROM products WHERE sku = 'BESI-BETON-06-SNI' ON CONFLICT DO NOTHING;
INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'KG', 'BTG', 0.375, false FROM products WHERE sku = 'BESI-BETON-06-SNI' ON CONFLICT DO NOTHING;

INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'BTG', 'KG', 4.740, true FROM products WHERE sku = 'BESI-BETON-08-SNI' ON CONFLICT DO NOTHING;
INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'KG', 'BTG', 0.211, false FROM products WHERE sku = 'BESI-BETON-08-SNI' ON CONFLICT DO NOTHING;

INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'BTG', 'KG', 7.398, true FROM products WHERE sku = 'BESI-BETON-10-SNI' ON CONFLICT DO NOTHING;
INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'KG', 'BTG', 0.135, false FROM products WHERE sku = 'BESI-BETON-10-SNI' ON CONFLICT DO NOTHING;

INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'BTG', 'KG', 12.456, true FROM products WHERE sku = 'BESI-BETON-13-SNI' ON CONFLICT DO NOTHING;
INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'KG', 'BTG', 0.080, false FROM products WHERE sku = 'BESI-BETON-13-SNI' ON CONFLICT DO NOTHING;

INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'BTG', 'KG', 18.912, true FROM products WHERE sku = 'BESI-BETON-16-SNI' ON CONFLICT DO NOTHING;
INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary) 
SELECT id, 'KG', 'BTG', 0.053, false FROM products WHERE sku = 'BESI-BETON-16-SNI' ON CONFLICT DO NOTHING;

-- Harga inisial (akan diupdate via API)
INSERT INTO steel_price_history (product_id, price_type, price_per_kg, price_per_bar, effective_from) 
SELECT id, 'SELL', 12500, 33475, CURRENT_DATE FROM products WHERE sku = 'BESI-BETON-06-SNI' ON CONFLICT DO NOTHING;

INSERT INTO steel_price_history (product_id, price_type, price_per_kg, price_per_bar, effective_from) 
SELECT id, 'SELL', 12000, 56880, CURRENT_DATE FROM products WHERE sku = 'BESI-BETON-08-SNI' ON CONFLICT DO NOTHING;

INSERT INTO steel_price_history (product_id, price_type, price_per_kg, price_per_bar, effective_from) 
SELECT id, 'SELL', 11800, 87284, CURRENT_DATE FROM products WHERE sku = 'BESI-BETON-10-SNI' ON CONFLICT DO NOTHING;

INSERT INTO steel_price_history (product_id, price_type, price_per_kg, price_per_bar, effective_from) 
SELECT id, 'SELL', 11500, 143275, CURRENT_DATE FROM products WHERE sku = 'BESI-BETON-13-SNI' ON CONFLICT DO NOTHING;

INSERT INTO steel_price_history (product_id, price_type, price_per_kg, price_per_bar, effective_from) 
SELECT id, 'SELL', 11000, 207832, CURRENT_DATE FROM products WHERE sku = 'BESI-BETON-16-SNI' ON CONFLICT DO NOTHING;
