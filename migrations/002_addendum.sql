-- ADDENDUM PRD v1.1 - Must Have & Should Have
-- Idempotent: CREATE IF NOT EXISTS + DO add columns
-- Konsinyasi
CREATE TABLE IF NOT EXISTS consignments (
  id SERIAL PRIMARY KEY,
  consignment_number VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('OUT','IN')),
  partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('CUSTOMER','SUPPLIER')),
  partner_id INT,
  location_name VARCHAR(200) NOT NULL,
  location_address TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PARTIAL','CLOSED')),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS consignment_items (
  id SERIAL PRIMARY KEY,
  consignment_id INT REFERENCES consignments(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty_sent DECIMAL(15,3) NOT NULL,
  qty_sold DECIMAL(15,3) DEFAULT 0,
  qty_returned DECIMAL(15,3) DEFAULT 0,
  qty_lost DECIMAL(15,3) DEFAULT 0,
  selling_price DECIMAL(15,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS consignment_movements (
  id SERIAL PRIMARY KEY,
  consignment_item_id INT REFERENCES consignment_items(id) ON DELETE CASCADE,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('SENT','SOLD','RETURNED','LOST')),
  qty DECIMAL(15,3) NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT,
  notes TEXT
);

-- Proyek & Tender
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  project_code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  customer_id INT REFERENCES customers(id),
  contract_value DECIMAL(18,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  location TEXT,
  pic_name VARCHAR(100),
  pic_phone VARCHAR(20),
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('PROSPECT','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  retention_pct DECIMAL(5,2) DEFAULT 5,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS project_terms (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  term_number INT NOT NULL,
  description VARCHAR(200) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','INVOICED','PAID'))
);
CREATE TABLE IF NOT EXISTS project_prices (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_id INT REFERENCES units(id),
  price DECIMAL(15,2) NOT NULL,
  valid_from DATE,
  valid_to DATE
);
CREATE TABLE IF NOT EXISTS project_documents (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  doc_type VARCHAR(20) NOT NULL CHECK (doc_type IN ('CONTRACT','ADDENDUM','BAST','INVOICE','OTHER')),
  doc_number VARCHAR(50),
  doc_date DATE,
  file_url VARCHAR(255),
  uploaded_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS project_rab (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty_planned DECIMAL(15,3) DEFAULT 0,
  qty_actual DECIMAL(15,3) DEFAULT 0,
  amount_planned DECIMAL(18,2) DEFAULT 0,
  amount_actual DECIMAL(18,2) DEFAULT 0
);

-- Pricing bertingkat
CREATE TABLE IF NOT EXISTS price_lists (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('RETAIL','WHOLESALE','CONTRACTOR','PROJECT','DISTRIBUTOR')),
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS price_list_items (
  id SERIAL PRIMARY KEY,
  price_list_id INT REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_id INT REFERENCES units(id),
  min_qty DECIMAL(15,3) DEFAULT 1,
  price DECIMAL(15,2) NOT NULL,
  discount_pct DECIMAL(5,2) DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customer_prices (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_id INT REFERENCES units(id),
  price DECIMAL(15,2) NOT NULL,
  valid_from DATE,
  valid_to DATE,
  approved_by INT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('DISCOUNT','BUNDLE','GIFT','VOUCHER')),
  start_date DATE,
  end_date DATE,
  conditions JSONB DEFAULT '{}',
  benefits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true
);
-- floor price per product
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='floor_price') THEN
    ALTER TABLE products ADD COLUMN floor_price DECIMAL(15,2) DEFAULT 0;
  END IF;
END $$;

-- Retur & Klaim
CREATE TABLE IF NOT EXISTS sales_returns (
  id SERIAL PRIMARY KEY,
  return_number VARCHAR(30) UNIQUE NOT NULL,
  invoice_id INT REFERENCES invoices(id),
  customer_id INT REFERENCES customers(id),
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason VARCHAR(20) CHECK (reason IN ('DAMAGED','WRONG_ITEM','EXCESS','QUALITY','OTHER')),
  settlement_type VARCHAR(20) CHECK (settlement_type IN ('REFUND','CREDIT_NOTE','EXCHANGE')),
  total DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','APPROVED','COMPLETED')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_return_items (
  id SERIAL PRIMARY KEY,
  return_id INT REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  condition VARCHAR(20) CHECK (condition IN ('GOOD','DAMAGED','QUARANTINE'))
);
CREATE TABLE IF NOT EXISTS claims (
  id SERIAL PRIMARY KEY,
  claim_number VARCHAR(30) UNIQUE NOT NULL,
  claim_type VARCHAR(20) NOT NULL CHECK (claim_type IN ('SUPPLIER','EXPEDITION','INSURANCE')),
  reference_type VARCHAR(50),
  reference_id INT,
  amount_claimed DECIMAL(15,2) DEFAULT 0,
  amount_settled DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','REJECTED','PAID')),
  filed_date DATE DEFAULT CURRENT_DATE,
  settled_date DATE,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS claim_attachments (
  id SERIAL PRIMARY KEY,
  claim_id INT REFERENCES claims(id) ON DELETE CASCADE,
  file_url VARCHAR(255),
  file_type VARCHAR(50),
  description TEXT
);
-- also purchase returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id SERIAL PRIMARY KEY,
  return_number VARCHAR(30) UNIQUE NOT NULL,
  po_id INT REFERENCES purchase_orders(id),
  supplier_id INT REFERENCES suppliers(id),
  return_date DATE DEFAULT CURRENT_DATE,
  reason VARCHAR(20),
  total DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT'
);

-- Landed Cost
CREATE TABLE IF NOT EXISTS landed_costs (
  id SERIAL PRIMARY KEY,
  po_id INT REFERENCES purchase_orders(id),
  grn_id INT REFERENCES goods_receipts(id),
  container_no VARCHAR(50),
  bl_number VARCHAR(50),
  pib_number VARCHAR(50),
  arrival_date DATE,
  clearance_date DATE,
  total_cost DECIMAL(18,2) DEFAULT 0,
  allocation_method VARCHAR(10) DEFAULT 'VALUE' CHECK (allocation_method IN ('VALUE','WEIGHT','VOLUME')),
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CALCULATED','POSTED')),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS landed_cost_details (
  id SERIAL PRIMARY KEY,
  landed_cost_id INT REFERENCES landed_costs(id) ON DELETE CASCADE,
  cost_type VARCHAR(20) CHECK (cost_type IN ('FREIGHT','INSURANCE','DUTY','TAX','CLEARANCE','TRUCKING','HANDLING','OTHER')),
  description VARCHAR(200),
  amount DECIMAL(18,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'IDR',
  exchange_rate DECIMAL(15,4) DEFAULT 1,
  amount_idr DECIMAL(18,2) DEFAULT 0
);

-- Armada enhancement
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='plate_number') THEN
    ALTER TABLE vehicles ADD COLUMN plate_number VARCHAR(15);
    UPDATE vehicles SET plate_number = plat_no WHERE plate_number IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='brand') THEN
    ALTER TABLE vehicles ADD COLUMN brand VARCHAR(50) DEFAULT 'Mitsubishi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='model') THEN
    ALTER TABLE vehicles ADD COLUMN model VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='year') THEN
    ALTER TABLE vehicles ADD COLUMN year INT DEFAULT 2020;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='capacity_weight_kg') THEN
    ALTER TABLE vehicles ADD COLUMN capacity_weight_kg DECIMAL(10,2) DEFAULT 8000;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='capacity_volume_m3') THEN
    ALTER TABLE vehicles ADD COLUMN capacity_volume_m3 DECIMAL(10,2) DEFAULT 20;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='ownership') THEN
    ALTER TABLE vehicles ADD COLUMN ownership VARCHAR(20) DEFAULT 'OWNED' CHECK (ownership IN ('OWNED','RENTED','THIRD_PARTY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='kir_expiry') THEN
    ALTER TABLE vehicles ADD COLUMN kir_expiry DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='tax_expiry') THEN
    ALTER TABLE vehicles ADD COLUMN tax_expiry DATE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id),
  sim_number VARCHAR(30),
  sim_type VARCHAR(10) DEFAULT 'B1',
  sim_expiry DATE,
  license_type VARCHAR(10),
  is_active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  trip_number VARCHAR(30) UNIQUE NOT NULL,
  vehicle_id INT REFERENCES vehicles(id),
  driver_id INT REFERENCES drivers(id),
  do_id INT REFERENCES delivery_orders(id),
  departure_date TIMESTAMP,
  arrival_date TIMESTAMP,
  route TEXT,
  distance_km DECIMAL(10,2) DEFAULT 0,
  fuel_cost DECIMAL(15,2) DEFAULT 0,
  toll_cost DECIMAL(15,2) DEFAULT 0,
  other_cost DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'))
);
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id SERIAL PRIMARY KEY,
  vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_type VARCHAR(20) CHECK (maintenance_type IN ('PREVENTIVE','CORRECTIVE','EMERGENCY')),
  service_date DATE NOT NULL,
  next_service_date DATE,
  description TEXT,
  cost DECIMAL(15,2) DEFAULT 0,
  workshop VARCHAR(100),
  invoice_number VARCHAR(50)
);

