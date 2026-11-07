import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
import { rbac } from '../../middleware/auth.js';
import { postJournal, withTx, assertPeriodOpen } from '../../lib/journal.js';
const router = express.Router();

router.get('/ping', (req,res)=>res.json({ok:true, routes:['/ar','/ap','/cash'], note:'AR POS/DO/SO only'}));
router.post('/journals', rbac('finance', 'direktur', 'super_admin'), async (req, res) => {
  const { entry_date, description, details } = req.body || {};
  if (!Array.isArray(details) || !details.length) {
    return res.status(400).json({ error: 'Detail baris jurnal wajib diisi' });
  }

  try {
    const result = await withTx(async (client) => {
      const lines = [];
      for (const d of details) {
        let code = d.code;
        let accountId = d.account_id ? parseInt(d.account_id, 10) : null;
        if (!code && !accountId) {
          throw new Error('Setiap baris jurnal harus memiliki account_id atau code');
        }
        lines.push({
          code,
          account_id: accountId,
          debit: parseFloat(d.debit || 0) || 0,
          credit: parseFloat(d.credit || 0) || 0,
          description: d.description || description || 'Jurnal Umum'
        });
      }

      const id = await postJournal({
        date: entry_date || new Date().toISOString().slice(0, 10),
        refType: 'MANUAL',
        refId: null,
        description: description || 'Jurnal Umum Manual',
        lines,
        createdBy: req.user.id,
        client
      });

      const je = await client.query('SELECT entry_number FROM journal_entries WHERE id=$1', [id]);
      return { id, entry_number: je.rows[0]?.entry_number };
    }, req.user);

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /finance/journals/:id/reverse — pembalik jurnal resmi (append-only, bukan hapus/ubah).
// Membuat jurnal lawan dengan nomor REV-JRN-… lalu menandai jurnal asal sebagai reversed.
router.post('/journals/:id/reverse', async (req,res)=>{
  const { reason } = req.body || {};
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const je = await client.query('SELECT * FROM journal_entries WHERE id=$1', [req.params.id]);
    if(!je.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({error:'Jurnal tidak ditemukan'}); }
    if(je.rows[0].reversed_by) { await client.query('ROLLBACK'); return res.status(400).json({error:'Jurnal sudah dibalik (#'+je.rows[0].reversed_by+')'}); }
    if(je.rows[0].reversal_of) { await client.query('ROLLBACK'); return res.status(400).json({error:'Jurnal ini sendiri adalah jurnal pembalik — tidak bisa dibalik lagi'}); }
    const det = await client.query(`SELECT jd.account_id, jd.debit, jd.credit, jd.description, a.code
        FROM journal_details jd JOIN accounts a ON a.id=jd.account_id WHERE jd.journal_id=$1`, [req.params.id]);
    if(!det.rows.length){ await client.query('ROLLBACK'); return res.status(400).json({error:'Jurnal tidak punya baris detail'}); }
    const lines = det.rows.map(d=>({ code:d.code, debit:Number(d.credit), credit:Number(d.debit),
      description:'Pembalik: '+(d.description||je.rows[0].description) }));
    const { postJournal } = await import('../../lib/journal.js');
    const revId = await postJournal({
      refType: 'REVERSAL', refId: Number(req.params.id),
      description: 'Pembalik ' + je.rows[0].entry_number + (reason ? ' — ' + reason : ''),
      lines, createdBy: req.user.id, client,
    });
    // Tandai relasi dua arah (diizinkan lewat escape hatch kolom metadata, bukan angka jurnal)
    await client.query("SET LOCAL app.allow_ledger_mutation='on'");
    await client.query('UPDATE journal_entries SET reversed_by=$1, reversal_reason=$2 WHERE id=$3', [revId, reason||null, req.params.id]);
    await client.query('UPDATE journal_entries SET reversal_of=$1 WHERE id=$2', [Number(req.params.id), revId]);
    await client.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'REVERSE', 'JOURNAL', Number(req.params.id), JSON.stringify({ reversal_id: revId, reason: reason||null })]);
    await client.query('COMMIT');
    res.json({ ok:true, reversal_id: revId, original_id: Number(req.params.id) });
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    res.status(400).json({ error: e.message });
  }finally{ client.release(); }
});

