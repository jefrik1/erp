-- 018 (v1): pengumuman internal + kuota cuti per karyawan
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(30) DEFAULT 'UMUM',
  is_active BOOLEAN DEFAULT true,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at DATE
);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_quota INT DEFAULT 12;
