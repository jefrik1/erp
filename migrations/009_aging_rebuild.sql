-- 009_aging_rebuild.sql — rebuild AR jadi POS/DO/SO only (hapus dummy seed, anti-404)
-- ponytail: idempotent. Hanya perbaiki schema + bersihkan dummy lama. Tidak seed invoice baru.
-- AR = invoices yang lahir dari POS (INV-POS-) atau DO (sales/invoices). Finance tidak buat dummy.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dp_percent INT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'SENT';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS do_id INT REFERENCES delivery_orders(id);

-- Hapus dummy lama dari finance seed (INV-SENT-/INV-POS-DEMO/INV-OVER/INV-DEMO) biar 100% dari POS/DO/SO
DELETE FROM payments WHERE invoice_id IN (
  SELECT id FROM invoices WHERE invoice_number LIKE 'INV-SENT-%' OR invoice_number LIKE 'INV-POS-DEMO%' OR invoice_number LIKE 'INV-DEMO%' OR invoice_number LIKE 'INV-OVER-%' OR invoice_number LIKE 'INV-POS-%' AND so_id IS NULL
);
DELETE FROM invoice_details WHERE invoice_id IN (
  SELECT id FROM invoices WHERE invoice_number LIKE 'INV-SENT-%' OR invoice_number LIKE 'INV-POS-DEMO%' OR invoice_number LIKE 'INV-DEMO%' OR invoice_number LIKE 'INV-OVER-%'
);
DELETE FROM invoices WHERE invoice_number LIKE 'INV-SENT-%' OR invoice_number LIKE 'INV-POS-DEMO%' OR invoice_number LIKE 'INV-DEMO%' OR invoice_number LIKE 'INV-OVER-%';
-- outstanding generated column sudah di 001 — tidak alter
