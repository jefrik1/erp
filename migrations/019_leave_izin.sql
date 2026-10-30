-- 019: modul izin karyawan (izin / sakit) + jejak keputusan approval
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS decision_note TEXT;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_leaves_status_type ON leaves (status, type);
CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves (employee_id, start_date DESC);
