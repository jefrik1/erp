-- Add delivery_address column to sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- Add delivery tracking to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING','IN_TRANSIT','DELIVERED','CANCELLED'));
