import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
const router = express.Router();

router.get('/ping', (req,res)=>res.json({ok:true, routes:['/ar','/ar/debug','/ap','/cash'], note:'AR POS/DO/SO only'}));
router.get('/ar/debug', async (req,res)=>{
  try{
    const all=await pool.query(`SELECT id, invoice_number, status, total, paid_amount, COALESCE(total,0)-COALESCE(paid_amount,0) as outstanding_calc, due_date, so_id, do_id, customer_id, invoice_date FROM invoices ORDER BY id DESC LIMIT 30`);
    const byStatus=await pool.query(`SELECT status, COUNT(*) as c FROM invoices GROUP BY status ORDER BY c DESC`);
    res.json({all: all.rows, byStatus: byStatus.rows});
  }catch(e){ res.status(500).json({error:e.message}); }
});
// atur due date - hanya SENT/PARTIAL/OVERDUE
router.patch('/ar/:id/due-date', async (req,res)=>{
  try{
    const id=parseInt(req.params.id,10);
    const {due_date}=req.body;
    if(!due_date || !/^\d{4}-\d{2}-\d{2}/.test(String(due_date))) return res.status(400).json({error:'due_date YYYY-MM-DD wajib'});
    const inv=await pool.query('SELECT id,status,invoice_date,due_date FROM invoices WHERE id=$1',[id]);
    if(!inv.rows[0]) return res.status(404).json({error:'Invoice tidak ditemukan'});
    const st=String(inv.rows[0].status||'').trim().toUpperCase();
    if(['PAID','CANCELLED','VOID','LUNAS'].includes(st)) return res.status(400).json({error:'Invoice '+st+' tidak bisa ubah jatuh tempo'});
    // allow SENT/PARTIAL/OVERDUE/DRAFT/APPROVED dll selama belum lunas
    const d=new Date(due_date); if(isNaN(d.getTime())) return res.status(400).json({error:'Tanggal tidak valid'});
    const upd=await pool.query('UPDATE invoices SET due_date=$1 WHERE id=$2 RETURNING id,invoice_number,due_date,invoice_date,status',[due_date,id]);
    res.json({ok:true, invoice: upd.rows[0]});
  }catch(e){ console.error('patch due_date',e.message); res.status(500).json({error:e.message}); }
});
router.get('/coa', async (req,res)=>{ try{ const r=await pool.query('SELECT * FROM accounts ORDER BY code'); res.json(r.rows);}catch(e){ console.error('coa',e.message); res.json([]);} });
router.post('/coa', async (req,res)=>{ const {code,name,type,parent_id}=req.body; const r=await pool.query('INSERT INTO accounts (code,name,type,parent_id) VALUES ($1,$2,$3,$4) RETURNING id',[code,name,type,parent_id]); res.json(r.rows[0]); });

router.get('/journals', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const cnt=await pool.query('SELECT COUNT(*) FROM journal_entries');
  const data=await pool.query('SELECT je.*, u.username FROM journal_entries je LEFT JOIN users u ON u.id=je.created_by ORDER BY je.id DESC LIMIT $1 OFFSET $2',[limit, offset]);
  for(const je of data.rows){
    const d=await pool.query('SELECT jd.*, a.code, a.name FROM journal_details jd JOIN accounts a ON a.id=jd.account_id WHERE jd.journal_id=$1',[je.id]);
    je.details=d.rows;
  }
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/journals', async (req,res)=>{
  const {entry_date, description, details} = req.body;
  const entry_number='JE-'+Date.now();
  let debit=0, credit=0; for(const d of details){ debit+=parseFloat(d.debit||0); credit+=parseFloat(d.credit||0); }
  if(debit!==credit) return res.status(400).json({error:'Debit != Credit'});
  const ins=await pool.query('INSERT INTO journal_entries (entry_number, entry_date, description, total_debit, total_credit, posted, created_by) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id',[entry_number, entry_date||new Date().toISOString().slice(0,10), description, debit, credit, req.user.id]);
  const jid=ins.rows[0].id;
  for(const d of details) await pool.query('INSERT INTO journal_details (journal_id, account_id, debit, credit, description) VALUES ($1,$2,$3,$4,$5)',[jid, d.account_id, d.debit||0, d.credit||0, d.description]);
  res.json({id:jid, entry_number});
});

// AR POS/DO/SO only - ponytail: jangan buat dummy di finance, baca invoices langsung
router.get('/ar', async (req,res)=>{
  try{
    for(const sql of [
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dp_percent INT DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total DECIMAL(15,2) DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE`,
    ]){ try{ await pool.query(sql); }catch{} }
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
  try{ await pool.query(`CREATE TABLE IF NOT EXISTS purchase_invoices (id SERIAL PRIMARY KEY, inv_number VARCHAR(30) UNIQUE NOT NULL, po_id INT REFERENCES purchase_orders(id), supplier_id INT REFERENCES suppliers(id), invoice_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE, subtotal DECIMAL(15,2) DEFAULT 0, tax DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'HOLD', notes TEXT, created_by INT REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())`); }catch{}
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
  await pool.query(`DELETE FROM bank_accounts WHERE id NOT IN (SELECT MAX(id) FROM bank_accounts GROUP BY bank_name, account_no)`);
  try{ await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_acc ON bank_accounts(bank_name, account_no)`); }catch{}
  const r=await pool.query(`SELECT id, bank_name, account_no, account_name, balance FROM bank_accounts ORDER BY bank_name`);
  res.json(r.rows);
}catch(e){ console.error('cash',e.message); res.json([]); } });
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
