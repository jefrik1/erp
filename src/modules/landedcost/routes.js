import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;
const COST_TYPES = ['FREIGHT','INSURANCE','DUTY','TAX','CLEARANCE','TRUCKING','HANDLING','OTHER'];
const METHOD_LABEL = { VALUE:'Nilai Barang', WEIGHT:'Berat / Qty', VOLUME:'Volume / Jumlah Item' };

// Landed cost = harga barang sampai gudang. Biaya impor dialokasikan ke tiap item
// PO secara proporsional, lalu menambah nilai persediaan (stocks.avg_cost) supaya
// HPP penjualan tidak understated. Hitung ulang aman: alokasi lama dikembalikan dulu.

async function lcAllocations(id){
  const r = await pool.query(
    `SELECT a.*, p.name AS product_name, p.sku, w.name AS warehouse_name
       FROM landed_cost_allocations a
       LEFT JOIN products p ON p.id = a.product_id
       LEFT JOIN warehouses w ON w.id = a.warehouse_id
      WHERE a.landed_cost_id = $1 ORDER BY a.id`, [id]);
  return r.rows.map(x=>({ ...x, qty:num(x.qty), base:num(x.base), share:num(x.share), extra:num(x.extra), per_unit:num(x.per_unit),
    avg_cost_before: x.avg_cost_before===null? null : num(x.avg_cost_before),
    avg_cost_after: x.avg_cost_after===null? null : num(x.avg_cost_after) }));
}

