-- 025: Penjaga integritas stok & buku besar (Phase 1 enterprise upgrade).
-- Semua pernyataan idempoten (aman dijalankan berulang).

-- ── 1. Akun COA standar untuk perpetual inventory ────────────────────────────
INSERT INTO accounts (code, name, type)
SELECT v.code, v.name, v.type
  FROM (VALUES
    ('1-1250','Persediaan Konsinyasi','ASSET'),
    ('1-1410','PPN Masukan','ASSET'),
    ('1-1420','PPh 22 Dibayar Dimuka','ASSET'),
    ('2-1150','Hutang GR/IR (Barang Diterima Belum Ditagih)','LIABILITY'),
    ('2-1210','Hutang PPh 21','LIABILITY'),
    ('3-1100','Modal Saldo Awal','EQUITY'),
    ('5-1200','Selisih Harga Beli (PPV)','EXPENSE'),
    ('5-1300','Susut / Barang Rusak','EXPENSE')
  ) AS v(code,name,type)
 WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.code = v.code);

-- ── 2. Kolom pembalik jurnal (reversal formal, bukan hapus/ubah) ─────────────
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_of INT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversed_by INT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- ── 3. Stok tidak boleh minus (dipasang hanya bila data sudah bersih) ────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stocks WHERE qty_on_hand < 0) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stocks_qty_nonneg') THEN
      ALTER TABLE stocks ADD CONSTRAINT chk_stocks_qty_nonneg CHECK (qty_on_hand >= 0);
    END IF;
  END IF;
END $$;

-- ── 4. Tabel buku besar bersifat append-only ────────────────────────────────
-- Escape hatch untuk skrip perbaikan data: SET LOCAL app.allow_ledger_mutation = 'on';
CREATE OR REPLACE FUNCTION prevent_immutable_table_mutation() RETURNS trigger AS $$
BEGIN
  IF COALESCE(current_setting('app.allow_ledger_mutation', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  -- Satu pengecualian sah: melengkapi referensi kartu stok yang masih kosong
  -- (POS menautkan pergerakan stok ke Sales Order setelah checkout).
  IF TG_TABLE_NAME = 'stock_movements' AND TG_OP = 'UPDATE'
     AND OLD.reference_id IS NULL AND NEW.reference_id IS NOT NULL
     AND NEW.product_id = OLD.product_id AND NEW.warehouse_id = OLD.warehouse_id
     AND NEW.qty_in = OLD.qty_in AND NEW.qty_out = OLD.qty_out
     AND NEW.balance_qty = OLD.balance_qty AND NEW.movement_type = OLD.movement_type THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'IMMUTABLE_RECORD_VIOLATION: % pada tabel % tidak diizinkan (gunakan jurnal pembalik / dokumen koreksi)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['journal_entries','journal_details','audit_logs','data_change_logs','stock_movements'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_immutable_%1$s ON %1$I', t);
    EXECUTE format('CREATE TRIGGER trg_immutable_%1$s BEFORE UPDATE OR DELETE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION prevent_immutable_table_mutation()', t);
  END LOOP;
END $$;

-- ── 5. Indeks bantu rekonsiliasi GL vs stok ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_journal_details_account ON journal_details (account_id, journal_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON stock_movements (product_id, movement_date);
