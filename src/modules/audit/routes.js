import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;
const ACTION_LABEL = {
  CREATE:'Buat data', UPDATE:'Ubah data', DELETE:'Hapus data', APPROVE:'Setujui', REJECT:'Tolak',
  LOGIN:'Login', LOGOUT:'Logout', MIGRATE:'Migrasi sistem', MERGE:'Gabung data',
};
const ENTITY_LABEL = {
  SO:'Sales Order', PO:'Purchase Order', GRN:'Goods Receipt', INVOICE:'Invoice', PRODUCT:'Produk',
  CUSTOMER:'Pelanggan', SUPPLIER:'Supplier', STOCK_ADJUST:'Penyesuaian Stok', STOCK_IN:'Penambahan Stok',
  STOCK_OUT:'Pengurangan Stok', STOCK_SET:'Opname Stok', STOCK_DUPLICATE:'Perawatan Stok',
  MIGRATION:'Migrasi', SALES_RETURN:'Retur Penjualan', USER:'Pengguna', PRICE:'Harga',
};

// ------------------------------------------------------------------ JEJAK AUDIT
router.get('/logs', async (req,res)=>{
  const limit = Math.min(500, parseInt(req.query.limit||'50'));
  const offset = parseInt(req.query.offset||'0');
  const {q, user_id, entity_type, action, start, end} = req.query;
  let where='WHERE 1=1'; const p=[];
  if(q){
    p.push('%'+String(q).toLowerCase()+'%');
    where+=' AND (LOWER(COALESCE(u.username,\'\')) LIKE $'+p.length+' OR LOWER(al.entity_type) LIKE $'+p.length+
           ' OR LOWER(al.action) LIKE $'+p.length+' OR CAST(al.entity_id AS TEXT) LIKE $'+p.length+
           ' OR LOWER(COALESCE(al.new_value::text,\'\')) LIKE $'+p.length+')';
  }
  if(user_id){ p.push(user_id); where+=' AND al.user_id=$'+p.length; }
  if(req.query.user){ p.push(req.query.user); where+=' AND COALESCE(u.username,\'(sistem)\')=$'+p.length; }
  if(entity_type && entity_type!=='Semua'){ p.push(entity_type); where+=' AND al.entity_type=$'+p.length; }
  if(action && action!=='Semua'){ p.push(action); where+=' AND al.action=$'+p.length; }
  if(start){ p.push(start); where+=' AND al.created_at >= $'+p.length; }
  if(end){ p.push(end); where+=' AND al.created_at <= $'+p.length+'::date + 1'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id '+where,p);
    const r=await pool.query(
      `SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
       ${where} ORDER BY al.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({ data:r.rows, total:parseInt(cnt.rows[0].count) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/logs/summary', async (req,res)=>{
  const {start,end} = req.query;
  let where='WHERE 1=1'; const p=[];
  if(start){ p.push(start); where+=' AND created_at >= $'+p.length; }
  if(end){ p.push(end); where+=' AND created_at <= $'+p.length+'::date + 1'; }
  try{
    const total=await pool.query(`SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS users FROM audit_logs ${where}`,p);
    const byAction=await pool.query(`SELECT action, COUNT(*)::int AS n FROM audit_logs ${where} GROUP BY action ORDER BY n DESC LIMIT 12`,p);
    const byEntity=await pool.query(`SELECT entity_type, COUNT(*)::int AS n FROM audit_logs ${where} GROUP BY entity_type ORDER BY n DESC LIMIT 12`,p);
    const byUser=await pool.query(
      `SELECT COALESCE(u.username,'(sistem)') AS username, COUNT(*)::int AS n
         FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${where.replace(/created_at/g,'al.created_at')}
        GROUP BY 1 ORDER BY n DESC LIMIT 10`,p);
    const todayN=await pool.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE created_at::date = CURRENT_DATE");
    res.json({ total:total.rows[0].n, users:total.rows[0].users, today:todayN.rows[0].n,
      by_action:byAction.rows, by_entity:byEntity.rows, by_user:byUser.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// -------------------------------------------------------------- PERUBAHAN DATA
router.get('/data-changes', async (req,res)=>{
  const limit = Math.min(500, parseInt(req.query.limit||'50'));
  const offset = parseInt(req.query.offset||'0');
  const {q, table_name, field_name, changed_by, start, end} = req.query;
  let where='WHERE 1=1'; const p=[];
  if(table_name && table_name!=='Semua'){ p.push(table_name); where+=' AND dcl.table_name=$'+p.length; }
  if(field_name && field_name!=='Semua'){ p.push(field_name); where+=' AND dcl.field_name=$'+p.length; }
  if(changed_by){ p.push(changed_by); where+=' AND dcl.changed_by=$'+p.length; }
  if(start){ p.push(start); where+=' AND dcl.changed_at >= $'+p.length; }
  if(end){ p.push(end); where+=' AND dcl.changed_at <= $'+p.length+'::date + 1'; }
  if(q){
    p.push('%'+String(q).toLowerCase()+'%');
    where+=' AND (LOWER(dcl.table_name) LIKE $'+p.length+' OR LOWER(dcl.field_name) LIKE $'+p.length+
           ' OR LOWER(COALESCE(dcl.old_value,\'\')) LIKE $'+p.length+' OR LOWER(COALESCE(dcl.new_value,\'\')) LIKE $'+p.length+
           ' OR LOWER(COALESCE(dcl.reason,\'\')) LIKE $'+p.length+')';
  }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM data_change_logs dcl '+where,p);
    const r=await pool.query(
      `SELECT dcl.*, u.username AS changed_by_name FROM data_change_logs dcl LEFT JOIN users u ON u.id=dcl.changed_by
       ${where} ORDER BY dcl.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    const tabel=await pool.query('SELECT DISTINCT table_name FROM data_change_logs ORDER BY table_name');
    const field=await pool.query('SELECT DISTINCT field_name FROM data_change_logs ORDER BY field_name');
    res.json({ data:r.rows, total:parseInt(cnt.rows[0].count),
      tables: tabel.rows.map(x=>x.table_name), fields: field.rows.map(x=>x.field_name) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ---------------------------------------------------------------- DETEKSI FRAUD
// Ambang batas bisa diubah lewat query (?diskon=0.15&qty=500&jam=5) supaya bisa
// disetel sesuai kebijakan toko, bukan angka mati di dalam kode.
router.get('/fraud', async (req,res)=>{
  const diskonPct = num(req.query.diskon) || 0.2;
  const qtyBesar  = num(req.query.qty) || 1000;
  const jamMalam  = num(req.query.jam) || 5;
  const nilaiBesar = num(req.query.nilai) || 50000000;
  try{
    const bigDiscount=await pool.query(
      `SELECT so.so_number, so.total, so.discount, ROUND((so.discount/NULLIF(so.total,0)*100)::numeric,1) AS persen,
              u.username, so.created_at
         FROM sales_orders so LEFT JOIN users u ON u.id=so.created_by
        WHERE so.total > 0 AND so.discount/NULLIF(so.total,0) > $1 ORDER BY so.discount DESC LIMIT 20`, [diskonPct]);
    const nightTx=await pool.query(
      `SELECT so.so_number, so.total, u.username, so.created_at
         FROM sales_orders so LEFT JOIN users u ON u.id=so.created_by
        WHERE EXTRACT(HOUR FROM so.created_at) < $1 ORDER BY so.created_at DESC LIMIT 20`, [jamMalam]);
    const bigQty=await pool.query(
      `SELECT so.so_number, p.name AS product_name, sd.qty, u.username
         FROM so_details sd JOIN products p ON p.id=sd.product_id
         JOIN sales_orders so ON so.id=sd.so_id LEFT JOIN users u ON u.id=so.created_by
        WHERE sd.qty > $1 ORDER BY sd.qty DESC LIMIT 20`, [qtyBesar]);
    const bigOrder=await pool.query(
      `SELECT so.so_number, so.total, u.username, so.created_at
         FROM sales_orders so LEFT JOIN users u ON u.id=so.created_by
        WHERE so.total > $1 ORDER BY so.total DESC LIMIT 20`, [nilaiBesar]);
    const belowFloor=await pool.query(
      `SELECT so.so_number, p.name AS product_name, sd.unit_price, p.floor_price, u.username
         FROM so_details sd JOIN products p ON p.id=sd.product_id JOIN sales_orders so ON so.id=sd.so_id
         LEFT JOIN users u ON u.id=so.created_by
        WHERE p.floor_price > 0 AND sd.unit_price < p.floor_price ORDER BY so.id DESC LIMIT 20`);
    const bigAdjust=await pool.query(
      `SELECT a.adjustment_number, a.type, a.reason, a.total_value, w.code AS warehouse_code, a.adjustment_date
         FROM stock_adjustments a LEFT JOIN warehouses w ON w.id=a.warehouse_id
        WHERE ABS(a.total_value) > 5000000 OR (SELECT COALESCE(SUM(i.qty),0) FROM stock_adjustment_items i WHERE i.adjustment_id=a.id) > 1000
        ORDER BY a.id DESC LIMIT 20`);
    const selfApprove=await pool.query(
      `SELECT 'SO' AS type, so_number AS doc, created_by, approved_by FROM sales_orders
        WHERE approved_by IS NOT NULL AND created_by = approved_by
        UNION ALL
       SELECT 'PO', po_number, created_by, approved_by FROM purchase_orders
        WHERE approved_by IS NOT NULL AND created_by = approved_by
        LIMIT 30`);
    const alerts = bigDiscount.rows.length + nightTx.rows.length + bigQty.rows.length + bigOrder.rows.length
                 + belowFloor.rows.length + bigAdjust.rows.length + selfApprove.rows.length;
    res.json({
      thresholds:{ diskon_pct:diskonPct*100, qty_besar:qtyBesar, jam_malam_sampai:jamMalam, nilai_besar:nilaiBesar, nilai_adjust:5000000, qty_adjust:1000 },
      big_discount:bigDiscount.rows, night_transactions:nightTx.rows, big_qty:bigQty.rows, big_order:bigOrder.rows,
      below_floor:belowFloor.rows, big_adjustment:bigAdjust.rows, self_approve:selfApprove.rows, alerts,
    });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------------------------------------------- SEGREGASI TUGAS
router.get('/segregation', async (_req,res)=>{
  try{
    // 1 dokumen sebaiknya tidak dibuat dan disetujui oleh orang yang sama
    const self=await pool.query(
      `SELECT * FROM (
         SELECT 'Sales Order' AS jenis, so.so_number AS dokumen, so.total AS nilai, u.username AS orang, so.created_at AS tanggal
           FROM sales_orders so JOIN users u ON u.id=so.created_by
          WHERE so.approved_by IS NOT NULL AND so.created_by = so.approved_by
          UNION ALL
         SELECT 'Purchase Order', po.po_number, po.total, u.username, po.created_at
           FROM purchase_orders po JOIN users u ON u.id=po.created_by
          WHERE po.approved_by IS NOT NULL AND po.created_by = po.approved_by
       ) x ORDER BY tanggal DESC LIMIT 50`);
    // GRN tanpa PO (barang masuk tanpa dokumen pembelian)
    const grnNoPo=await pool.query(
      `SELECT g.grn_number, g.receipt_date, COALESCE(po.po_number,'(tanpa PO)') AS po_number
         FROM goods_receipts g LEFT JOIN purchase_orders po ON po.id=g.po_id
        WHERE g.po_id IS NULL OR po.id IS NULL ORDER BY g.id DESC LIMIT 50`);
    // PO disetujui tapi belum ada penerimaan > 30 hari
    const poStale=await pool.query(
      `SELECT po.po_number, po.total, po.status, po.po_date, s.name AS supplier_name,
              CURRENT_DATE - po.po_date::date AS umur_hari
         FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id
        WHERE po.status IN ('APPROVED','PARTIAL') AND po.po_date::date < CURRENT_DATE - 30
        ORDER BY po.po_date LIMIT 50`);
    res.json({ self_approve:self.rows, grn_tanpa_po:grnNoPo.rows, po_tanpa_penerimaan:poStale.rows,
      alerts: self.rows.length + grnNoPo.rows.length + poStale.rows.length });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------------------------------------------------- EXPORT
router.get('/export', async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'logs');
  try{
    if(dataset==='changes'){
      const r=await pool.query(
        `SELECT dcl.*, u.username AS changed_by_name FROM data_change_logs dcl LEFT JOIN users u ON u.id=dcl.changed_by
          ORDER BY dcl.id DESC LIMIT 5000`);
      const columns=[{label:'Waktu'},{label:'Tabel'},{label:'Record'},{label:'Kolom'},{label:'Nilai Lama'},
        {label:'Nilai Baru'},{label:'Oleh'},{label:'Alasan'}];
      const rows=r.rows.map(d=>[String(d.changed_at||'').slice(0,19).replace('T',' '), d.table_name, d.record_id,
        d.field_name, d.old_value||'-', d.new_value||'-', d.changed_by_name||'-', d.reason||'-']);
      const totals=columns.map(()=> '');
      return sendReport(res,{format,filename:'perubahan-data',
        payload:{title:'Riwayat Perubahan Data',subtitle:`${rows.length} perubahan`,columns,rows,totals,sheetName:'Perubahan Data'}});
    }
    if(dataset==='fraud'){
      const f=await (async ()=>{
        const bigDiscount=await pool.query(
          `SELECT so.so_number, so.total, so.discount, ROUND((so.discount/NULLIF(so.total,0)*100)::numeric,1) AS persen, u.username, so.created_at
             FROM sales_orders so LEFT JOIN users u ON u.id=so.created_by WHERE so.total>0 AND so.discount/NULLIF(so.total,0) > 0.2 ORDER BY so.discount DESC LIMIT 2000`);
        return bigDiscount.rows;
      })();
      const columns=[{label:'Dokumen'},{label:'Nilai',numeric:true,total:true},{label:'Diskon',numeric:true,total:true},
        {label:'Diskon %',numeric:true},{label:'Oleh'},{label:'Waktu'}];
      const rows=f.map(x=>[x.so_number, num(x.total), num(x.discount), num(x.persen), x.username||'-', String(x.created_at||'').slice(0,19).replace('T',' ')]);
      const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
      return sendReport(res,{format,filename:'temuan-fraud',
        payload:{title:'Temuan Tidak Wajar (Diskon > 20%)',subtitle:`${rows.length} transaksi`,columns,rows,totals,sheetName:'Temuan'}});
    }
    if(dataset==='segregation'){
      const r=await pool.query(
        `SELECT * FROM (
           SELECT 'Sales Order' AS jenis, so.so_number AS dokumen, so.total AS nilai, u.username AS orang, so.created_at AS tanggal
             FROM sales_orders so JOIN users u ON u.id=so.created_by
            WHERE so.approved_by IS NOT NULL AND so.created_by = so.approved_by
            UNION ALL
           SELECT 'Purchase Order', po.po_number, po.total, u.username, po.created_at
             FROM purchase_orders po JOIN users u ON u.id=po.created_by
            WHERE po.approved_by IS NOT NULL AND po.created_by = po.approved_by
         ) x ORDER BY tanggal DESC LIMIT 2000`);
      const columns=[{label:'Jenis'},{label:'Dokumen'},{label:'Nilai',numeric:true,total:true},{label:'Dibuat & Disetujui Oleh'},{label:'Waktu'}];
      const rows=r.rows.map(x=>[x.jenis, x.dokumen, num(x.nilai), x.orang||'-', String(x.tanggal||'').slice(0,19).replace('T',' ')]);
      const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
      return sendReport(res,{format,filename:'segregasi-tugas',
        payload:{title:'Pelanggaran Segregasi Tugas',subtitle:`${rows.length} dokumen dibuat & disetujui orang yang sama`,columns,rows,totals,sheetName:'Segregasi'}});
    }
    const {q,user_id,entity_type,action,start,end}=req.query;
    let where='WHERE 1=1'; const p=[];
    if(q){ p.push('%'+String(q).toLowerCase()+'%'); where+=' AND (LOWER(COALESCE(u.username,\'\')) LIKE $'+p.length+' OR LOWER(al.entity_type) LIKE $'+p.length+' OR LOWER(al.action) LIKE $'+p.length+')'; }
    if(user_id){ p.push(user_id); where+=' AND al.user_id=$'+p.length; }
    if(req.query.user){ p.push(req.query.user); where+=' AND COALESCE(u.username,\'(sistem)\')=$'+p.length; }
    if(entity_type && entity_type!=='Semua'){ p.push(entity_type); where+=' AND al.entity_type=$'+p.length; }
    if(action && action!=='Semua'){ p.push(action); where+=' AND al.action=$'+p.length; }
    if(start){ p.push(start); where+=' AND al.created_at >= $'+p.length; }
    if(end){ p.push(end); where+=' AND al.created_at <= $'+p.length+'::date + 1'; }
    const r=await pool.query(
      `SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
       ${where} ORDER BY al.id DESC LIMIT 5000`, p);
    const columns=[{label:'Waktu'},{label:'Pengguna'},{label:'Aksi'},{label:'Jenis Data'},{label:'ID'},{label:'Nilai Baru'},{label:'IP'}];
    const rows=r.rows.map(a=>[String(a.created_at||'').slice(0,19).replace('T',' '), a.username||'(sistem)',
      ACTION_LABEL[a.action]||a.action, ENTITY_LABEL[a.entity_type]||a.entity_type, a.entity_id,
      a.new_value? JSON.stringify(a.new_value).slice(0,300) : '-', a.ip_address||'-']);
    const totals=columns.map(()=> '');
    const sub=[`${rows.length} baris`];
    if(start||end) sub.unshift(`Periode ${start||'awal'} s/d ${end||'sekarang'}`);
    if(user_id) sub.unshift('Pengguna #'+user_id);
    return sendReport(res,{format,filename:'jejak-audit',
      payload:{title:'Jejak Audit (Audit Trail)',subtitle:sub.join('  |  '),columns,rows,totals,sheetName:'Audit Trail'}});
  }catch(e){
    console.error('audit export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});

export default router;