// ------------------------------------------------------------------- GET /list
router.get('/', async (req, res)=>{
  const w = []; const p = [];
  if (req.query.q){
    p.push('%' + String(req.query.q).toLowerCase() + '%');
    w.push(`(LOWER(COALESCE(po.po_number,'')) LIKE $${p.length} OR LOWER(COALESCE(lc.container_no,'')) LIKE $${p.length}
             OR LOWER(COALESCE(lc.bl_number,'')) LIKE $${p.length} OR LOWER(COALESCE(lc.pib_number,'')) LIKE $${p.length}
             OR LOWER(COALESCE(s.name,'')) LIKE $${p.length} OR CAST(lc.id AS TEXT) = $${p.length + 1})`);
    p.push(String(req.query.q));
  }
  if (req.query.status && req.query.status !== 'Semua'){ p.push(req.query.status); w.push(`lc.status = $${p.length}`); }
  try {
    const r = await pool.query(
      `SELECT lc.*, po.po_number, s.name AS supplier_name,
              (SELECT COUNT(*)::int FROM landed_cost_details d WHERE d.landed_cost_id = lc.id) AS cost_lines,
              (SELECT COUNT(*)::int FROM landed_cost_allocations a WHERE a.landed_cost_id = lc.id) AS alloc_count
         FROM landed_costs lc
         LEFT JOIN purchase_orders po ON po.id = lc.po_id
         LEFT JOIN suppliers s ON s.id = po.supplier_id
         ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
        ORDER BY lc.id DESC LIMIT 200`, p);
    res.json(r.rows.map(x=>({ ...x, total_cost:num(x.total_cost) })));
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------- GET /summary
router.get('/summary', async (_req, res)=>{
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
              COUNT(*) FILTER (WHERE status = 'CALCULATED')::int AS calculated,
              COUNT(*) FILTER (WHERE status = 'POSTED')::int AS posted,
              COALESCE(SUM(total_cost),0)::float AS total_cost,
              COALESCE(SUM(total_cost) FILTER (WHERE status <> 'POSTED'),0)::float AS belum_posting
         FROM landed_costs`);
    const byType = await pool.query(
      `SELECT d.cost_type, COALESCE(SUM(d.amount_idr),0)::float AS amount
         FROM landed_cost_details d GROUP BY d.cost_type ORDER BY amount DESC`);
    res.json({ ...r.rows[0], by_type: byType.rows });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------- GET /export
router.get('/export', async (req, res)=>{
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({ error: `Format tidak didukung: ${format}` });
  try {
    if (req.query.id){
      const h = await pool.query('SELECT lc.*, po.po_number, s.name AS supplier_name FROM landed_costs lc LEFT JOIN purchase_orders po ON po.id=lc.po_id LEFT JOIN suppliers s ON s.id=po.supplier_id WHERE lc.id=$1', [req.query.id]);
      if (!h.rows[0]) return res.status(404).json({ error: 'Landed cost tidak ditemukan' });
      const det = await pool.query('SELECT * FROM landed_cost_details WHERE landed_cost_id=$1 ORDER BY id', [req.query.id]);
      const alloc = await lcAllocations(req.query.id);
      // Satu sheet: alokasi per item PO (angka yang benar-benar masuk nilai persediaan).
      // Rincian komponen biaya diringkas di subtitle agar tetap terbaca di semua format.
      const rincian = det.rows.map(d=> `${d.cost_type} ${new Intl.NumberFormat('id-ID').format(num(d.amount_idr))}`).join('  |  ');
      const columns = [{ label:'SKU' },{ label:'Produk' },{ label:'Qty', numeric:true, total:true },
                       { label:'Dasar Alokasi', numeric:true, total:true },{ label:'Porsi %', numeric:true },
                       { label:'Tambahan Biaya', numeric:true, total:true },{ label:'Per Unit', numeric:true },
                       { label:'Avg Cost Sebelum', numeric:true },{ label:'Avg Cost Sesudah', numeric:true }];
      const rows = alloc.map(a=>[a.sku || '-', a.product_name || ('Produk #' + a.product_id), a.qty, a.base, a.share*100,
                                 a.extra, a.per_unit, num(a.avg_cost_before), num(a.avg_cost_after)]);
      const totals = columns.map((c,i)=> c.total ? rows.reduce((s,x)=> s + num(x[i]), 0) : '');
      return sendReport(res, { format, filename: 'landed-cost-' + req.query.id,
        payload: { title: 'Landed Cost #' + req.query.id + ' - Alokasi ke Item PO',
          subtitle: `PO ${h.rows[0].po_number || '-'}  |  ${h.rows[0].supplier_name || '-'}  |  Metode ${METHOD_LABEL[h.rows[0].allocation_method] || h.rows[0].allocation_method}  |  Status ${h.rows[0].status}  |  ${rincian}`,
          columns, rows, totals, sheetName: 'Alokasi Item' } });
    }
    const r = await pool.query(
      `SELECT lc.*, po.po_number, s.name AS supplier_name,
              (SELECT COUNT(*)::int FROM landed_cost_details d WHERE d.landed_cost_id=lc.id) AS cost_lines,
              (SELECT COUNT(*)::int FROM landed_cost_allocations a WHERE a.landed_cost_id=lc.id) AS alloc_count
         FROM landed_costs lc LEFT JOIN purchase_orders po ON po.id=lc.po_id LEFT JOIN suppliers s ON s.id=po.supplier_id
        ORDER BY lc.id DESC`);
    const columns = [{ label:'LC' },{ label:'PO' },{ label:'Supplier' },{ label:'Container' },{ label:'BL' },{ label:'PIB' },
                     { label:'Komponen', numeric:true },{ label:'Metode' },{ label:'Total Biaya', numeric:true, total:true },{ label:'Status' }];
    const rows = r.rows.map(x=>['#' + x.id, x.po_number || '-', x.supplier_name || '-', x.container_no || '-', x.bl_number || '-',
      x.pib_number || '-', x.cost_lines || 0, METHOD_LABEL[x.allocation_method] || x.allocation_method, num(x.total_cost), x.status]);
    const totals = columns.map((c,i)=> c.total ? rows.reduce((a,x)=> a + num(x[i]), 0) : '');
    return sendReport(res, { format, filename: 'daftar-landed-cost',
      payload:{ title:'Daftar Landed Cost & Import', subtitle:`${rows.length} dokumen  |  Total Rp ${new Intl.NumberFormat('id-ID').format(totals[8] || 0)}`,
                columns, rows, totals, sheetName:'Landed Cost' } });
  } catch (e){ res.status(500).json({ error: 'Gagal membuat laporan: ' + e.message }); }
});

// ------------------------------------------------------------------ GET /:id
router.get('/:id', async (req, res)=>{
  try {
    const h = await pool.query(
      `SELECT lc.*, po.po_number, s.name AS supplier_name FROM landed_costs lc
         LEFT JOIN purchase_orders po ON po.id = lc.po_id
         LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE lc.id = $1`, [req.params.id]);
    if (!h.rows[0]) return res.status(404).json({ error: 'Landed cost tidak ditemukan' });
    const details = await pool.query('SELECT * FROM landed_cost_details WHERE landed_cost_id=$1 ORDER BY id', [req.params.id]);
    const alloc = await lcAllocations(req.params.id);
    const poItems = await pool.query(
      `SELECT pd.*, p.name AS product_name, p.sku FROM po_details pd
         LEFT JOIN products p ON p.id = pd.product_id WHERE pd.po_id = $1 ORDER BY pd.id`, [h.rows[0].po_id]);
    const grnItems = h.rows[0].grn_id
      ? (await pool.query(`SELECT gd.*, p.name AS product_name, p.sku FROM grn_details gd
                             LEFT JOIN products p ON p.id = gd.product_id WHERE gd.grn_id = $1`, [h.rows[0].grn_id])).rows
      : [];
    res.json({ ...h.rows[0], total_cost: num(h.rows[0].total_cost),
      details: details.rows.map(d=>({ ...d, amount:num(d.amount), amount_idr:num(d.amount_idr), exchange_rate:num(d.exchange_rate) })),
      allocations: alloc, po_items: poItems.rows, grn_items: grnItems });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------- POST /create
router.post('/', async (req, res)=>{
  const { po_id, grn_id, container_no, bl_number, pib_number, arrival_date, clearance_date, allocation_method, notes, details } = req.body || {};
  if (!po_id) return res.status(400).json({ error: 'PO wajib dipilih' });
  const lines = Array.isArray(details) ? details.filter(d=> num(d.amount) !== 0) : [];
  if (!lines.length) return res.status(400).json({ error: 'Minimal satu komponen biaya dengan nilai > 0' });
  const method = ['VALUE','WEIGHT','VOLUME'].includes(allocation_method) ? allocation_method : 'VALUE';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = lines.reduce((a, d)=> a + num(d.amount) * (num(d.exchange_rate) || 1), 0);
    const ins = await client.query(
      `INSERT INTO landed_costs (po_id,grn_id,container_no,bl_number,pib_number,arrival_date,clearance_date,total_cost,allocation_method,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10) RETURNING id`,
      [po_id, grn_id || null, container_no || null, bl_number || null, pib_number || null,
       arrival_date || null, clearance_date || null, total, method, notes || null]);
    const lcId = ins.rows[0].id;
    for (const d of lines){
      const rate = num(d.exchange_rate) || 1;
      await client.query(
        `INSERT INTO landed_cost_details (landed_cost_id,cost_type,description,amount,currency,exchange_rate,amount_idr)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [lcId, COST_TYPES.includes(d.cost_type) ? d.cost_type : 'OTHER', d.description || null,
         num(d.amount), d.currency || 'IDR', rate, num(d.amount) * rate]);
    }
    await client.query('COMMIT');
    res.json({ id: lcId, total_cost: total, status: 'DRAFT' });
  } catch (e){
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// --------------------------------------------------------- POST /:id/calculate
// Alokasi biaya ke tiap item PO, lalu tambahkan ke nilai persediaan.
// Aman diulang: alokasi sebelumnya dikembalikan dulu (avg_cost dipulihkan).
router.post('/:id/calculate', async (req, res)=>{
  const client = await pool.connect();
  try {
    const lcRes = await client.query('SELECT * FROM landed_costs WHERE id=$1', [req.params.id]);
    const lc = lcRes.rows[0];
    if (!lc) return res.status(404).json({ error: 'Landed cost tidak ditemukan' });
    if (lc.status === 'POSTED') return res.status(400).json({ error: 'Landed cost sudah diposting ke jurnal - hitung ulang tidak diizinkan' });

    await client.query('BEGIN');
    // 1) kembalikan nilai persediaan ke kondisi sebelum alokasi sebelumnya.
    //    Urut DESC: kalau satu produk punya beberapa baris PO, pemulihan terakhir
    //    harus baris alokasi paling awal (nilai aslinya), bukan yang terakhir.
    const prev = await client.query('SELECT * FROM landed_cost_allocations WHERE landed_cost_id=$1 ORDER BY id DESC', [req.params.id]);
    let reverted = 0;
    for (const a of prev.rows){
      if (a.avg_cost_before === null || a.avg_cost_before === undefined) continue;
      if (a.warehouse_id){
        const u = await client.query('UPDATE stocks SET avg_cost=$1 WHERE product_id=$2 AND warehouse_id=$3',
          [a.avg_cost_before, a.product_id, a.warehouse_id]);
        reverted += u.rowCount;
      } else {
        const u = await client.query('UPDATE stocks SET avg_cost=$1 WHERE product_id=$2', [a.avg_cost_before, a.product_id]);
        reverted += u.rowCount;
      }
    }
    await client.query('DELETE FROM landed_cost_allocations WHERE landed_cost_id=$1', [req.params.id]);

    // 2) hitung ulang alokasi dari komponen biaya + item PO
    const det = await client.query('SELECT * FROM landed_cost_details WHERE landed_cost_id=$1', [req.params.id]);
    const totalCost = det.rows.reduce((a, b)=> a + num(b.amount_idr), 0);
    if (!totalCost) return res.status(400).json({ error: 'Komponen biaya masih 0 - isi dulu biaya impornya' });
    const poDetails = await client.query('SELECT * FROM po_details WHERE po_id=$1 ORDER BY id', [lc.po_id]);
    if (!poDetails.rows.length) return res.status(400).json({ error: 'PO belum punya item - tidak ada yang bisa dialokasikan' });

    const baseOf = (pd)=>{
      if (lc.allocation_method === 'VALUE') return num(pd.total);
      if (lc.allocation_method === 'WEIGHT') return num(pd.qty_received) || num(pd.qty);
      return 1; // VOLUME: rata per baris item
    };
    const totalBase = poDetails.rows.reduce((a, pd)=> a + baseOf(pd), 0);

    const allocations = [];
    for (const pd of poDetails.rows){
      const base = baseOf(pd);
      const share = totalBase > 0 ? base / totalBase : 1 / poDetails.rows.length;
      const extra = totalCost * share;
      const qty = num(pd.qty_received) || num(pd.qty) || 0;
      const perUnit = qty ? extra / qty : 0;

      const st = await client.query('SELECT id, warehouse_id, qty_on_hand, avg_cost FROM stocks WHERE product_id=$1 ORDER BY id LIMIT 1', [pd.product_id]);
      const row = st.rows[0];
      const beforeAvg = row ? num(row.avg_cost) : null;
      const beforeQty = row ? num(row.qty_on_hand) : null;
      const warehouseId = row ? row.warehouse_id : null;
      // Barang sudah masuk stok saat GRN (qty_on_hand sudah termasuk yang diterima),
      // jadi biaya impor hanya menambah NILAI persediaan - qty tidak ditambah lagi.
      //   avg_cost baru = (qty on hand x avg lama + tambahan biaya) / qty on hand
      const newAvg = row
        ? (beforeQty > 0 ? ((beforeQty * beforeAvg) + extra) / beforeQty : (beforeAvg + perUnit))
        : null;

      if (row) await client.query('UPDATE stocks SET avg_cost=$1 WHERE id=$2', [newAvg, row.id]);

      await client.query(
        `INSERT INTO landed_cost_allocations (landed_cost_id,product_id,warehouse_id,qty,base,share,extra,per_unit,avg_cost_before,avg_cost_after,qty_before)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [req.params.id, pd.product_id, warehouseId, qty, base, share, extra, perUnit, beforeAvg, newAvg, beforeQty]);

      allocations.push({ product_id: pd.product_id, qty, base, share, extra, per_unit: perUnit,
        avg_cost_before: beforeAvg, avg_cost_after: newAvg, stocks_found: !!row });
    }

    await client.query("UPDATE landed_costs SET total_cost=$1, status='CALCULATED' WHERE id=$2", [totalCost, req.params.id]);
    await client.query('COMMIT');
    const tanpaStok = allocations.filter(a=> !a.stocks_found).length;
    res.json({ totalCost, method: lc.allocation_method, reverted_rows: reverted, allocations,
      tanpa_stok: tanpaStok,
      catatan: tanpaStok ? tanpaStok + ' item belum punya baris stok - nilai per unit tidak masuk ke persediaan' : null });
  } catch (e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[lc calculate]', e);
    res.status(500).json({ error: 'Gagal menghitung alokasi: ' + e.message });
  } finally { client.release(); }
});

// -------------------------------------------------------------- POST /:id/post
// Kunci nilai persediaan ke jurnal: Debit Persediaan, Kredit Hutang Usaha / Hutang Pajak.
router.post('/:id/post', async (req, res)=>{
  const client = await pool.connect();
  try {
    const lcRes = await client.query('SELECT * FROM landed_costs WHERE id=$1', [req.params.id]);
    const lc = lcRes.rows[0];
    if (!lc) return res.status(404).json({ error: 'Landed cost tidak ditemukan' });
    if (lc.status === 'POSTED') return res.status(400).json({ error: 'Landed cost sudah diposting sebelumnya' });
    if (lc.status !== 'CALCULATED') return res.status(400).json({ error: 'Hitung alokasi dulu sebelum posting jurnal' });

    const det = await client.query('SELECT * FROM landed_cost_details WHERE landed_cost_id=$1', [req.params.id]);
    const total = det.rows.reduce((a, b)=> a + num(b.amount_idr), 0);

    await client.query('BEGIN');
    const inv = await client.query("SELECT id FROM accounts WHERE code='1-1200' OR name ILIKE '%persediaan%' ORDER BY code LIMIT 1");
    const payable = await client.query("SELECT id FROM accounts WHERE code='2-1000' OR name ILIKE '%hutang usaha%' ORDER BY code LIMIT 1");
    const tax = await client.query("SELECT id FROM accounts WHERE code='2-1100' OR name ILIKE '%hutang pajak%' ORDER BY code LIMIT 1");

    const je = await client.query(
      `INSERT INTO journal_entries (entry_number,entry_date,description,total_debit,total_credit,posted)
       VALUES ($1,CURRENT_DATE,$2,$3,$3,true) RETURNING id`,
      ['JE-LC-' + req.params.id, 'Landed cost #' + req.params.id + ' (' + (lc.container_no || lc.bl_number || 'impor') + ')', total]);
    const jeId = je.rows[0].id;

    let detailLines = 0;
    if (inv.rows[0]){
      await client.query('INSERT INTO journal_details (journal_id,account_id,debit,credit,description) VALUES ($1,$2,$3,0,$4)',
        [jeId, inv.rows[0].id, total, 'Kapitalisasi biaya impor ke persediaan']);
      detailLines++;
      const taxTotal = det.rows.filter(d=> ['DUTY','TAX'].includes(d.cost_type)).reduce((a, b)=> a + num(b.amount_idr), 0);
      const otherTotal = total - taxTotal;
      if (taxTotal > 0 && tax.rows[0]){
        await client.query('INSERT INTO journal_details (journal_id,account_id,debit,credit,description) VALUES ($1,$2,0,$3,$4)',
          [jeId, tax.rows[0].id, taxTotal, 'Bea masuk & PPh22 impor']);
        detailLines++;
      }
      const rest = (taxTotal > 0 && tax.rows[0]) ? otherTotal : total;
      if (rest > 0 && payable.rows[0]){
        await client.query('INSERT INTO journal_details (journal_id,account_id,debit,credit,description) VALUES ($1,$2,0,$3,$4)',
          [jeId, payable.rows[0].id, rest, 'Freight, asuransi, clearance, trucking']);
        detailLines++;
      }
    }
    await client.query("UPDATE landed_costs SET status='POSTED', posted_at=NOW(), journal_entry_id=$1 WHERE id=$2", [jeId, req.params.id]);
    await client.query('COMMIT');
    res.json({ ok:true, journal_entry_id: jeId, entry_number: 'JE-LC-' + req.params.id, total,
      detail_lines: detailLines,
      catatan: detailLines ? null : 'COA Persediaan/Hutang tidak ditemukan - jurnal dibuat tanpa rincian baris' });
  } catch (e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[lc post]', e);
    res.status(500).json({ error: 'Gagal posting jurnal: ' + e.message });
  } finally { client.release(); }
});

// ------------------------------------------------------------- DELETE /:id
router.delete('/:id', async (req, res)=>{
  const client = await pool.connect();
  try {
    const lc = await client.query('SELECT * FROM landed_costs WHERE id=$1', [req.params.id]);
    if (!lc.rows[0]) return res.status(404).json({ error: 'Landed cost tidak ditemukan' });
    if (lc.rows[0].status === 'POSTED') return res.status(400).json({ error: 'Sudah diposting - hapus lewat jurnal koreksi, bukan di sini' });
    await client.query('BEGIN');
    // kembalikan avg_cost sebelum baris alokasi dihapus (urutan DESC seperti di calculate)
    const prev = await client.query('SELECT * FROM landed_cost_allocations WHERE landed_cost_id=$1 ORDER BY id DESC', [req.params.id]);
    for (const a of prev.rows){
      if (a.avg_cost_before === null || a.avg_cost_before === undefined) continue;
      if (a.warehouse_id) await client.query('UPDATE stocks SET avg_cost=$1 WHERE product_id=$2 AND warehouse_id=$3', [a.avg_cost_before, a.product_id, a.warehouse_id]);
      else await client.query('UPDATE stocks SET avg_cost=$1 WHERE product_id=$2', [a.avg_cost_before, a.product_id]);
    }
    await client.query('DELETE FROM landed_cost_allocations WHERE landed_cost_id=$1', [req.params.id]);
    await client.query('DELETE FROM landed_cost_details WHERE landed_cost_id=$1', [req.params.id]);
    await client.query('DELETE FROM landed_costs WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok:true, restored: prev.rows.length });
  } catch (e){
    await client.query('ROLLBACK').catch(()=>{});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

export default router;
