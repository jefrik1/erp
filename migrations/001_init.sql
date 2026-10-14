
-- Enable extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- companies & branches
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO companies (code,name,address,phone) VALUES ('CMP001','PT Sumber Material Jaya','Jl. Industri No. 88, Bekasi','021-8888888') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO branches (company_id, code,name,address,phone) VALUES (1,'CBK','Cabang Bekasi','Jl. Bekasi Timur No.1','021-1111111'),(1,'JKT','Cabang Jakarta','Jl. Sudirman No.10','021-2222222'),(1,'BDG','Cabang Bandung','Jl. Soekarno No.5','022-3333333') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  branch_id INT REFERENCES branches(id),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'main',
  address TEXT,
  is_active BOOLEAN DEFAULT true
);
INSERT INTO warehouses (branch_id,code,name,type) VALUES (1,'WH-BEK-01','Gudang Pusat Bekasi','main'),(1,'WH-BEK-TR','Gudang Transit Bekasi','transit'),(2,'WH-JKT-01','Gudang Jakarta','main'),(3,'WH-BDG-01','Gudang Bandung','main') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS bin_locations (
  id SERIAL PRIMARY KEY,
  warehouse_id INT REFERENCES warehouses(id),
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100),
  UNIQUE(warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  base_unit_id INT REFERENCES units(id),
  conversion_factor DECIMAL(15,6) DEFAULT 1
);
INSERT INTO units (code,name) VALUES ('PCS','Pieces'),('SAK','Sak'),('TON','Ton'),('KG','Kilogram'),('M3','Kubik'),('BTG','Batang'),('DUS','Dus'),('LTR','Liter') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  parent_id INT REFERENCES product_categories(id),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT
);
INSERT INTO product_categories (code,name) VALUES ('SEMEN','Semen'),('BESI','Besi Beton'),('PASIR','Pasir & Agregat'),('BATA','Batu Bata & Batako'),('KERAMIK','Keramik & Granit'),('CAT','Cat'),('PIPA','Pipa & Fitting'),('ALAT','Alat & Mesin') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS taxes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  rate DECIMAL(5,2) DEFAULT 11
);
INSERT INTO taxes (code,name,rate) VALUES ('PPN11','PPN 11%',11),('NONPPN','Non PPN',0) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES product_categories(id),
  sku VARCHAR(50) UNIQUE NOT NULL,
  barcode VARCHAR(50) UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_unit_id INT REFERENCES units(id),
  cost_method VARCHAR(20) DEFAULT 'AVG',
  min_stock DECIMAL(15,3) DEFAULT 10,
  max_stock DECIMAL(15,3) DEFAULT 1000,
  reorder_point DECIMAL(15,3) DEFAULT 20,
  is_batch_tracked BOOLEAN DEFAULT false,
  is_serial_tracked BOOLEAN DEFAULT false,
  tax_id INT REFERENCES taxes(id),
  is_active BOOLEAN DEFAULT true,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_units (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  unit_id INT REFERENCES units(id),
  conversion_factor DECIMAL(15,6) NOT NULL,
  selling_price DECIMAL(15,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  npwp VARCHAR(30),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  payment_term_days INT DEFAULT 14,
  rating DECIMAL(3,2) DEFAULT 4.5,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) DEFAULT 'retail',
  npwp VARCHAR(30),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  credit_limit DECIMAL(15,2) DEFAULT 50000000,
  payment_term_days INT DEFAULT 14,
  sales_pic_id INT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employee_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  position VARCHAR(50),
  department VARCHAR(50),
  branch_id INT REFERENCES branches(id),
  join_date DATE,
  basic_salary DECIMAL(15,2) DEFAULT 5000000,
  npwp VARCHAR(30),
  bpjs_number VARCHAR(30),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  branch_id INT REFERENCES branches(id),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}'
);
INSERT INTO roles (name, description, permissions) VALUES 
('direktur','Direktur - full access','{"*": true}'),
('finance','Finance Manager','{"finance": true, "report": true, "dashboard": true}'),
('sales','Sales Manager & Counter','{"sales": true, "crm": true, "pos": true, "dashboard": true}'),
('warehouse','Warehouse Manager','{"inventory": true, "warehouse": true, "logistics": true}'),
('purchasing','Purchasing Admin','{"purchase": true, "inventory": true}'),
('hrd','HRD','{"hr": true}'),
('auditor','Auditor read-only','{"audit": true, "report": true}')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  warehouse_id INT REFERENCES warehouses(id),
  bin_id INT REFERENCES bin_locations(id),
  batch_no VARCHAR(50),
  expired_date DATE,
  qty_on_hand DECIMAL(15,3) DEFAULT 0,
  qty_reserved DECIMAL(15,3) DEFAULT 0,
  qty_available DECIMAL(15,3) GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
  avg_cost DECIMAL(15,2) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id, batch_no)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  warehouse_id INT REFERENCES warehouses(id),
  movement_type VARCHAR(20) NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT,
  qty_in DECIMAL(15,3) DEFAULT 0,
  qty_out DECIMAL(15,3) DEFAULT 0,
  unit_cost DECIMAL(15,2) DEFAULT 0,
  balance_qty DECIMAL(15,3),
  movement_date TIMESTAMP DEFAULT NOW(),
  created_by INT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_movement_product_date ON stock_movements(product_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_movement_type ON stock_movements(movement_type);

CREATE TABLE IF NOT EXISTS sales_orders (
  id SERIAL PRIMARY KEY,
  so_number VARCHAR(30) UNIQUE NOT NULL,
  customer_id INT REFERENCES customers(id),
  branch_id INT REFERENCES branches(id),
  so_date DATE NOT NULL,
  delivery_date DATE,
  status VARCHAR(20) DEFAULT 'DRAFT',
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_so_customer_date ON sales_orders(customer_id, so_date);
CREATE INDEX IF NOT EXISTS idx_so_status ON sales_orders(status);

CREATE TABLE IF NOT EXISTS so_details (
  id SERIAL PRIMARY KEY,
  so_id INT REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_id INT REFERENCES units(id),
  qty DECIMAL(15,3) NOT NULL,
  qty_delivered DECIMAL(15,3) DEFAULT 0,
  unit_price DECIMAL(15,2) NOT NULL,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  discount_amt DECIMAL(15,2) DEFAULT 0,
  tax_amt DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_orders (
  id SERIAL PRIMARY KEY,
  do_number VARCHAR(30) UNIQUE NOT NULL,
  so_id INT REFERENCES sales_orders(id),
  customer_id INT REFERENCES customers(id),
  warehouse_id INT REFERENCES warehouses(id),
  delivery_date DATE,
  driver_id INT REFERENCES employees(id),
  vehicle_no VARCHAR(30),
  status VARCHAR(20) DEFAULT 'DRAFT',
  shipping_address TEXT,
  pod_signature_url VARCHAR(255),
  pod_photo_url VARCHAR(255),
  received_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS do_details (
  id SERIAL PRIMARY KEY,
  do_id INT REFERENCES delivery_orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty DECIMAL(15,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(30) UNIQUE NOT NULL,
  customer_id INT REFERENCES customers(id),
  so_id INT REFERENCES sales_orders(id),
  do_id INT REFERENCES delivery_orders(id),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'DRAFT',
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  outstanding DECIMAL(15,2) GENERATED ALWAYS AS (total - paid_amount) STORED,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_due ON invoices(due_date, status);

CREATE TABLE IF NOT EXISTS invoice_details (
  id SERIAL PRIMARY KEY,
  invoice_id INT REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty DECIMAL(15,3),
  unit_price DECIMAL(15,2),
  total DECIMAL(15,2)
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  payment_number VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(10) NOT NULL,
  invoice_id INT REFERENCES invoices(id),
  purchase_invoice_id INT,
  payment_date DATE NOT NULL,
  method VARCHAR(20) DEFAULT 'TRANSFER',
  bank_account_id INT,
  amount DECIMAL(15,2) NOT NULL,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(30) UNIQUE NOT NULL,
  supplier_id INT REFERENCES suppliers(id),
  branch_id INT REFERENCES branches(id),
  po_date DATE NOT NULL,
  expected_date DATE,
  status VARCHAR(20) DEFAULT 'DRAFT',
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  created_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id, po_date);

CREATE TABLE IF NOT EXISTS po_details (
  id SERIAL PRIMARY KEY,
  po_id INT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_id INT REFERENCES units(id),
  qty DECIMAL(15,3) NOT NULL,
  qty_received DECIMAL(15,3) DEFAULT 0,
  unit_cost DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id SERIAL PRIMARY KEY,
  grn_number VARCHAR(30) UNIQUE NOT NULL,
  po_id INT REFERENCES purchase_orders(id),
  warehouse_id INT REFERENCES warehouses(id),
  receipt_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'DRAFT',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grn_details (
  id SERIAL PRIMARY KEY,
  grn_id INT REFERENCES goods_receipts(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty_ordered DECIMAL(15,3),
  qty_received DECIMAL(15,3),
  qty_rejected DECIMAL(15,3) DEFAULT 0,
  unit_cost DECIMAL(15,2),
  batch_no VARCHAR(50),
  expired_date DATE
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  transfer_number VARCHAR(30) UNIQUE NOT NULL,
  from_warehouse_id INT REFERENCES warehouses(id),
  to_warehouse_id INT REFERENCES warehouses(id),
  transfer_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'DRAFT',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfer_details (
  id SERIAL PRIMARY KEY,
  transfer_id INT REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  qty DECIMAL(15,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS attendances (
  id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id),
  date DATE NOT NULL,
  check_in TIMESTAMP,
  check_out TIMESTAMP,
  status VARCHAR(20) DEFAULT 'PRESENT',
  overtime_hours DECIMAL(5,2) DEFAULT 0,
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS payrolls (
  id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id),
  period VARCHAR(7) NOT NULL,
  basic_salary DECIMAL(15,2),
  allowances DECIMAL(15,2) DEFAULT 0,
  overtime DECIMAL(15,2) DEFAULT 0,
  deductions DECIMAL(15,2) DEFAULT 0,
  bpjs_employee DECIMAL(15,2) DEFAULT 0,
  bpjs_company DECIMAL(15,2) DEFAULT 0,
  pph21 DECIMAL(15,2) DEFAULT 0,
  net_salary DECIMAL(15,2),
  status VARCHAR(20) DEFAULT 'DRAFT',
  UNIQUE(employee_id, period)
);

CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id),
  type VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  approved_by INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  company VARCHAR(200),
  phone VARCHAR(20),
  email VARCHAR(100),
  source VARCHAR(50),
  status VARCHAR(20) DEFAULT 'NEW',
  assigned_to INT REFERENCES users(id),
  expected_value DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  plat_no VARCHAR(20) UNIQUE NOT NULL,
  type VARCHAR(50),
  capacity_ton DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'AVAILABLE',
  driver_id INT REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  parent_id INT REFERENCES accounts(id),
  is_active BOOLEAN DEFAULT true
);
INSERT INTO accounts (code,name,type) VALUES 
('1-1000','Kas & Bank','ASSET'),
('1-1100','Piutang Usaha','ASSET'),
('1-1200','Persediaan','ASSET'),
('2-1000','Hutang Usaha','LIABILITY'),
('2-1100','Hutang Pajak','LIABILITY'),
('3-1000','Modal','EQUITY'),
('4-1000','Penjualan','REVENUE'),
('5-1000','Harga Pokok Penjualan','EXPENSE'),
('6-1000','Beban Operasional','EXPENSE')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  entry_number VARCHAR(30) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT,
  description TEXT,
  total_debit DECIMAL(15,2) DEFAULT 0,
  total_credit DECIMAL(15,2) DEFAULT 0,
  posted BOOLEAN DEFAULT false,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_details (
  id SERIAL PRIMARY KEY,
  journal_id INT REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INT REFERENCES accounts(id),
  debit DECIMAL(15,2) DEFAULT 0,
  credit DECIMAL(15,2) DEFAULT 0,
  description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  bank_name VARCHAR(100),
  account_no VARCHAR(50),
  account_name VARCHAR(100),
  balance DECIMAL(15,2) DEFAULT 0
);
INSERT INTO bank_accounts (bank_name,account_no,account_name,balance) VALUES ('BCA','1234567890','PT Sumber Material Jaya', 1500000000),('Mandiri','0987654321','PT Sumber Material Jaya', 800000000) ON CONFLICT DO NOTHING;

-- seed products
INSERT INTO products (category_id, sku, barcode, name, description, base_unit_id, min_stock, reorder_point, tax_id) VALUES
(1,'SEM-001','899001','Semen Gresik 50kg','Semen Portland Type I',2,100,50,1),
(1,'SEM-002','899002','Semen Tiga Roda 40kg','Semen premium',2,100,50,1),
(2,'BES-006','899010','Besi Beton 6mm x12m','Besi polos SNI',6,200,100,1),
(2,'BES-010','899011','Besi Beton 10mm x12m','Besi ulir SNI',6,200,100,1),
(2,'BES-013','899012','Besi Beton 13mm x12m','Besi ulir SNI',6,150,80,1),
(3,'PAS-001','899020','Pasir Mundu Halus','Pasir per m3',5,50,30,1),
(3,'BAT-001','899030','Batu Split 1-2','Agregat',5,50,30,1),
(4,'BTB-001','899040','Bata Merah Press','Bata ukuran 22x11x5',1,1000,500,2),
(4,'BTK-001','899041','Batako Putih','Batako 40x20x10',1,800,400,2),
(5,'KRM-001','899050','Keramik 40x40 Putih','Keramik lantai',7,100,50,1),
(6,'CAT-001','899060','Cat Tembok Dulux 25kg','Cat interior',8,50,20,1),
(7,'PIP-021','899070','Pipa PVC 3/4"','Pipa AW',6,200,100,1)
ON CONFLICT DO NOTHING;

INSERT INTO product_units (product_id, unit_id, conversion_factor, selling_price) VALUES
(1,2,1,65000),(1,3,0.02,65000),
(2,2,1,62000),
(3,6,1,42000),(3,3,0.008,42000),
(4,6,1,72000),
(5,6,1,110000),
(6,5,1,280000),
(7,5,1,320000),
(8,1,1,650),
(9,1,1,2800),
(10,7,1,85000),
(11,8,1,1450000),
(12,6,1,18000)
ON CONFLICT DO NOTHING;

INSERT INTO customers (code,name,type,address,phone,credit_limit,payment_term_days) VALUES
('C001','PT Waskita Beton','contractor','Jl. Gatot Subroto No.10','0811111111',500000000,30),
('C002','Toko Bangunan Sinar Jaya','wholesale','Jl. Pasar Minggu No.5','0812222222',200000000,14),
('C003','CV Karya Mandiri','contractor','Jl. Cileungsi No.8','0813333333',300000000,30),
('C004','Budi Santoso (Retail)','retail','Jl. Kemang No.1','0814444444',10000000,0),
('C005','PT Adhi Karya Cabang','contractor','Jl. Rasuna Said No.20','0815555555',400000000,45)
ON CONFLICT DO NOTHING;

INSERT INTO suppliers (code,name,address,phone,payment_term_days) VALUES
('S001','PT Semen Indonesia Distributor','Jl. Industri Semen No.1','021-1000001',14),
('S002','PT Krakatau Steel','Jl. Baja No.5, Cilegon','0254-200001',30),
('S003','CV Pasir Mundu','Jl. Mundu, Cirebon','0231-300003',7),
('S004','PT Keramik Mulia','Jl. Keramik No.8','021-400004',14)
ON CONFLICT DO NOTHING;

INSERT INTO employees (employee_code,name,position,department,branch_id,join_date,basic_salary,phone) VALUES
('EMP001','Admin Utama','Direktur','Management',1,'2020-01-01',25000000,'0810000001'),
('EMP002','Siti Keuangan','Manager Keuangan','Finance',1,'2020-03-01',12000000,'0810000002'),
('EMP003','Budi Sales','Sales Manager','Sales',1,'2021-01-15',8000000,'0810000003'),
('EMP004','Agus Gudang','Manager Gudang','Warehouse',1,'2021-02-01',7000000,'0810000004'),
('EMP005','Rina HRD','HR Manager','HR',1,'2020-06-01',9000000,'0810000005'),
('EMP006','Joko Driver','Driver','Logistics',1,'2022-01-10',4500000,'0810000006'),
('EMP007','Slamet Driver','Driver','Logistics',1,'2022-03-12',4500000,'0810000007'),
('EMP008','Dewi Kasir','Kasir','Sales',2,'2022-05-01',5000000,'0810000008')
ON CONFLICT DO NOTHING;

-- stocks seed
INSERT INTO stocks (product_id, warehouse_id, qty_on_hand, avg_cost) VALUES
(1,1,850,58000),(2,1,620,55000),(3,1,180,38000),(4,1,140,65000),(5,1,90,100000),
(6,1,45,250000),(7,1,55,290000),(8,1,4200,500),(9,1,3100,2200),(10,1,95,75000),(11,1,42,1300000),(12,1,380,15000),
(1,3,320,58000),(3,3,80,38000),(8,3,1800,500)
ON CONFLICT DO NOTHING;

-- users with bcrypt hashes (admin123)
-- hash for admin123 = $2a$10$... generated at runtime via seed.js fallback, insert placeholder and update via seed.js
INSERT INTO users (employee_id, username, email, password_hash, branch_id) VALUES
(1,'admin','admin@erp.local','$2a$10$7EqJtF9iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8',1),
(2,'finance','finance@erp.local','$2a$10$7EqJtF9iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8',1),
(3,'sales','sales@erp.local','$2a$10$7EqJtF9iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8',1),
(4,'gudang','gudang@erp.local','$2a$10$7EqJtF9iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8iN8',1)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id) VALUES (1,1),(2,2),(3,3),(4,4) ON CONFLICT DO NOTHING;

INSERT INTO vehicles (plat_no, type, capacity_ton, driver_id) VALUES ('B 9001 JKT','Colt Diesel 8 Ton',8,6),('B 9002 JKT','Truk Tronton 20 Ton',20,7),('B 9003 JKT','Pickup 2 Ton',2,6) ON CONFLICT DO NOTHING;

-- sample SO/PO/Invoices for KPIs
INSERT INTO sales_orders (so_number, customer_id, branch_id, so_date, delivery_date, status, subtotal, tax, total, created_by) VALUES
('SO-2024-0001',1,1,'2024-09-18','2024-09-20','COMPLETED', 125000000,13750000,138750000,3),
('SO-2024-0002',2,1,'2024-09-19','2024-09-21','APPROVED', 68000000,7480000,75480000,3),
('SO-2024-0003',3,1,'2024-09-20','2024-09-22','PENDING', 92000000,10120000,102120000,3),
('SO-2024-0004',4,2,'2024-09-20','2024-09-21','COMPLETED', 4500000,0,4500000,3)
ON CONFLICT DO NOTHING;

INSERT INTO invoices (invoice_number, customer_id, so_id, invoice_date, due_date, status, subtotal, tax, total, paid_amount) VALUES
('INV-2024-0001',1,1,'2024-09-20','2024-10-20','PARTIAL',125000000,13750000,138750000,80000000),
('INV-2024-0002',2,2,'2024-09-21','2024-10-05','SENT',68000000,7480000,75480000,0),
('INV-2024-0003',1,1,'2024-09-10','2024-09-24','OVERDUE',85000000,9350000,94350000,0)
ON CONFLICT DO NOTHING;

INSERT INTO purchase_orders (po_number, supplier_id, branch_id, po_date, expected_date, status, subtotal, tax, total, created_by) VALUES
('PO-2024-0001',1,1,'2024-09-15','2024-09-22','APPROVED', 58000000,6380000,64380000,1),
('PO-2024-0002',2,1,'2024-09-16','2024-09-23','PENDING', 72000000,7920000,79920000,1),
('PO-2024-0003',3,1,'2024-09-18','2024-09-25','RECEIVED', 12000000,0,12000000,1)
ON CONFLICT DO NOTHING;

-- seed CRM leads — idempotent (ON CONFLICT tidak ada unique, pakai NOT EXISTS)
INSERT INTO leads (name, company, phone, status, expected_value, assigned_to)
SELECT v.name, v.company, v.phone, v.status, v.expected_value, v.assigned_to
FROM (VALUES
  ('Pak Hendra','PT Pembangunan Jaya','0816000001','QUALIFIED',250000000,3),
  ('Ibu Sari','Toko Citra Bangunan','0816000002','NEW',45000000,3),
  ('Kontraktor Wijaya','CV Wijaya Karya','0816000003','PROPOSAL',120000000,3)
) AS v(name, company, phone, status, expected_value, assigned_to)
WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.phone=v.phone AND l.name=v.name LIMIT 1);

