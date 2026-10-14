-- v3.0 POS MODULE — Phase 0: Local POS Minimal Tables
-- Fast checkout, offline sync, multi-register

-- ========== POS TRANSACTIONS ==========
CREATE TABLE IF NOT EXISTS pos_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_number VARCHAR(30) UNIQUE NOT NULL,
  cashier_id BIGINT REFERENCES users(id),
  register_id INT DEFAULT 1,
  total DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) NOT NULL,
  change_amount DECIMAL(15,2) GENERATED ALWAYS AS (paid_amount - total) STORED,
  payment_method VARCHAR(30) CHECK (payment_method IN ('CASH','CARD','QRIS','CHEQUE')),
  status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','CANCELLED','REFUNDED')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  sync_status VARCHAR(20) DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SYNCED','FAILED'))
);

CREATE TABLE IF NOT EXISTS pos_transaction_items (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES pos_transactions(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  qty DECIMAL(15,3) NOT NULL,
  unit VARCHAR(20),
  price_per_unit DECIMAL(15,2) NOT NULL,
  subtotal DECIMAL(15,2) GENERATED ALWAYS AS (qty * price_per_unit) STORED,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  discount_amt DECIMAL(15,2) DEFAULT 0
);

-- ========== CASHIER RECONCILIATION ==========
CREATE TABLE IF NOT EXISTS pos_reconciliation (
  id BIGSERIAL PRIMARY KEY,
  cashier_id BIGINT REFERENCES users(id),
  register_id INT DEFAULT 1,
  recon_date DATE DEFAULT CURRENT_DATE,
  cash_count DECIMAL(15,2) NOT NULL,
  expected_cash DECIMAL(15,2) NOT NULL,
  variance DECIMAL(15,2) GENERATED ALWAYS AS (cash_count - expected_cash) STORED,
  variance_pct DECIMAL(5,2) GENERATED ALWAYS AS ((cash_count - expected_cash) / NULLIF(expected_cash, 0) * 100) STORED,
  status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','REVIEWED','APPROVED')),
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== PROMOTION/DISCOUNT ==========
CREATE TABLE IF NOT EXISTS pos_promotions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  description VARCHAR(200),
  type VARCHAR(20) CHECK (type IN ('PERCENTAGE','FIXED','BOGO')),
  discount_value DECIMAL(15,2),
  min_purchase DECIMAL(15,2) DEFAULT 0,
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos_promotion_items (
  id BIGSERIAL PRIMARY KEY,
  promotion_id BIGINT REFERENCES pos_promotions(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  discount_pct DECIMAL(5,2)
);

-- ========== MEMBER/LOYALTY ==========
CREATE TABLE IF NOT EXISTS pos_members (
  id BIGSERIAL PRIMARY KEY,
  member_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  member_tier VARCHAR(20) DEFAULT 'REGULAR' CHECK (member_tier IN ('REGULAR','SILVER','GOLD','PLATINUM')),
  points_balance BIGINT DEFAULT 0,
  lifetime_points BIGINT DEFAULT 0,
  last_transaction TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  joined_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS pos_member_transactions (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT REFERENCES pos_members(id),
  transaction_id BIGINT REFERENCES pos_transactions(id),
  points_earned BIGINT,
  discount_applied DECIMAL(15,2),
  transaction_date TIMESTAMP DEFAULT NOW()
);

-- ========== STOCK PER LOCATION ==========
CREATE TABLE IF NOT EXISTS pos_stock_locations (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id),
  location_code VARCHAR(50),
  location_name VARCHAR(100),
  qty_on_hand DECIMAL(15,3) DEFAULT 0,
  min_stock DECIMAL(15,3) DEFAULT 10,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- ========== POS SETTINGS ==========
CREATE TABLE IF NOT EXISTS pos_settings (
  id BIGSERIAL PRIMARY KEY,
  store_name VARCHAR(100),
  store_address TEXT,
  register_id INT UNIQUE,
  register_name VARCHAR(50),
  currency VARCHAR(3) DEFAULT 'IDR',
  receipt_header TEXT,
  receipt_footer TEXT,
  print_logo BOOLEAN DEFAULT false,
  theme VARCHAR(20) DEFAULT 'LIGHT',
  language VARCHAR(10) DEFAULT 'ID'
);

-- ========== INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_pos_transaction_date ON pos_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_cashier ON pos_transactions(cashier_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_number ON pos_transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_pos_reconciliation_date ON pos_reconciliation(recon_date, cashier_id);
CREATE INDEX IF NOT EXISTS idx_pos_member_phone ON pos_members(phone);
CREATE INDEX IF NOT EXISTS idx_pos_member_code ON pos_members(member_code);
CREATE INDEX IF NOT EXISTS idx_pos_stock_location_product ON pos_stock_locations(product_id, location_code);

-- ========== SEED DATA ==========
INSERT INTO pos_settings (store_name, store_address, register_id, register_name, receipt_header, receipt_footer) 
VALUES ('Toko Material Utama', 'Jl. Industri No.88, Bekasi', 1, 'Register 1', 
'TOKO MATERIAL UTAMA', 'Terima Kasih Telah Berbelanja') 
ON CONFLICT DO NOTHING;

INSERT INTO pos_members (member_code, name, phone, member_tier) 
VALUES ('MBR-001', 'Member Test', '081234567890', 'REGULAR')
ON CONFLICT DO NOTHING;

INSERT INTO pos_promotions (code, description, type, discount_value, valid_from, valid_to) 
VALUES ('PROMO10', 'Diskon 10% untuk pembelian > 500rb', 'PERCENTAGE', 10, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days')
ON CONFLICT DO NOTHING;
