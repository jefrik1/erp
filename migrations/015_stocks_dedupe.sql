-- 015: rapikan baris stok ganda + cegah terulang.
--
-- Akar masalah kebingungan "1 produk muncul 87 kali":
--   stocks punya unique index (product_id, warehouse_id, batch_no), TAPI di Postgres
--   NULL dianggap berbeda satu sama lain. Karena semua baris punya batch_no NULL,
--   "ON CONFLICT (product_id, warehouse_id, batch_no) DO UPDATE" TIDAK PERNAH kena
--   konflik -> setiap penerimaan/transfer/POS membuat baris BARU untuk produk yang sama.
--   Akibatnya 1.325 baris stok hanya untuk 22 produk.
--
-- Perbaikan:
--   1) baris batch NULL untuk (produk, gudang) yang sama digabung jadi satu baris;
--      qty dijumlah, harga rata-rata dihitung tertimbang dari nilai total.
--   2) dibuat index unik parsial supaya NULL diperlakukan sebagai satu nilai,
--      sehingga kebocoran baris tidak terulang (index penuh tetap ada untuk batch nyata).

-- 1) gabungkan: simpan ke baris id terkecil
WITH agg AS (
  SELECT product_id, warehouse_id, MIN(id) AS keep_id,
         SUM(qty_on_hand) AS qty,
         SUM(COALESCE(qty_reserved,0)) AS reserved,
         CASE WHEN SUM(qty_on_hand) <> 0
              THEN SUM(qty_on_hand * COALESCE(avg_cost,0)) / SUM(qty_on_hand)
              ELSE COALESCE(AVG(avg_cost),0) END AS avgc,
         MAX(last_updated) AS last_upd
    FROM stocks
   WHERE batch_no IS NULL
   GROUP BY product_id, warehouse_id
  HAVING COUNT(*) > 1
)
UPDATE stocks s
   SET qty_on_hand = agg.qty,
       qty_reserved = agg.reserved,
       avg_cost = agg.avgc,
       last_updated = COALESCE(agg.last_upd, NOW())
  FROM agg
 WHERE s.id = agg.keep_id;

-- 2) hapus baris sisanya
WITH agg AS (
  SELECT product_id, warehouse_id, MIN(id) AS keep_id
    FROM stocks
   WHERE batch_no IS NULL
   GROUP BY product_id, warehouse_id
  HAVING COUNT(*) > 1
)
DELETE FROM stocks s
 USING agg
 WHERE s.product_id = agg.product_id
   AND s.warehouse_id = agg.warehouse_id
   AND s.batch_no IS NULL
   AND s.id <> agg.keep_id;

-- 3) kunci: batch NULL = satu nilai per (produk, gudang)
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_stocks_no_batch ON stocks(product_id, warehouse_id) WHERE batch_no IS NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'index unik stok tanpa batch dilewati: %', SQLERRM;
END $$;
