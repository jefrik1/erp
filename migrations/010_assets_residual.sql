-- 010_assets_residual.sql — kolom tambahan aset tetap untuk depresiasi & kartu aset
-- ponytail: idempotent. Nilai buku/akumulasi dihitung runtime oleh API, kolom hanya menyimpan input.

ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS residual_value DECIMAL(15,2) DEFAULT 0;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS disposal_date DATE;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS disposal_price DECIMAL(15,2);
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- status default supaya filter status di UI selalu punya nilai
UPDATE fixed_assets SET status = 'ACTIVE' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_code ON fixed_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_budgets_lookup ON budgets(fiscal_year, branch_id, account_id, period_month);
