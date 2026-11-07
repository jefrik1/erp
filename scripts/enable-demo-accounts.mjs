import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("UPDATE users SET is_active=true WHERE username = ANY($1)", [
  ['admin', 'kasir', 'finance', 'driver', 'hrd', 'purchasing', 'auditor', 'gudang', 'sales']
]);
const r = await pool.query("SELECT username, is_active FROM users WHERE username = ANY($1)", [
  ['admin', 'kasir', 'finance']
]);
console.log(r.rows);
await pool.end();
