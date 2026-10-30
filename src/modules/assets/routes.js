import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
import { postJournal, ensureCoa, withTx } from '../../lib/journal.js';
const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;
const int = (v)=> parseInt(v, 10) || 0;
const idDateShort = (d)=>{
  const x = d instanceof Date ? d : (d ? new Date(d) : new Date());
  if (Number.isNaN(x.getTime())) return String(d ?? '-');
  const p = (n)=> String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
};
const iso = (d)=>{
  if (!d) return null;
  if (d instanceof Date){
    const p = (n)=> String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
};

// ---------------------------------------------------------------------------
// Hitung depresiasi berjalan dari data aset. Sumber tunggal untuk kartu, summary,
// jadwal, disposal gain/loss, dan posting jurnal.
//   STRAIGHT  : (cost - residual) / (umur * 12) per bulan
//   DECLINING : double declining (2/umur) atas nilai buku - residual, per bulan
// ---------------------------------------------------------------------------
function depreciationState(asset, asOf = new Date()){
  const cost = num(asset.acquisition_cost);
  const residual = num(asset.residual_value);
  const life = int(asset.useful_life_years) || 5;
  const depreciable = Math.max(0, cost - residual);
  const months = life * 12;
  const start = asset.acquisition_date ? new Date(asset.acquisition_date) : null;
  const startMonth = start ? start.getFullYear() * 12 + start.getMonth() : null;
  const nowMonth = asOf.getFullYear() * 12 + asOf.getMonth();
  const elapsed = startMonth === null ? 0 : Math.max(0, Math.min(months, nowMonth - startMonth));
  const thisYearStart = asOf.getFullYear() * 12;

  const rows = [];
  let book = cost, accum = 0, monthly = 0;
  for (let m = 1; m <= months; m++){
    if (asset.depreciation_method === 'DECLINING'){
      const rate = 2 / life;
      monthly = Math.max(0, (book - residual) * rate / 12);
      if (m === months) monthly = Math.max(0, book - residual);
    } else {
      monthly = depreciable / months;
    }
    monthly = Math.min(monthly, Math.max(0, book - residual));
    book -= monthly;
    accum += monthly;
    rows.push({ month_index: m, depreciation: monthly, accumulated: accum, book_value: book });
  }
  const upto = rows.slice(0, elapsed);
  const accumulated = upto.reduce((a, b)=> a + b.depreciation, 0);
  const thisYear = rows.slice(0, elapsed)
    .filter((_, i)=> (startMonth + i) >= thisYearStart)
    .reduce((a, b)=> a + b.depreciation, 0);
  return {
    monthly: elapsed < months ? (rows[elapsed] ? rows[elapsed].depreciation : 0) : 0,
    accumulated, book_value: cost - accumulated, this_year: thisYear,
    months_elapsed: elapsed, months_total: months, depreciable,
  };
}

function withDepreciation(a){
  const st = depreciationState(a);
  return {
    ...a,
    acquisition_cost: num(a.acquisition_cost),
    residual_value: num(a.residual_value),
    book_value: st.book_value,
    accumulated_depreciation: st.accumulated,
    depreciation_this_year: st.this_year,
    monthly_depreciation: st.monthly,
    months_elapsed: st.months_elapsed,
    acquisition_date: iso(a.acquisition_date),
  };
}

// ------------------------------------------------------------------- GET /assets
// Armada (vehicles) yang tertaut lewat vehicle_id ikut tampil di sini lengkap dengan
// plat & status armadanya, jadi aset tetap = aset biasa + armada milik sendiri.
router.get('/', async (req, res)=>{
  const w = [];
  const p = [];
  if (req.query.q){
    p.push('%' + String(req.query.q).toLowerCase() + '%');
    w.push(`(LOWER(fa.asset_code) LIKE $${p.length} OR LOWER(fa.name) LIKE $${p.length} OR LOWER(COALESCE(v.plat_no,'')) LIKE $${p.length})`);
  }
  if (req.query.category && req.query.category !== 'Semua'){ p.push(req.query.category); w.push(`fa.category = $${p.length}`); }
  if (req.query.status && req.query.status !== 'Semua'){ p.push(req.query.status); w.push(`fa.status = $${p.length}`); }
  try {
    const r = await pool.query(
      `SELECT fa.*, v.plat_no AS fleet_plat, v.type AS fleet_type, v.ownership AS fleet_ownership,
              v.kir_expiry AS fleet_kir_expiry, v.tax_expiry AS fleet_tax_expiry, v.status AS fleet_status
         FROM fixed_assets fa
         LEFT JOIN vehicles v ON v.id = fa.vehicle_id
         ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
        ORDER BY fa.asset_code`, p);
    let rows = r.rows.map(withDepreciation);
    if (req.query.sort === 'umur') rows.sort((a, b)=> b.months_elapsed - a.months_elapsed);
    else if (req.query.sort === 'nilai') rows.sort((a, b)=> b.book_value - a.book_value);
    else if (req.query.sort === 'perolehan') rows.sort((a, b)=> b.acquisition_cost - a.acquisition_cost);
    res.json(rows);
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------- GET /assets/summary
router.get('/summary', async (_req, res)=>{
  try {
    const r = await pool.query('SELECT * FROM fixed_assets');
    const rows = r.rows.map(withDepreciation);
    const active = rows.filter(x=> x.status !== 'DISPOSED');
    const maint = await pool.query(
      `SELECT COUNT(DISTINCT asset_id)::int AS n FROM asset_maintenance
        WHERE maintenance_date >= CURRENT_DATE - INTERVAL '12 months'`).catch(()=>({ rows: [{ n: 0 }] }));
    res.json({
      total_assets: rows.length,
      active_assets: active.length,
      total_acquisition: rows.reduce((a, b)=> a + b.acquisition_cost, 0),
      total_book_value: active.reduce((a, b)=> a + b.book_value, 0),
      total_depreciation_this_year: active.reduce((a, b)=> a + b.depreciation_this_year, 0),
      needs_maintenance: maint.rows[0].n,
    });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------ GET /assets/meta
router.get('/meta', async (_req, res)=>{
  try {
    const r = await pool.query("SELECT DISTINCT category FROM fixed_assets WHERE category IS NOT NULL ORDER BY category");
    const cats = r.rows.map(x=> x.category);
    // ARMADA selalu tersedia walau belum ada armadanya
    if (!cats.includes('ARMADA')) cats.push('ARMADA');
    res.json({ categories: cats,
      methods: ['STRAIGHT', 'DECLINING'], statuses: ['ACTIVE', 'MAINTENANCE', 'DISPOSED'] });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------- POST /assets/sync-fleet
// Tarik/segarkan armada menjadi Aset Tetap. Idempoten: dipanggil berkali-kali
// tidak menggandakan baris (dikunci oleh fixed_assets.vehicle_id).
//   - ownership OWNED saja (RENTED / THIRD_PARTY bukan aset perusahaan)
//   - harga perolehan & umur diambil dari vehicles, hanya ditimpa bila aset masih 0
//     supaya angka yang sudah diedit di halaman Aset tidak hilang
//   - aset berstatus DISPOSED tidak dihidupkan kembali
router.post('/sync-fleet', async (req, res)=>{
  const body = req.body || {};
  const includeAll = body.include_all === true || body.include_all === 'true';
  try {
    const vs = await pool.query(
      `SELECT * FROM vehicles ${includeAll ? '' : "WHERE ownership = 'OWNED'"} ORDER BY id`);
    let created = 0, updated = 0;
    const skipped = [];
    for (const v of vs.rows){
      const cost = num(v.acquisition_cost);
      const life = int(v.useful_life_years) || 8;
      const residual = num(v.residual_value);
      const acqDate = iso(v.acquisition_date) || (v.year ? `${v.year}-01-01` : null) || iso(new Date());
      const name = `${v.type || 'Armada'} - ${v.plat_no}`;
      const status = v.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'ACTIVE';
      const existing = await pool.query('SELECT * FROM fixed_assets WHERE vehicle_id = $1', [v.id]);
      if (existing.rows[0]){
        const a = existing.rows[0];
        if (a.status === 'DISPOSED'){ skipped.push({ plat: v.plat_no, reason: 'aset sudah DISPOSED' }); continue; }
        await pool.query(
          `UPDATE fixed_assets SET name = $1, category = 'ARMADA', location = COALESCE(location, $2),
                  photo_url = COALESCE($3, photo_url), status = $4,
                  acquisition_date = COALESCE(acquisition_date, $5),
                  acquisition_cost = CASE WHEN COALESCE(acquisition_cost,0) = 0 THEN $6 ELSE acquisition_cost END,
                  book_value = CASE WHEN COALESCE(acquisition_cost,0) = 0 THEN $6 ELSE book_value END,
                  useful_life_years = CASE WHEN COALESCE(useful_life_years,0) = 0 THEN $7 ELSE useful_life_years END,
                  residual_value = CASE WHEN COALESCE(residual_value,0) = 0 THEN $8 ELSE residual_value END
             WHERE id = $9`,
          [name, 'Armada - ' + (v.brand || ''), v.photo_url || null, status, acqDate, cost, life, residual, a.id]);
        updated++;
      } else {
        await pool.query(
          `INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                                     useful_life_years, depreciation_method, accumulated_depreciation,
                                     book_value, location, residual_value, photo_url, status, vehicle_id)
           VALUES ($1,$2,'ARMADA',$3,$4,$5,'STRAIGHT',0,$4,$6,$7,$8,$9,$10)
           ON CONFLICT (asset_code) DO NOTHING`,
          ['AST-ARM-' + String(v.id).padStart(3, '0'), name, acqDate, cost, life,
           'Armada - ' + (v.brand || ''), residual, v.photo_url || null, status, v.id]);
        await pool.query('UPDATE vehicles SET asset_code = $1 WHERE id = $2 AND (asset_code IS NULL OR asset_code = $3)',
          ['AST-ARM-' + String(v.id).padStart(3, '0'), v.id, '']);
        created++;
      }
    }
    const total = await pool.query("SELECT COUNT(*)::int AS n FROM fixed_assets WHERE category = 'ARMADA'");
    const zeroCost = await pool.query("SELECT COUNT(*)::int AS n FROM fixed_assets WHERE category = 'ARMADA' AND COALESCE(acquisition_cost,0) = 0");
    res.json({ ok: true, created, updated, skipped, armada_assets: total.rows[0].n, tanpa_harga_perolehan: zeroCost.rows[0].n });
  } catch (e){ res.status(500).json({ error: 'Gagal menarik data armada: ' + e.message }); }
});

// ------------------------------------------------------------------ POST /assets
router.post('/', async (req, res)=>{
  const b = req.body || {};
  const missing = [];
  if (!b.asset_code) missing.push('asset_code');
  if (!b.name) missing.push('name');
  if (!b.acquisition_date) missing.push('acquisition_date');
  if (!(num(b.acquisition_cost) > 0)) missing.push('acquisition_cost (> 0)');
  if (missing.length) return res.status(400).json({ error: 'Field wajib belum lengkap: ' + missing.join(', ') });
  try {
    const dup = await pool.query('SELECT id FROM fixed_assets WHERE LOWER(asset_code) = LOWER($1)', [b.asset_code]);
    if (dup.rows[0]) return res.status(409).json({ error: `Kode aset ${b.asset_code} sudah dipakai` });
    const cost = num(b.acquisition_cost);
    const r = await pool.query(
      `INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                                 useful_life_years, depreciation_method, accumulated_depreciation, book_value,
                                 location, residual_value, photo_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$5,$8,$9,$10,'ACTIVE') RETURNING *`,
      [b.asset_code, b.name, b.category || 'ALAT', b.acquisition_date, cost,
       int(b.useful_life_years) || 5, b.depreciation_method === 'DECLINING' ? 'DECLINING' : 'STRAIGHT',
       b.location || null, num(b.residual_value), b.photo_url || null]);
    res.json({ ok: true, asset: withDepreciation(r.rows[0]) });
  } catch (e){ res.status(400).json({ error: e.message }); }
});

// -------------------------------------------------------------- PUT /assets/:id
router.put('/:id', async (req, res)=>{
  const b = req.body || {};
  try {
    const cur = await pool.query('SELECT * FROM fixed_assets WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    const c = cur.rows[0];
    if (b.asset_code && String(b.asset_code).toLowerCase() !== String(c.asset_code).toLowerCase()){
      const dup = await pool.query('SELECT id FROM fixed_assets WHERE LOWER(asset_code) = LOWER($1) AND id != $2',
        [b.asset_code, req.params.id]);
      if (dup.rows[0]) return res.status(409).json({ error: `Kode aset ${b.asset_code} sudah dipakai` });
    }
    const r = await pool.query(
      `UPDATE fixed_assets SET asset_code = COALESCE($1, asset_code), name = COALESCE($2, name),
              category = COALESCE($3, category), acquisition_date = COALESCE($4, acquisition_date),
              acquisition_cost = COALESCE($5, acquisition_cost), useful_life_years = COALESCE($6, useful_life_years),
              depreciation_method = COALESCE($7, depreciation_method), location = COALESCE($8, location),
              residual_value = COALESCE($9, residual_value), photo_url = COALESCE($10, photo_url),
              status = COALESCE($11, status)
        WHERE id = $12 RETURNING *`,
      [b.asset_code || null, b.name || null, b.category || null, b.acquisition_date || null,
       b.acquisition_cost !== undefined && b.acquisition_cost !== '' ? num(b.acquisition_cost) : null,
       b.useful_life_years !== undefined && b.useful_life_years !== '' ? int(b.useful_life_years) : null,
       b.depreciation_method || null, b.location ?? null,
       b.residual_value !== undefined && b.residual_value !== '' ? num(b.residual_value) : null,
       b.photo_url ?? null, b.status || null, req.params.id]);
    res.json({ ok: true, asset: withDepreciation(r.rows[0]) });
  } catch (e){ res.status(400).json({ error: e.message }); }
});

// ----------------------------------------------------------- DELETE /assets/:id
router.delete('/:id', async (req, res)=>{
  try {
    await pool.query('DELETE FROM asset_maintenance WHERE asset_id = $1', [req.params.id]);
    const r = await pool.query('DELETE FROM fixed_assets WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------- GET /assets/:id/maintenance (log)
router.get('/:id/maintenance', async (req, res)=>{
  try {
    const r = await pool.query(
      'SELECT * FROM asset_maintenance WHERE asset_id = $1 ORDER BY maintenance_date DESC', [req.params.id]);
    res.json({
      rows: r.rows.map(x=>({ ...x, cost: num(x.cost), maintenance_date: iso(x.maintenance_date) })),
      total_cost: r.rows.reduce((a, b)=> a + num(b.cost), 0),
    });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------ POST /assets/:id/maintenance
router.post('/:id/maintenance', async (req, res)=>{
  const { maintenance_date, type, cost, description } = req.body || {};
  if (!maintenance_date) return res.status(400).json({ error: 'Tanggal maintenance wajib diisi' });
  try {
    const r = await pool.query(
      `INSERT INTO asset_maintenance (asset_id, maintenance_date, type, cost, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, maintenance_date, type || 'PREVENTIVE', num(cost), description || null]);
    if ((type || '').toUpperCase() === 'MAINTENANCE'){
      await pool.query("UPDATE fixed_assets SET status = 'MAINTENANCE' WHERE id = $1 AND status = 'ACTIVE'", [req.params.id]);
    }
    res.json({ ok: true, row: { ...r.rows[0], cost: num(r.rows[0].cost), maintenance_date: iso(r.rows[0].maintenance_date) } });
  } catch (e){ res.status(400).json({ error: e.message }); }
});

// ------------------------------------ GET /assets/:id/depreciation (jadwal)
router.get('/:id/depreciation', async (req, res)=>{
  try {
    const a = await pool.query('SELECT * FROM fixed_assets WHERE id = $1', [req.params.id]);
    if (!a.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    const asset = a.rows[0];
    const st = depreciationState(asset);
    const life = int(asset.useful_life_years) || 5;
    const cost = num(asset.acquisition_cost);
    const residual = num(asset.residual_value);

    // jadwal tahunan (bentuk lama dipertahankan: year, depreciation, accumulated, book_value)
    const schedule = [];
    let book = cost, accum = 0;
    for (let y = 1; y <= life; y++){
      const dep = Math.min(Math.max(0, book - residual), st.depreciable / life);
      book -= dep; accum += dep;
      schedule.push({ year: y, depreciation: dep, accumulated: accum, book_value: book });
    }
    // jadwal bulanan untuk modal (kolom bulan)
    const schedule_monthly = [];
    let mBook = cost, mAccum = 0;
    for (let m = 1; m <= st.months_total; m++){
      let dep;
      if (asset.depreciation_method === 'DECLINING'){
        dep = Math.max(0, (mBook - residual) * (2 / life) / 12);
        if (m === st.months_total) dep = Math.max(0, mBook - residual);
      } else dep = st.depreciable / st.months_total;
      dep = Math.min(dep, Math.max(0, mBook - residual));
      mBook -= dep; mAccum += dep;
      schedule_monthly.push({ month: m, year: Math.ceil(m / 12), depreciation: dep,
        accumulated: mAccum, book_value: mBook, accrued: m <= st.months_elapsed });
    }
    res.json({
      asset: { ...asset, acquisition_cost: cost, residual_value: residual, book_value: st.book_value,
               accumulated_depreciation: st.accumulated, depreciation_this_year: st.this_year,
               acquisition_date: iso(asset.acquisition_date) },
      monthly: st.monthly,
      accumulated: st.accumulated,
      book_value: st.book_value,
      months_elapsed: st.months_elapsed,
      schedule,
      schedule_monthly,
    });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// --------------------------- POST /assets/:id/depreciate (posting jurnal manual)
router.post('/:id/depreciate', async (req, res)=>{
  try {
    const a = await pool.query('SELECT * FROM fixed_assets WHERE id = $1', [req.params.id]);
    if (!a.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (a.rows[0].status === 'DISPOSED') return res.status(400).json({ error: 'Aset sudah disposal' });
    const st = depreciationState(a.rows[0]);
    const amount = num(req.body?.amount) || st.accumulated;
    if (!(amount > 0)) return res.status(400).json({ error: 'Nilai depresiasi 0 - tidak ada yang diposting' });

    const date = req.body?.date || new Date().toISOString().slice(0, 10);
    const entryNumber = 'JE-DEP-' + a.rows[0].asset_code + '-' + Date.now().toString().slice(-6);
    await pool.query(
      `INSERT INTO journal_entries (entry_number, entry_date, description, total_debit, total_credit, posted)
       VALUES ($1,$2,$3,$4,$4,true)`,
      [entryNumber, date, `Depresiasi ${a.rows[0].asset_code} - ${a.rows[0].name}`, amount]);
    await pool.query(
      `UPDATE fixed_assets SET accumulated_depreciation = $1, book_value = $2 WHERE id = $3`,
      [st.accumulated, st.book_value, req.params.id]);
    res.json({ ok: true, entry_number: entryNumber, amount, accumulated: st.accumulated, book_value: st.book_value });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------- POST /assets/:id/dispose
router.post('/:id/dispose', async (req, res)=>{
  const price = num(req.body?.price);
  try {
    const a = await pool.query('SELECT * FROM fixed_assets WHERE id = $1', [req.params.id]);
    if (!a.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (a.rows[0].status === 'DISPOSED') return res.status(400).json({ error: 'Aset sudah didisposal' });
    const st = depreciationState(a.rows[0]);
    const gain = price - st.book_value;
    const date = req.body?.disposal_date || new Date().toISOString().slice(0, 10);

    await pool.query(
      `UPDATE fixed_assets SET status = 'DISPOSED', accumulated_depreciation = $1, book_value = $2 WHERE id = $3`,
      [st.accumulated, st.book_value, req.params.id]);
    const entryNumber = 'JE-DISP-' + a.rows[0].asset_code + '-' + Date.now().toString().slice(-6);
    await pool.query(
      `INSERT INTO journal_entries (entry_number, entry_date, description, total_debit, total_credit, posted)
       VALUES ($1,$2,$3,$4,$4,true)`,
      [entryNumber, date,
       `Disposal ${a.rows[0].asset_code} - harga jual ${price}, nilai buku ${st.book_value}, ${gain >= 0 ? 'laba' : 'rugi'} ${Math.abs(gain)}`,
       Math.abs(gain)]);
    res.json({ ok: true, gain_loss: gain, book_value: st.book_value, price,
               type: gain >= 0 ? 'GAIN' : 'LOSS', entry_number: entryNumber });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------- GET /assets/export
// dataset=assets (daftar aset) | depreciation (jadwal 1 aset, butuh id) | maintenance (riwayat 1 aset, butuh id)
router.get('/export', async (req, res)=>{
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['csv', 'xlsx', 'pdf'].includes(format)) return res.status(400).json({ error: `Format tidak didukung: ${format}` });
  const dataset = String(req.query.dataset || 'assets');
  try {
    if (dataset === 'depreciation'){
      const a = await pool.query('SELECT * FROM fixed_assets WHERE id = $1', [req.params.id || req.query.id]);
      if (!a.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
      const asset = a.rows[0];
      const st = depreciationState(asset);
      const columns = [{ label: 'Bulan' }, { label: 'Tahun' }, { label: 'Depresiasi', numeric: true, total: true },
                       { label: 'Akumulasi', numeric: true }, { label: 'Nilai Buku', numeric: true }, { label: 'Status' }];
      const rows = [];
      let book = num(asset.acquisition_cost), accum = 0;
      const life = int(asset.useful_life_years) || 5;
      const residual = num(asset.residual_value);
      for (let m = 1; m <= st.months_total; m++){
        let dep;
        if (asset.depreciation_method === 'DECLINING'){
          dep = Math.max(0, (book - residual) * (2 / life) / 12);
          if (m === st.months_total) dep = Math.max(0, book - residual);
        } else dep = st.depreciable / st.months_total;
        dep = Math.min(dep, Math.max(0, book - residual));
        book -= dep; accum += dep;
        rows.push([m, Math.ceil(m / 12), dep, accum, book, m <= st.months_elapsed ? 'Sudah dibukukan' : 'Rencana']);
      }
      const totals = ['', '', num(st.accumulated), '', '', ''];
      const subtitle = `${asset.asset_code} - ${asset.name}  |  Metode ${asset.depreciation_method}  |  Umur ${life} tahun  |  ` +
        `Perolehan ${idDateShort(asset.acquisition_date)}  |  Nilai buku sekarang ${num(asset.acquisition_cost) - st.accumulated}`;
      return sendReport(res, { format, filename: `depresiasi-${asset.asset_code}`,
        payload: { title: 'Jadwal Depresiasi Aset', subtitle, columns, rows, totals, sheetName: 'Depresiasi' } });
    }

    if (dataset === 'maintenance'){
      const a = await pool.query('SELECT * FROM fixed_assets WHERE id = $1', [req.query.id]);
      if (!a.rows[0]) return res.status(404).json({ error: 'Aset tidak ditemukan' });
      const r = await pool.query(
        'SELECT * FROM asset_maintenance WHERE asset_id = $1 ORDER BY maintenance_date DESC', [req.query.id]);
      const columns = [{ label: 'Tanggal' }, { label: 'Tipe' }, { label: 'Biaya', numeric: true, total: true }, { label: 'Keterangan' }];
      const rows = r.rows.map(x=>[iso(x.maintenance_date), x.type || '-', num(x.cost), x.description || '-']);
      const totals = ['', '', rows.reduce((s, x)=> s + num(x[2]), 0), ''];
      const subtitle = `${a.rows[0].asset_code} - ${a.rows[0].name}  |  ${rows.length} catatan pemeliharaan`;
      return sendReport(res, { format, filename: `maintenance-${a.rows[0].asset_code}`,
        payload: { title: 'Riwayat Pemeliharaan Aset', subtitle, columns, rows, totals, sheetName: 'Maintenance' } });
    }

    // default: daftar aset (mengikuti filter di layar)
    const w = [];
    const p = [];
    if (req.query.q){
      p.push('%' + String(req.query.q).toLowerCase() + '%');
      w.push(`(LOWER(fa.asset_code) LIKE $${p.length} OR LOWER(fa.name) LIKE $${p.length} OR LOWER(COALESCE(v.plat_no,'')) LIKE $${p.length})`);
    }
    if (req.query.category && req.query.category !== 'Semua'){ p.push(req.query.category); w.push(`fa.category = $${p.length}`); }
    if (req.query.status && req.query.status !== 'Semua'){ p.push(req.query.status); w.push(`fa.status = $${p.length}`); }
    const r = await pool.query(
      `SELECT fa.*, v.plat_no AS fleet_plat, v.type AS fleet_type
         FROM fixed_assets fa LEFT JOIN vehicles v ON v.id = fa.vehicle_id
         ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY fa.asset_code`, p);
    const rows0 = r.rows.map(withDepreciation);
    const columns = [{ label: 'Kode' }, { label: 'Nama' }, { label: 'Kategori' }, { label: 'Sumber' },
                     { label: 'Plat Armada' }, { label: 'Lokasi' },
                     { label: 'Tgl Perolehan' }, { label: 'Perolehan', numeric: true, total: true },
                     { label: 'Residu', numeric: true, total: true }, { label: 'Umur (th)', numeric: true },
                     { label: 'Metode' }, { label: 'Akumulasi', numeric: true, total: true },
                     { label: 'Nilai Buku', numeric: true, total: true }, { label: 'Status' }];
    const rows = rows0.map(a=>[a.asset_code, a.name, a.category || '-', a.vehicle_id ? 'Armada' : 'Manual',
                               a.fleet_plat || '-', a.location || '-', a.acquisition_date || '-',
                               a.acquisition_cost, a.residual_value, a.useful_life_years || 0, a.depreciation_method,
                               a.accumulated_depreciation, a.book_value, a.status]);
    const totals = columns.map((c, i)=> c.total ? rows.reduce((s, row)=> s + num(row[i]), 0) : '');
    const filters = [];
    if (req.query.category && req.query.category !== 'Semua') filters.push('Kategori: ' + req.query.category);
    if (req.query.status && req.query.status !== 'Semua') filters.push('Status: ' + req.query.status);
    if (req.query.q) filters.push('Pencarian: "' + req.query.q + '"');
    const subtitle = `Per ${idDateShort(new Date())}` + (filters.length ? '  |  ' + filters.join('  |  ') : '') + `  |  ${rows.length} aset`;
    return sendReport(res, { format, filename: 'daftar-aset-tetap',
      payload: { title: 'Daftar Aset Tetap (termasuk Armada)', subtitle, columns, rows, totals, sheetName: 'Aset Tetap' } });
  } catch (e){
    console.error('assets export error', e);
    res.status(500).json({ error: 'Gagal membuat laporan: ' + e.message });
  }
});

// ───────────────────────────── PENYUSUTAN OTOMATIS → JURNAL ─────────────────────────────
// Jalankan sekali per bulan: hitung penyusutan garis lurus tiap aset aktif,
// simpan ke asset_depreciations, update buku aset, dan posting jurnal
// Dr Beban Penyusutan / Cr Akumulasi Penyusutan (gabungan semua aset).
let depEnsured = false;
async function ensureDepTables(){
  if(depEnsured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS asset_depreciations (
    id SERIAL PRIMARY KEY,
    asset_id INT REFERENCES fixed_assets(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL,
    amount NUMERIC(18,2) DEFAULT 0,
    journal_id INT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, period)
  )`).catch(()=>{});
  await ensureCoa([
    { code:'1-3000', name:'Akumulasi Penyusutan', type:'ASSET' },
    { code:'6-2000', name:'Beban Penyusutan', type:'EXPENSE' },
  ]);
  depEnsured = true;
}

router.get('/depreciations', async (req,res)=>{
  await ensureDepTables();
  const period = /^\d{4}-\d{2}$/.test(String(req.query.period||'')) ? req.query.period : new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
  try{
    const r = await pool.query(`SELECT d.*, fa.asset_code, fa.name, fa.category
      FROM asset_depreciations d JOIN fixed_assets fa ON fa.id=d.asset_id
      WHERE d.period=$1 ORDER BY fa.asset_code`,[period]);
    res.json({ period, data:r.rows, total: r.rows.reduce((s,x)=>s+Number(x.amount||0),0) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/depreciation/run', async (req,res)=>{
  await ensureDepTables();
  const period = /^\d{4}-\d{2}$/.test(String(req.body?.period||'')) ? req.body.period : new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
  try{
    const assets = await pool.query(`SELECT * FROM fixed_assets
      WHERE UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' AND COALESCE(acquisition_cost,0) > 0 AND COALESCE(useful_life_years,0) > 0`);
    if(!assets.rows.length) return res.json({ ok:true, period, assets:0, total:0, journal_id:null, message:'Tidak ada aset aktif untuk disusutkan.' });
    let total = 0; const detail = [];
    const journalId = await withTx(async (c)=>{
      for(const a of assets.rows){
        const exist = await c.query('SELECT 1 FROM asset_depreciations WHERE asset_id=$1 AND period=$2',[a.id, period]);
        if(exist.rows[0]) continue;
        const cost = num(a.acquisition_cost), residual = num(a.residual_value);
        const life = Math.max(1, int(a.useful_life_years));
        const monthly = (cost - residual) / (life*12);
        const accumulated = num(a.accumulated_depreciation);
        const remaining = Math.max(0, (cost - residual) - accumulated);
        const amount = Math.round(Math.min(monthly, remaining) * 100) / 100;
        if(amount <= 0.5) continue;
        total += amount;
        detail.push({ asset_id:a.id, asset_code:a.asset_code, name:a.name, amount });
        await c.query(`INSERT INTO asset_depreciations (asset_id, period, amount, created_by) VALUES ($1,$2,$3,$4)
          ON CONFLICT (asset_id, period) DO NOTHING`, [a.id, period, amount, req.user.id]);
        await c.query(`UPDATE fixed_assets SET accumulated_depreciation = COALESCE(accumulated_depreciation,0)+$1,
            book_value = COALESCE(acquisition_cost,0) - (COALESCE(accumulated_depreciation,0)+$1)
          WHERE id=$2`, [amount, a.id]);
      }
      if(total <= 0.5) return null;
      return await postJournal({
        date: `${period}-01`,
        refType:'DEPRECIATION', refId:null, description:`Penyusutan aset periode ${period}`,
        lines:[
          { code:'6-2000', debit:total, description:'Beban penyusutan' },
          { code:'1-3000', credit:total, description:'Akumulasi penyusutan' },
        ], createdBy:req.user.id, client:c,
      });
    });
    if(journalId) await pool.query('UPDATE asset_depreciations SET journal_id=$1 WHERE period=$2 AND journal_id IS NULL',[journalId, period]);
    res.json({ ok:true, period, assets: detail.length, total, journal_id: journalId, detail,
      message: journalId ? `Penyusutan ${period} diposting: ${detail.length} aset, total Rp ${new Intl.NumberFormat('id-ID').format(Math.round(total))}.` : 'Semua aset sudah disusutkan untuk periode ini.' });
  }catch(e){ console.error('[depreciation]',e); res.status(500).json({error:e.message}); }
});

export default router;
