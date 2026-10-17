import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();
let prRfqEnsured=false;
async function ensurePrRfq(){
  if(prRfqEnsured) return;
  try{
    await pool.query(`CREATE TABLE IF NOT EXISTS purchase_requests (id SERIAL PRIMARY KEY, pr_number VARCHAR(30) UNIQUE NOT NULL, product_id INT REFERENCES products(id), qty DECIMAL(15,3) NOT NULL, needed_date DATE, notes TEXT, status VARCHAR(20) DEFAULT 'DRAFT', created_by INT REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rfqs (id SERIAL PRIMARY KEY, rfq_number VARCHAR(30) UNIQUE NOT NULL, pr_id INT REFERENCES purchase_requests(id), status VARCHAR(20) DEFAULT 'OPEN', notes TEXT, created_by INT REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW(), winner_quotation_id INT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rfq_quotations (id SERIAL PRIMARY KEY, rfq_id INT REFERENCES rfqs(id) ON DELETE CASCADE, supplier_id INT REFERENCES suppliers(id), unit_price DECIMAL(15,2) NOT NULL, lead_days INT, notes TEXT, is_winner BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW())`);
    prRfqEnsured=true;
  }catch(e){ console.error('[pr_rfq ensure]',e.message); }
}
let pinvEnsured=false;
async function ensurePinv(){
  if(pinvEnsured) return;
  try{
    await pool.query(`CREATE TABLE IF NOT EXISTS purchase_invoices (id SERIAL PRIMARY KEY, inv_number VARCHAR(30) UNIQUE NOT NULL, po_id INT REFERENCES purchase_orders(id), supplier_id INT REFERENCES suppliers(id), invoice_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE, subtotal DECIMAL(15,2) DEFAULT 0, tax DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'HOLD', notes TEXT, created_by INT REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS purchase_invoice_items (id SERIAL PRIMARY KEY, invoice_id INT REFERENCES purchase_invoices(id) ON DELETE CASCADE, product_id INT REFERENCES products(id), qty DECIMAL(15,3) NOT NULL, unit_cost DECIMAL(15,2) NOT NULL, total DECIMAL(15,2) NOT NULL)`);
    pinvEnsured=true;
  }catch(e){ console.error('[pinv ensure]',e.message); }
}
// -- PR / RFQ (Plan B: minimal tables, winner→PO) --
router.get('/requests', async (req,res)=>{ await ensurePrRfq(); const {limit,offset}=paginate(req); const st=req.query.status; let w='WHERE 1=1'; const p=[]; if(st){p.push(st); w+=` AND pr.status=$${p.length}`;} const cnt=await pool.query('SELECT COUNT(*) FROM purchase_requests pr '+w,p); const data=await pool.query(`SELECT pr.*, p.name as product_name, p.sku, u.username as requester FROM purchase_requests pr LEFT JOIN products p ON p.id=pr.product_id LEFT JOIN users u ON u.id=pr.created_by ${w} ORDER BY pr.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,[...p,limit,offset]); res.json({data:data.rows, total:parseInt(cnt.rows[0].count)}); });
router.post('/requests', async (req,res)=>{
  await ensurePrRfq();
  // bulk: {items:[{product_id,qty,needed_date,notes}]}
  if(Array.isArray(req.body.items) && req.body.items.length){
    const items=req.body.items; const created=[];
    for(const it of items){
      const pid=parseInt(it.product_id); const qty=parseFloat(it.qty);
      if(!pid) return res.status(400).json({error:'Pilih produk untuk setiap baris'});
      if(isNaN(qty)||qty<=0) return res.status(400).json({error:'Jumlah harus > 0 untuk setiap baris'});
      const pr_number='PR-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000))+String(Math.floor(Math.random()*90+10));
      const ins=await pool.query('INSERT INTO purchase_requests (pr_number, product_id, qty, needed_date, notes, status, created_by) VALUES ($1,$2,$3,$4,$5,\'DRAFT\',$6) RETURNING id',[pr_number, pid, qty, it.needed_date||null, it.notes||null, req.user.id]);
      created.push({id:ins.rows[0].id, pr_number});
    }
    return res.json({created, count:created.length});
  }
  const {product_id, qty, needed_date, notes}=req.body; if(!product_id||qty==null||qty==='') return res.status(400).json({error:'product_id & qty wajib'});
  const qtyNum=parseFloat(qty); if(isNaN(qtyNum)||qtyNum<=0) return res.status(400).json({error:'Jumlah harus > 0'});
  const pr_number='PR-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
  const ins=await pool.query('INSERT INTO purchase_requests (pr_number, product_id, qty, needed_date, notes, status, created_by) VALUES ($1,$2,$3,$4,$5,\'DRAFT\',$6) RETURNING id',[pr_number, parseInt(product_id), qtyNum, needed_date||null, notes||null, req.user.id]);
  res.json({id:ins.rows[0].id, pr_number});
});
router.post('/requests/:id/approve', async (req,res)=>{ await ensurePrRfq(); const r=await pool.query("UPDATE purchase_requests SET status='APPROVED' WHERE id=$1 RETURNING *",[req.params.id]); if(!r.rows[0]) return res.status(404).json({error:'PR not found'}); res.json({ok:true, pr:r.rows[0]}); });
router.post('/requests/:id/rfq', async (req,res)=>{ await ensurePrRfq(); const pr=await pool.query('SELECT * FROM purchase_requests WHERE id=$1',[req.params.id]); if(!pr.rows[0]) return res.status(404).json({error:'PR not found'}); if(pr.rows[0].status!=='APPROVED') return res.status(400).json({error:'PR harus APPROVED dulu'}); const rfq_number='RFQ-'+Date.now(); const ins=await pool.query('INSERT INTO rfqs (rfq_number, pr_id, status, notes, created_by) VALUES ($1,$2,\'OPEN\',$3,$4) RETURNING id',[rfq_number, pr.rows[0].id, req.body.notes||null, req.user.id]); await pool.query("UPDATE purchase_requests SET status='RFQ' WHERE id=$1",[req.params.id]); res.json({id:ins.rows[0].id, rfq_number}); });

router.get('/rfqs', async (req,res)=>{ await ensurePrRfq(); const {limit,offset}=paginate(req); const st=req.query.status; let w='WHERE 1=1'; const p=[]; if(st){p.push(st); w+=` AND r.status=$${p.length}`;} const cnt=await pool.query('SELECT COUNT(*) FROM rfqs r '+w,p); const data=await pool.query(`SELECT r.*, pr.pr_number, pr.qty as pr_qty, p.name as product_name, p.sku FROM rfqs r LEFT JOIN purchase_requests pr ON pr.id=r.pr_id LEFT JOIN products p ON p.id=pr.product_id ${w} ORDER BY r.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,[...p,limit,offset]); res.json({data:data.rows, total:parseInt(cnt.rows[0].count)}); });
router.get('/rfqs/:id', async (req,res)=>{ await ensurePrRfq(); const rfq=await pool.query('SELECT r.*, pr.pr_number, pr.qty as pr_qty, pr.product_id, p.name as product_name, p.sku FROM rfqs r LEFT JOIN purchase_requests pr ON pr.id=r.pr_id LEFT JOIN products p ON p.id=pr.product_id WHERE r.id=$1',[req.params.id]); if(!rfq.rows[0]) return res.status(404).json({error:'RFQ not found'}); const qs=await pool.query('SELECT q.*, s.name as supplier_name FROM rfq_quotations q JOIN suppliers s ON s.id=q.supplier_id WHERE q.rfq_id=$1 ORDER BY q.unit_price ASC',[req.params.id]); res.json({...rfq.rows[0], quotations:qs.rows}); });
router.post('/rfqs', async (req,res)=>{ await ensurePrRfq(); const {pr_id, notes}=req.body; const rfq_number='RFQ-'+Date.now(); const ins=await pool.query('INSERT INTO rfqs (rfq_number, pr_id, status, notes, created_by) VALUES ($1,$2,\'OPEN\',$3,$4) RETURNING id',[rfq_number, pr_id||null, notes||null, req.user.id]); if(pr_id) await pool.query("UPDATE purchase_requests SET status='RFQ' WHERE id=$1",[pr_id]).catch(()=>{}); res.json({id:ins.rows[0].id, rfq_number}); });
router.post('/rfqs/:id/quotations', async (req,res)=>{ await ensurePrRfq(); const {supplier_id, unit_price, lead_days, notes}=req.body; if(!supplier_id||!unit_price) return res.status(400).json({error:'supplier & harga wajib'}); const ins=await pool.query('INSERT INTO rfq_quotations (rfq_id, supplier_id, unit_price, lead_days, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id',[req.params.id, supplier_id, unit_price, lead_days||null, notes||null]); res.json({id:ins.rows[0].id}); });
router.post('/rfqs/:id/select-winner', async (req,res)=>{ await ensurePrRfq(); const {quotation_id}=req.body; const rfq=await pool.query('SELECT r.*, pr.product_id, pr.qty FROM rfqs r LEFT JOIN purchase_requests pr ON pr.id=r.pr_id WHERE r.id=$1',[req.params.id]); if(!rfq.rows[0]) return res.status(404).json({error:'RFQ not found'}); if(rfq.rows[0].status!=='OPEN') return res.status(400).json({error:'RFQ sudah closed'}); const q=await pool.query('SELECT * FROM rfq_quotations WHERE id=$1 AND rfq_id=$2',[quotation_id, req.params.id]); if(!q.rows[0]) return res.status(404).json({error:'Quotation not found'}); await pool.query('UPDATE rfq_quotations SET is_winner=false WHERE rfq_id=$1',[req.params.id]); await pool.query('UPDATE rfq_quotations SET is_winner=true WHERE id=$1',[quotation_id]); await pool.query("UPDATE rfqs SET status='SELECTED', winner_quotation_id=$1 WHERE id=$2",[quotation_id, req.params.id]); if(rfq.rows[0].pr_id) await pool.query("UPDATE purchase_requests SET status='DONE' WHERE id=$1",[rfq.rows[0].pr_id]); // auto buat PO dari winner
  const po_number='PO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000)); const qty=parseFloat(rfq.rows[0].qty||10); const unit_cost=parseFloat(q.rows[0].unit_price); const subtotal=qty*unit_cost; const tax=subtotal*0.11; const total=subtotal+tax; const status = total>50000000 ? 'PENDING' : 'APPROVED'; const poIns=await pool.query('INSERT INTO purchase_orders (po_number, supplier_id, branch_id, po_date, expected_date, status, subtotal, tax, total, created_by) VALUES ($1,$2,$3,CURRENT_DATE,NULL,$4,$5,$6,$7,$8) RETURNING id',[po_number, q.rows[0].supplier_id, 1, status, subtotal, tax, total, req.user.id]); if(rfq.rows[0].product_id) await pool.query('INSERT INTO po_details (po_id, product_id, unit_id, qty, unit_cost, total) VALUES ($1,$2,1,$3,$4,$5)',[poIns.rows[0].id, rfq.rows[0].product_id, qty, unit_cost, subtotal]); res.json({ok:true, po_id:poIns.rows[0].id, po_number, status}); });

router.get('/orders', async (req,res)=>{
  await ensurePrRfq();
  const {limit,offset}=paginate(req);
  const status=req.query.status;
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND po.status=$'+p.length; }
  const cnt=await pool.query('SELECT COUNT(*) FROM purchase_orders po '+where,p);
  const data=await pool.query('SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id '+where+' ORDER BY po.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.get('/orders/:id', async (req,res)=>{
  const po=await pool.query('SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=$1',[req.params.id]);
  if(!po.rows[0]) return res.status(404).json({error:'Not found'});
  const d=await pool.query('SELECT d.*, p.name as product_name, p.sku FROM po_details d JOIN products p ON p.id=d.product_id WHERE d.po_id=$1',[req.params.id]);
  res.json({...po.rows[0], details:d.rows});
});
router.post('/orders', async (req,res)=>{
  const {supplier_id, branch_id, expected_date, notes, items} = req.body;
  const po_number='PO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
  let subtotal=0; for(const it of items) subtotal+= parseFloat(it.qty)*parseFloat(it.unit_cost);
  const tax=subtotal*0.11; const total=subtotal+tax;
  const status = total>50000000 ? 'PENDING' : 'APPROVED';
  const ins=await pool.query('INSERT INTO purchase_orders (po_number, supplier_id, branch_id, po_date, expected_date, status, subtotal, tax, total, created_by) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9) RETURNING id',[po_number, supplier_id, branch_id||1, expected_date, status, subtotal, tax, total, req.user.id]);
  const poId=ins.rows[0].id;
  for(const it of items) await pool.query('INSERT INTO po_details (po_id, product_id, unit_id, qty, unit_cost, total) VALUES ($1,$2,1,$3,$4,$5)',[poId, it.product_id, it.qty, it.unit_cost, parseFloat(it.qty)*parseFloat(it.unit_cost)]);
  res.json({id:poId, po_number, status});
});
router.post('/orders/:id/approve', async (req,res)=>{
  await pool.query("UPDATE purchase_orders SET status='APPROVED', approved_by=$1, approved_at=NOW() WHERE id=$2",[req.user.id, req.params.id]);
  res.json({ok:true});
});
router.get('/receipts', async (req,res)=>{
  await ensurePinv();
  const r=await pool.query('SELECT gr.*, po.po_number, w.name as warehouse_name FROM goods_receipts gr LEFT JOIN purchase_orders po ON po.id=gr.po_id LEFT JOIN warehouses w ON w.id=gr.warehouse_id ORDER BY gr.id DESC LIMIT 50');
  res.json(r.rows);
});
router.get('/receipts/:id', async (req,res)=>{
  const gr=await pool.query('SELECT gr.*, po.po_number, w.name as warehouse_name FROM goods_receipts gr LEFT JOIN purchase_orders po ON po.id=gr.po_id LEFT JOIN warehouses w ON w.id=gr.warehouse_id WHERE gr.id=$1',[req.params.id]);
  if(!gr.rows[0]) return res.status(404).json({error:'GRN not found'});
  const d=await pool.query('SELECT gd.*, p.name as product_name, p.sku FROM grn_details gd LEFT JOIN products p ON p.id=gd.product_id WHERE gd.grn_id=$1',[req.params.id]);
  res.json({...gr.rows[0], items:d.rows});
});
router.post('/receipts', async (req,res)=>{
  await ensurePinv();
  const {po_id, warehouse_id, items} = req.body;
  const chk=await pool.query('SELECT status FROM purchase_orders WHERE id=$1',[po_id]);
  if(!chk.rows[0]) return res.status(404).json({error:'PO not found'});
  if(!['APPROVED','PARTIAL'].includes(chk.rows[0].status)) return res.status(400).json({error:'PO harus APPROVED/PARTIAL dulu (lewat Approval jika >50jt)'});
  const grn_number='GRN-'+Date.now();
  const ins=await pool.query("INSERT INTO goods_receipts (grn_number, po_id, warehouse_id, receipt_date, status) VALUES ($1,$2,$3,CURRENT_DATE,'COMPLETED') RETURNING id",[grn_number, po_id, warehouse_id||1]);
  const grnId=ins.rows[0].id;
  for(const it of items){
    await pool.query('INSERT INTO grn_details (grn_id, product_id, qty_ordered, qty_received, unit_cost, batch_no) VALUES ($1,$2,$3,$4,$5,$6)',[grnId, it.product_id, it.qty_ordered||it.qty_received, it.qty_received, it.unit_cost, it.batch_no||null]);
    // Update-atau-insert: batch NULL harus dianggap satu baris (ON CONFLICT dengan
    // batch_no NULL tidak pernah konflik di Postgres -> dulu bikin baris baru tiap GRN).
    const ex = await pool.query('SELECT id, qty_on_hand, avg_cost FROM stocks WHERE product_id=$1 AND warehouse_id=$2 AND batch_no IS NULL ORDER BY id LIMIT 1',[it.product_id, warehouse_id||1]);
    if (ex.rows[0]){
      const before = parseFloat(ex.rows[0].qty_on_hand)||0;
      const avgBefore = parseFloat(ex.rows[0].avg_cost)||0;
      const recv = parseFloat(it.qty_received)||0;
      const cost = parseFloat(it.unit_cost)||0;
      const after = before + recv;
      const newAvg = (after>0 && cost>0) ? ((before*avgBefore) + (recv*cost))/after : (cost||avgBefore);
      await pool.query('UPDATE stocks SET qty_on_hand=$1, avg_cost=$2, last_updated=NOW() WHERE id=$3',[after, newAvg, ex.rows[0].id]);
    } else {
      await pool.query('INSERT INTO stocks (product_id, warehouse_id, qty_on_hand, avg_cost, batch_no) VALUES ($1,$2,$3,$4,$5)',
        [it.product_id, warehouse_id||1, it.qty_received, it.unit_cost||0, it.batch_no||null]);
    }
    await pool.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_in, balance_qty, created_by) VALUES ($1,$2,'IN','GRN',$3,$4,0,$5)",[it.product_id, warehouse_id||1, grnId, it.qty_received, req.user.id]);
    await pool.query('UPDATE po_details SET qty_received = qty_received + $1 WHERE po_id=$2 AND product_id=$3',[it.qty_received, po_id, it.product_id]);
  }
  const pending = await pool.query('SELECT COUNT(*) as cnt FROM po_details WHERE po_id=$1 AND qty_received < qty',[po_id]);
  if(parseInt(pending.rows[0].cnt)===0) await pool.query("UPDATE purchase_orders SET status='RECEIVED' WHERE id=$1",[po_id]); else await pool.query("UPDATE purchase_orders SET status='PARTIAL' WHERE id=$1",[po_id]);
  res.json({id:grnId, grn_number});
});

// - 3-way matching: PO ↔ GRN ↔ Invoice supplier -
async function threeWayRows(){
  const pos=await pool.query(`SELECT po.id, po.po_number, po.status as po_status, po.total as po_total, po.subtotal as po_subtotal, s.name as supplier_name,
    COALESCE((SELECT SUM(qty) FROM po_details WHERE po_id=po.id),0) as po_qty,
    COALESCE((SELECT SUM(qty_received) FROM grn_details gd JOIN goods_receipts gr ON gr.id=gd.grn_id WHERE gr.po_id=po.id),0) as grn_qty,
    COALESCE((SELECT COUNT(*) FROM goods_receipts WHERE po_id=po.id),0) as grn_count,
    COALESCE((SELECT SUM(total) FROM purchase_invoices WHERE po_id=po.id),0) as inv_total,
    COALESCE((SELECT COUNT(*) FROM purchase_invoices WHERE po_id=po.id),0) as inv_count
    FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id ORDER BY po.id DESC LIMIT 50`);
  return pos.rows.map(r=>{
    const po_qty=parseFloat(r.po_qty), grn_qty=parseFloat(r.grn_qty), po_total=parseFloat(r.po_total), inv_total=parseFloat(r.inv_total);
    let match='HOLD', note='';
    if(parseInt(r.grn_count)===0) { match='WAIT_GRN'; note='Belum ada GRN - terima barang dulu'; }
    else if(parseInt(r.inv_count)===0) { match='WAIT_INVOICE'; note='Belum ada Invoice supplier - input di bawah'; }
    else if(grn_qty + 0.001 < po_qty) { match='HOLD'; note=`Qty kurang: terima ${grn_qty} / pesan ${po_qty}`; }
    else if(Math.abs(inv_total - po_total) > 1000) { match='HOLD'; note=`Harga beda: PO ${po_total.toLocaleString('id-ID')} vs INV ${inv_total.toLocaleString('id-ID')}`; }
    else { match='MATCHED'; note='Qty & harga cocok - siap bayar (AP)'; }
    return {...r, po_qty, grn_qty, inv_total, match, note};
  });
}
router.get('/three-way', async (req,res)=>{ await ensurePinv(); res.json(await threeWayRows()); });
router.get('/invoices', async (req,res)=>{ await ensurePinv(); const r=await pool.query('SELECT pi.*, po.po_number, s.name as supplier_name FROM purchase_invoices pi JOIN purchase_orders po ON po.id=pi.po_id JOIN suppliers s ON s.id=pi.supplier_id ORDER BY pi.id DESC LIMIT 50'); res.json(r.rows); });
router.get('/invoices/:id', async (req,res)=>{
  await ensurePinv();
  const pi=await pool.query('SELECT pi.*, po.po_number, s.name as supplier_name FROM purchase_invoices pi JOIN purchase_orders po ON po.id=pi.po_id JOIN suppliers s ON s.id=pi.supplier_id WHERE pi.id=$1',[req.params.id]);
  if(!pi.rows[0]) return res.status(404).json({error:'Invoice not found'});
  const items=await pool.query('SELECT pii.*, p.name as product_name, p.sku FROM purchase_invoice_items pii LEFT JOIN products p ON p.id=pii.product_id WHERE pii.invoice_id=$1',[req.params.id]);
  const poD=await pool.query('SELECT d.*, p.name as product_name FROM po_details d LEFT JOIN products p ON p.id=d.product_id WHERE d.po_id=$1',[pi.rows[0].po_id]);
  const grnD=await pool.query('SELECT gd.product_id, SUM(gd.qty_received) as grn_qty FROM grn_details gd JOIN goods_receipts gr ON gr.id=gd.grn_id WHERE gr.po_id=$1 GROUP BY gd.product_id',[pi.rows[0].po_id]);
  const grnMap=new Map(grnD.rows.map(x=>[String(x.product_id), parseFloat(x.grn_qty)]));
  const poMap=new Map(poD.rows.map(x=>[String(x.product_id), x]));
  const analysis=items.rows.map(it=>{
    const po=poMap.get(String(it.product_id)); const grnQty=grnMap.get(String(it.product_id))||0;
    const qtyMatch = Math.abs(parseFloat(it.qty)- (po?parseFloat(po.qty):0))<0.001 && Math.abs(parseFloat(it.qty)-grnQty)<0.001;
    const priceMatch = po ? Math.abs(parseFloat(it.unit_cost)-parseFloat(po.unit_cost))<0.01 : true;
    return {...it, po_qty: po?po.qty:null, po_unit_cost: po?po.unit_cost:null, grn_qty: grnQty, qtyMatch, priceMatch, rowMatch: qtyMatch && priceMatch};
  });
  const allMatch = analysis.length>0 && analysis.every(a=>a.rowMatch) && Math.abs(parseFloat(pi.rows[0].total) - parseFloat(pi.rows[0].po_id ? (await pool.query('SELECT total FROM purchase_orders WHERE id=$1',[pi.rows[0].po_id])).rows[0].total : pi.rows[0].total))<1000;
  res.json({...pi.rows[0], items: analysis, allMatch});
});
router.post('/invoices', async (req,res)=>{
  await ensurePinv();
  const {po_id, invoice_date, due_date, notes, items} = req.body;
  if(!po_id || !Array.isArray(items) || !items.length) return res.status(400).json({error:'po_id & items wajib'});
  const po=await pool.query('SELECT * FROM purchase_orders WHERE id=$1',[po_id]);
  if(!po.rows[0]) return res.status(404).json({error:'PO not found'});
  if(!['RECEIVED','PARTIAL','APPROVED'].includes(po.rows[0].status)) return res.status(400).json({error:'PO belum siap - harus sudah APPROVED dan ada GRN (PARTIAL/RECEIVED)'});
  let subtotal=0; for(const it of items) subtotal+= parseFloat(it.qty)*parseFloat(it.unit_cost);
  const tax=subtotal*0.11; const total=subtotal+tax;
  // 3-way check GRN-centric: tagih sesuai barang DITERIMA, bukan PO
  const grnQty=await pool.query('SELECT COALESCE(SUM(qty_received),0) as s FROM grn_details gd JOIN goods_receipts gr ON gr.id=gd.grn_id WHERE gr.po_id=$1',[po_id]);
  const grnTotalQty=parseFloat(grnQty.rows[0].s)||0;
  const poQty=await pool.query('SELECT COALESCE(SUM(qty),0) as s FROM po_details WHERE po_id=$1',[po_id]);
  const poQtyVal=parseFloat(poQty.rows[0].s)||0;
  const invQty=items.reduce((a,b)=>a+parseFloat(b.qty),0);
  // HOLD jika invoice tidak cocok dengan GRN (barang datang). PO qty hanya info short/over delivery
  const qtyHold = grnTotalQty>0 ? Math.abs(invQty - grnTotalQty)>0.001 : Math.abs(invQty - poQtyVal)>0.001;
  // price HOLD jika ada selisih harga per item vs PO (toleransi 1000 di total)
  let priceHold=false;
  if(!qtyHold){
    const poD=await pool.query('SELECT product_id, unit_cost FROM po_details WHERE po_id=$1',[po_id]);
    const poPrice=new Map(poD.rows.map(r=>[String(r.product_id), parseFloat(r.unit_cost)]));
    for(const it of items){
      const p=poPrice.get(String(it.product_id));
      if(p!=null && Math.abs(parseFloat(it.unit_cost)-p)>0.01){ priceHold=true; break; }
    }
  } else priceHold = Math.abs(total - parseFloat(po.rows[0].total)) > 1000;
  const status = (qtyHold||priceHold) ? 'HOLD' : 'MATCHED';
  const inv_number='PINV-'+Date.now();
  const ins=await pool.query('INSERT INTO purchase_invoices (inv_number, po_id, supplier_id, invoice_date, due_date, subtotal, tax, total, status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[inv_number, po_id, po.rows[0].supplier_id, invoice_date||new Date().toISOString().slice(0,10), due_date||null, subtotal, tax, total, status, notes||null, req.user.id]);
  const invId=ins.rows[0].id;
  for(const it of items) await pool.query('INSERT INTO purchase_invoice_items (invoice_id, product_id, qty, unit_cost, total) VALUES ($1,$2,$3,$4,$5)',[invId, it.product_id, it.qty, it.unit_cost, parseFloat(it.qty)*parseFloat(it.unit_cost)]);
  let note='';
  if(status==='HOLD'){
    if(qtyHold) note+=`Qty INV ${invQty} ≠ GRN terima ${grnTotalQty} (${grnTotalQty? 'tagih harus = barang datang':' belum GRN'}) . `;
    if(priceHold) note+=`Harga INV ≠ PO - selisih perlu approve. `;
    note+=`Bayar akan sesuai GRN/INV (bukan PO).`;
  } else note='Cocok GRN - siap bayar sesuai barang diterima';
  res.json({id:invId, inv_number, status, hold: status==='HOLD', note});
});
router.post('/invoices/:id/approve', async (req,res)=>{
  await ensurePinv();
  const pi=await pool.query('SELECT * FROM purchase_invoices WHERE id=$1',[req.params.id]);
  if(!pi.rows[0]) return res.status(404).json({error:'Invoice not found'});
  // force approve: bayar sesuai INV/GRN, bukan PO - simpan total apa adanya, status APPROVED agar finance bisa Bayar
  await pool.query("UPDATE purchase_invoices SET status='APPROVED' WHERE id=$1",[req.params.id]);
  // hitung info selisih untuk audit
  const grnQty=await pool.query('SELECT COALESCE(SUM(qty_received),0) as s FROM grn_details gd JOIN goods_receipts gr ON gr.id=gd.grn_id WHERE gr.po_id=$1',[pi.rows[0].po_id]);
  res.json({ok:true, note:`Approved - bayar sesuai diterima: ${parseFloat(grnQty.rows[0].s)} qty, total ${pi.rows[0].total} (bukan PO)`});
});
router.post('/invoices/:id/hold', async (req,res)=>{ await ensurePinv(); await pool.query("UPDATE purchase_invoices SET status='HOLD' WHERE id=$1",[req.params.id]); res.json({ok:true}); });
export default router;
