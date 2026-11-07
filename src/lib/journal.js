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
 * lines: [{ code:'1-1200', account_id: 5, debit:0, credit:1000, description:'...' }]
 * Mengembalikan id journal_entries.
 */
export async function postJournal({ date, refType, refId, description, lines, createdBy, client, reversalOf = null, reversalReason = null }){
  const db = client || pool;
  await assertPeriodOpen(date, db);
  const clean = (lines||[]).map(l=>({
    code: l.code ? String(l.code) : null,
    account_id: l.account_id ? parseInt(l.account_id, 10) : null,
    debit: Number(l.debit)||0,
    credit: Number(l.credit)||0,
    description: l.description||description
  })).filter(l=> l.debit>0.0001 || l.credit>0.0001);

  if(!clean.length) throw new Error('Jurnal kosong');
  const totalD = clean.reduce((s,l)=>s+l.debit,0);
  const totalC = clean.reduce((s,l)=>s+l.credit,0);
  if(Math.abs(totalD-totalC) > 0.5) throw new Error(`Jurnal tidak balance (D ${totalD} vs K ${totalC})`);

  // Resolve account_ids from codes if needed
  const codes = [...new Set(clean.filter(l => l.code && !l.account_id).map(l => l.code))];
  const accMap = new Map();
  if(codes.length > 0){
    const acc = await db.query('SELECT id, code FROM accounts WHERE code = ANY($1)', [codes]);
    for(const r of acc.rows) accMap.set(r.code, r.id);
    const missing = codes.filter(c=>!accMap.has(c));
    if(missing.length) throw new Error('Akun COA belum ada: '+missing.join(', '));
  }

  const entryNo = 'JE-'+Date.now()+'-'+String(Math.floor(Math.random()*900+100));
  const je = await db.query(
    `INSERT INTO journal_entries (entry_number, entry_date, reference_type, reference_id, description, total_debit, total_credit, posted, created_by, reversal_of, reversal_reason)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $6, true, $7, $8, $9) RETURNING id`,
    [entryNo, date||null, refType||'MANUAL', refId||null, description||'Jurnal', totalD, createdBy||null, reversalOf, reversalReason]);
  const id = je.rows[0].id;
  for(const l of clean){
    const targetAccountId = l.account_id || accMap.get(l.code);
    if(!targetAccountId) throw new Error(`Akun COA tidak ditemukan untuk baris: ${l.code || l.account_id}`);
    await db.query('INSERT INTO journal_details (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,$4,$5)',
      [id, targetAccountId, l.debit, l.credit, l.description]);
  }
  return id;
}

/** Helper transaksi: BEGIN/COMMIT/ROLLBACK + release, dengan retry untuk deadlock.
 * Mendukung user context untuk SET LOCAL app.current_user_id & current_branch_id.
 */
export async function withTx(fn, user = null){
  const MAX = 3;
  for(let attempt = 1; ; attempt++){
    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      if(user){
        if(user.id != null){
          await client.query(`SET LOCAL app.current_user_id = '${String(user.id).replace(/'/g, "''")}'`);
        }
        if(user.branch_id != null){
          await client.query(`SET LOCAL app.current_branch_id = '${String(user.branch_id).replace(/'/g, "''")}'`);
        }
      }
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    }catch(e){
      try{ await client.query('ROLLBACK'); }catch{ /* koneksi sudah putus */ }
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