// AR POS/DO/SO only - ponytail: jangan buat dummy di finance, baca invoices langsung
router.get('/ar', async (req,res)=>{
  try{
    // Schema ensured via migrations
    const r=await pool.query(`
      SELECT inv.id, inv.invoice_number, inv.status, inv.total, inv.paid_amount, inv.discount, inv.discount_pct, inv.voucher_code, inv.due_date, inv.invoice_date, inv.customer_id, inv.so_id, inv.do_id,
             c.name as customer_name, c.code as customer_code, so.so_number,
             (COALESCE(inv.total,0) - COALESCE(inv.paid_amount,0)) as outstanding,
             (CURRENT_DATE - COALESCE(inv.due_date, CURRENT_DATE))::int as overdue_days,
             CASE WHEN inv.invoice_number LIKE 'INV-POS-%' THEN true ELSE false END as is_pos
      FROM invoices inv
      LEFT JOIN customers c ON c.id=inv.customer_id
      LEFT JOIN sales_orders so ON so.id=inv.so_id
      ORDER BY inv.id DESC
      LIMIT 200`);
    // filter JS: sisa >0.5 dan belum lunas. TRIM+UPPER biar 'sent ' atau 'SENT' tetap masuk
    const mapped = r.rows.map(x=>{
      const rawStatus=String(x.status??'').trim();
      const norm=rawStatus.toUpperCase();
      const outstanding=parseFloat(x.outstanding ?? (parseFloat(x.total||0)-parseFloat(x.paid_amount||0)));
      return {...x, _norm:norm, _raw:rawStatus, outstanding: isNaN(outstanding)?0:outstanding, overdue_days: x.overdue_days ?? 0 };
    }).filter(x=>{
      if(!(x.outstanding > 0.5)) return false;
      if(['PAID','CANCELLED','VOID','LUNAS','COMPLETED'].includes(x._norm)) return false;
      // allow SENT/PARTIAL/OVERDUE/DRAFT/APPROVED dll - selama belum lunas tampil
      return true;
    });
    if(mapped.length===0 && r.rows.length>0){
    }
    // strip helper fields before send but keep is_pos/outstanding
    res.json(mapped.map(({_norm,_raw,...rest})=>rest));
  }catch(e){
    console.error('ar ERR',e.message, e.stack?.slice(0,500));
    try{
      const r2=await pool.query(`SELECT inv.*, c.name as customer_name, c.code as customer_code FROM invoices inv LEFT JOIN customers c ON c.id=inv.customer_id ORDER BY inv.id DESC LIMIT 100`);
      res.json(r2.rows.map(x=>({...x, outstanding: parseFloat(x.total||0)-parseFloat(x.paid_amount||0), overdue_days:0, is_pos: String(x.invoice_number).startsWith('INV-POS-')})).filter(x=>x.outstanding>0.5));
    }catch{ res.json([]); }
  }
});
router.get('/ap', async (req,res)=>{
  try{
  // purchase_invoices ensured via migrations
  const r=await pool.query(`SELECT 'PURCHASE' as source, pi.id, pi.inv_number as doc_number, pi.po_id, po.po_number, s.name as supplier_name, pi.total, pi.status, pi.invoice_date as doc_date, pi.due_date FROM purchase_invoices pi JOIN purchase_orders po ON po.id=pi.po_id JOIN suppliers s ON s.id=pi.supplier_id WHERE pi.status IN ('MATCHED','HOLD','APPROVED') UNION ALL SELECT 'PO' as source, po.id, po.po_number as doc_number, po.id as po_id, po.po_number, s.name as supplier_name, po.total, po.status, po.po_date as doc_date, po.expected_date as due_date FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.status IN ('RECEIVED','PARTIAL') AND NOT EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.po_id=po.id) ORDER BY doc_date DESC`);
  res.json(r.rows);
  }catch(e){ console.error('ap',e.message); res.json([]); }
});
router.post('/ap/pay', async (req,res)=>{
  const {purchase_invoice_id, po_id, amount, bank_account_id, method, notes} = req.body;
  const pid = purchase_invoice_id || po_id;
  if(!pid) return res.status(400).json({error:'purchase_invoice_id / po_id wajib'});
  let inv=null, piId=null, total=0;
  if(purchase_invoice_id){
    const q=await pool.query('SELECT * FROM purchase_invoices WHERE id=$1',[purchase_invoice_id]);
    if(!q.rows[0]) return res.status(404).json({error:'Invoice not found'});
    if(q.rows[0].status==='HOLD') return res.status(400).json({error:'Invoice HOLD - tidak bisa dibayar, selesaikan 3-way dulu'});
    inv=q.rows[0]; piId=inv.id; total=parseFloat(inv.total);
  } else {
    const q=await pool.query('SELECT * FROM purchase_orders WHERE id=$1',[po_id]);
    if(!q.rows[0]) return res.status(404).json({error:'PO not found'});
    total=parseFloat(q.rows[0].total);
  }
  const payAmt = parseFloat(amount)||total;
  if(payAmt<=0) return res.status(400).json({error:'amount >0'});
  const payNo='PAY-'+Date.now();
  const bank = bank_account_id ? await pool.query('SELECT * FROM bank_accounts WHERE id=$1',[bank_account_id]) : null;
  const bankId = bank?.rows?.[0]?.id || (await pool.query('SELECT id FROM bank_accounts LIMIT 1')).rows[0]?.id;
  await pool.query("INSERT INTO payments (payment_number, type, invoice_id, purchase_invoice_id, payment_date, method, bank_account_id, amount, notes, created_by) VALUES ($1,'AP',$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8)",[payNo, null, piId, method||'TRANSFER', bankId, payAmt, notes||null, req.user.id]);
  if(bankId) await pool.query('UPDATE bank_accounts SET balance = balance - $1 WHERE id=$2',[payAmt, bankId]);
  try{
    const hutang = (await pool.query("SELECT id FROM accounts WHERE code='2-1000'")).rows[0]?.id;
    const kas = (await pool.query("SELECT id FROM accounts WHERE code='1-1000'")).rows[0]?.id;
    if(hutang && kas){
      const jeNo='JE-'+Date.now();
      const je=await pool.query('INSERT INTO journal_entries (entry_number, entry_date, description, total_debit, total_credit, posted, created_by) VALUES ($1,CURRENT_DATE,$2,$3,$3,true,$4) RETURNING id',[jeNo, 'Bayar '+ (inv? inv.inv_number : 'PO-'+po_id), payAmt, req.user.id]);
      await pool.query('INSERT INTO journal_details (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$4),($1,$5,0,$3,$4)',[je.rows[0].id, hutang, payAmt, 'Bayar hutang', kas]);
    }
  }catch(e){ console.error('journal pay',e.message)}
  if(piId) await pool.query("UPDATE purchase_invoices SET status='PAID' WHERE id=$1",[piId]);
  else if(po_id) await pool.query("UPDATE purchase_orders SET status='PAID' WHERE id=$1",[po_id]);
  res.json({ok:true, payment_number: payNo, amount: payAmt});
});
router.get('/cash', async (req,res)=>{ try{
  await ensureCashAccount();
  await pool.query(`DELETE FROM bank_accounts WHERE id NOT IN (SELECT MAX(id) FROM bank_accounts GROUP BY bank_name, account_no)`);
  try{ await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_acc ON bank_accounts(bank_name, account_no)`); }catch{}
  const r=await pool.query(`SELECT id, bank_name, account_no, account_name, balance, COALESCE(kind,'BANK') AS kind FROM bank_accounts ORDER BY (COALESCE(kind,'BANK')='CASH') DESC, bank_name`);
  res.json(r.rows);
}catch(e){ console.error('cash',e.message); res.json([]); } });

// ── Kas Tunai ───────────────────────────────────────────────────────────────
// Semua uang fisik dari tutup shift masuk ke akun CASH dulu, baru disetor ke bank.
let cashEnsured=false;
async function ensureCashAccount(){
  if(cashEnsured) return;
  try{
            // Sub-akun COA untuk kas tunai & bank (dipakai jurnal setor kas).
    await pool.query(`INSERT INTO accounts (code,name,type) VALUES ('1-1010','Kas Tunai','ASSET') ON CONFLICT (code) DO NOTHING`).catch(()=>{});
    await pool.query(`INSERT INTO accounts (code,name,type) VALUES ('1-1020','Bank','ASSET') ON CONFLICT (code) DO NOTHING`).catch(()=>{});
    const has=await pool.query(`SELECT id FROM bank_accounts WHERE COALESCE(kind,'BANK')='CASH' LIMIT 1`);
    if(!has.rows[0]){
      await pool.query(`INSERT INTO bank_accounts (bank_name, account_no, account_name, balance, kind) VALUES ('Kas Tunai','KAS-001','Kas Kasir / Tunai',0,'CASH')`).catch(()=>{});
    }
    cashEnsured=true;
  }catch(e){ console.error('[ensure cash]', e.message); }
}

async function cashAccount(){
  await ensureCashAccount();
  const r=await pool.query(`SELECT * FROM bank_accounts WHERE COALESCE(kind,'BANK')='CASH' ORDER BY id LIMIT 1`);
  return r.rows[0] || null;
}
async function coaId(code){
  const r=await pool.query('SELECT id FROM accounts WHERE code=$1',[code]);
  return r.rows[0]?.id || null;
}
/** Catat uang masuk ke Kas Tunai + jurnal Dr Kas Tunai / Cr Penjualan. */
export async function creditCash({ amount, source, referenceType, referenceId, notes, createdBy, withJournal = true }){
  const amt = parseFloat(amount)||0;
  if(amt<=0) return null;
  await ensureCashAccount();
  const acc = await cashAccount();
  if(!acc) return null;
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const up = await client.query('UPDATE bank_accounts SET balance = COALESCE(balance,0) + $1 WHERE id=$2 RETURNING balance',[amt, acc.id]);
    await client.query(`INSERT INTO cash_movements (account_id, direction, amount, source, reference_type, reference_id, notes, created_by)
      VALUES ($1,'IN',$2,$3,$4,$5,$6,$7)`,[acc.id, amt, source||'MANUAL', referenceType||null, referenceId||null, notes||null, createdBy||null]);
    const kas = await coaId('1-1010');
    const jual = await coaId('4-1000');
    // withJournal=false dipakai tutup shift POS: pendapatan sudah diakui saat checkout,
    // jadi kas masuk shift hanya memperbarui saldo & mutasi kas (tanpa jurnal kedua).
    if(withJournal && kas && jual){
      const je = await client.query(`INSERT INTO journal_entries (entry_number, entry_date, reference_type, reference_id, description, total_debit, total_credit, posted, created_by)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $5, true, $6) RETURNING id`,
        ['JE-'+Date.now(), referenceType||'CASH_IN', referenceId||null, notes||('Kas masuk '+(source||'')), amt, createdBy||null]);
      await client.query('INSERT INTO journal_details (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$5),($1,$4,0,$3,$5)',
        [je.rows[0].id, kas, amt, jual, notes||'Kas masuk']);
    }
    await client.query('COMMIT');
    return { account_id: acc.id, balance: parseFloat(up.rows[0].balance) };
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[creditCash]', e.message); return null; }
  finally{ client.release(); }
}

// Riwayat mutasi kas tunai
router.get('/cash/movements', async (req,res)=>{
  await ensureCashAccount();
  try{
    const acc=await cashAccount();
    if(!acc) return res.json({ data:[], account:null });
    const limit=Math.min(parseInt(req.query.limit||'30')||30, 100);
    const r=await pool.query(`SELECT cm.*, u.username FROM cash_movements cm LEFT JOIN users u ON u.id=cm.created_by
      WHERE cm.account_id=$1 ORDER BY cm.id DESC LIMIT $2`,[acc.id, limit]);
    res.json({ account: acc, data: r.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Setor kas tunai ke bank: saldo kas berkurang, saldo bank bertambah + jurnal Dr Bank / Cr Kas Tunai
router.post('/cash/deposit', rbac('finance','direktur','super_admin'), async (req,res)=>{
  await ensureCashAccount();
  const amount=parseFloat(req.body?.amount)||0;
  const bankId=parseInt(req.body?.bank_account_id);
  const notes=req.body?.notes||null;
  if(amount<=0) return res.status(400).json({error:'Nominal setor harus lebih dari 0'});
  if(!bankId) return res.status(400).json({error:'Pilih rekening bank tujuan'});
  const acc=await cashAccount();
  if(!acc) return res.status(400).json({error:'Akun Kas Tunai belum ada'});
  const bank=await pool.query(`SELECT * FROM bank_accounts WHERE id=$1 AND COALESCE(kind,'BANK')<>'CASH'`,[bankId]);
  if(!bank.rows[0]) return res.status(404).json({error:'Rekening bank tujuan tidak ditemukan'});
  const saldo=parseFloat(acc.balance||0);
  if(amount > saldo + 0.5) return res.status(400).json({error:`Saldo Kas Tunai tidak cukup (Rp ${new Intl.NumberFormat('id-ID').format(saldo)})`});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('UPDATE bank_accounts SET balance = COALESCE(balance,0) - $1 WHERE id=$2',[amount, acc.id]);
    await client.query('UPDATE bank_accounts SET balance = COALESCE(balance,0) + $1 WHERE id=$2',[amount, bankId]);
    await client.query(`INSERT INTO cash_movements (account_id, direction, amount, source, reference_type, reference_id, notes, created_by)
      VALUES ($1,'OUT',$2,'DEPOSIT_TO_BANK','BANK_ACCOUNT',$3,$4,$5)`,[acc.id, amount, bankId, notes||('Setor ke '+bank.rows[0].bank_name), req.user.id]);
    const kas=await coaId('1-1010'); const bankCoa=await coaId('1-1020');
    if(kas && bankCoa){
      const je=await client.query(`INSERT INTO journal_entries (entry_number, entry_date, reference_type, reference_id, description, total_debit, total_credit, posted, created_by)
        VALUES ($1, CURRENT_DATE, 'CASH_DEPOSIT', $2, $3, $4, $4, true, $5) RETURNING id`,
        ['JE-'+Date.now(), bankId, 'Setor kas ke '+bank.rows[0].bank_name, amount, req.user.id]);
      await client.query('INSERT INTO journal_details (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,0,$4),($1,$5,0,$3,$4)',
        [je.rows[0].id, bankCoa, amount, 'Setor kas ke bank', kas]);
    }
    await client.query('COMMIT');
    const after=await pool.query('SELECT balance FROM bank_accounts WHERE id=$1',[acc.id]);
    res.json({ ok:true, amount, cash_balance: parseFloat(after.rows[0].balance), bank: bank.rows[0].bank_name });
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[cash deposit]',e); res.status(500).json({error:e.message}); }
  finally{ client.release(); }
});
router.get('/trial-balance', async (req,res)=>{
  try{ const r=await pool.query("SELECT a.code, a.name, a.type, COALESCE(SUM(jd.debit),0) as debit, COALESCE(SUM(jd.credit),0) as credit FROM accounts a LEFT JOIN journal_details jd ON jd.account_id=a.id LEFT JOIN journal_entries je ON je.id=jd.journal_id WHERE je.posted=true OR je.posted IS NULL GROUP BY a.code, a.name, a.type ORDER BY a.code"); res.json(r.rows.map(x=>({...x, debit:parseFloat(x.debit), credit:parseFloat(x.credit)}))); }catch(e){ console.error('tb',e.message); res.json([]); }
});
router.get('/profit-loss', async (req,res)=>{
  // ESTIMASI: HPP = qty x avg_cost stok saat ini; opex diambil dari jurnal akun EXPENSE (real).
  try{
    const rev=await pool.query("SELECT COALESCE(SUM(total),0) as val FROM invoices WHERE status != 'CANCELLED'");
    const cogs=await pool.query(`SELECT COALESCE(SUM(d.qty * COALESCE(c.avg_cost,0)),0) as val
      FROM invoices i JOIN so_details d ON d.so_id=i.so_id
      LEFT JOIN LATERAL (SELECT SUM(s.qty_on_hand*s.avg_cost)/NULLIF(SUM(s.qty_on_hand),0) as avg_cost FROM stocks s WHERE s.product_id=d.product_id) c ON true
      WHERE i.status != 'CANCELLED'`);
    const opex=await pool.query("SELECT COALESCE(SUM(jd.debit)-SUM(jd.credit),0) as val FROM journal_details jd JOIN accounts a ON a.id=jd.account_id WHERE a.type='EXPENSE'");
    const revVal=parseFloat(rev.rows[0].val), cogsVal=parseFloat(cogs.rows[0].val), opexVal=parseFloat(opex.rows[0].val);
    res.json({ revenue: revVal, cogs: cogsVal, gross_profit: revVal-cogsVal, opex: opexVal, net_profit: revVal-cogsVal-opexVal, estimated:true });
  }catch(e){ console.error('pl',e.message); res.json({revenue:0,cogs:0,gross_profit:0,opex:0,net_profit:0,estimated:true}); }
});

// ------------------------------------------------------------- EXPORT

// ------------------------------------------------------------- PSAK FINANCIAL STATEMENTS

// GET /api/finance/balance-sheet (Neraca Keuangan PSAK 1)
router.get('/balance-sheet', async (req, res) => {
  const asOf = req.query.as_of_date || new Date().toISOString().slice(0, 10);
  try {
    // 1. Ambil semua akun dan saldo kumulatif per tanggal asOf
    const q = await pool.query(`
      SELECT a.id, a.code, a.name, a.type,
             COALESCE(SUM(jd.debit), 0) as debit,
             COALESCE(SUM(jd.credit), 0) as credit
        FROM accounts a
        LEFT JOIN journal_details jd ON jd.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jd.journal_id AND je.entry_date <= $1 AND je.posted = true
       GROUP BY a.id, a.code, a.name, a.type
       ORDER BY a.code
    `, [asOf]);

    const accounts = q.rows.map(r => {
      const d = parseFloat(r.debit || 0);
      const c = parseFloat(r.credit || 0);
      let balance = 0;
      if (r.type === 'ASSET' || r.type === 'EXPENSE') balance = d - c;
      else balance = c - d;
      return { ...r, debit: d, credit: c, balance };
    });

    // 2. Klasifikasi Aset Lancar & Tidak Lancar
    const currentAssets = accounts.filter(a => a.type === 'ASSET' && a.code < '1-2000' && a.code !== '1-3000');
    const nonCurrentAssets = accounts.filter(a => a.type === 'ASSET' && (a.code >= '1-2000' || a.code === '1-3000'));
    const totalCurrentAssets = currentAssets.reduce((s, a) => s + a.balance, 0);
    const totalNonCurrentAssets = nonCurrentAssets.reduce((s, a) => s + a.balance, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    // 3. Klasifikasi Liabilitas Jangka Pendek & Panjang
    const currentLiabilities = accounts.filter(a => a.type === 'LIABILITY' && a.code < '2-2000');
    const longTermLiabilities = accounts.filter(a => a.type === 'LIABILITY' && a.code >= '2-2000');
    const totalCurrentLiabilities = currentLiabilities.reduce((s, a) => s + a.balance, 0);
    const totalLongTermLiabilities = longTermLiabilities.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

    // 4. Ekuitas & Laba Tahun Berjalan
    const equityAccounts = accounts.filter(a => a.type === 'EQUITY');
    const totalBookEquity = equityAccounts.reduce((s, a) => s + a.balance, 0);

    // Hitung Laba/Rugi Berjalan = Total Revenue - Total Expense
    const totalRevenue = accounts.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0);
    const totalExpense = accounts.filter(a => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0);
    const netIncomeCurrentPeriod = totalRevenue - totalExpense;

    const totalEquity = totalBookEquity + netIncomeCurrentPeriod;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const diff = Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;

    res.json({
      as_of_date: asOf,
      assets: {
        current: currentAssets,
        total_current: totalCurrentAssets,
        non_current: nonCurrentAssets,
        total_non_current: totalNonCurrentAssets,
        total: totalAssets
      },
      liabilities: {
        current: currentLiabilities,
        total_current: totalCurrentLiabilities,
        long_term: longTermLiabilities,
        total_long_term: totalLongTermLiabilities,
        total: totalLiabilities
      },
      equity: {
        accounts: equityAccounts,
        total_equity_accounts: totalBookEquity,
        current_period_net_income: netIncomeCurrentPeriod,
        total: totalEquity
      },
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      balanced: Math.abs(diff) < 1,
      difference: diff
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/finance/cash-flow (Laporan Arus Kas PSAK 2)
router.get('/cash-flow', async (req, res) => {
  const from = req.query.from_date || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = req.query.to_date || new Date().toISOString().slice(0, 10);
  try {
    // Kas masuk dari pelanggan (AR payments)
    const arIn = await pool.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric as val
        FROM payments
       WHERE type='AR' AND payment_date BETWEEN $1 AND $2
    `, [from, to]);

    // Kas keluar ke pemasok (AP payments)
    const apOut = await pool.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric as val
        FROM payments
       WHERE type='AP' AND payment_date BETWEEN $1 AND $2
    `, [from, to]);

    // Beban operasional kas (cash movements direct)
    const opexOut = await pool.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric as val
        FROM cash_movements
       WHERE direction='OUT' AND source NOT IN ('DEPOSIT_TO_BANK', 'BANK_TRANSFER')
         AND created_at::date BETWEEN $1 AND $2
    `, [from, to]);

    const cashFromCustomers = parseFloat(arIn.rows[0].val);
    const cashToSuppliers = parseFloat(apOut.rows[0].val);
    const cashForOpex = parseFloat(opexOut.rows[0].val);
    const netOperating = cashFromCustomers - cashToSuppliers - cashForOpex;

    // Investasi (pembelian aset tetap)
    const investOut = await pool.query(`
      SELECT COALESCE(SUM(jd.debit), 0)::numeric as val
        FROM journal_details jd
        JOIN journal_entries je ON je.id = jd.journal_id
        JOIN accounts a ON a.id = jd.account_id
       WHERE a.code >= '1-2000' AND a.code < '1-3000' AND a.type = 'ASSET'
         AND je.entry_date BETWEEN $1 AND $2 AND je.posted = true
    `, [from, to]);
    const netInvesting = -parseFloat(investOut.rows[0].val);

    // Pendanaan
    const equityIn = await pool.query(`
      SELECT COALESCE(SUM(jd.credit - jd.debit), 0)::numeric as val
        FROM journal_details jd
        JOIN journal_entries je ON je.id = jd.journal_id
        JOIN accounts a ON a.id = jd.account_id
       WHERE a.type = 'EQUITY' AND je.entry_date BETWEEN $1 AND $2 AND je.posted = true
         AND je.reference_type NOT IN ('YEAR_END_CLOSE')
    `, [from, to]);
    const netFinancing = parseFloat(equityIn.rows[0].val);

    const netChangeInCash = netOperating + netInvesting + netFinancing;

    // Saldo kas awal dan akhir
    const beginningQ = await pool.query(`
      SELECT COALESCE(SUM(jd.debit - jd.credit), 0)::numeric as val
        FROM journal_details jd
        JOIN journal_entries je ON je.id = jd.journal_id
        JOIN accounts a ON a.id = jd.account_id
       WHERE a.code IN ('1-1000', '1-1010', '1-1020') AND je.entry_date < $1 AND je.posted = true
    `, [from]);
    const beginningCash = parseFloat(beginningQ.rows[0].val);
    const endingCash = beginningCash + netChangeInCash;

    res.json({
      period: { from, to },
      operating_activities: {
        receipts_from_customers: cashFromCustomers,
        payments_to_suppliers: cashToSuppliers,
        operating_expenses_paid: cashForOpex,
        net_cash_operating: netOperating
      },
      investing_activities: {
        fixed_asset_acquisitions: parseFloat(investOut.rows[0].val),
        net_cash_investing: netInvesting
      },
      financing_activities: {
        capital_and_equity_contributions: netFinancing,
        net_cash_financing: netFinancing
      },
      net_change_in_cash: netChangeInCash,
      beginning_cash_balance: beginningCash,
      ending_cash_balance: endingCash
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/finance/equity-changes (Laporan Perubahan Ekuitas)
router.get('/equity-changes', async (req, res) => {
  const from = req.query.from_date || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = req.query.to_date || new Date().toISOString().slice(0, 10);
  try {
    // Saldo awal modal & laba ditahan
    const begQ = await pool.query(`
      SELECT a.code, a.name, COALESCE(SUM(jd.credit - jd.debit), 0)::numeric as val
        FROM accounts a
        LEFT JOIN journal_details jd ON jd.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jd.journal_id AND je.entry_date < $1 AND je.posted = true
       WHERE a.type = 'EQUITY'
       GROUP BY a.code, a.name ORDER BY a.code
    `, [from]);
    const beginningEquity = begQ.rows.reduce((s, r) => s + parseFloat(r.val), 0);

    // Laba bersih periode berjalan
    const revQ = await pool.query(`
      SELECT COALESCE(SUM(jd.credit - jd.debit), 0)::numeric as val
        FROM journal_details jd
        JOIN journal_entries je ON je.id = jd.journal_id
        JOIN accounts a ON a.id = jd.account_id
       WHERE a.type = 'REVENUE' AND je.entry_date BETWEEN $1 AND $2 AND je.posted = true
    `, [from, to]);
    const expQ = await pool.query(`
      SELECT COALESCE(SUM(jd.debit - jd.credit), 0)::numeric as val
        FROM journal_details jd
        JOIN journal_entries je ON je.id = jd.journal_id
        JOIN accounts a ON a.id = jd.account_id
       WHERE a.type = 'EXPENSE' AND je.entry_date BETWEEN $1 AND $2 AND je.posted = true
    `, [from, to]);
    const netProfit = parseFloat(revQ.rows[0].val) - parseFloat(expQ.rows[0].val);

    // Perubahan modal langsung selama periode (setoran modal / prive)
    const capQ = await pool.query(`
      SELECT COALESCE(SUM(jd.credit - jd.debit), 0)::numeric as val
        FROM journal_details jd
        JOIN journal_entries je ON je.id = jd.journal_id
        JOIN accounts a ON a.id = jd.account_id
       WHERE a.type = 'EQUITY' AND je.entry_date BETWEEN $1 AND $2 AND je.posted = true
         AND je.reference_type NOT IN ('YEAR_END_CLOSE')
    `, [from, to]);
    const capitalContributions = parseFloat(capQ.rows[0].val);
    const endingEquity = beginningEquity + netProfit + capitalContributions;

    res.json({
      period: { from, to },
      beginning_equity: beginningEquity,
      details_beginning: begQ.rows,
      net_profit_period: netProfit,
      capital_contributions: capitalContributions,
      ending_equity: endingEquity
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/finance/close-year (Tutup Buku Tahunan ke Laba Ditahan)
router.post('/close-year', rbac('direktur', 'super_admin'), async (req, res) => {
  const year = parseInt(req.body.year || new Date().getFullYear(), 10);
  const closingDate = req.body.closing_date || `${year}-12-31`;
  const notes = req.body.notes || `Tutup Buku Akhir Tahun ${year}`;

  try {
    const result = await withTx(async (client) => {
      // Pastikan akun 3-2000 (Laba Ditahan) ada
      await client.query("INSERT INTO accounts (code, name, type) VALUES ('3-2000', 'Laba Ditahan', 'EQUITY') ON CONFLICT (code) DO NOTHING");
      const retainedAcc = (await client.query("SELECT id FROM accounts WHERE code = '3-2000'")).rows[0]?.id;

      // Cek apakah sudah pernah tutup buku untuk tahun ini
      const already = await client.query(
        "SELECT id, entry_number FROM journal_entries WHERE reference_type = 'YEAR_END_CLOSE' AND reference_id = $1",
        [year]
      );
      if (already.rows.length) {
        throw new Error(`Tutup buku tahun ${year} sudah pernah diposting (#${already.rows[0].entry_number})`);
      }

      // Ambil saldo akun pendapatan (REVENUE) dan beban (EXPENSE)
      const revs = await client.query(`
        SELECT a.id, a.code, a.name, COALESCE(SUM(jd.credit - jd.debit), 0)::numeric as balance
          FROM accounts a
          JOIN journal_details jd ON jd.account_id = a.id
          JOIN journal_entries je ON je.id = jd.journal_id
         WHERE a.type = 'REVENUE' AND EXTRACT(YEAR FROM je.entry_date) = $1 AND je.posted = true
         GROUP BY a.id, a.code, a.name
        HAVING ABS(SUM(jd.credit - jd.debit)) > 0.01
      `, [year]);

      const exps = await client.query(`
        SELECT a.id, a.code, a.name, COALESCE(SUM(jd.debit - jd.credit), 0)::numeric as balance
          FROM accounts a
          JOIN journal_details jd ON jd.account_id = a.id
          JOIN journal_entries je ON je.id = jd.journal_id
         WHERE a.type = 'EXPENSE' AND EXTRACT(YEAR FROM je.entry_date) = $1 AND je.posted = true
         GROUP BY a.id, a.code, a.name
        HAVING ABS(SUM(jd.debit - jd.credit)) > 0.01
      `, [year]);

      let totalRev = revs.rows.reduce((s, r) => s + parseFloat(r.balance), 0);
      let totalExp = exps.rows.reduce((s, r) => s + parseFloat(r.balance), 0);
      let netIncome = totalRev - totalExp;

      const lines = [];
      // Tutup Pendapatan: Dr Pendapatan
      for (const r of revs.rows) {
        const bal = parseFloat(r.balance);
        if (bal > 0) lines.push({ code: r.code, debit: bal, credit: 0, description: `Penutupan pendapatan ${r.code}` });
        else if (bal < 0) lines.push({ code: r.code, debit: 0, credit: Math.abs(bal), description: `Penutupan pendapatan ${r.code}` });
      }

      // Tutup Beban: Cr Beban
      for (const e of exps.rows) {
        const bal = parseFloat(e.balance);
        if (bal > 0) lines.push({ code: e.code, debit: 0, credit: bal, description: `Penutupan beban ${e.code}` });
        else if (bal < 0) lines.push({ code: e.code, debit: Math.abs(bal), credit: 0, description: `Penutupan beban ${e.code}` });
      }

      // Selisih laba/rugi masuk ke 3-2000 (Laba Ditahan)
      if (netIncome > 0) {
        lines.push({ code: '3-2000', debit: 0, credit: netIncome, description: `Laba bersih ditahan tahun ${year}` });
      } else if (netIncome < 0) {
        lines.push({ code: '3-2000', debit: Math.abs(netIncome), credit: 0, description: `Rugi bersih dipindahkan ke laba ditahan tahun ${year}` });
      }

      if (!lines.length) throw new Error(`Tidak ada saldo pendapatan atau beban yang perlu ditutup untuk tahun ${year}`);

      const id = await postJournal({
        date: closingDate,
        refType: 'YEAR_END_CLOSE',
        refId: year,
        description: notes,
        lines,
        createdBy: req.user.id,
        client
      });

      return { id, year, net_income: netIncome, total_revenue: totalRev, total_expense: totalExp };
    }, req.user);

    res.json({ ok: true, message: `Tutup buku tahun ${year} berhasil dibukukan ke Laba Ditahan`, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/export', async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:'Format tidak didukung: '+format});
  const dataset=String(req.query.dataset||'coa');
  const money=(n)=>new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
  try{
    if(dataset==='coa'){
      const r=await pool.query('SELECT * FROM accounts ORDER BY code');
      const columns=[{label:'Kode'},{label:'Nama Akun'},{label:'Tipe'},{label:'Induk'}];
      const rows=r.rows.map(a=>[a.code, a.name, a.type, a.parent_id||'-']);
      return sendReport(res,{format,filename:'coa',payload:{title:'Chart of Accounts',subtitle:`${rows.length} akun`,columns,rows,sheetName:'COA'}});
    }
    if(dataset==='journals'){
      const r=await pool.query('SELECT je.*, u.username FROM journal_entries je LEFT JOIN users u ON u.id=je.created_by ORDER BY je.id DESC LIMIT 2000');
      for(const je of r.rows){
        const d=await pool.query('SELECT jd.*, a.code, a.name FROM journal_details jd JOIN accounts a ON a.id=jd.account_id WHERE jd.journal_id=$1',[je.id]);
        je._details=d.rows;
      }
      const columns=[{label:'No. Jurnal'},{label:'Tanggal'},{label:'Deskripsi'},{label:'Debit',numeric:true,total:true},{label:'Kredit',numeric:true,total:true},{label:'Status'}];
      const rows=r.rows.map(j=>[j.entry_number, String(j.entry_date||'').slice(0,10), j.description||'-', parseFloat(j.total_debit||0), parseFloat(j.total_credit||0), j.posted?'POSTED':'DRAFT']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
      return sendReport(res,{format,filename:'jurnal-umum',payload:{title:'Jurnal Umum',subtitle:`${rows.length} jurnal  |  Debit ${money(totals[3]||0)}  Kredit ${money(totals[4]||0)}`,columns,rows,totals,sheetName:'Jurnal'}});
    }
    if(dataset==='ar'){
      const r=await pool.query(`SELECT inv.invoice_number, inv.status, inv.total, inv.paid_amount, COALESCE(inv.total,0)-COALESCE(inv.paid_amount,0) as outstanding, c.name as customer_name FROM invoices inv LEFT JOIN customers c ON c.id=inv.customer_id ORDER BY inv.id DESC LIMIT 2000`);
      const columns=[{label:'Invoice'},{label:'Customer'},{label:'Status'},{label:'Total',numeric:true,total:true},{label:'Terbayar',numeric:true,total:true},{label:'Sisa',numeric:true,total:true}];
      const rows=r.rows.map(x=>[x.invoice_number, x.customer_name||'-', x.status, parseFloat(x.total||0), parseFloat(x.paid_amount||0), parseFloat(x.outstanding||0)]);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
      return sendReport(res,{format,filename:'aging-piutang',payload:{title:'Aging Piutang (AR)',subtitle:`${rows.length} invoice`,columns,rows,totals,sheetName:'AR'}});
    }
    if(dataset==='ap'){
      const r=await pool.query(`SELECT 'PURCHASE' as source, pi.inv_number as doc_number, pi.total, pi.status, s.name as supplier_name FROM purchase_invoices pi JOIN suppliers s ON s.id=pi.supplier_id UNION ALL SELECT 'PO' as source, po.po_number as doc_number, po.total, po.status, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.status IN ('RECEIVED','PARTIAL') LIMIT 2000`);
      const columns=[{label:'Sumber'},{label:'Dokumen'},{label:'Supplier'},{label:'Status'},{label:'Total',numeric:true,total:true}];
      const rows=r.rows.map(x=>[x.source, x.doc_number, x.supplier_name||'-', x.status, parseFloat(x.total||0)]);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
      return sendReport(res,{format,filename:'hutang-usaha',payload:{title:'Hutang Usaha (AP)',subtitle:`${rows.length} dokumen`,columns,rows,totals,sheetName:'AP'}});
    }
    if(dataset==='cash'){
      const r=await pool.query('SELECT bank_name, account_no, account_name, balance FROM bank_accounts ORDER BY bank_name');
      const columns=[{label:'Bank'},{label:'No. Rekening'},{label:'Atas Nama'},{label:'Saldo',numeric:true,total:true}];
      const rows=r.rows.map(x=>[x.bank_name, x.account_no, x.account_name||'-', parseFloat(x.balance||0)]);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
      return sendReport(res,{format,filename:'saldo-bank',payload:{title:'Saldo Kas & Bank',subtitle:`${rows.length} rekening`,columns,rows,totals,sheetName:'Kas'}});
    }
    return res.status(400).json({error:'dataset tidak dikenal: '+dataset});
  }catch(e){ res.status(500).json({error:e.message}); }
});


router.put('/coa/:id', async (req,res)=>{
  const {code,name,type,parent_id}=req.body;
  try{
    const sets=[]; const vals=[]; let i=1;
    if(code!==undefined){ sets.push('code=$'+i); vals.push(code); i++; }
    if(name!==undefined){ sets.push('name=$'+i); vals.push(name); i++; }
    if(type!==undefined){ sets.push('type=$'+i); vals.push(type); i++; }
    if(parent_id!==undefined){ sets.push('parent_id=$'+i); vals.push(parent_id||null); i++; }
    if(!sets.length) return res.status(400).json({error:'Tidak ada perubahan'});
    vals.push(req.params.id);
    await pool.query('UPDATE accounts SET '+sets.join(', ')+' WHERE id=$'+i, vals);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/coa/:id', async (req,res)=>{
  try{
    const j=await pool.query('SELECT COUNT(*) FROM journal_details WHERE account_id=$1',[req.params.id]);
    if(parseInt(j.rows[0].count)>0) return res.status(400).json({error:'Akun masih dipakai di jurnal - tidak bisa dihapus'});
    await pool.query('DELETE FROM accounts WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
