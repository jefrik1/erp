import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   PORTAL PUBLIK — lacak pesanan tanpa login (token acak per order).
   Hanya menampilkan status & tanggal. Tidak ada data internal (harga modal,
   catatan internal, TTD, data pelanggan lain).
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
export async function ensureTrackCols(){
  if(ensured) return;
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS track_token VARCHAR(48)`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS track_enabled BOOLEAN DEFAULT true`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS track_views INT DEFAULT 0`).catch(()=>{});
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_so_track_token ON sales_orders(track_token) WHERE track_token IS NOT NULL`).catch(()=>{});
  ensured = true;
}

const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const d = (v)=> v ? String(v).slice(0,10) : null;

router.get('/track/:token', async (req,res)=>{
  await ensureTrackCols();
  const token = String(req.params.token||'').trim();
  if(!/^[a-f0-9]{16,48}$/i.test(token)) return res.status(404).json({error:'Link tidak valid'});
  try{
    const so = await pool.query(`SELECT so.id, so.so_number, so.so_date, so.status, so.total, so.created_at, so.track_enabled,
        c.name AS customer_name
      FROM sales_orders so LEFT JOIN customers c ON c.id=so.customer_id
      WHERE so.track_token=$1 LIMIT 1`, [token]);
    const row = so.rows[0];
    if(!row || row.track_enabled===false) return res.status(404).json({error:'Pesanan tidak ditemukan atau link sudah dinonaktifkan'});
    const dos = await pool.query(`SELECT do_number, status, delivery_date, delivered_at, vehicle_no,
        (pod_signed_at IS NOT NULL) AS received
      FROM delivery_orders WHERE so_id=$1 ORDER BY id`, [row.id]).catch(()=>({rows:[]}));
    const inv = await pool.query(`SELECT invoice_number, status, total, paid_amount, due_date, invoice_date
      FROM invoices WHERE so_id=$1 ORDER BY id DESC LIMIT 1`, [row.id]).catch(()=>({rows:[]}));
    const invRow = inv.rows[0] || null;
    await pool.query('UPDATE sales_orders SET track_views = COALESCE(track_views,0)+1 WHERE id=$1',[row.id]).catch(()=>{});

    // Order POS tanpa DO (ambil di toko): tahap kirim/terima tidak relevan.
    const hasDo = dos.rows.length > 0;
    const timeline = [
      { key:'created', label:'Pesanan diterima', at:d(row.so_date), done:true },
      { key:'approved', label:'Disetujui', at:null, done:['APPROVED','PICKING','SHIPPED','COMPLETED'].includes(String(row.status).toUpperCase()) },
      { key:'picking', label:'Disiapkan di gudang', at:null, done:['PICKING','SHIPPED','COMPLETED'].includes(String(row.status).toUpperCase()) },
      ...(hasDo ? [
        { key:'shipped', label:'Dikirim', at: d(dos.rows.find(x=>x.delivery_date)?.delivery_date), done: dos.rows.some(x=>['SHIPPED','DELIVERED','IN_TRANSIT'].includes(String(x.status).toUpperCase())) },
        { key:'delivered', label:'Diterima', at: d(dos.rows.find(x=>x.delivered_at)?.delivered_at), done: dos.rows.some(x=>String(x.status).toUpperCase()==='DELIVERED') },
      ] : []),
      { key:'invoiced', label:'Invoice diterbitkan', at: d(invRow?.invoice_date), done: !!invRow },
      { key:'paid', label:'Pembayaran lunas', at: null, done: invRow && String(invRow.status).toUpperCase()==='PAID' },
    ];

    res.json({
      order: { so_number:row.so_number, date:d(row.so_date), status:row.status, total:Number(row.total)||0, customer:row.customer_name },
      deliveries: dos.rows.map(x=>({ do_number:x.do_number, status:x.status, date:d(x.delivery_date||x.delivered_at), vehicle:x.vehicle_no, received:!!x.received })),
      invoice: invRow ? { number:invRow.invoice_number, status:invRow.status, total:Number(invRow.total)||0, paid:Number(invRow.paid_amount)||0, due_date:d(invRow.due_date) } : null,
      timeline,
      total_fmt: rupiah(row.total),
      sisa_fmt: invRow ? rupiah(Math.max(0, Number(invRow.total)-Number(invRow.paid_amount))) : null,
    });
  }catch(e){ console.error('[public track]',e); res.status(500).json({error:'Gagal memuat data pesanan'}); }
});

export default router;
