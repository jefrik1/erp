-- 026: Perbaikan fungsi penjaga tabel append-only.
-- Versi 025 mengakses NEW.product_id pada tabel yang tidak punya kolom itu sehingga
-- PostgreSQL melempar "record new has no field product_id" (pesan salah, walau mutasi
-- tetap ditolak). Versi ini memakai to_jsonb() sehingga aman untuk semua tabel.
CREATE OR REPLACE FUNCTION prevent_immutable_table_mutation() RETURNS trigger AS $$
DECLARE
  o JSONB;
  n JSONB;
BEGIN
  IF COALESCE(current_setting('app.allow_ledger_mutation', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD_VIOLATION: DELETE pada tabel % tidak diizinkan (gunakan jurnal pembalik / dokumen koreksi)', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  o := to_jsonb(OLD);
  n := to_jsonb(NEW);

  -- Pengecualian sah: melengkapi reference_id kartu stok yang masih kosong
  -- (POS menautkan pergerakan stok ke Sales Order setelah checkout).
  IF TG_TABLE_NAME = 'stock_movements'
     AND (o->>'reference_id') IS NULL
     AND (n->>'reference_id') IS NOT NULL
     AND (n->>'product_id') = (o->>'product_id')
     AND (n->>'warehouse_id') = (o->>'warehouse_id')
     AND (n->>'qty_in') = (o->>'qty_in')
     AND (n->>'qty_out') = (o->>'qty_out')
     AND (n->>'balance_qty') = (o->>'balance_qty')
     AND (n->>'movement_type') = (o->>'movement_type') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'IMMUTABLE_RECORD_VIOLATION: UPDATE pada tabel % tidak diizinkan (gunakan jurnal pembalik / dokumen koreksi)', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
