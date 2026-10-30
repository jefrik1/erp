-- 021: akun karyawan + RBAC berbasis jabatan
-- Role self-service minimal supaya jabatan tak dikenal tidak mendapat akses admin.
INSERT INTO roles (name, description)
VALUES ('employee', 'Karyawan - self-service: absen, cuti/izin, profil')
ON CONFLICT (name) DO NOTHING;

-- Satu akun per karyawan (dijaga agar tidak dobel saat provisioning/ulang).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_employee_id_uniq') THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE employee_id IS NOT NULL GROUP BY employee_id HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX users_employee_id_uniq ON users (employee_id) WHERE employee_id IS NOT NULL;
    END IF;
  END IF;
END $$;
