import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
import { postJournal } from '../../lib/journal.js';
import { mutateStock, weightedCost, sendBusinessError } from '../../lib/stock-service.js';
const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;

// Express 4 tidak meneruskan rejection dari handler async ke error middleware -
// tanpa pembungkus ini, satu request dengan :id bukan angka bisa mematikan proses.
const wrap = (fn)=> (req,res)=> Promise.resolve(fn(req,res)).catch(e=>{
  console.error('[returns]', req.method, req.originalUrl, e.message);
  if (!res.headersSent) res.status(e.code === '22P02' ? 400 : 500).json({ error: e.code === '22P02' ? 'ID tidak valid' : e.message });
});

// Item invoice untuk form retur: invoice tidak menyimpan barisnya sendiri,
// diambil dari so_details lewat invoices.so_id.
router.get('/invoice/:id', async (req,res)=>{
  try{
    const inv = await pool.query('SELECT inv.*, c.name AS customer_name FROM invoices inv LEFT JOIN customers c ON c.id=inv.customer_id WHERE inv.id=$1',[req.params.id]);
    if(!inv.rows[0]) return res.status(404).json({error:'Invoice tidak ditemukan'});
    let items = [];
    if (inv.rows[0].so_id){
      const r = await pool.query(`SELECT sd.*, p.name AS product_name, p.sku FROM so_details sd LEFT JOIN products p ON p.id=sd.product_id WHERE sd.so_id=$1 ORDER BY sd.id`,[inv.rows[0].so_id]);
      items = r.rows.map(x=>({ ...x, qty:num(x.qty), unit_price:num(x.unit_price ?? x.price), total:num(x.total) }));
    }
    res.json({ invoice: inv.rows[0], items });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/sales', async(req,res)=>{
  const w=[]; const p=[];
  if(req.query.q){
    p.push('%'+String(req.query.q).toLowerCase()+'%');
    w.push(`(LOWER(sr.return_number) LIKE $${p.length} OR LOWER(COALESCE(c.name,'')) LIKE $${p.length} OR LOWER(COALESCE(i.invoice_number,'')) LIKE $${p.length})`);
  }
  if(req.query.status && req.query.status!=='Semua'){ p.push(req.query.status); w.push(`sr.status = $${p.length}`); }
  if(req.query.reason && req.query.reason!=='Semua'){ p.push(req.query.reason); w.push(`sr.reason = $${p.length}`); }
  const r=await pool.query(
    `SELECT sr.*, c.name as customer_name, i.invoice_number,
            (SELECT COUNT(*)::int FROM sales_return_items sri WHERE sri.return_id=sr.id) as item_count,
            (SELECT COALESCE(SUM(sri.qty),0)::float FROM sales_return_items sri WHERE sri.return_id=sr.id) as total_qty
       FROM sales_returns sr
       LEFT JOIN customers c ON c.id=sr.customer_id
       LEFT JOIN invoices i ON i.id=sr.invoice_id
       ${w.length? 'WHERE '+w.join(' AND ') : ''} ORDER BY sr.id DESC LIMIT 200`, p);
  res.json(r.rows.map(x=>({ ...x, total:num(x.total) })));
});
router.get('/sales/:id', async(req,res)=>{
  const h=await pool.query('SELECT sr.*, c.name FROM sales_returns sr LEFT JOIN customers c ON c.id=sr.customer_id WHERE sr.id=$1',[req.params.id]);
  const items=await pool.query('SELECT sri.*, p.name FROM sales_return_items sri JOIN products p ON p.id=sri.product_id WHERE sri.return_id=$1',[req.params.id]);
  const claims=await pool.query("SELECT * FROM claims WHERE reference_type='SALES_RETURN' AND reference_id=$1",[req.params.id]);
  res.json({...h.rows[0], items:items.rows, claims:claims.rows});
});
router.post('/sales', async(req,res)=>{
  const {invoice_id,customer_id,reason,settlement_type,items,notes}=req.body;
  if(!items?.length) return res.status(400).json({error:'items required'});
  const num='RS-'+Date.now().toString().slice(-6);
  let total=0; for(const it of items) total+= parseFloat(it.qty)*parseFloat(it.unit_price||0);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const ins=await client.query('INSERT INTO sales_returns (return_number,invoice_id,customer_id,reason,settlement_type,total,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[num,invoice_id,customer_id,reason||'OTHER',settlement_type||'CREDIT_NOTE',total,req.user.id]);
    const rid=ins.rows[0].id;
    // HPP barang yang kembali = HPP gudang asal (wh1) saat ini
    const hpp = await weightedCost(client, items.map(it=>it.product_id), 1);
    let cogsBack = 0;
    for(const it of items){
      await client.query('INSERT INTO sales_return_items (return_id,product_id,qty,unit_price,total,condition) VALUES ($1,$2,$3,$4,$5,$6)',[rid,it.product_id,it.qty,it.unit_price||0,parseFloat(it.qty)*parseFloat(it.unit_price||0),it.condition||'QUARANTINE']);
      const cost = Number(hpp.get(Number(it.product_id))) || 0;
      // masuk gudang karantina (warehouse 2) lewat pintu tunggal mutateStock
      await mutateStock(client, {
        productId: it.product_id, warehouseId: 2, qtyDelta: Math.abs(parseFloat(it.qty)),
        unitCost: cost, refType: 'SALES_RETURN', refId: rid, userId: req.user.id,
        notes: `Retur penjualan ${num}`,
      });
      cogsBack += Math.abs(parseFloat(it.qty)) * cost;
    }
    // jika CREDIT_NOTE, kurangi piutang + jurnal nota kredit (Dr Penjualan + Dr PPN / Cr Piutang)
    if(settlement_type==='CREDIT_NOTE' && invoice_id){
      await client.query('UPDATE invoices SET total = total - $1 WHERE id=$2',[total,invoice_id]);
      const dpp = Math.round(total/1.11);
      const ppn = total - dpp;
      const lines = [
        { code:'4-1000', debit:dpp, description:'Retur penjualan '+num },
        { code:'1-1100', credit:total, description:'Nota kredit '+num },
      ];
      if(ppn > 0) lines.push({ code:'2-1100', debit:ppn, description:'PPN retur '+num });
      if(cogsBack > 0.5){
        lines.push({ code:'1-1200', debit:cogsBack, description:'Persediaan masuk (retur) '+num });
        lines.push({ code:'5-1000', credit:cogsBack, description:'Pembalik HPP retur '+num });
      }
      await postJournal({ refType:'SALES_RETURN', refId:rid, description:'Retur '+num, lines, createdBy:req.user.id, client });
    }
    await client.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\'CREATE\',\'SALES_RETURN\',$2,$3)',[req.user.id,rid,JSON.stringify({num,reason})]);
    await client.query('COMMIT');
    res.json({id:rid, return_number:num, total});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[sales return]',e);
    res.status(500).json({error:'Gagal menyimpan retur: '+e.message});
  }finally{ client.release(); }
});
router.post('/sales/:id/approve', async(req,res)=>{
  await pool.query("UPDATE sales_returns SET status='APPROVED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});
router.get('/purchase', async(req,res)=>{
  const w=[]; const p=[];
  if(req.query.q){
    p.push('%'+String(req.query.q).toLowerCase()+'%');
    w.push(`(LOWER(pr.return_number) LIKE $${p.length} OR LOWER(COALESCE(s.name,'')) LIKE $${p.length})`);
  }
  if(req.query.status && req.query.status!=='Semua'){ p.push(req.query.status); w.push(`pr.status = $${p.length}`); }
  const r=await pool.query(`SELECT pr.*, s.name as supplier_name FROM purchase_returns pr LEFT JOIN suppliers s ON s.id=pr.supplier_id ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY pr.id DESC LIMIT 200`, p);
  res.json(r.rows.map(x=>({ ...x, total:num(x.total) })));
});
router.post('/purchase', async(req,res)=>{
  const {po_id,supplier_id,reason,items,notes}=req.body;
  if(!items?.length) return res.status(400).json({error:'Minimal satu item retur'});
  const num='RP-'+Date.now().toString().slice(-6);
  const total=items.reduce((a,it)=> a + (parseFloat(it.qty)||0)*(parseFloat(it.unit_cost)||0), 0);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const ins=await client.query('INSERT INTO purchase_returns (return_number,po_id,supplier_id,reason,total,status) VALUES ($1,$2,$3,$4,$5,\'SUBMITTED\') RETURNING id',[num,po_id||null,supplier_id||null,reason||'OTHER',total]);
    const rid=ins.rows[0].id;
    // simpan rincian bila tabelnya tersedia (tidak wajib ada di semua instalasi)
    const t=await client.query("SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_name='purchase_return_items'");
    if(t.rows[0].n){
      for(const it of items){
        await client.query('INSERT INTO purchase_return_items (return_id,product_id,qty,unit_cost,total,condition) VALUES ($1,$2,$3,$4,$5,$6)',
          [rid, it.product_id, it.qty, it.unit_cost||0, (parseFloat(it.qty)||0)*(parseFloat(it.unit_cost)||0), it.condition||'DAMAGED']);
      }
    }
    await client.query('COMMIT');
    res.json({ok:true, id:rid, return_number:num, total});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    res.status(500).json({error:'Gagal menyimpan retur pembelian: '+e.message});
  }finally{ client.release(); }
});
router.get('/claims', async(req,res)=>{
  const w=[]; const p=[];
  if(req.query.q){
    p.push('%'+String(req.query.q).toLowerCase()+'%');
    w.push(`(LOWER(claim_number) LIKE $${p.length} OR LOWER(COALESCE(notes,'')) LIKE $${p.length})`);
  }
  if(req.query.status && req.query.status!=='Semua'){ p.push(req.query.status); w.push(`status = $${p.length}`); }
  if(req.query.claim_type && req.query.claim_type!=='Semua'){ p.push(req.query.claim_type); w.push(`claim_type = $${p.length}`); }
  const r=await pool.query(`SELECT * FROM claims ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY id DESC LIMIT 200`, p);
  res.json(r.rows.map(x=>({ ...x, amount_claimed:num(x.amount_claimed), amount_settled:num(x.amount_settled) })));
});
router.post('/claims', async(req,res)=>{
  const {claim_type,reference_type,reference_id,amount_claimed,notes}=req.body;
  const num='CLM-'+Date.now().toString().slice(-6);
  const ins=await pool.query('INSERT INTO claims (claim_number,claim_type,reference_type,reference_id,amount_claimed,notes,status) VALUES ($1,$2,$3,$4,$5,$6,\'SUBMITTED\') RETURNING id',[num,claim_type||'SUPPLIER',reference_type,reference_id,amount_claimed||0,notes]);
  res.json({id:ins.rows[0].id, claim_number:num});
});
router.post('/claims/:id/settle', async(req,res)=>{
  const {amount_settled,status}=req.body;
  await pool.query('UPDATE claims SET amount_settled=$1, status=$2, settled_date=CURRENT_DATE WHERE id=$3',[amount_settled,status||'PAID',req.params.id]);
  res.json({ok:true});
});
router.post('/claims/:id/attach', async(req,res)=>{
  await pool.query('INSERT INTO claim_attachments (claim_id,file_url,file_type,description) VALUES ($1,$2,$3,$4)',[req.params.id,req.body.file_url,req.body.file_type,req.body.description]);
  res.json({ok:true});
});

// ------------------------------------------------------------- GET /export
router.get('/export', async(req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'sales');
  const money=(n)=>new Intl.NumberFormat('id-ID').format(num(n));
  try{
    if(dataset==='purchase'){
      const r=await pool.query('SELECT pr.*, s.name as supplier_name, po.po_number FROM purchase_returns pr LEFT JOIN suppliers s ON s.id=pr.supplier_id LEFT JOIN purchase_orders po ON po.id=pr.po_id ORDER BY pr.id DESC LIMIT 5000');
      const columns=[{label:'No Retur'},{label:'Tanggal'},{label:'Supplier'},{label:'PO'},{label:'Alasan'},{label:'Total',numeric:true,total:true},{label:'Status'}];
      const rows=r.rows.map(x=>[x.return_number, String(x.return_date||'').slice(0,10), x.supplier_name||'-', x.po_number||'-', x.reason||'-', num(x.total), x.status||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'retur-pembelian',
        payload:{title:'Retur Pembelian ke Supplier',subtitle:`${rows.length} dokumen  |  Total ${money(totals[5]||0)}`,columns,rows,totals,sheetName:'Retur Pembelian'}});
    }
    if(dataset==='claims'){
      const r=await pool.query('SELECT * FROM claims ORDER BY id DESC LIMIT 5000');
      const columns=[{label:'No Klaim'},{label:'Tipe'},{label:'Referensi'},{label:'Diajukan',numeric:true,total:true},
        {label:'Diselesaikan',numeric:true,total:true},{label:'Selisih',numeric:true,total:true},
        {label:'Tgl Ajukan'},{label:'Tgl Selesai'},{label:'Status'},{label:'Catatan'}];
      const rows=r.rows.map(c=>[c.claim_number, c.claim_type||'-', c.reference_type?`${c.reference_type} #${c.reference_id??'-'}`:'-',
        num(c.amount_claimed), num(c.amount_settled), num(c.amount_claimed)-num(c.amount_settled),
        c.filed_date?String(c.filed_date).slice(0,10):'-', c.settled_date?String(c.settled_date).slice(0,10):'-',
        c.status||'-', c.notes||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'klaim-supplier-ekspedisi',
        payload:{title:'Klaim Supplier & Ekspedisi',subtitle:`${rows.length} klaim  |  Diajukan ${money(totals[3]||0)}  |  Diselesaikan ${money(totals[4]||0)}`,columns,rows,totals,sheetName:'Klaim'}});
    }
    const w=[]; const p=[];
    if(req.query.q){ p.push('%'+String(req.query.q).toLowerCase()+'%'); w.push(`(LOWER(sr.return_number) LIKE $${p.length} OR LOWER(COALESCE(c.name,'')) LIKE $${p.length})`); }
    if(req.query.status && req.query.status!=='Semua'){ p.push(req.query.status); w.push(`sr.status = $${p.length}`); }
    const r=await pool.query(
      `SELECT sr.*, c.name as customer_name, i.invoice_number,
              (SELECT COUNT(*)::int FROM sales_return_items sri WHERE sri.return_id=sr.id) as item_count,
              (SELECT COALESCE(SUM(sri.qty),0)::float FROM sales_return_items sri WHERE sri.return_id=sr.id) as total_qty
         FROM sales_returns sr LEFT JOIN customers c ON c.id=sr.customer_id LEFT JOIN invoices i ON i.id=sr.invoice_id
         ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY sr.id DESC LIMIT 5000`, p);
    const columns=[{label:'No Retur'},{label:'Tanggal'},{label:'Customer'},{label:'Invoice'},{label:'Alasan'},
      {label:'Settlement'},{label:'Item',numeric:true,total:true},{label:'Qty',numeric:true,total:true},
      {label:'Total',numeric:true,total:true},{label:'Status'}];
    const rows=r.rows.map(x=>[x.return_number, String(x.return_date||'').slice(0,10), x.customer_name||'-', x.invoice_number||'-',
      x.reason||'-', x.settlement_type||'-', x.item_count||0, num(x.total_qty), num(x.total), x.status||'-']);
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
    return sendReport(res,{format,filename:'retur-penjualan',
      payload:{title:'Retur Penjualan',subtitle:`${rows.length} dokumen  |  Total ${money(totals[8]||0)}`,columns,rows,totals,sheetName:'Retur Penjualan'}});
  }catch(e){
    console.error('returns export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});
export default router;
