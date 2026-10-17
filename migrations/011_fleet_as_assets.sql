-- 011: Armada (vehicles) ikut tercatat sebagai Aset Tetap (fixed_assets)
-- Armada milik sendiri (ownership = OWNED) dibuatkan 1 baris aset tetap yang
-- terhubung lewat fixed_assets.vehicle_id, supaya bisa didepresiasi, dijadwalkan
-- maintenance, dan di-disposal seperti aset lain.

ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS vehicle_id INT;

DO $$ BEGIN
  ALTER TABLE fixed_assets
    ADD CONSTRAINT fk_fixed_assets_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- 1 armada = maksimal 1 baris aset
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_assets_vehicle ON fixed_assets(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);

-- Data perolehan pada armada: tanpa harga perolehan, depresiasi selalu 0.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS acquisition_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS acquisition_cost DECIMAL(18,2) DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS residual_value DECIMAL(18,2) DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS useful_life_years INT DEFAULT 8;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS asset_code VARCHAR(20);

-- Backfill: setiap armada OWNED yang belum punya baris aset dibuatkan asetnya.
-- Harga perolehan dibiarkan 0 bila belum diisi (ditandai di UI, bukan ditebak).
INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                          useful_life_years, depreciation_method, accumulated_depreciation,
                          book_value, location, residual_value, photo_url, status, vehicle_id)
SELECT 'AST-ARM-' || LPAD(v.id::text, 3, '0'),
       COALESCE(v.type, 'Armada') || ' - ' || v.plat_no,
       'ARMADA',
       COALESCE(v.acquisition_date, CASE WHEN v.year IS NOT NULL THEN make_date(v.year, 1, 1) ELSE CURRENT_DATE END),
       COALESCE(v.acquisition_cost, 0),
       COALESCE(v.useful_life_years, 8),
       'STRAIGHT', 0,
       COALESCE(v.acquisition_cost, 0),
       'Armada - ' || COALESCE(v.brand, ''),
       COALESCE(v.residual_value, 0),
       v.photo_url,
       CASE WHEN v.status = 'MAINTENANCE' THEN 'MAINTENANCE' ELSE 'ACTIVE' END,
       v.id
FROM vehicles v
WHERE v.ownership = 'OWNED'
  AND NOT EXISTS (SELECT 1 FROM fixed_assets fa WHERE fa.vehicle_id = v.id)
ON CONFLICT (asset_code) DO NOTHING;

UPDATE vehicles v
   SET asset_code = fa.asset_code
  FROM fixed_assets fa
 WHERE fa.vehicle_id = v.id AND (v.asset_code IS NULL OR v.asset_code = '');
