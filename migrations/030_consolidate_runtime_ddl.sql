-- 030_consolidate_runtime_ddl.sql
-- Consolidate all runtime DDL out of HTTP request handlers into a single idempotent migration.

-- 1. MFA Columns on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT;

-- 2. Attendance GPS and Late Tracking Columns on attendances
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_lat DECIMAL(10,7);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_lng DECIMAL(10,7);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_distance_m INT;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_accuracy_m INT;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_lat DECIMAL(10,7);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_lng DECIMAL(10,7);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_distance_m INT;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS note TEXT;

-- Backfill attendances late calculation for legacy rows
UPDATE attendances
   SET is_late = (check_in::time > TIME '08:00'),
       late_minutes = GREATEST(0, (EXTRACT(EPOCH FROM (check_in::time - TIME '08:00'))/60)::int)
 WHERE check_in IS NOT NULL
   AND (is_late IS NULL OR (is_late = false AND check_in::time > TIME '08:00'));

-- 3. Public Order Tracking Columns on sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS track_token VARCHAR(48);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS track_enabled BOOLEAN DEFAULT true;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS track_views INT DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ux_so_track_token ON sales_orders(track_token) WHERE track_token IS NOT NULL;

-- 4. Tax Module Tables
CREATE TABLE IF NOT EXISTS tax_invoices (
  id SERIAL PRIMARY KEY,
  invoice_id INT UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  tax_number VARCHAR(25) NOT NULL,
  dpp NUMERIC(18,2) DEFAULT 0,
  ppn NUMERIC(18,2) DEFAULT 0,
  period VARCHAR(7),
  status VARCHAR(20) DEFAULT 'ISSUED',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pph_withholdings (
  id SERIAL PRIMARY KEY,
  ref_type VARCHAR(20) DEFAULT 'SALES',
  ref_id INT,
  invoice_number VARCHAR(40),
  partner_name VARCHAR(200),
  pph_type VARCHAR(10) NOT NULL,
  rate NUMERIC(6,2) DEFAULT 0,
  base NUMERIC(18,2) DEFAULT 0,
  amount NUMERIC(18,2) DEFAULT 0,
  period VARCHAR(7),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Invoice Columns in Finance
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dp_percent INT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;

-- 6. Cash Movements & Bank Accounts
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS kind VARCHAR(10) DEFAULT 'BANK';

CREATE TABLE IF NOT EXISTS cash_movements (
  id SERIAL PRIMARY KEY,
  account_id INT REFERENCES bank_accounts(id),
  direction VARCHAR(4) NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  source VARCHAR(20) NOT NULL,
  reference_type VARCHAR(30),
  reference_id INT,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Purchase Invoices Table
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id SERIAL PRIMARY KEY,
  inv_number VARCHAR(30) UNIQUE NOT NULL,
  po_id INT REFERENCES purchase_orders(id),
  supplier_id INT REFERENCES suppliers(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'HOLD',
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
