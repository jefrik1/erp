#!/usr/bin/env node
/**
 * INF-1 — Nonaktifkan akun demo/seed.
 *   node scripts/disable-demo-accounts.mjs                  # dry-run
 *   node scripts/disable-demo-accounts.mjs --apply --approved-by="<nama direktur>"
 *
 * Pengaman: menolak berjalan bila tidak ada akun aktif lain dengan role super_admin/direktur
 * yang punya MFA aktif (mencegah terkunci di luar sistem).
 */
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = process.argv.includes('--apply');
const APPROVED = (process.argv.find((a) => a.startsWith('--approved-by=')) || '').split('=')[1];
const DEMO = ['admin', 'kasir', 'driver', 'hrd', 'purchasing', 'auditor', 'gudang', 'sales'];

const q = async (sql, p) => (await pool.query(sql, p)).rows;
try {
  const targets = await q(`SELECT u.id, u.username, u.name, u.is_active
      FROM users u WHERE lower(u.username) = ANY($1) AND u.is_active ORDER BY u.username`, [DEMO]);
  const guardians = await q(`SELECT COUNT(DISTINCT u.id)::int n FROM users u
      JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active AND r.name IN ('super_admin','direktur')
       AND lower(u.username) <> ALL($1)
       AND (u.mfa_enabled IS TRUE OR COALESCE(u.totp_enabled,false) IS TRUE)`, [DEMO]).catch(() => [{ n: 0 }]);

  console.log(`Akun demo aktif: ${targets.length}`);
  for (const t of targets) console.log(`  - ${t.username} (${t.name})`);
  console.log(`Pengaman (direktur/super_admin aktif + MFA, bukan demo): ${guardians[0].n}`);
  if (!targets.length) { console.log('Tidak ada yang perlu dilakukan.'); await pool.end(); process.exit(0); }
  if (guardians[0].n < 1) {
    console.error('DITOLAK: tidak ada akun direktur/super_admin aktif dengan MFA. Aktifkan MFA pada akun asli lebih dulu.');
    await pool.end(); process.exit(2);
  }
  if (!APPLY) { console.log('\nDRY-RUN. Tambahkan --apply --approved-by="<nama>" untuk menonaktifkan.'); await pool.end(); process.exit(0); }
  if (!APPROVED || APPROVED.length < 3) { console.error('DITOLAK: --approved-by wajib (nama penyetuju).'); await pool.end(); process.exit(2); }
  const r = await pool.query(`UPDATE users SET is_active=false WHERE id = ANY($1) RETURNING id`, [targets.map((t) => t.id)]);
  await pool.query(`INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
     VALUES (NULL,'DISABLE_DEMO_ACCOUNTS','users',NULL,$1, now())`,
    [JSON.stringify({ disabled: targets.map((t) => t.username), approved_by: APPROVED })])
    .catch(() => {});
  console.log(`Selesai: ${r.rowCount} akun demo dinonaktifkan (approved_by: ${APPROVED}).`);
} catch (e) {
  console.error('gagal:', e.message);
  process.exitCode = 1;
} finally { await pool.end().catch(() => {}); }
