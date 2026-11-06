import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
// Tanggal & jam disimpan sebagai WIB wall-clock (timestamp/date tanpa zona).
// Jangan biarkan node-postgres mengubahnya jadi Date (akan bergeser -7 jam saat
// di-JSON-kan, mis. 12:49 tampil 05:49). Kembalikan string apa adanya.
pg.types.setTypeParser(1114, v => v ? String(v).replace(' ', 'T').slice(0, 23) : v); // timestamp without time zone
pg.types.setTypeParser(1082, v => v); // date
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://erp:erp_secret@localhost:5432/erp_db',
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || '5000', 10),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10),
});
pool.on('error', e=>console.error('pg error',e));
export async function query(text, params){ return pool.query(text, params); }
