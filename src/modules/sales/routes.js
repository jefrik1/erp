import express from 'express';
import crypto from 'node:crypto';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { rbac } from '../../middleware/auth.js';
import { createDelivery, DeliveryError, calcEst, ensureSignatureCols } from './delivery-service.js';
import { ensureTrackCols } from '../public/routes.js';
import { getRule, createApproval } from '../approvals/rules-routes.js';
const router = express.Router();
export { calcEst };

function wibNow(){ return new Date(Date.now() + 7*3600*1000); } void wibNow;
function requireDoOfficeConfirmed(doRow){
  if(!doRow || !doRow.office_confirmed_at){
    return `DO ${doRow?.do_number||''} belum dikonfirmasi Pengirim/Gudang/Kantor. Buka Detail Sales Order (panel Pengiriman & Tanda Tangan), Surat Jalan, atau Logistik lalu klik "Konfirmasi Gudang" — setelah itu invoice bisa dilunasi.`.trim();
  }
  return null;
}


// Plan B: DO estimasi muatan & biaya zona (idempotent)
let deliveryEstEnsured=false;
async function ensureDeliveryEst(){
  if(deliveryEstEnsured) return;
  try{
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_weight_ton DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_volume_m3 DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_zone VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost_dalam DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost_luar DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`UPDATE delivery_orders SET est_cost_dalam = COALESCE(est_cost_dalam, 150000 + COALESCE(est_weight_ton,0)*120000) WHERE est_cost_dalam IS NULL AND est_weight_ton IS NOT NULL`).catch(()=>{});
    await pool.query(`UPDATE delivery_orders SET est_cost_luar  = COALESCE(est_cost_luar, 600000 + COALESCE(est_weight_ton,0)*350000) WHERE est_cost_luar IS NULL AND est_weight_ton IS NOT NULL`).catch(()=>{});
    deliveryEstEnsured=true;
  }catch{}
}
async function assertCustomerCredit(customer_id, addAmount=0){
  if(!customer_id) return null;
  const c=await pool.query('SELECT id, name, credit_limit, is_hold, hold_reason FROM customers WHERE id=$1',[customer_id]);
  if(!c.rows[0]) return null;
  const limit=parseFloat(c.rows[0].credit_limit||0);
  const isHold=c.rows[0].is_hold;
  if(isHold) return { blocked:true, reason:`Customer di-HOLD: ${c.rows[0].hold_reason||'-'} - hanya Direktur bisa buka. Tidak bisa buat SO/POS baru.` };
  if(limit>0){
    const ar=await pool.query("SELECT COALESCE(SUM(COALESCE(total,0)-COALESCE(paid_amount,0)),0) as o FROM invoices WHERE customer_id=$1 AND UPPER(TRIM(status)) NOT IN ('PAID','CANCELLED','VOID','LUNAS') AND COALESCE(total,0)-COALESCE(paid_amount,0) > 0.5",[customer_id]);
    const outstanding=parseFloat(ar.rows[0].o||0);
    const projected=outstanding + parseFloat(addAmount||0);
    if(projected > limit){
      const usage=((projected/limit)*100).toFixed(1);
      return { blocked:true, reason:`Melebihi limit kredit: limit ${new Intl.NumberFormat('id-ID').format(limit)} outstanding ${new Intl.NumberFormat('id-ID').format(outstanding)} + baru ${new Intl.NumberFormat('id-ID').format(addAmount)} = ${new Intl.NumberFormat('id-ID').format(projected)} (${usage}%). Butuh approval Finance Manager atau lunasi dulu / HOLD.` };
    }
  }
  return null;
}

