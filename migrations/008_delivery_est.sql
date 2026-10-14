-- Plan B: DO estimasi muatan & biaya zona (pickup prioritas)
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_weight_ton DECIMAL(10,2);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_volume_m3 DECIMAL(10,2);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_zone VARCHAR(50);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost DECIMAL(15,2);
CREATE INDEX IF NOT EXISTS idx_do_est_zone ON delivery_orders(est_zone);
