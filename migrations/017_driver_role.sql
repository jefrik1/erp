-- 017: role 'driver' untuk supir (halaman Trip Saya self-service)
INSERT INTO roles (name, description, permissions) VALUES ('driver','Driver / Supir','{"driver": true, "fleet": true}')
ON CONFLICT (name) DO NOTHING;
