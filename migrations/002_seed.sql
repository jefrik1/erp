-- Seed minimal - only tables that exist
INSERT INTO companies (code,name,address) VALUES ('PT-001','PT Maju Bangun Sejahtera','Jl. Industri No.1') ON CONFLICT DO NOTHING;
INSERT INTO branches (company_id,code,name) VALUES (1,'CB-JKT','Cabang Jakarta'),(1,'CB-SBY','Cabang Surabaya') ON CONFLICT DO NOTHING;
INSERT INTO warehouses (branch_id,code,name,type) VALUES (1,'WH-PUSAT','Gudang Pusat','main'),(1,'WH-RET','Gudang Retur','transit'),(1,'WH-SITE-A','Gudang Site Cluster A','main') ON CONFLICT DO NOTHING;
INSERT INTO units (code,name) VALUES ('PCS','Pcs'),('SAK','Sak'),('M3','m3'),('DUS','Dus'),('BTG','Batang'),('KG','Kg'),('M2','m2'),('ROLL','Roll'),('LTR','Liter'),('UNIT','Unit') ON CONFLICT DO NOTHING;
INSERT INTO taxes (code,name) VALUES ('PPN11','PPN 11%'),('PPH21','PPh 21'),('PPH23','PPh 23') ON CONFLICT DO NOTHING;
INSERT INTO product_categories (code,name) VALUES ('CAT-STR','Struktur'),('CAT-DND','Dinding'),('CAT-LNT','Lantai'),('CAT-ATP','Atap'),('CAT-SAN','Sanitasi'),('CAT-LST','Listrik'),('CAT-CAT','Pengecatan') ON CONFLICT DO NOTHING;
INSERT INTO roles (name,description) VALUES
 ('super_admin','Super Admin'),
 ('direktur','Direktur'),
 ('finance','Finance'),
 ('sales_trading','Sales Trading'),
 ('warehouse','Warehouse'),
 ('purchasing','Purchasing'),
 ('POS_CASHIER','POS Cashier'),
 ('POS_SUPERVISOR','POS Supervisor'),
 ('POS_MANAGER','POS Manager')
ON CONFLICT DO NOTHING;
INSERT INTO users (username,email,password_hash,branch_id) VALUES ('admin','admin@erp.local','$2a$10$D6H5Gk2g7k8n1Q2w3e4r5O6p7Q8R9S0T1U2V3W4X5Y6Z7a8b9c0d1e',1) ON CONFLICT DO NOTHING;
INSERT INTO user_roles (user_id,role_id) VALUES (1,1) ON CONFLICT DO NOTHING;
INSERT INTO products (category_id,sku,name,base_unit_id,min_stock,reorder_point) VALUES
 (1,'SEM-PC-40','Semen PC 40kg',(SELECT id FROM units WHERE code='SAK'),100,200),
 (1,'BSI-10-ULIR','Besi Beton Ulir 10mm',(SELECT id FROM units WHERE code='BTG'),50,100),
 (3,'KRM-60-GLS','Keramik 60x60 Putih Glossy',(SELECT id FROM units WHERE code='DUS'),20,50),
 (4,'BJR-C75','Baja Ringan C75',(SELECT id FROM units WHERE code='BTG'),30,60),
 (5,'CLOSET-DUDUK','Closet Duduk Monoblok',(SELECT id FROM units WHERE code='PCS'),5,10)
ON CONFLICT DO NOTHING;
INSERT INTO suppliers (code,name,phone) VALUES ('SUP-001','PT Semen Indonesia','021-123456'),('SUP-002','PT Keramik Utama','021-654321') ON CONFLICT DO NOTHING;
INSERT INTO customers (code,name,type,phone) VALUES ('CUST-001','Toko Sumber Rejeki','RETAIL','08123456789'),('CUST-002','PT Kontraktor Jaya','CONTRACTOR','08234567890') ON CONFLICT DO NOTHING;