-- Loyalty
CREATE TABLE IF NOT EXISTS customer_tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  min_spend DECIMAL(18,2) DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  benefits JSONB DEFAULT '{}'
);
INSERT INTO customer_tiers (name, min_spend, discount_pct, benefits) VALUES
('Silver',0,2,'{"gratis_ongkir": false, "prioritas": false}'),
('Gold',50000000,5,'{"gratis_ongkir": true, "prioritas": false}'),
('Platinum',200000000,8,'{"gratis_ongkir": true, "prioritas": true}')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS loyalty_points (
  id SERIAL PRIMARY KEY,
  customer_id INT UNIQUE REFERENCES customers(id),
  points_balance BIGINT DEFAULT 0,
  lifetime_points BIGINT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  transaction_type VARCHAR(20) CHECK (transaction_type IN ('EARN','REDEEM','EXPIRE','ADJUST')),
  points BIGINT NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT,
  description TEXT,
  transaction_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE
);

-- Budgeting
CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  fiscal_year INT NOT NULL,
  branch_id INT REFERENCES branches(id),
  department VARCHAR(50),
  account_id INT REFERENCES accounts(id),
  period_month INT CHECK (period_month BETWEEN 1 AND 12),
  budget_amount DECIMAL(18,2) NOT NULL,
  notes TEXT,
  UNIQUE(fiscal_year, branch_id, account_id, period_month)
);
-- budget_actuals as view later, but create table for manual entry comparison
CREATE TABLE IF NOT EXISTS budget_actuals (
  id SERIAL PRIMARY KEY,
  fiscal_year INT NOT NULL,
  branch_id INT REFERENCES branches(id),
  account_id INT REFERENCES accounts(id),
  period_month INT,
  actual_amount DECIMAL(18,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit enhancement
CREATE TABLE IF NOT EXISTS data_change_logs (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id BIGINT NOT NULL,
  field_name VARCHAR(50),
  old_value TEXT,
  new_value TEXT,
  changed_by INT REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  reason TEXT
);

-- Marketplace
CREATE TABLE IF NOT EXISTS marketplace_channels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL CHECK (name IN ('TOKOPEDIA','SHOPEE','LAZADA')),
  store_id VARCHAR(50),
  api_key VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMP
);
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id SERIAL PRIMARY KEY,
  channel_id INT REFERENCES marketplace_channels(id),
  external_order_id VARCHAR(50) UNIQUE NOT NULL,
  so_id INT REFERENCES sales_orders(id),
  order_date TIMESTAMP DEFAULT NOW(),
  buyer_name VARCHAR(100),
  buyer_phone VARCHAR(20),
  shipping_address TEXT,
  total DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'PENDING',
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Additional: Waste & Susut
CREATE TABLE IF NOT EXISTS waste_logs (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  warehouse_id INT REFERENCES warehouses(id),
  qty DECIMAL(15,3) NOT NULL,
  waste_type VARCHAR(30) CHECK (waste_type IN ('PECAH_GUDANG','PECAH_KIRIM','PECAH_BONGKAR','SUSUT_ALAMI','SALAH_HITUNG','OTHER')),
  reason TEXT,
  cost DECIMAL(15,2) DEFAULT 0,
  approved_by INT REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Credit control extra
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='is_hold') THEN
    ALTER TABLE customers ADD COLUMN is_hold BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='hold_reason') THEN
    ALTER TABLE customers ADD COLUMN hold_reason TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS promise_to_pay (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  invoice_id INT REFERENCES invoices(id),
  promise_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','FULFILLED','BROKEN')),
  created_by INT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS dunning_letters (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  invoice_id INT REFERENCES invoices(id),
  level INT CHECK (level IN (1,2,3)),
  letter_date DATE DEFAULT CURRENT_DATE,
  content TEXT,
  sent_via VARCHAR(20) CHECK (sent_via IN ('WA','EMAIL','SMS','PRINT'))
);

-- Fixed Assets
CREATE TABLE IF NOT EXISTS fixed_assets (
  id SERIAL PRIMARY KEY,
  asset_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  acquisition_date DATE,
  acquisition_cost DECIMAL(18,2),
  useful_life_years INT DEFAULT 5,
  depreciation_method VARCHAR(20) DEFAULT 'STRAIGHT' CHECK (depreciation_method IN ('STRAIGHT','DECLINING')),
  accumulated_depreciation DECIMAL(18,2) DEFAULT 0,
  book_value DECIMAL(18,2),
  location VARCHAR(100),
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE','DISPOSED'))
);
CREATE TABLE IF NOT EXISTS asset_maintenance (
  id SERIAL PRIMARY KEY,
  asset_id INT REFERENCES fixed_assets(id) ON DELETE CASCADE,
  maintenance_date DATE NOT NULL,
  type VARCHAR(20) CHECK (type IN ('PREVENTIVE','CORRECTIVE')),
  cost DECIMAL(15,2),
  description TEXT
);

-- Approvals mobile
CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT NOT NULL,
  requester_id INT REFERENCES users(id),
  approver_id INT REFERENCES users(id),
  level INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','DELEGATED')),
  requested_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP,
  notes TEXT,
  delegated_to INT REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_customer_status ON projects(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_project_dates ON projects(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_consignment_partner ON consignments(partner_type, partner_id, status);
CREATE INDEX IF NOT EXISTS idx_consignment_items_product ON consignment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_claims_reference ON claims(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_landed_cost_po ON landed_costs(po_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_date ON trips(vehicle_id, departure_date);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_points(customer_id);
CREATE INDEX IF NOT EXISTS idx_budget_period ON budgets(fiscal_year, branch_id, account_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_channel ON marketplace_orders(channel_id, external_order_id);
CREATE INDEX IF NOT EXISTS idx_waste_product ON waste_logs(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_promise_customer ON promise_to_pay(customer_id, promise_date);
CREATE INDEX IF NOT EXISTS idx_data_change_table ON data_change_logs(table_name, record_id);

-- Seed addendum data
INSERT INTO projects (project_code, name, customer_id, contract_value, start_date, end_date, location, pic_name, status, retention_pct) VALUES
('PRJ-2024-001','Renovasi Mall ABC',1,2500000000,'2024-01-01','2024-06-30','Jl. Sudirman No.1, Jakarta','Budi Proyek','ACTIVE',5),
('PRJ-2024-002','Pembangunan Perumahan Citra 2',3,1800000000,'2024-03-01','2024-09-30','Cileungsi, Bogor','Siti Proyek','ACTIVE',5),
('PRJ-2024-003','Gudang Logistik Bekasi',1,900000000,'2024-02-15','2024-05-15','Bekasi Timur','Agus Proyek','PROSPECT',5)
ON CONFLICT DO NOTHING;

INSERT INTO project_terms (project_id, term_number, description, percentage, amount, due_date, status) VALUES
(1,1,'DP 30%',30,750000000,'2024-01-15','PAID'),
(1,2,'Termin 1 - Struktur',35,875000000,'2024-03-01','INVOICED'),
(1,3,'Termin 2 - Finishing',30,750000000,'2024-05-15','PENDING'),
(1,4,'Retensi 5%',5,125000000,'2024-07-30','PENDING'),
(2,1,'DP 20%',20,360000000,'2024-03-10','PAID'),
(2,2,'Termin 1',40,720000000,'2024-05-01','PENDING')
ON CONFLICT DO NOTHING;

INSERT INTO project_rab (project_id, product_id, qty_planned, qty_actual, amount_planned, amount_actual) VALUES
(1,1,2000,1450,130000000,94250000),
(1,3,500,380,21000000,15960000),
(1,10,300,210,25500000,17850000)
ON CONFLICT DO NOTHING;

INSERT INTO price_lists (code, name, type) VALUES
('PL-RETAIL','Harga Retail','RETAIL'),
('PL-GROSIR','Harga Grosir','WHOLESALE'),
('PL-KONTRAKTOR','Harga Kontraktor','CONTRACTOR'),
('PL-PROYEK','Harga Proyek','PROJECT')
ON CONFLICT DO NOTHING;

INSERT INTO price_list_items (price_list_id, product_id, unit_id, min_qty, price) VALUES
(1,1,2,1,65000),(2,1,2,50,62000),(3,1,2,100,59000),
(1,3,6,1,42000),(2,3,6,50,39000),
(1,10,7,1,85000),(2,10,7,20,79000)
ON CONFLICT DO NOTHING;

INSERT INTO customer_prices (customer_id, product_id, unit_id, price) VALUES
(1,1,2,58000),
(2,1,2,61000)
ON CONFLICT DO NOTHING;

INSERT INTO consignments (consignment_number, type, partner_type, partner_id, location_name, location_address, start_date, status) VALUES
('CSO-2024-0001','OUT','CUSTOMER',2,'Toko Sinar Jaya - Titipan','Jl. Pasar Minggu No.5','2024-09-01','ACTIVE'),
('CSO-2024-0002','OUT','CUSTOMER',3,'Proyek Citra - Pos Titip','Cileungsi','2024-09-10','ACTIVE'),
('CSI-2024-0001','IN','SUPPLIER',4,'Gudang Pusat Bekasi','Jl. Industri No.88','2024-09-05','ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO consignment_items (consignment_id, product_id, qty_sent, qty_sold, qty_returned, selling_price) VALUES
(1,10,100,45,5,85000),
(1,11,40,18,2,1450000),
(2,1,200,80,0,65000),
(3,7,100,30,0,320000)
ON CONFLICT DO NOTHING;

INSERT INTO consignments (consignment_number, type, partner_type, partner_id, location_name, start_date, status) VALUES
('CSO-2024-0003','OUT','CUSTOMER',2,'Toko Citra Bangunan Titip','2024-08-01','ACTIVE')
ON CONFLICT DO NOTHING;

UPDATE customers SET is_hold=false WHERE is_hold IS NULL;
INSERT INTO loyalty_points (customer_id, points_balance, lifetime_points) VALUES
(1,12500,45000),(2,8300,28000),(3,5400,15000),(4,1200,1200)
ON CONFLICT DO NOTHING;

INSERT INTO loyalty_transactions (customer_id, transaction_type, points, description) VALUES
(1,'EARN',2500,'SO-2024-0001'),
(2,'EARN',1800,'SO-2024-0002'),
(1,'REDEEM',-500,'Tukar voucher 50rb')
ON CONFLICT DO NOTHING;

INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost, useful_life_years, book_value, status) VALUES
('AST-001','Gudang Pusat Bekasi','BANGUNAN','2020-01-01',3500000000,20,2800000000,'ACTIVE'),
('AST-002','Truk Fuso B 9001','KENDARAAN','2021-06-01',650000000,8,400000000,'ACTIVE'),
('AST-003','Forklift Toyota 3 Ton','ALAT','2022-03-15',450000000,10,360000000,'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO marketplace_channels (name, store_id, is_active) VALUES
('TOKOPEDIA','tokopedia-sumber-material',true),
('SHOPEE','shopee-sumber-mtrl',true)
ON CONFLICT DO NOTHING;

INSERT INTO budgets (fiscal_year, branch_id, department, account_id, period_month, budget_amount) VALUES
(2024,1,'Sales',7,9,500000000),
(2024,1,'Sales',7,10,550000000),
(2024,1,'Operations',9,9,300000000)
ON CONFLICT DO NOTHING;

INSERT INTO waste_logs (product_id, warehouse_id, qty, waste_type, reason, cost, status) VALUES
(10,1,5,'PECAH_GUDANG','Pecah saat stacking',425000,'APPROVED'),
(8,1,200,'PECAH_KIRIM','Pecah di truk B9001',130000,'PENDING'),
(6,1,2,'SUSUT_ALAMI','Pasir menguap susut',560000,'APPROVED')
ON CONFLICT DO NOTHING;

INSERT INTO promise_to_pay (customer_id, invoice_id, promise_date, amount, status) VALUES
(1,1,'2024-10-05',58750000,'PENDING'),
(2,2,'2024-10-10',75480000,'PENDING')
ON CONFLICT DO NOTHING;
