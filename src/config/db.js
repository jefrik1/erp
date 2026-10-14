import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://erp:erp_secret@localhost:5432/erp_db',
});
pool.on('error', e=>console.error('pg error',e));
export async function query(text, params){ return pool.query(text, params); }
