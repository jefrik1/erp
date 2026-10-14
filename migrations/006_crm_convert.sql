-- CRM -> SO converter (toko bangunan)
-- ponytail: lead_items table add when need RAB per lead before SO
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='converted_so_id') THEN
    ALTER TABLE leads ADD COLUMN converted_so_id INT REFERENCES sales_orders(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='converted_at') THEN
    ALTER TABLE leads ADD COLUMN converted_at TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='converted_by') THEN
    ALTER TABLE leads ADD COLUMN converted_by INT REFERENCES users(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(converted_so_id);
CREATE INDEX IF NOT EXISTS idx_leads_status_converted ON leads(status, converted_so_id);
