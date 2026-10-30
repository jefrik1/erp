-- 022: HPP ikut tercatat pada detail transfer stok.
-- Tanpa kolom ini, gudang penerima bisa menerima stok dengan avg_cost = 0
-- (bug POST /inventory/transfers lama) sehingga laporan margin tampak ~100%.
ALTER TABLE stock_transfer_details ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,2) DEFAULT 0;

-- Baris transfer lama: isi HPP dari baris stok gudang asal bila masih 0/kosong.
UPDATE stock_transfer_details d
   SET unit_cost = COALESCE((
        SELECT NULLIF(s.avg_cost,0) FROM stocks s
         WHERE s.product_id = d.product_id
           AND s.warehouse_id = (SELECT t.from_warehouse_id FROM stock_transfers t WHERE t.id = d.transfer_id)
         ORDER BY s.id LIMIT 1), 0)
 WHERE COALESCE(d.unit_cost,0) = 0;
