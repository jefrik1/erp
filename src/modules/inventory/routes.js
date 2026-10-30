import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
const router = express.Router();
router.get('/stocks', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const wh=req.query.warehouse_id;
  const search=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(wh){ p.push(wh); where+=' AND s.warehouse_id=$'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND p.name ILIKE $'+p.length; }
  const cnt=await pool.query('SELECT COUNT(*) FROM stocks s JOIN products p ON p.id=s.product_id '+where,p);
  const data=await pool.query('SELECT s.*, p.name as product_name, p.sku, p.reorder_point, p.min_stock, w.name as warehouse_name, w.code as warehouse_code FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id '+where+' ORDER BY s.qty_available ASC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.get('/movements', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {product_id,warehouse_id,movement_type,start,end,search}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(product_id){ p.push(product_id); where+=' AND m.product_id=$'+p.length; }
  if(warehouse_id){ p.push(warehouse_id); where+=' AND m.warehouse_id=$'+p.length; }
  if(movement_type){ p.push(movement_type); where+=' AND m.movement_type=$'+p.length; }
  if(start){ p.push(start); where+=' AND m.movement_date >= $'+p.length; }
  if(end){ p.push(end); where+=' AND m.movement_date <= $'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND (p.name ILIKE $'+p.length+' OR p.sku ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM stock_movements m JOIN products p ON p.id=m.product_id '+where,p);
  const data=await pool.query('SELECT m.*, p.name as product_name, p.sku, w.name as warehouse_name FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN warehouses w ON w.id=m.warehouse_id '+where+' ORDER BY m.movement_date DESC, m.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.get('/opname', async (req,res)=>{
  const r=await pool.query('SELECT s.*, p.name, p.sku, w.name as wh FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id WHERE s.qty_available <= p.reorder_point ORDER BY s.qty_available ASC LIMIT 20');
  res.json(r.rows);
});
router.post('/adjustment', async (req,res)=>{
  const {product_id, warehouse_id, qty_adjust, reason} = req.body;
  await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand + $1 WHERE product_id=$2 AND warehouse_id=$3',[qty_adjust, product_id, warehouse_id]);
  await pool.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, qty_in, qty_out, balance_qty, created_by) VALUES ($1,$2,'ADJ','ADJUSTMENT',$3,$4,0,$5)",[product_id, warehouse_id, qty_adjust>0?qty_adjust:0, qty_adjust<0?Math.abs(qty_adjust):0, req.user.id]);
  await pool.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES ($1,\'UPDATE\',\'STOCK_ADJUST\',$2,$3)',[req.user.id, product_id, JSON.stringify({qty_adjust, reason})]);
  res.json({ok:true});
});
// --------------------------- GET /inventory/stocks/fefo/:product_id
// Saran pengambilan barang (FEFO): batch paling dekat kedaluwarsa lebih dulu.
// Dipakai gudang untuk semen/cat dan untuk alokasi picking DO.
router.get('/stocks/fefo/:product_id', async (req,res)=>{
  try{
    const wh = parseInt(req.query.warehouse_id)||null;
    const p = [req.params.product_id]; let where = 'AND s.product_id=$1 AND s.qty_on_hand > 0';
    if(wh){ p.push(wh); where += ` AND s.warehouse_id=$${p.length}`; }
    const r = await pool.query(
      `SELECT s.id, s.product_id, p.sku, p.name, w.code AS warehouse_code, w.name AS warehouse_name,
              s.batch_no, s.expired_date, s.manufactured_date, s.qty_on_hand, s.qty_reserved, s.qty_available,
              s.avg_cost,
              CASE WHEN s.expired_date IS NULL THEN NULL ELSE (s.expired_date - CURRENT_DATE) END AS days_to_expiry
         FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
        ${where}
        ORDER BY s.expired_date ASC NULLS LAST, s.id ASC`, p);
    const total = r.rows.reduce((a,x)=> a + Number(x.qty_available||0), 0);
    res.json({ product_id:Number(req.params.product_id), total_available:total, batches:r.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// --------------------------- GET /inventory/expiring?days=30
// Peringatan stok mendekati kedaluwarsa (banner gudang).
router.get('/expiring', async (req,res)=>{
  try{
    const days = Math.min(365, Math.max(1, parseInt(req.query.days)||30));
    const r = await pool.query(
      `SELECT s.id, p.sku, p.name, w.code AS warehouse_code, s.batch_no, s.expired_date,
              s.qty_on_hand, s.qty_available, s.avg_cost,
              (s.expired_date - CURRENT_DATE) AS days_to_expiry
         FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
        WHERE s.expired_date IS NOT NULL AND s.qty_on_hand > 0
          AND s.expired_date <= CURRENT_DATE + ($1 || ' days')::interval
        ORDER BY s.expired_date ASC`, [String(days)]);
    res.json({ days, count:r.rowCount, data:r.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------------------------- GET /inventory/stocks/summary
// Ringkasan per PRODUK (bukan per baris batch) - dipakai tampilan "Ringkas"
// supaya 1 produk tidak muncul berkali-kali dan angkanya mudah dibaca.
router.get('/stocks/summary', async (req,res)=>{
  try{
    const wh=req.query.warehouse_id;
    const search=req.query.search||'';
    let where='WHERE 1=1'; const p=[];
    if(wh){ p.push(wh); where+=' AND s.warehouse_id=$'+p.length; }
    if(search){ p.push('%'+search+'%'); where+=' AND (p.name ILIKE $'+p.length+' OR p.sku ILIKE $'+p.length+')'; }
    const r=await pool.query(
      `SELECT p.id AS product_id, p.sku, p.name AS product_name, p.reorder_point, p.min_stock,
              COALESCE(SUM(s.qty_on_hand),0)::float AS qty_on_hand,
              COALESCE(SUM(s.qty_reserved),0)::float AS qty_reserved,
              COALESCE(SUM(s.qty_on_hand - COALESCE(s.qty_reserved,0)),0)::float AS qty_available,
              COALESCE(SUM(s.qty_on_hand * COALESCE(s.avg_cost,0)),0)::float AS stock_value,
              COUNT(DISTINCT s.warehouse_id)::int AS warehouse_count,
              COUNT(*)::int AS row_count
         FROM stocks s JOIN products p ON p.id = s.product_id
         ${where}
        GROUP BY p.id, p.sku, p.name, p.reorder_point, p.min_stock
        ORDER BY qty_available ASC`, p);
    res.json(r.rows.map(x=>({ ...x,
      status: x.qty_available <= (x.reorder_point||0) ? 'KRITIS'
            : x.qty_available <= Math.max(x.min_stock||0, (x.reorder_point||0)*1.5) ? 'WASPADA' : 'AMAN',
      avg_cost: x.qty_on_hand > 0 ? x.stock_value / x.qty_on_hand : 0 })));
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------- POST /inventory/stocks/merge-duplicates (perawatan)
// Gabungkan baris stok batch NULL yang berganda untuk (produk, gudang) yang sama:
// qty dijumlah, harga rata-rata dihitung tertimbang dari nilai total. Idempoten.
router.post('/stocks/merge-duplicates', async (req,res)=>{
  const dry = req.body?.dry_run === true;
  try{
    const groups = await pool.query(
      `SELECT product_id, warehouse_id, COUNT(*)::int AS n, SUM(qty_on_hand)::float AS qty, MIN(id) AS keep_id
         FROM stocks WHERE batch_no IS NULL
        GROUP BY product_id, warehouse_id HAVING COUNT(*) > 1
        ORDER BY n DESC`);
    const rowsAffected = groups.rows.reduce((a,g)=> a + (g.n-1), 0);
    if (dry) return res.json({ dry_run:true, groups:groups.rows.length, rows_removed:rowsAffected, detail:groups.rows.slice(0,50) });
    if (!groups.rows.length) return res.json({ ok:true, groups:0, rows_removed:0 });

    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      for (const g of groups.rows){
        const agg = await client.query(
          `SELECT SUM(qty_on_hand)::float AS qty, SUM(COALESCE(qty_reserved,0))::float AS reserved,
                  CASE WHEN SUM(qty_on_hand) <> 0 THEN SUM(qty_on_hand*COALESCE(avg_cost,0))/SUM(qty_on_hand)
                       ELSE COALESCE(AVG(avg_cost),0) END::float AS avgc,
                  MAX(last_updated) AS last_upd
             FROM stocks WHERE product_id=$1 AND warehouse_id=$2 AND batch_no IS NULL`,
          [g.product_id, g.warehouse_id]);
        const a = agg.rows[0];
        await client.query('UPDATE stocks SET qty_on_hand=$1, qty_reserved=$2, avg_cost=$3, last_updated=COALESCE($4,NOW()) WHERE id=$5',
          [a.qty, a.reserved, a.avgc, a.last_upd, g.keep_id]);
        await client.query('DELETE FROM stocks WHERE product_id=$1 AND warehouse_id=$2 AND batch_no IS NULL AND id <> $3',
          [g.product_id, g.warehouse_id, g.keep_id]);
      }
      await client.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES ($1,$2,$3,$4,$5)',
        [req.user?.id||null, 'MERGE', 'STOCK_DUPLICATE', 0, JSON.stringify({ groups:groups.rows.length, rows_removed:rowsAffected })]);
      await client.query('COMMIT');
      res.json({ ok:true, groups:groups.rows.length, rows_removed:rowsAffected });
    }catch(e){
      await client.query('ROLLBACK').catch(()=>{});
      throw e;
    }finally{ client.release(); }
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------------------- GET /inventory/adjustments (riwayat)
router.get('/adjustments', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {q,type,reason,warehouse_id,start,end}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(q){ p.push('%'+q+'%'); where+=' AND (a.adjustment_number ILIKE $'+p.length+' OR COALESCE(a.reference_no,\'\') ILIKE $'+p.length+' OR COALESCE(a.note,\'\') ILIKE $'+p.length+')'; }
  if(type){ p.push(type); where+=' AND a.type=$'+p.length; }
  if(reason){ p.push(reason); where+=' AND a.reason=$'+p.length; }
  if(warehouse_id){ p.push(warehouse_id); where+=' AND a.warehouse_id=$'+p.length; }
  if(start){ p.push(start); where+=' AND a.adjustment_date >= $'+p.length; }
  if(end){ p.push(end); where+=' AND a.adjustment_date <= $'+p.length; }
  try{
    const base=' FROM stock_adjustments a LEFT JOIN warehouses w ON w.id=a.warehouse_id '+where;
    const cnt=await pool.query('SELECT COUNT(*) '+base, p);
    const r=await pool.query(
      `SELECT a.*, w.name AS warehouse_name, w.code AS warehouse_code,
              (SELECT COUNT(*)::int FROM stock_adjustment_items i WHERE i.adjustment_id=a.id) AS item_count,
              (SELECT COALESCE(SUM(i.qty),0)::float FROM stock_adjustment_items i WHERE i.adjustment_id=a.id) AS total_qty,
              u.username AS created_by_name
         FROM stock_adjustments a LEFT JOIN warehouses w ON w.id=a.warehouse_id
         LEFT JOIN users u ON u.id=a.created_by
         ${where} ORDER BY a.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({ data:r.rows, total:parseInt(cnt.rows[0].count) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/adjustments/:id', async (req,res)=>{
  try{
    const h=await pool.query('SELECT a.*, w.name AS warehouse_name, w.code AS warehouse_code, u.username AS created_by_name FROM stock_adjustments a LEFT JOIN warehouses w ON w.id=a.warehouse_id LEFT JOIN users u ON u.id=a.created_by WHERE a.id=$1',[req.params.id]);
    if(!h.rows[0]) return res.status(404).json({error:'Dokumen tidak ditemukan'});
    const items=await pool.query('SELECT i.*, p.name AS product_name, p.sku FROM stock_adjustment_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.adjustment_id=$1 ORDER BY i.id',[req.params.id]);
    res.json({ ...h.rows[0], items: items.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// --------------------------- POST /inventory/adjustments (tambah/kurang/opname)
// Satu-satunya pintu resmi input stok manual:
//   IN  = tambah stok (stok awal, pembelian tanpa PO, retur customer, hibah...)
//   OUT = kurangi stok (susut, rusak, pemakaian internal...)
//   SET = opname fisik: qty diisi = jumlah nyata di gudang (bukan selisih)
// Stok ditulis ke baris (produk+gudang+batch) yang SUDAH ADA bila ada - tidak
// membuat baris baru setiap kali, supaya tidak menumpuk seperti sebelumnya.
const REASONS = {
  IN:  ['STOK_AWAL','PEMBELIAN_TANPA_PO','RETUR_CUSTOMER','HIBAH','BARANG_TEMUAN','KOREKSI_OPNAME','LAINNYA'],
  OUT: ['SUSUT','RUSAK','KOREKSI_OPNAME','PEMAKAIAN_INTERNAL','SAMPLE','LAINNYA'],
  SET: ['OPNAME_FISIK'],
};
router.get('/adjustment-reasons', (_req,res)=> res.json(REASONS));

async function createAdjustment(req,res){
  const { warehouse_id, type, reason, adjustment_date, reference_no, note, items } = req.body || {};
  const t = String(type||'').toUpperCase();
  if (!['IN','OUT','SET'].includes(t)) return res.status(400).json({error:'Jenis harus IN, OUT, atau SET'});
  if (!warehouse_id) return res.status(400).json({error:'Gudang wajib dipilih'});
  if (!REASONS[t].includes(reason)) return res.status(400).json({error:'Alasan tidak valid untuk jenis '+t});
  const list = (Array.isArray(items)? items : []).filter(i=> i.product_id && parseFloat(i.qty) !== 0);
  if (!list.length) return res.status(400).json({error:'Minimal satu produk dengan jumlah > 0'});
  if (t==='SET' && list.some(i=> parseFloat(i.qty) < 0)) return res.status(400).json({error:'Opname tidak boleh negatif'});
  if (t!=='SET' && list.some(i=> parseFloat(i.qty) <= 0)) return res.status(400).json({error:'Jumlah harus lebih dari 0 (pakai jenis OUT untuk mengurangi)'});

  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const d = adjustment_date ? new Date(adjustment_date) : new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const prefix = t==='IN' ? 'SI' : t==='OUT' ? 'SO' : 'OP';
    const cnt = await client.query('SELECT COUNT(*)::int n FROM stock_adjustments WHERE adjustment_number LIKE $1',[prefix+'-'+ymd+'-%']);
    let number = `${prefix}-${ymd}-${String(cnt.rows[0].n+1).padStart(4,'0')}`;

    const totalValue = list.reduce((a,i)=> a + (parseFloat(i.qty)||0)*(parseFloat(i.unit_cost)||0), 0);
    let head;
    for (let attempt=0; attempt<3; attempt++){
      try{
        head = await client.query(
          `INSERT INTO stock_adjustments (adjustment_number, adjustment_date, warehouse_id, type, reason, reference_no, note, total_value, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, adjustment_number`,
          [number, adjustment_date||new Date().toISOString().slice(0,10), warehouse_id, t, reason, reference_no||null, note||null, totalValue, req.user?.id||null]);
        break;
      }catch(e){
        if (e.code === '23505' && attempt < 2){ number = `${prefix}-${ymd}-${String(cnt.rows[0].n+1+attempt+1).padStart(4,'0')}`; continue; }
        throw e;
      }
    }
    const adjId = head.rows[0].id;
    const result = [];

    for (const it of list){
      const qty = parseFloat(it.qty);
      const unitCost = parseFloat(it.unit_cost)||0;
      const batch = it.batch_no ? String(it.batch_no).trim() : null;
      const row = await client.query(
        `SELECT id, qty_on_hand, qty_reserved, avg_cost FROM stocks
          WHERE product_id=$1 AND warehouse_id=$2 AND COALESCE(batch_no,'') = COALESCE($3,'')
          ORDER BY id LIMIT 1`, [it.product_id, warehouse_id, batch]);
      const cur = row.rows[0];
      const before = cur ? parseFloat(cur.qty_on_hand)||0 : 0;
      const after = t==='IN' ? before + qty : t==='OUT' ? before - qty : qty;
      if (after < 0) return res.status(400).json({error:`Stok tidak cukup untuk produk #${it.product_id} di gudang ini (tersedia ${before}, diminta keluar ${qty})`});
      const avgBefore = cur ? parseFloat(cur.avg_cost)||0 : 0;

      if (cur){
        // IN dengan harga beli: rata-rata tertimbang. OUT: avg tidak berubah. SET: pakai harga bila diisi.
        let newAvg = avgBefore;
        if (t==='IN' && unitCost > 0) newAvg = after > 0 ? ((before*avgBefore) + (qty*unitCost)) / after : unitCost;
        else if (t==='SET' && unitCost > 0) newAvg = unitCost;
        await client.query('UPDATE stocks SET qty_on_hand=$1, avg_cost=$2, last_updated=NOW() WHERE id=$3',[after, newAvg, cur.id]);
      } else {
        await client.query('INSERT INTO stocks (product_id, warehouse_id, qty_on_hand, avg_cost, batch_no, expired_date) VALUES ($1,$2,$3,$4,$5,$6)',
          [it.product_id, warehouse_id, after, unitCost, batch, it.expired_date||null]);
      }

      await client.query(
        `INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_in, qty_out, unit_cost, balance_qty, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [it.product_id, warehouse_id, t==='IN' ? 'IN' : 'ADJ',
         t==='IN' ? 'STOCK_IN' : t==='OUT' ? 'STOCK_OUT' : 'OPNAME', adjId,
         t==='IN' ? qty : 0, t==='IN' ? 0 : (t==='OUT' ? qty : Math.abs(after-before)),
         unitCost || null, after, req.user?.id||null]);

      await client.query('INSERT INTO stock_adjustment_items (adjustment_id, product_id, qty, unit_cost, qty_before, qty_after, batch_no, expired_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [adjId, it.product_id, qty, unitCost, before, after, batch, it.expired_date||null]);

      result.push({ product_id: it.product_id, qty, unit_cost: unitCost, qty_before: before, qty_after: after });
    }

    await client.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES ($1,$2,$3,$4,$5)',
      [req.user?.id||null, 'CREATE', 'STOCK_'+t, adjId, JSON.stringify({ number, warehouse_id, reason, items: result.length })]);
    await client.query('COMMIT');
    res.json({ ok:true, id: adjId, adjustment_number: head.rows[0].adjustment_number, type:t, total_value: totalValue, items: result });
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[stock adjustment]', e);
    res.status(500).json({error:'Gagal menyimpan: '+e.message});
  }finally{ client.release(); }
}
router.post('/adjustments', createAdjustment);

// Endpoint lama dipertahankan (dipakai integrasi lain) tapi kini menulis dokumen juga.
router.post('/adjustment', async (req,res)=>{
  const { product_id, warehouse_id, qty_adjust, reason } = req.body || {};
  const qty = parseFloat(qty_adjust);
  if (!product_id || !warehouse_id || !qty) return res.status(400).json({error:'product_id, warehouse_id, qty_adjust wajib'});
  req.body = { warehouse_id, type: qty > 0 ? 'IN' : 'OUT', reason: 'KOREKSI_OPNAME',
    note: reason || 'Penyesuaian cepat', items:[{ product_id, qty: Math.abs(qty) }] };
  return createAdjustment(req,res);
});

router.get('/transfers', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {status,q}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND t.status=$'+p.length; }
  if(q){ p.push('%'+q+'%'); where+=' AND (t.transfer_number ILIKE $'+p.length+' OR wf.name ILIKE $'+p.length+' OR wt.name ILIKE $'+p.length+')'; }
  const base=' FROM stock_transfers t LEFT JOIN warehouses wf ON wf.id=t.from_warehouse_id LEFT JOIN warehouses wt ON wt.id=t.to_warehouse_id '+where;
  const cnt=await pool.query('SELECT COUNT(*) '+base,p);
  const r=await pool.query('SELECT t.*, wf.name as from_name, wt.name as to_name, wf.code as from_code, wt.code as to_code '+
    ', (SELECT COUNT(*) FROM stock_transfer_details d WHERE d.transfer_id=t.id)::int as item_count '+
    ', (SELECT COALESCE(SUM(d.qty),0)::float FROM stock_transfer_details d WHERE d.transfer_id=t.id) as total_qty '+
    base+' ORDER BY t.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:r.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/transfers', async (req,res)=>{
  const {from_warehouse_id, to_warehouse_id, items} = req.body || {};
  const list = Array.isArray(items) ? items : [];
  if(!from_warehouse_id || !to_warehouse_id) return res.status(400).json({error:'Gudang asal & tujuan wajib dipilih'});
  if(String(from_warehouse_id)===String(to_warehouse_id)) return res.status(400).json({error:'Gudang asal dan tujuan tidak boleh sama'});
  if(!list.length) return res.status(400).json({error:'Minimal satu produk untuk dipindahkan'});
  const tn='TRF-'+Date.now();
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const ins=await client.query("INSERT INTO stock_transfers (transfer_number, from_warehouse_id, to_warehouse_id, transfer_date, status) VALUES ($1,$2,$3,CURRENT_DATE,'IN_TRANSIT') RETURNING id",[tn, from_warehouse_id, to_warehouse_id]);
    const tid=ins.rows[0].id;
    for(const it of list){
      const qty = Number(it.qty)||0;
      if(qty <= 0) throw Object.assign(new Error('Jumlah transfer harus lebih dari 0'), {status:400});
      // Baris sumber: batch NULL (satu baris per produk+gudang). HPP ikut terbawa ke
      // gudang tujuan - kalau tidak, gudang penerima punya stok ber-HPP 0 dan laporan
      // margin tampak 100%.
      const src = await client.query(`SELECT id, qty_on_hand, COALESCE(qty_reserved,0) AS qty_reserved, COALESCE(avg_cost,0) AS avg_cost
        FROM stocks WHERE product_id=$1 AND warehouse_id=$2 AND batch_no IS NULL ORDER BY id LIMIT 1 FOR UPDATE`,
        [it.product_id, from_warehouse_id]);
      const s = src.rows[0];
      const avail = s ? Number(s.qty_on_hand) - Number(s.qty_reserved) : 0;
      if(!s || avail + 1e-9 < qty){
        const nm = await client.query('SELECT name FROM products WHERE id=$1',[it.product_id]);
        throw Object.assign(new Error(`Stok tidak cukup untuk ${nm.rows[0]?.name||('produk '+it.product_id)}: tersedia ${Math.max(0,avail)}, diminta ${qty}`), {status:400});
      }
      const unitCost = Number(s.avg_cost)||0;
      const afterSrc = Number(s.qty_on_hand) - qty;
      await client.query('UPDATE stocks SET qty_on_hand=$1, last_updated=NOW() WHERE id=$2',[afterSrc, s.id]);
      await client.query('INSERT INTO stock_transfer_details (transfer_id, product_id, qty, unit_cost) VALUES ($1,$2,$3,$4)',[tid, it.product_id, qty, unitCost]);
      await client.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_out, unit_cost, balance_qty, created_by) VALUES ($1,$2,'TRF','TRANSFER',$3,$4,$5,$6,$7)",
        [it.product_id, from_warehouse_id, tid, qty, unitCost, afterSrc, req.user.id]);
      // Gudang tujuan: update-atau-insert, HPP dirata-ratakan tertimbang.
      const dst = await client.query('SELECT id, qty_on_hand, COALESCE(avg_cost,0) AS avg_cost FROM stocks WHERE product_id=$1 AND warehouse_id=$2 AND batch_no IS NULL ORDER BY id LIMIT 1 FOR UPDATE',[it.product_id, to_warehouse_id]);
      let afterDst;
      if (dst.rows[0]){
        const d = dst.rows[0];
        const qBefore = Number(d.qty_on_hand)||0;
        afterDst = qBefore + qty;
        const newAvg = afterDst > 0 ? ((qBefore*Number(d.avg_cost||0)) + (qty*unitCost)) / afterDst : unitCost;
        await client.query('UPDATE stocks SET qty_on_hand=$1, avg_cost=$2, last_updated=NOW() WHERE id=$3',[afterDst, newAvg, d.id]);
      } else {
        afterDst = qty;
        await client.query('INSERT INTO stocks (product_id, warehouse_id, qty_on_hand, avg_cost) VALUES ($1,$2,$3,$4)',[it.product_id, to_warehouse_id, qty, unitCost]);
      }
      await client.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_in, unit_cost, balance_qty, created_by) VALUES ($1,$2,'TRF','TRANSFER',$3,$4,$5,$6,$7)",
        [it.product_id, to_warehouse_id, tid, qty, unitCost, afterDst, req.user.id]);
    }
    await client.query('COMMIT');
    res.json({id:tid, transfer_number: tn});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    if(e.status) return res.status(e.status).json({error:e.message});
    console.error('[transfer]',e);
    res.status(500).json({error:e.message});
  }finally{ client.release(); }
});
router.post('/transfers/:id/receive', async (req,res)=>{
  await pool.query("UPDATE stock_transfers SET status='RECEIVED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});

// ------------------------------------------------------- GET /inventory/export
// dataset=stocks | movements | transfers - file berwarna, judul, periode, baris TOTAL.
router.get('/export', async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'stocks');
  const num=(v)=>parseFloat(v||0)||0;
  try{
    if(dataset==='movements'){
      const {product_id,warehouse_id,movement_type,start,end,search}=req.query;
      let where='WHERE 1=1'; const p=[];
      if(product_id){ p.push(product_id); where+=' AND m.product_id=$'+p.length; }
      if(warehouse_id){ p.push(warehouse_id); where+=' AND m.warehouse_id=$'+p.length; }
      if(movement_type){ p.push(movement_type); where+=' AND m.movement_type=$'+p.length; }
      if(start){ p.push(start); where+=' AND m.movement_date >= $'+p.length; }
      if(end){ p.push(end); where+=' AND m.movement_date <= $'+p.length; }
      if(search){ p.push('%'+search+'%'); where+=' AND (p.name ILIKE $'+p.length+' OR p.sku ILIKE $'+p.length+')'; }
      const r=await pool.query('SELECT m.*, p.name as product_name, p.sku, w.name as warehouse_name FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN warehouses w ON w.id=m.warehouse_id '+where+' ORDER BY m.movement_date DESC, m.id DESC LIMIT 5000',p);
      const columns=[{label:'Tanggal'},{label:'SKU'},{label:'Produk'},{label:'Gudang'},{label:'Tipe'},
        {label:'Masuk',numeric:true,total:true},{label:'Keluar',numeric:true,total:true},{label:'Saldo',numeric:true},{label:'Referensi'}];
      const rows=r.rows.map(m=>[String(m.movement_date||'').slice(0,16).replace('T',' '), m.sku, m.product_name, m.warehouse_name||'-',
        m.movement_type, num(m.qty_in), num(m.qty_out), m.balance_qty==null?'':num(m.balance_qty),
        m.reference_type?`${m.reference_type} #${m.reference_id??'-'}`:'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      const sub=[`${rows.length} pergerakan`]; if(warehouse_id) sub.unshift('Gudang #'+warehouse_id);
      if(movement_type) sub.unshift('Tipe '+movement_type);
      if(start||end) sub.unshift(`Periode ${start||'awal'} s/d ${end||'sekarang'}`);
      return sendReport(res,{format,filename:'kartu-stok',
        payload:{title:'Kartu Stok - Mutasi Persediaan',subtitle:sub.join('  |  '),columns,rows,totals,sheetName:'Kartu Stok'}});
    }
    if(dataset==='adjustments'){
      const {q,type,reason,warehouse_id,start,end}=req.query;
      let where='WHERE 1=1'; const p=[];
      if(q){ p.push('%'+q+'%'); where+=' AND (a.adjustment_number ILIKE $'+p.length+' OR COALESCE(a.note,\'\') ILIKE $'+p.length+')'; }
      if(type){ p.push(type); where+=' AND a.type=$'+p.length; }
      if(reason){ p.push(reason); where+=' AND a.reason=$'+p.length; }
      if(warehouse_id){ p.push(warehouse_id); where+=' AND a.warehouse_id=$'+p.length; }
      if(start){ p.push(start); where+=' AND a.adjustment_date >= $'+p.length; }
      if(end){ p.push(end); where+=' AND a.adjustment_date <= $'+p.length; }
      const r=await pool.query(
        `SELECT a.*, w.code AS warehouse_code, w.name AS warehouse_name,
                (SELECT COUNT(*)::int FROM stock_adjustment_items i WHERE i.adjustment_id=a.id) AS item_count,
                (SELECT COALESCE(SUM(i.qty),0)::float FROM stock_adjustment_items i WHERE i.adjustment_id=a.id) AS total_qty,
                (SELECT STRING_AGG(p.name || ' (' || i.qty || ')', ', ' ORDER BY i.id) FROM stock_adjustment_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.adjustment_id=a.id) AS item_list
           FROM stock_adjustments a LEFT JOIN warehouses w ON w.id=a.warehouse_id ${where} ORDER BY a.id DESC LIMIT 5000`, p);
      const TYPE_LABEL={IN:'Tambah stok',OUT:'Kurangi stok',SET:'Opname fisik'};
      const columns=[{label:'No Dokumen'},{label:'Tanggal'},{label:'Jenis'},{label:'Alasan'},{label:'Gudang'},
        {label:'Jumlah Item',numeric:true,total:true},{label:'Total Qty',numeric:true,total:true},
        {label:'Nilai',numeric:true,total:true},{label:'Referensi'},{label:'Catatan'},{label:'Daftar Produk'}];
      const rows=r.rows.map(a=>[a.adjustment_number, String(a.adjustment_date||'').slice(0,10), TYPE_LABEL[a.type]||a.type,
        a.reason, a.warehouse_code||('-'), a.item_count||0, num(a.total_qty), num(a.total_value),
        a.reference_no||'-', a.note||'-', a.item_list||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
      const sub=[`${rows.length} dokumen`]; if(type) sub.unshift('Jenis '+type); if(warehouse_id) sub.unshift('Gudang #'+warehouse_id);
      if(start||end) sub.unshift(`Periode ${start||'awal'} s/d ${end||'sekarang'}`);
      return sendReport(res,{format,filename:'penyesuaian-stok',
        payload:{title:'Riwayat Penambahan & Pengurangan Stok',subtitle:sub.join('  |  '),columns,rows,totals,sheetName:'Penyesuaian Stok'}});
    }
    if(dataset==='transfers'){
      const {status,q}=req.query;
      let where='WHERE 1=1'; const p=[];
      if(status){ p.push(status); where+=' AND t.status=$'+p.length; }
      if(q){ p.push('%'+q+'%'); where+=' AND (t.transfer_number ILIKE $'+p.length+' OR wf.name ILIKE $'+p.length+' OR wt.name ILIKE $'+p.length+')'; }
      const r=await pool.query('SELECT t.*, wf.name as from_name, wt.name as to_name, wf.code as from_code, wt.code as to_code'+
        ', (SELECT COUNT(*) FROM stock_transfer_details d WHERE d.transfer_id=t.id)::int as item_count'+
        ', (SELECT COALESCE(SUM(d.qty),0)::float FROM stock_transfer_details d WHERE d.transfer_id=t.id) as total_qty'+
        ' FROM stock_transfers t LEFT JOIN warehouses wf ON wf.id=t.from_warehouse_id LEFT JOIN warehouses wt ON wt.id=t.to_warehouse_id '+where+' ORDER BY t.id DESC LIMIT 5000',p);
      const columns=[{label:'No Transfer'},{label:'Dari'},{label:'Ke'},{label:'Tanggal'},{label:'Status'},
        {label:'Item',numeric:true},{label:'Total Qty',numeric:true,total:true},{label:'Catatan'}];
      const rows=r.rows.map(t=>[t.transfer_number,`${t.from_code||''} ${t.from_name||''}`.trim(),`${t.to_code||''} ${t.to_name||''}`.trim(),
        String(t.transfer_date||'').slice(0,10), t.status, t.item_count||0, num(t.total_qty), t.notes||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'transfer-stok',
        payload:{title:'Transfer Stok Antar Gudang',subtitle:`${rows.length} transfer${status?'  |  Status '+status:''}`,columns,rows,totals,sheetName:'Transfer'}});
    }
    // default: stocks
    const {warehouse_id,search}=req.query;
    let where='WHERE 1=1'; const p=[];
    if(warehouse_id){ p.push(warehouse_id); where+=' AND s.warehouse_id=$'+p.length; }
    if(search){ p.push('%'+search+'%'); where+=' AND p.name ILIKE $'+p.length; }
    const r=await pool.query('SELECT s.*, p.name as product_name, p.sku, p.reorder_point, p.min_stock, w.name as warehouse_name, w.code as warehouse_code FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id '+where+' ORDER BY s.qty_available ASC LIMIT 5000',p);
    const st=(s)=> num(s.qty_available)<=num(s.reorder_point) ? 'KRITIS' : (num(s.qty_available)<=Math.max(num(s.min_stock),num(s.reorder_point))*1.5 ? 'WASPADA' : 'AMAN');
    const columns=[{label:'SKU'},{label:'Produk'},{label:'Gudang'},{label:'On Hand',numeric:true,total:true},
      {label:'Reserved',numeric:true,total:true},{label:'Available',numeric:true,total:true},
      {label:'Avg Cost',numeric:true},{label:'Nilai Stok',numeric:true,total:true},{label:'Status'}];
    const rows=r.rows.map(s=>[s.sku, s.product_name, s.warehouse_code, num(s.qty_on_hand), num(s.qty_reserved),
      num(s.qty_available), num(s.avg_cost), num(s.qty_on_hand)*num(s.avg_cost), st(s)]);
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
    return sendReport(res,{format,filename:'stok-inventory',
      payload:{title:'Posisi Stok Inventory',subtitle:`${rows.length} baris stok${warehouse_id?'  |  Gudang #'+warehouse_id:''}`,columns,rows,totals,sheetName:'Stok'}});
  }catch(e){
    console.error('inventory export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});
export default router;
