-- Dedup leads seed yang terduplikasi tiap restart (bug 001_init ON CONFLICT DO NOTHING tanpa unique)
-- Keep 1 per phone+status untuk seed, keep semua WON converted, hapus sisanya
DELETE FROM leads WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY phone, status ORDER BY id) AS rn
    FROM leads
    WHERE converted_so_id IS NULL
      AND phone IN ('0816000001','0816000002','0816000003')
  ) s WHERE rn > 1
);
-- safety: jika masih ada >500 karena migrasi keulang, hapus audit duplikat 001/002 (keep 1 per file)
DELETE FROM audit_logs WHERE id NOT IN (
  SELECT MIN(id) FROM audit_logs WHERE entity_type='MIGRATION' GROUP BY new_value::text
) AND entity_type='MIGRATION';
