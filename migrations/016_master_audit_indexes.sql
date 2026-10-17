-- 016: rapikan data master + index untuk halaman Audit & GRC.
--
-- 1) customers.type bercampur huruf besar/kecil ('retail' vs 'RETAIL', 'contractor'
--    vs 'CONTRACTOR'), sehingga filter tipe di UI tidak pernah konsisten.
-- 2) audit_logs & data_change_logs akan sering difilter per tanggal/pengguna/jenis
--    di halaman Audit & GRC — index diperlukan sebelum datanya membesar.

UPDATE customers SET type = UPPER(TRIM(type)) WHERE type IS NOT NULL AND type <> UPPER(TRIM(type));
UPDATE customers SET type = 'RETAIL' WHERE type IS NULL OR TRIM(type) = '';

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_dcl_changed_at ON data_change_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dcl_table ON data_change_logs(table_name);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendances(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendances(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_payrolls_period ON payrolls(period DESC);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