router.get('/orders', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const status=req.query.status;
  const search=req.query.search||'';
  const source=req.query.source||'';
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND so.status=$'+p.length; }
  if(source==='pos'){ where+=" AND so.so_number LIKE 'SO-POS-%'"; }
  if(search){ p.push('%'+search+'%'); where+=' AND (so.so_number ILIKE $'+p.length+' OR c.name ILIKE $'+p.length+' OR c.code ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM sales_orders so JOIN customers c ON c.id=so.customer_id '+where,p);
  const data=await pool.query("SELECT so.*, c.name as customer_name, c.code as customer_code, b.name as branch_name, CASE WHEN so.so_number LIKE 'SO-POS-%' THEN true ELSE false END as is_pos FROM sales_orders so JOIN customers c ON c.id=so.customer_id LEFT JOIN branches b ON b.id=so.branch_id "+where+" ORDER BY so.id DESC LIMIT $"+(p.length+1)+" OFFSET $"+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
// Riwayat order (POS + SO) lengkap dengan metode pembayaran.
// Cakupan per role: kasir hanya order POS miliknya; sales/finance/admin melihat semua.
router.get('/orders/history', async (req,res)=>{
  try{
    const {limit,offset}=paginate(req);
    const roles=(req.user?.roles||[]).map(r=>String(r).toLowerCase());
    const broad = roles.some(r=>['direktur','super_admin','sales','sales_trading','finance','warehouse','auditor'].includes(r));
    const posOnly = !broad && roles.some(r=>['pos_cashier','pos_supervisor','pos_manager'].includes(r));
    const {search,source,status,method,start,end}=req.query;
    let where='WHERE 1=1'; const p=[];
    if(posOnly){ where+=" AND so.so_number LIKE 'SO-POS-%'"; p.push(req.user.id); where+=' AND so.created_by=$'+p.length; }
    if(source==='pos') where+=" AND so.so_number LIKE 'SO-POS-%'";
    if(source==='so') where+=" AND so.so_number NOT LIKE 'SO-POS-%'";
    if(status && status!=='Semua'){ p.push(status); where+=' AND so.status=$'+p.length; }
    if(start){ p.push(start); where+=' AND so.so_date >= $'+p.length; }
    if(end){ p.push(end); where+=' AND so.so_date <= $'+p.length; }
    if(method && method!=='Semua'){
      p.push(method); where+=` AND EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id=inv.id AND p.method=$${p.length})`;
    }
    if(search){ p.push('%'+search+'%'); where+=` AND (so.so_number ILIKE $${p.length} OR c.name ILIKE $${p.length} OR c.code ILIKE $${p.length} OR inv.invoice_number ILIKE $${p.length})`; }
    const base = `FROM sales_orders so
      JOIN customers c ON c.id=so.customer_id
      LEFT JOIN users u ON u.id=so.created_by
      LEFT JOIN LATERAL (SELECT * FROM invoices i WHERE i.so_id=so.id ORDER BY i.id DESC LIMIT 1) inv ON true
      ${where}`;
    const cnt=await pool.query('SELECT COUNT(*)::int AS n '+base, p);
    const data=await pool.query(`
      SELECT so.id, so.so_number, so.so_date, so.created_at, so.status, so.total, so.subtotal, so.discount, so.tax, so.notes,
             so.created_by, u.username AS created_by_name,
             c.name AS customer_name, c.code AS customer_code,
             CASE WHEN so.so_number LIKE 'SO-POS-%' THEN 'POS' ELSE 'SO' END AS source,
             inv.id AS invoice_id, inv.invoice_number, inv.status AS invoice_status, inv.total AS invoice_total, inv.paid_amount,
             (SELECT string_agg(DISTINCT pm.method, ' + ') FROM payments pm WHERE pm.invoice_id=inv.id) AS methods,
             (SELECT COUNT(*)::int FROM delivery_orders d WHERE d.so_id=so.id) AS do_count
      ${base} ORDER BY so.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p, limit, offset]);
    const agg=await pool.query(`
      SELECT COALESCE(SUM(so.total),0)::float AS total_nilai,
             COALESCE(SUM(COALESCE(inv.paid_amount,0)),0)::float AS total_terbayar,
             COUNT(*) FILTER (WHERE so.so_number LIKE 'SO-POS-%')::int AS jml_pos,
             COUNT(*) FILTER (WHERE so.so_number NOT LIKE 'SO-POS-%')::int AS jml_so
      ${base}`, p);
    // Breakdown metode: kalau filter metode aktif, breakdown ikut difilter agar konsisten.
    const bmParams=[...p];
    let bmCond='';
    if(method && method!=='Semua'){ bmParams.push(method); bmCond=` AND pm.method=$${bmParams.length}`; }
    const byMethod=await pool.query(`
      SELECT pm.method, COUNT(DISTINCT pm.id)::int AS n, COALESCE(SUM(pm.amount),0)::float AS amount
        FROM payments pm JOIN invoices i ON i.id = pm.invoice_id
       WHERE i.so_id IN (SELECT so.id ${base})${bmCond}
       GROUP BY pm.method ORDER BY amount DESC`, bmParams);
    res.json({ data:data.rows, total:cnt.rows[0].n, summary:{ ...agg.rows[0], by_method: byMethod.rows }, scope: posOnly? 'POS_MILIK_SAYA':'SEMUA' });
  }catch(e){ console.error('[orders history]',e); res.status(500).json({error:e.message}); }
});

// Link lacak publik (tanpa login) untuk pelanggan: token acak per order.
router.post('/orders/:id/track-link', async (req,res)=>{
  await ensureTrackCols();
  try{
    const so = await pool.query('SELECT id, so_number, track_token FROM sales_orders WHERE id=$1',[req.params.id]);
    if(!so.rows[0]) return res.status(404).json({error:'Order tidak ditemukan'});
    let token = so.rows[0].track_token;
    if(!token || req.body?.regenerate){
      token = crypto.randomBytes(16).toString('hex');
      await pool.query('UPDATE sales_orders SET track_token=$1, track_enabled=true WHERE id=$2',[token, req.params.id]);
    } else {
      await pool.query('UPDATE sales_orders SET track_enabled=true WHERE id=$1',[req.params.id]);
    }
    res.json({ ok:true, token, path:'/lacak/'+token, so_number:so.rows[0].so_number });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/orders/:id/track-link', async (req,res)=>{
  await ensureTrackCols();
  try{ await pool.query('UPDATE sales_orders SET track_enabled=false WHERE id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/orders/:id', async (req,res)=>{
  await ensureTrackCols();
  const so=await pool.query('SELECT so.*, c.name as customer_name, c.phone as customer_phone, c.code as customer_code FROM sales_orders so JOIN customers c ON c.id=so.customer_id WHERE so.id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'Not found'});
  const details=await pool.query('SELECT d.*, p.name as product_name, p.sku, u.code as unit_code FROM so_details d JOIN products p ON p.id=d.product_id LEFT JOIN units u ON u.id=d.unit_id WHERE d.so_id=$1',[req.params.id]);
  const inv=await pool.query('SELECT * FROM invoices WHERE so_id=$1 ORDER BY id DESC LIMIT 1',[req.params.id]);
  // Riwayat pembayaran (metode, bank, tanggal) untuk detail order
  const pays=await pool.query(`SELECT p.id, p.payment_number, p.type, p.payment_date, p.method, p.amount, p.notes,
      b.bank_name, b.account_no
    FROM payments p
    LEFT JOIN bank_accounts b ON b.id=p.bank_account_id
    WHERE p.invoice_id IN (SELECT id FROM invoices WHERE so_id=$1)
    ORDER BY p.id`,[req.params.id]);
  // Flag tanda tangan saja (tanpa base64) - dipakai halaman detail SO untuk
  // menampilkan status TTD gudang/driver/penerima + tombol konfirmasi kantor.
  const dos=await pool.query(`SELECT id, do_number, status, delivery_date, vehicle_no, driver_id,
      received_by, delivered_at, invoice_handed, distance_km, est_zone,
      (sender_signature_url IS NOT NULL) AS sender_signed, sender_signed_by, sender_signed_at,
      (driver_signature_url IS NOT NULL) AS driver_signed,
      (pod_signature_url IS NOT NULL) AS pod_signed,
      office_confirmed_at
    FROM delivery_orders WHERE so_id=$1 ORDER BY id DESC`,[req.params.id]);
  res.json({...so.rows[0], details: details.rows, invoice: inv.rows[0]||null, deliveries: dos.rows, payments: pays.rows});
});
router.post('/orders', async (req,res)=>{
  await ensureDeliveryEst();
  const {customer_id, branch_id, delivery_date, delivery_address, delivery_lat, delivery_lng, notes, items, discount, discount_percent, voucher_code, dp_percent} = req.body;
  if(!items||!items.length) return res.status(400).json({error:'Items required'});
  if(customer_id){
    // gate: HOLD / limit - blok bikin SO baru
    const so_number_tmp = 'SO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
    // hitung total dulu untuk cek limit (tanpa commit)
    let tmpSub=0; for(const it of items) tmpSub+=parseFloat(it.qty)*parseFloat(it.unit_price);
    const tmpPct=Math.min(100,Math.max(0,parseInt(discount_percent||0,10)||0)); const tmpV=voucherAmt(voucher_code);
    const tmpDisc = (tmpPct>0||voucher_code) ? Math.min(tmpSub, Math.round(tmpSub*tmpPct/100)+tmpV) : parseFloat(discount||0);
    const tmpTotal=(tmpSub-tmpDisc)*1.11;
    const block=await assertCustomerCredit(customer_id, tmpTotal);
    if(block) return res.status(403).json({error:block.reason, blocked:true});
    void so_number_tmp;
  }
  const so_number = 'SO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
  let subtotal=0;
  for(const it of items){ subtotal += parseFloat(it.qty)*parseFloat(it.unit_price); }
  const discPct=Math.min(100,Math.max(0,parseInt(discount_percent||0,10)||0));
  const vAmt=voucherAmt(voucher_code);
  const discPctAmt=Math.round(subtotal*discPct/100);
  const pctPlusVoucher = discPct>0 || voucher_code ? Math.min(subtotal, discPctAmt+vAmt) : null;
  const disc = pctPlusVoucher!=null ? pctPlusVoucher : parseFloat(discount||0);
  const taxable=subtotal-disc;
  const tax = taxable*0.11;
  const total = taxable + tax;
  // Ambang diskon mengikuti approval matrix (default 10%), bukan angka hardcode.
  const discRule = await getRule('SALES_ORDER','DISCOUNT_PCT').catch(()=>null);
  const discLimitPct = discRule ? Number(discRule.threshold) : 10;
  const status = subtotal>0 && (disc/subtotal*100) > discLimitPct ? 'PENDING' : 'APPROVED';
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS dp_percent INT DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0`).catch(()=>{});
  const ins=await pool.query('INSERT INTO sales_orders (so_number, customer_id, branch_id, so_date, delivery_date, delivery_address, delivery_lat, delivery_lng, status, subtotal, discount, discount_pct, voucher_code, dp_percent, tax, total, notes, created_by) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id',[so_number, customer_id, branch_id||1, delivery_date, delivery_address||null, delivery_lat!=null?parseFloat(delivery_lat):null, delivery_lng!=null?parseFloat(delivery_lng):null, status, subtotal, disc, discPct, voucher_code?String(voucher_code).toUpperCase():null, parseInt(dp_percent||0)||0, tax, total, notes, req.user.id]);
  const soId=ins.rows[0].id;
  // Diskon melewati ambang → masuk antrian approval (bukan cuma status PENDING).
  if(status==='PENDING'){
    try{ await createApproval({ entityType:'SALES_ORDER', entityId:soId, requesterId:req.user.id, roles: discRule?.approver_roles || 'direktur' }); }
    catch(e){ console.error('[approval SO]', e.message); }
  }
  for(const it of items){
    const lineTotal = parseFloat(it.qty)*parseFloat(it.unit_price) - (parseFloat(it.discount_amt||0));
    const lineTax = lineTotal*0.11;
    const pid = it.product_id ? parseInt(it.product_id) : null;
    if(pid){
      await pool.query('INSERT INTO so_details (so_id, product_id, unit_id, qty, unit_price, discount_pct, discount_amt, tax_amt, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[soId, pid, it.unit_id||1, it.qty, it.unit_price, it.discount_pct||0, it.discount_amt||0, lineTax, lineTotal+lineTax]);
      // Stok fisik baru berkurang saat DO keluar (createDelivery) — di sini hanya reservasi
      await pool.query('UPDATE stocks SET qty_reserved = qty_reserved + $1 WHERE product_id=$2 AND warehouse_id=$3', [it.qty, pid, 1]);
    } else {
      // barang ketik manual - tanpa stok, simpan tanpa product_id (nama ikut di notes SO jika ada)
      await pool.query('INSERT INTO so_details (so_id, product_id, unit_id, qty, unit_price, discount_pct, discount_amt, tax_amt, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[soId, null, it.unit_id||1, it.qty, it.unit_price, it.discount_pct||0, it.discount_amt||0, lineTax, lineTotal+lineTax]);
    }
  }
  res.json({id:soId, so_number, status});
});
router.post('/orders/:id/approve', async (req,res)=>{
  const so=await pool.query('SELECT status FROM sales_orders WHERE id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  if(so.rows[0].status!=='PENDING') return res.status(400).json({error:'Hanya PENDING yang bisa di-approve (status sekarang: '+so.rows[0].status+')'});
  await pool.query("UPDATE sales_orders SET status='APPROVED', approved_by=$1, approved_at=NOW() WHERE id=$2",[req.user.id, req.params.id]);
  res.json({ok:true});
});
router.post('/orders/:id/cancel', async (req,res)=>{ await pool.query("UPDATE sales_orders SET status='CANCELLED' WHERE id=$1",[req.params.id]); res.json({ok:true}); });
router.post('/orders/:id/picking', async (req,res)=>{
  const so=await pool.query('SELECT status FROM sales_orders WHERE id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  const st=so.rows[0].status;
  // PARTIAL legacy tetap diizinkan masuk PICKING untuk data lama
  if(!['APPROVED','SHIPPED','PARTIAL'].includes(st)) return res.status(400).json({error:'Hanya APPROVED/SHIPPED yang bisa masuk PICKING (status sekarang: '+st+')'});
  await pool.query("UPDATE sales_orders SET status='PICKING' WHERE id=$1",[req.params.id]);
  res.json({ok:true, status:'PICKING'});
});
router.post('/orders/:id/complete', async (req,res)=>{
  const so=await pool.query('SELECT * FROM sales_orders WHERE id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  if(so.rows[0].status==='COMPLETED') return res.json({ok:true, already:true});
  const invs=await pool.query('SELECT * FROM invoices WHERE so_id=$1',[req.params.id]);
  if(!invs.rows.length) return res.status(400).json({error:'Belum ada invoice untuk SO ini'});
  const unpaid=invs.rows.filter(r=> String(r.status)!=='PAID' || parseFloat(r.paid_amount)+0.5 < parseFloat(r.total));
  if(unpaid.length){
    const sisa=unpaid.reduce((s,r)=> s + (parseFloat(r.total)-parseFloat(r.paid_amount)),0);
    return res.status(400).json({error:`Belum lunas - ${unpaid.length} invoice belum PAID, sisa Rp ${new Intl.NumberFormat('id-ID').format(sisa)}`});
  }
  // Konfirmasi Pengirim/Gudang/Kantor wajib untuk semua DO SO ini sebelum COMPLETED
  await ensureSignatureCols();
  const dos=await pool.query("SELECT do_number, office_confirmed_at FROM delivery_orders WHERE so_id=$1 AND status<>'CANCELLED'",[req.params.id]);
  const unconfirmed=dos.rows.filter(d=>!d.office_confirmed_at);
  if(unconfirmed.length){
    return res.status(400).json({error:'Konfirmasi Pengirim/Gudang/Kantor belum lengkap untuk DO: '+unconfirmed.map(d=>d.do_number).join(', ')+' — konfirmasi + tanda tangan dulu sebelum SO COMPLETED.'});
  }
  await pool.query("UPDATE sales_orders SET status='COMPLETED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});

router.get('/deliveries', async (req,res)=>{
  await ensureDeliveryEst();
  const so_id=req.query.so_id;
  if(so_id){
    const r=await pool.query('SELECT d.*, c.name as customer_name, so.so_number FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id WHERE d.so_id=$1 ORDER BY d.id DESC',[so_id]);
    return res.json(r.rows);
  }
  const r=await pool.query('SELECT d.*, c.name as customer_name, so.so_number FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id ORDER BY d.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/deliveries', async (req,res)=>{
  await ensureDeliveryEst();
  try{
    const out = await createDelivery({ ...req.body, created_by: req.user.id, sender_signed_by: req.body.sender_signed_by || req.user.username || req.user.name });
    res.json(out);
  }catch(e){
    if(e instanceof DeliveryError) return res.status(e.status).json({error:e.message});
    console.error('[deliveries]',e);
    res.status(500).json({error:e.message});
  }
});

// Konfirmasi Pengirim/Gudang/Kantor - versi modul sales supaya sales/kasir/finance
// bisa konfirmasi dari Detail SO tanpa perlu akses modul logistik. Logika sama
// dengan POST /api/logistics/deliveries/:id/confirm-office.
router.post('/deliveries/:id/confirm-office', rbac('warehouse','finance','sales','sales_trading','super_admin','direktur'), async (req,res)=>{
  await ensureSignatureCols();
  const { sender_signature_url, sender_signed_by, notes } = req.body || {};
  try{
    const chk=await pool.query('SELECT id, do_number, status, sender_signature_url, sender_signed_by, office_confirmed_at FROM delivery_orders WHERE id=$1',[req.params.id]);
    if(!chk.rows[0]) return res.status(404).json({error:'DO tidak ditemukan'});
    const doRow=chk.rows[0];
    const sig = sender_signature_url || doRow.sender_signature_url || null;
    if(!sig || !String(sig).startsWith('data:')) return res.status(400).json({error:'Tanda tangan Pengirim/Gudang wajib'});
    if(!String(sig).startsWith('data:image/')) return res.status(400).json({error:'Format tanda tangan pengirim tidak valid'});
    if(String(sig).length > 2_000_000) return res.status(400).json({error:'Ukuran tanda tangan terlalu besar'});
    const by = String(sender_signed_by||doRow.sender_signed_by||'').trim() || (req.user?.name || req.user?.username || '');
    if(!by) return res.status(400).json({error:'Nama petugas gudang/pengirim wajib diisi'});
    if(doRow.status!=='DELIVERED' && doRow.status!=='INVOICED') return res.status(400).json({error:'DO harus DELIVERED/INVOICED dulu sebelum dikonfirmasi (status sekarang: '+doRow.status+')'});
    await pool.query(`UPDATE delivery_orders
        SET sender_signature_url=$1,
            sender_signed_at=COALESCE(sender_signed_at, NOW()),
            sender_signed_by=$2,
            office_confirmed_at=NOW(), office_confirmed_by=$4
      WHERE id=$3`,[sig, by, req.params.id, by]);
    res.json({ok:true, do_number:doRow.do_number, sender_signed_by:by, office_confirmed_at:new Date().toISOString(), notes:notes||null});
  }catch(e){ console.error('[confirm-office sales]',e); res.status(500).json({error:e.message}); }
});

// Detail invoice + item + pembayaran (dipakai struk thermal & halaman riwayat)
router.get('/invoices/:id', async (req,res)=>{
  try{
    const inv = await pool.query(`
      SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
             so.so_number, COALESCE(e.name, u.username) AS cashier_name, u.username AS cashier_username
        FROM invoices i
        LEFT JOIN customers c ON c.id=i.customer_id
        LEFT JOIN sales_orders so ON so.id=i.so_id
        LEFT JOIN users u ON u.id = so.created_by
        LEFT JOIN employees e ON e.id = u.employee_id
       WHERE i.id=$1`, [req.params.id]);
    if(!inv.rows[0]) return res.status(404).json({error:'Invoice tidak ditemukan'});
    const items = await pool.query(`
      SELECT d.id, d.product_id, d.qty, d.unit_price, d.total, p.sku, p.name,
             un.name AS unit
        FROM invoice_details d
        LEFT JOIN products p ON p.id=d.product_id
        LEFT JOIN units un ON un.id=p.base_unit_id
       WHERE d.invoice_id=$1 ORDER BY d.id`, [req.params.id]);
    const payments = await pool.query(`
      SELECT id, payment_number, payment_date, method, amount
        FROM payments WHERE invoice_id=$1 ORDER BY payment_date, id`, [req.params.id]);
    res.json({ ...inv.rows[0], items: items.rows, payments: payments.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/invoices', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const status=req.query.status;
  const source=req.query.source||'';
  const search=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND inv.status=$'+p.length; }
  if(source==='pos'){ where+=" AND inv.invoice_number LIKE 'INV-POS-%'"; }
  if(search){ p.push('%'+search+'%'); where+=' AND (inv.invoice_number ILIKE $'+p.length+' OR c.name ILIKE $'+p.length+' OR c.code ILIKE $'+p.length+' OR dinv.do_number ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM invoices inv JOIN customers c ON c.id=inv.customer_id LEFT JOIN delivery_orders dinv ON dinv.id=inv.do_id '+where,p);
  const data=await pool.query("SELECT inv.*, c.name as customer_name, c.code as customer_code, c.phone as customer_phone, so.delivery_address, so.notes, so.so_number, so.status as so_status, dinv.do_number, CASE WHEN inv.invoice_number LIKE 'INV-POS-%' THEN true ELSE false END as is_pos FROM invoices inv JOIN customers c ON c.id=inv.customer_id LEFT JOIN sales_orders so ON so.id=inv.so_id LEFT JOIN delivery_orders dinv ON dinv.id=inv.do_id "+where+" ORDER BY inv.id DESC LIMIT $"+(p.length+1)+" OFFSET $"+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/invoices', async (req,res)=>{
  const {so_id: bodySoId, do_id: bodyDoId, customer_id: bodyCustId, due_date, items: bodyItems, discount_percent: bodyDiscPct, voucher_code: bodyVoucher, dp_percent: bodyDpPct, discount: bodyDisc} = req.body;
  let so_id = bodySoId ? parseInt(bodySoId) : null;
  let do_id = bodyDoId ? parseInt(bodyDoId) : null;
  let customer_id = bodyCustId ? parseInt(bodyCustId) : null;
  let items = Array.isArray(bodyItems) ? bodyItems : null;
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    let doRow=null;
    if(do_id){
      const dr=await client.query('SELECT * FROM delivery_orders WHERE id=$1 FOR UPDATE',[do_id]);
      if(!dr.rows[0]){ await client.query('ROLLBACK'); return res.status(404).json({error:'DO tidak ditemukan'}); }
      doRow=dr.rows[0];
      if(doRow.status==='INVOICED'){ await client.query('ROLLBACK'); return res.status(400).json({error:'DO '+doRow.do_number+' sudah INVOICED'}); }
      if(doRow.status!=='DELIVERED'){ await client.query('ROLLBACK'); return res.status(400).json({error:'DO harus DITERIMA (DELIVERED) dulu sebelum buat Invoice. Status sekarang: '+doRow.status}); }
      // Driver wajib serahkan invoice ke penerima (checkbox "Kirim/Serah Invoice" saat POD)
      if(!doRow.invoice_handed){ await client.query('ROLLBACK'); return res.status(400).json({error:'Driver belum konfirmasi serah invoice ke penerima (Kirim Invoice) untuk '+doRow.do_number}); }
      if(!customer_id) customer_id = doRow.customer_id;
      if(!so_id) so_id = doRow.so_id;
      // auto-derive items dari DO jika tidak dikirim
      if(!items || !items.length){
        const dd=await client.query('SELECT dd.product_id, dd.qty, p.name FROM do_details dd JOIN products p ON p.id=dd.product_id WHERE dd.do_id=$1',[do_id]);
        if(!dd.rows.length){ await client.query('ROLLBACK'); return res.status(400).json({error:'DO tidak punya item'}); }
        items=[];
        for(const r of dd.rows){
          // cari harga dari SO detail, fallback product_units
          let unit_price=0;
          if(so_id){
            const sp=await client.query('SELECT unit_price FROM so_details WHERE so_id=$1 AND product_id=$2 LIMIT 1',[so_id, r.product_id]);
            if(sp.rows[0]) unit_price=parseFloat(sp.rows[0].unit_price);
          }
          if(!unit_price){
            const pu=await client.query('SELECT selling_price FROM product_units WHERE product_id=$1 ORDER BY id LIMIT 1',[r.product_id]);
            unit_price = pu.rows[0] ? parseFloat(pu.rows[0].selling_price) : 65000;
          }
          items.push({product_id: r.product_id, qty: parseFloat(r.qty), unit_price});
        }
      }
    }
    if(!customer_id) { await client.query('ROLLBACK'); return res.status(400).json({error:'customer_id wajib (atau kirim do_id)'}); }
    if(!items || !items.length){ await client.query('ROLLBACK'); return res.status(400).json({error:'Items required'}); }
    const inv_number='INV-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
    let subtotal=0; for(const it of items) subtotal+= parseFloat(it.qty)*parseFloat(it.unit_price);
    const discPct=Math.min(100,Math.max(0,parseInt(bodyDiscPct||0,10)||0));
    const vAmt=voucherAmt(bodyVoucher);
    const discPctAmt=Math.round(subtotal*discPct/100);
    const discFromPctVoucher = (bodyDiscPct!=null||bodyVoucher) ? Math.min(subtotal, discPctAmt+vAmt) : null;
    const discAmt = discFromPctVoucher!=null ? discFromPctVoucher : parseFloat(bodyDisc||0);
    const discount=Math.min(subtotal, Math.max(0, discAmt));
    const taxable=subtotal-discount;
    const tax=Math.round(taxable*0.11); const total=taxable+tax;
    const dpPct=Math.min(100,Math.max(0,parseInt(bodyDpPct||0,10)||0));
    const dpAmt = dpPct>0 ? Math.round(total*dpPct/100) : 0;
    const initPaid = dpAmt;
    const invStatus = dpPct>0 ? 'PARTIAL' : 'SENT';
    const due = due_date||new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
    const ins=await client.query("INSERT INTO invoices (invoice_number, customer_id, so_id, do_id, invoice_date, due_date, status, subtotal, discount, discount_pct, voucher_code, tax, total, paid_amount) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",[inv_number, customer_id, so_id, do_id, due, invStatus, subtotal, discount, discPct, bodyVoucher?String(bodyVoucher).toUpperCase():null, tax, total, initPaid]);
    const invId=ins.rows[0].id;
    for(const it of items) await client.query('INSERT INTO invoice_details (invoice_id, product_id, qty, unit_price, total) VALUES ($1,$2,$3,$4,$5)',[invId, it.product_id, it.qty, it.unit_price, parseFloat(it.qty)*parseFloat(it.unit_price)]);
    await client.query("INSERT INTO journal_entries (entry_number, entry_date, reference_type, reference_id, description, total_debit, total_credit, posted) VALUES ($1,CURRENT_DATE,'INVOICE',$2,$3,$4,$4,true)", ['JE-'+Date.now(), invId, 'Invoice '+inv_number, total]);
    if(initPaid>0){ await client.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,'TRANSFER',$3,$4)",['PAY-INV-'+Date.now(), invId, initPaid, req.user.id]); }
    if(doRow){
      await client.query("UPDATE delivery_orders SET status='INVOICED' WHERE id=$1",[do_id]);
      // SO TIDAK auto COMPLETED saat Invoice dibuat (SENT/PARTIAL) - tunggu PAID lunas.
    }
    await client.query('COMMIT');
    res.json({id:invId, invoice_number: inv_number, do_invoiced: !!doRow, total, subtotal, discount, discount_pct: discPct, voucher_code: bodyVoucher||null, dp_percent: dpPct, dp_amount: initPaid, remaining: total-initPaid, status: invStatus, tax, est_cost: doRow?.est_cost, est_cost_dalam: doRow?.est_cost_dalam, est_cost_luar: doRow?.est_cost_luar});
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[invoices]',e); res.status(500).json({error:e.message}); }
  finally{ client.release(); }
});
router.post('/invoices/:id/pay', async (req,res)=>{
  const {amount, method} = req.body;
  const inv=await pool.query('SELECT * FROM invoices WHERE id=$1',[req.params.id]);
  if(!inv.rows[0]) return res.status(404).json({error:'Not found'});
  const remaining = parseFloat(inv.rows[0].total) - parseFloat(inv.rows[0].paid_amount);
  if(remaining <= 0.5) return res.status(400).json({error:'Invoice sudah lunas'});
  // Konfirmasi Pengirim/Gudang/Kantor wajib sebelum invoice DO boleh dilunasi
  if(inv.rows[0].do_id){
    await ensureSignatureCols();
    const dr=await pool.query('SELECT do_number, office_confirmed_at FROM delivery_orders WHERE id=$1',[inv.rows[0].do_id]);
    const msg=requireDoOfficeConfirmed(dr.rows[0]);
    if(msg) return res.status(400).json({error:msg});
  }
  const payAmt = parseFloat(amount);
  if(isNaN(payAmt) || payAmt <=0) return res.status(400).json({error:'Nominal tidak valid'});
  // ponytail: full payment only - harus bayar sisa penuh, upgrade ke partial bertahap jika butuh cicilan
  if(Math.abs(payAmt - remaining) > 1) return res.status(400).json({error:`Harus bayar full sisa Rp ${new Intl.NumberFormat('id-ID').format(remaining)}`});
  const pay_no='PAY-'+Date.now();
  await pool.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,$3,$4,$5)",[pay_no, req.params.id, method||'TRANSFER', payAmt, req.user.id]);
  await pool.query("UPDATE invoices SET paid_amount = paid_amount + $1, status = CASE WHEN paid_amount + $1 >= total - 0.5 THEN 'PAID' ELSE 'PARTIAL' END WHERE id=$2",[payAmt, req.params.id]);
  // auto-complete SO hanya jika SEMUA invoice untuk SO tersebut sudah PAID/lunas
  const soId=inv.rows[0].so_id;
  if(soId){
    const chk=await pool.query('SELECT status FROM invoices WHERE id=$1',[req.params.id]);
    if(chk.rows[0]?.status==='PAID'){
      const unpaid=await pool.query(`SELECT COUNT(*) FROM invoices WHERE so_id=$1 AND status!='PAID'`,[soId]);
      if(parseInt(unpaid.rows[0].count)===0){
        // pastikan ada minimal 1 invoice (sudah PAID) dan tidak ada yang belum lunas
        const anyInv=await pool.query('SELECT COUNT(*) FROM invoices WHERE so_id=$1',[soId]);
        if(parseInt(anyInv.rows[0].count)>0){
          await pool.query("UPDATE sales_orders SET status='COMPLETED' WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED')",[soId]);
        }
      }
    }
  }
  res.json({ok:true});
});

function voucherAmt(code){ if(!code) return 0; const c=String(code).trim().toUpperCase(); const map={ 'VOUCHER10':10000,'VOUCHER50':50000,'DISKON10K':10000,'HEMAT20':20000,'PROMO20K':20000,'DISKON50K':50000 }; if(map[c]!=null) return map[c]; const n=parseInt(c.replace(/[^0-9]/g,''),10); if(!isNaN(n) && String(n)===c) return n; if(!isNaN(n) && c.startsWith('RP')) return n; return 0; }
router.post('/pos', async (req,res)=>{
  const client = await pool.connect();
  try{
    const {customer_id, items, payment_method, delivery_address, delivery_lat, delivery_lng, notes, dp_percent, discount_percent, voucher_code, client_ref} = req.body;
    if(!items||!items.length) return res.status(400).json({error:'Items required'});
    if(customer_id){
      let tmpSub2=0; for(const it of items) tmpSub2+=parseFloat(it.qty)*parseFloat(it.unit_price);
      const tmpPct2=Math.min(100,Math.max(0,parseInt(discount_percent||0,10)||0)); const tmpV2=voucherAmt(voucher_code);
      const tmpDisc2=Math.min(tmpSub2, Math.round(tmpSub2*tmpPct2/100)+tmpV2);
      const tmpTotal2=(tmpSub2-tmpDisc2)*1.11;
      const block2=await assertCustomerCredit(customer_id, tmpTotal2);
      if(block2) return res.status(403).json({error:block2.reason, blocked:true});
    }
    // Idempotensi transaksi offline: client_ref dikirim browser, jadi kirim ulang
    // (koneksi putus setelah server menyimpan) tidak membuat penjualan ganda.
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_ref VARCHAR(64)`).catch(()=>{});
    if(client_ref){
      const dup = await client.query(`SELECT invoice_number, total, subtotal, discount, paid_amount, status FROM invoices WHERE client_ref=$1 LIMIT 1`, [String(client_ref)]);
      if(dup.rows[0]){
        const d = dup.rows[0];
        return res.json({ duplicate:true, invoice_number:d.invoice_number, total:d.total, subtotal:d.subtotal,
          discTotal:d.discount, dp_amount:d.paid_amount,
          remaining_amount: Number(d.total)-Number(d.paid_amount),
          status:d.status, so_status: d.status==='PAID' ? 'COMPLETED' : 'PARTIAL' });
      }
    }
    await client.query('BEGIN');
    // Validasi stok + potong stok atomik per item (kunci baris stok dulu)
    const WH=1;
    for(const it of items){
      const pid=parseInt(it.product_id);
      const qty=parseFloat(it.qty);
      if(!pid || !(qty>0)) { await client.query('ROLLBACK'); return res.status(400).json({error:'Item tidak valid'}); }
      const s=await client.query('SELECT qty_on_hand, qty_reserved FROM stocks WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE',[pid, WH]);
      const avail = s.rows[0] ? (parseFloat(s.rows[0].qty_on_hand||0) - parseFloat(s.rows[0].qty_reserved||0)) : 0;
      if(!s.rows[0] || avail + 1e-9 < qty){
        const nm=await client.query('SELECT name FROM products WHERE id=$1',[pid]);
        await client.query('ROLLBACK');
        return res.status(400).json({error:`Stok tidak cukup untuk ${nm.rows[0]?.name||('produk '+pid)}: tersedia ${Math.max(0,avail)}, diminta ${qty}`});
      }
      const up=await client.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=$3 RETURNING qty_on_hand',[qty, pid, WH]);
      await client.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_out, balance_qty, created_by) VALUES ($1,$2,'OUT','POS',NULL,$3,$4,$5)",[pid, WH, qty, up.rows[0]?.qty_on_hand ?? 0, req.user.id]);
    }
    const so_number='SO-POS-'+Date.now();
    let subtotal=0; for(const it of items) subtotal+= parseFloat(it.qty)*parseFloat(it.unit_price);
    const discPct=Math.min(100,Math.max(0,parseInt(discount_percent||0,10)||0));
    const vAmt=voucherAmt(voucher_code);
    const discPctAmt=Math.round(subtotal*discPct/100);
    const discTotal=Math.min(subtotal, discPctAmt+vAmt);
    const taxable=subtotal-discTotal;
    const tax=Math.round(taxable*0.11); const total=taxable+tax;
    // robust parse: JSON may send string
    const dpPctRaw = dp_percent;
    const dpPct = dpPctRaw==null||dpPctRaw==='' ? 0 : parseInt(dpPctRaw,10);
    const dpPctValid = isNaN(dpPct) ? 0 : Math.min(100, Math.max(0, dpPct));
    const dp = dpPctValid>0 ? Math.round(total*dpPctValid/100) : total;
    const isPartial = dp + 0.5 < total;
    const soStatus = isPartial ? 'PARTIAL' : 'COMPLETED';
    const invStatus = isPartial ? 'PARTIAL' : 'PAID';
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
    const soIns=await client.query("INSERT INTO sales_orders (so_number, customer_id, branch_id, so_date, delivery_address, delivery_lat, delivery_lng, notes, status, subtotal, discount, discount_pct, voucher_code, tax, total, created_by) VALUES ($1,$2,1,CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",[so_number, customer_id||4, delivery_address||null, delivery_lat?parseFloat(delivery_lat):null, delivery_lng?parseFloat(delivery_lng):null, notes||null, soStatus, subtotal, discTotal, discPct, voucher_code?String(voucher_code).toUpperCase():null, tax, total, req.user.id]);
    const soId=soIns.rows[0].id;
    // kaitkan movement POS ke SO id
    await client.query("UPDATE stock_movements SET reference_id=$1 WHERE reference_type='POS' AND reference_id IS NULL AND created_by=$2 AND movement_date >= NOW() - INTERVAL '5 minutes'",[soId, req.user.id]);
    for(const it of items){
      await client.query('INSERT INTO so_details (so_id, product_id, unit_id, qty, unit_price, total) VALUES ($1,$2,1,$3,$4,$5)',[soId, it.product_id, it.qty, it.unit_price, parseFloat(it.qty)*parseFloat(it.unit_price)]);
    }
    const invNo='INV-POS-'+Date.now();
    const invIns=await client.query("INSERT INTO invoices (invoice_number, customer_id, so_id, invoice_date, due_date, status, subtotal, discount, discount_pct, voucher_code, tax, total, paid_amount, client_ref) VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",[invNo, customer_id||4, soId, invStatus, subtotal, discTotal, discPct, voucher_code?String(voucher_code).toUpperCase():null, tax, total, dp, client_ref?String(client_ref):null]);
    await client.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,$3,$4,$5)",['PAY-POS-'+Date.now(), invIns.rows[0].id, payment_method||'CASH', dp, req.user.id]);
    await client.query('COMMIT');
    res.json({so_number, client_ref: client_ref||null, invoice_number: invNo, total, subtotal, discTotal, discPct, voucherAmt: vAmt, dp_amount: dp, remaining_amount: total - dp, status: invStatus, so_status: soStatus, dp_percent: dpPctValid});
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[POS] err',e); res.status(500).json({error:e.message}); }
  finally{ client.release(); }
});

export default router;
