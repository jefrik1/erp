import { pool } from '../config/db.js';

/**
 * Pastikan akun COA ada (idempotent). Dipakai modul baru (opname, payroll,
 * penyusutan, pajak) supaya jurnal tidak gagal karena akun belum dibuat.
 * @param {{code:string,name:string,type:string}[]} rows
 */
export async function ensureCoa(rows){
  for(const a of rows||[]){
    try{ await pool.query(`INSERT INTO accounts (code,name,type) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`, [a.code,a.name,a.type]); }
    catch(e){ /* index unik belum ada → coba update */ try{ await pool.query('UPDATE accounts SET name=$2, type=$3 WHERE code=$1',[a.code,a.name,a.type]); }catch{} }
  }
}

/**
 * Pastikan periode akuntansi belum ditutup. Dipanggil setiap posting jurnal.
 * Tabel accounting_periods dibuat oleh modul finance/period-routes.js.
 */
export async function assertPeriodOpen(date, db){
  const d = date || new Date(Date.now()+7*3600*1000).toISOString().slice(0,10);
  const period = String(d).slice(0,7);
  try{
    const r = await (db||pool).query(`SELECT status FROM accounting_periods WHERE period=$1`, [period]);
    if(r.rows[0] && String(r.rows[0].status).toUpperCase()==='CLOSED'){
      throw new Error(`Periode ${period} sudah ditutup (tutup buku). Buka kembali periode tersebut untuk posting jurnal baru.`);
    }
  }catch(e){
    // Tabel belum ada (instalasi baru) → anggap periode terbuka.
    if(String(e.message||'').includes('accounting_periods')) return;
    throw e;
  }
}

/**
 * Posting jurnal double-entry.
 * lines: [{ code:'1-1200', debit:0, credit:1000, description:'...' }]
 * Mengembalikan id journal_entries.
 */
export async function postJournal({ date, refType, refId, description, lines, createdBy, client, reversalOf = null, reversalReason = null }){
  const db = client || pool;
  await assertPeriodOpen(date, db);
  const clean = (lines||[]).map(l=>({ code:String(l.code), debit:Number(l.debit)||0, credit:Number(l.credit)||0, description:l.description||description }))
    .filter(l=> l.debit>0.0001 || l.credit>0.0001);
  if(!clean.length) throw new Error('Jurnal kosong');
  const totalD = clean.reduce((s,l)=>s+l.debit,0);
  const totalC = clean.reduce((s,l)=>s+l.credit,0);
  if(Math.abs(totalD-totalC) > 0.5) throw new Error(`Jurnal tidak balance (D ${totalD} vs K ${totalC})`);
  const codes = [...new Set(clean.map(l=>l.code))];
  const acc = await db.query('SELECT id, code FROM accounts WHERE code = ANY($1)', [codes]);
  const map = new Map(acc.rows.map(r=>[r.code, r.id]));
  const missing = codes.filter(c=>!map.has(c));
  if(missing.length) throw new Error('Akun COA belum ada: '+missing.join(', '));
  const entryNo = 'JE-'+Date.now()+'-'+String(Math.floor(Math.random()*900+100));
  const je = await db.query(
    `INSERT INTO journal_entries (entry_number, entry_date, reference_type, reference_id, description, total_debit, total_credit, posted, created_by, reversal_of, reversal_reason)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $6, true, $7, $8, $9) RETURNING id`,
    [entryNo, date||null, refType||'MANUAL', refId||null, description||'Jurnal', totalD, createdBy||null, reversalOf, reversalReason]);
  const id = je.rows[0].id;
  for(const l of clean){
    await db.query('INSERT INTO journal_details (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,$4,$5)',
      [id, map.get(l.code), l.debit, l.credit, l.description]);
  }
  return id;
}

/** Helper transaksi: BEGIN/COMMIT/ROLLBACK + release, dengan retry untuk deadlock. */
export async function withTx(fn){
  const MAX = 3;
  for(let attempt = 1; ; attempt++){
    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    }catch(e){
      try{ await client.query('ROLLBACK'); }catch{ /* koneksi sudah putus */ }
      // 40P01 deadlock_detected / 40001 serialization_failure → ulangi dengan jitter.
      const transient = ['40P01','40001'].includes(e.code);
      if(transient && attempt < MAX){
        const wait = 50 + Math.floor(Math.random() * 150);
        await new Promise(r=> setTimeout(r, wait));
        continue;
      }
      throw e;
    }finally{ client.release(); }
  }
}
