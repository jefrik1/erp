import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();

// ensure pod columns + Plan B estimasi
let ensured=false;
async function ensurePodCols(){
  if(ensured) return;
  try{
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS pod_photo_url TEXT`);
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS pod_notes TEXT`);
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP`);
    await pool.query(`ALTER TABLE delivery_orders ALTER COLUMN pod_signature_url TYPE TEXT USING pod_signature_url::TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ALTER COLUMN pod_photo_url TYPE TEXT USING pod_photo_url::TEXT`).catch(()=>{});
    // Plan B estimasi (idempotent)
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_weight_ton DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_volume_m3 DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_zone VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost_dalam DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost_luar DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`UPDATE delivery_orders SET est_cost_dalam = COALESCE(est_cost_dalam, 150000 + COALESCE(est_weight_ton,0)*120000) WHERE est_cost_dalam IS NULL AND est_weight_ton IS NOT NULL`).catch(()=>{});
    await pool.query(`UPDATE delivery_orders SET est_cost_luar  = COALESCE(est_cost_luar, 600000 + COALESCE(est_weight_ton,0)*350000) WHERE est_cost_luar IS NULL AND est_weight_ton IS NOT NULL`).catch(()=>{});
    ensured=true;
  }catch(e){ console.error('[logistics ensure]',e.message); }
}

router.get('/delivered-notes', async (req,res)=>{
  await ensurePodCols();
  try{
    const {limit,offset} = paginate(req);
    const r=await pool.query(`SELECT d.id, d.do_number, d.delivered_at, d.received_by, d.status, d.pod_photo_url, c.name as customer_name, so.so_number, d.vehicle_no
      FROM delivery_orders d
      LEFT JOIN customers c ON c.id=d.customer_id
      LEFT JOIN sales_orders so ON so.id=d.so_id
      WHERE d.status IN ('DELIVERED','INVOICED') ORDER BY d.delivered_at DESC LIMIT $1 OFFSET $2`,[limit||20, offset||0]);
    const cnt=await pool.query(`SELECT COUNT(*) FROM delivery_orders WHERE status IN ('DELIVERED','INVOICED')`);
    res.json({data:r.rows, total:parseInt(cnt.rows[0].count)});
  }catch(e){ console.error('[delivered-notes]',e); res.json({data:[], total:0}); }
});
router.get('/deliveries', async (req,res)=>{
  try{
    await ensurePodCols();
    // Kolom tanda tangan (base64) sengaja tidak ikut di daftar supaya payload ringan;
    // UI hanya butuh status sudah/belum ditandatangani.
    const r=await pool.query(`SELECT d.id, d.do_number, d.so_id, d.customer_id, d.warehouse_id,
        d.delivery_date, d.vehicle_no, d.driver_id, d.status, d.received_by, d.delivered_at, d.invoice_handed,
        d.delivery_address, d.delivery_lat, d.delivery_lng, d.distance_km,
        d.est_weight_ton, d.est_volume_m3, d.est_zone, d.est_cost, d.est_cost_dalam, d.est_cost_luar,
        (d.sender_signature_url IS NOT NULL) AS sender_signed,
        (d.driver_signature_url IS NOT NULL) AS driver_signed,
        (d.pod_signature_url IS NOT NULL) AS pod_signed,
        d.sender_signed_by, d.sender_signed_at, d.office_confirmed_at,
        c.name as customer_name, so.so_number, e.name as driver_name
      FROM delivery_orders d
      LEFT JOIN customers c ON c.id=d.customer_id
      LEFT JOIN sales_orders so ON so.id=d.so_id
      LEFT JOIN employees e ON e.id=d.driver_id
      ORDER BY d.id DESC LIMIT 50`);
    res.json(r.rows);
  }catch(e){ console.error('[deliveries]',e); res.status(500).json({error:e.message}); }
});
router.get('/deliveries/:id', async (req,res)=>{
  try{
    await ensurePodCols();
    const r=await pool.query(`SELECT d.*, c.name as customer_name, c.phone as customer_phone, so.so_number, so.total as so_total, e.name as driver_name
      FROM delivery_orders d
      LEFT JOIN customers c ON c.id=d.customer_id
      LEFT JOIN sales_orders so ON so.id=d.so_id
      LEFT JOIN employees e ON e.id=d.driver_id WHERE d.id=$1`,[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'DO not found'});
    const items=await pool.query(`SELECT dd.*, p.name as product_name, p.sku FROM do_details dd JOIN products p ON p.id=dd.product_id WHERE dd.do_id=$1`,[req.params.id]);
    res.json({...r.rows[0], items:items.rows});
  }catch(e){ console.error('[deliveries:id]',e); res.status(500).json({error:e.message}); }
});
router.get('/vehicles', async (req,res)=>{ const r=await pool.query('SELECT v.*, e.name as driver_name FROM vehicles v LEFT JOIN employees e ON e.id=v.driver_id ORDER BY v.plat_no'); res.json(r.rows); });
router.get('/fleet-stats', async (req,res)=>{
  const tot=await pool.query('SELECT COUNT(*) FROM vehicles');
  const avail=await pool.query("SELECT COUNT(*) FROM vehicles WHERE status='AVAILABLE'");
  const intransit=await pool.query("SELECT COUNT(*) FROM delivery_orders WHERE status='IN_TRANSIT'");
  const delivered=await pool.query("SELECT COUNT(*) FROM delivery_orders WHERE status IN ('DELIVERED','INVOICED')");
  const invoiced=await pool.query("SELECT COUNT(*) FROM delivery_orders WHERE status='INVOICED'");
  res.json({ total: parseInt(tot.rows[0].count), available: parseInt(avail.rows[0].count), in_transit: parseInt(intransit.rows[0].count), delivered: parseInt(delivered.rows[0].count), invoiced: parseInt(invoiced.rows[0].count) });
});
router.post('/deliveries/:id/confirm-office', async (req,res)=>{
  await ensurePodCols();
  const {sender_signature_url, sender_signed_by, notes} = req.body;
  const chk=await pool.query('SELECT * FROM delivery_orders WHERE id=$1',[req.params.id]);
  if(!chk.rows[0]) return res.status(404).json({error:'DO not found'});
  const doRow=chk.rows[0];
  // Tanda tangan pengirim bisa dipakai ulang bila gudang sudah menandatangani saat
  // DO dibuat (barang keluar gudang) - kantor cukup mengonfirmasi.
  const sig = sender_signature_url || doRow.sender_signature_url || null;
  if(!sig || !String(sig).startsWith('data:')) return res.status(400).json({error:'Tanda tangan Pengirim/Gudang wajib'});
  if(!String(sig).startsWith('data:image/')) return res.status(400).json({error:'Format tanda tangan pengirim tidak valid'});
  if(String(sig).length > 2_000_000) return res.status(400).json({error:'Ukuran tanda tangan terlalu besar'});
  const by = String(sender_signed_by||doRow.sender_signed_by||'').trim() || (req.user?.name || req.user?.username || '');
  if(!by) return res.status(400).json({error:'Nama petugas gudang/pengirim wajib diisi'});
  if(doRow.status!=='DELIVERED' && doRow.status!=='INVOICED') return res.status(400).json({error:'Only DELIVERED/Invoiced DO can be confirmed by office'});
  await pool.query(`UPDATE delivery_orders
      SET sender_signature_url=$1,
          sender_signed_at=COALESCE(sender_signed_at, NOW()),
          sender_signed_by=$2,
          office_confirmed_at=NOW(), office_confirmed_by=$4
    WHERE id=$3`,[sig, by, req.params.id, by]);
  res.json({ok:true, sender_signature_url:sig, sender_signed_by:by, notes:notes||null});
});
router.post('/deliveries/:id/pod', async (req,res)=>{
  await ensurePodCols();
  const {received_by, signature_url, pod_signature_url, pod_photo_url, pod_notes, notes, invoice_handed} = req.body;
  const sig = pod_signature_url || signature_url || null;
  const photo = pod_photo_url || null;
  const note = pod_notes || notes || null;
  if(!received_by) return res.status(400).json({error:'Nama penerima wajib'});
  const chk=await pool.query('SELECT * FROM delivery_orders WHERE id=$1',[req.params.id]);
  if(!chk.rows[0]) return res.status(404).json({error:'DO not found'});
  if(chk.rows[0].status==='DELIVERED' || chk.rows[0].status==='INVOICED') return res.status(400).json({error:'DO sudah '+chk.rows[0].status});
  if(chk.rows[0].status!=='IN_TRANSIT') return res.status(400).json({error:'DO harus IN_TRANSIT dulu (status: '+chk.rows[0].status+')'});
  const client=await pool.connect();
  let soCompleted=false;
  try{
    await client.query('BEGIN');
    await client.query(`UPDATE delivery_orders SET status='DELIVERED', received_by=$1, pod_signature_url=$2, pod_photo_url=$3, pod_notes=$4, delivered_at=NOW()${invoice_handed ? ', invoice_handed=TRUE' : ''} WHERE id=$5`,[received_by, sig, photo, note, req.params.id]);
    if(chk.rows[0].vehicle_no){
      await client.query("UPDATE vehicles SET status='AVAILABLE' WHERE plat_no=$1",[chk.rows[0].vehicle_no]);
    }
    // SO TIDAK auto COMPLETED di POD - hanya setelah Invoice LUNAS (PAID). Biarkan PARTIAL.
    await client.query('COMMIT');
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[pod]',e); return res.status(500).json({error:e.message}); }
  finally{ client.release(); }
  const updated=await pool.query(`SELECT d.*, c.name as customer_name, so.so_number, so.status as so_status FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id WHERE d.id=$1`,[req.params.id]);
  res.json({ok:true, delivery: updated.rows[0], so_completed: soCompleted});
});

export default router;
