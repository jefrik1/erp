import { pool } from '../config/db.js';

/**
 * Kesalahan bisnis stok/harga. Dibawa sebagai error dengan status HTTP supaya route
 * bisa meneruskan apa adanya (422), bukan 500.
 */
export class BusinessError extends Error {
  constructor(message, code = 'BUSINESS_RULE', status = 422, detail = null) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * SATU-SATUNYA pintu mutasi stok. Mengunci baris (SELECT … FOR UPDATE), menolak stok
 * minus, memperbarui HPP rata-rata tertimbang, dan menulis kartu stok dalam transaksi
 * pemanggil.
 *
 * @param {object} db        pg client (WAJIB di dalam transaksi) atau pool
 * @param {object} p
 * @param {number} p.productId
 * @param {number} [p.warehouseId=1]
 * @param {string|null} [p.batchNo=null]
 * @param {string|null} [p.expiryDate=null]
 * @param {number} p.qtyDelta        positif = masuk, negatif = keluar
 * @param {number|null} [p.unitCost] harga per satuan untuk barang masuk (null = pakai HPP lama)
 * @param {string} p.refType         mis. GRN, DO, POS, ADJUST, OPNAME, RETURN, WASTE, CONSIGNMENT
 * @param {number|null} [p.refId]
 * @param {string|null} [p.notes]
 * @param {number|null} [p.userId]
 * @param {boolean} [p.allowNegative=false]
 * @param {string|null} [p.movementType] override tipe pergerakan (IN/OUT/ADJ/TRF)
 * @returns {{qty_before:number, qty_after:number, avg_cost:number, movement_id:number, stock_id:number}}
 */
export async function mutateStock(db, p) {
  const productId = Number(p.productId);
  const warehouseId = Number(p.warehouseId || 1);
  const batchNo = p.batchNo ? String(p.batchNo).trim() : null;
  const qtyDelta = Number(p.qtyDelta);
  if (!productId) throw new BusinessError('productId wajib', 'VALIDATION', 400);
  if (!Number.isFinite(qtyDelta) || qtyDelta === 0) throw new BusinessError('qtyDelta harus ≠ 0', 'VALIDATION', 400);

  // Kunci baris stok yang relevan (batch NULL = satu baris per produk+gudang).
  const cur = await db.query(
    `SELECT s.id, s.qty_on_hand, s.qty_reserved, COALESCE(s.avg_cost,0) AS avg_cost,
            p.sku, p.name AS product_name, w.name AS warehouse_name
       FROM stocks s
       JOIN products p ON p.id = s.product_id
       JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id=$1 AND s.warehouse_id=$2 AND COALESCE(s.batch_no,'') = COALESCE($3,'')
      ORDER BY s.id LIMIT 1
      FOR UPDATE`,
    [productId, warehouseId, batchNo],
  );
  const row = cur.rows[0];

  if (!row) {
    if (qtyDelta < 0) {
      const meta = await db.query(
        `SELECT p.sku, p.name AS product_name, w.name AS warehouse_name
           FROM products p, warehouses w WHERE p.id=$1 AND w.id=$2`, [productId, warehouseId]);
      const m = meta.rows[0] || {};
      throw new BusinessError(
        `Stok tidak cukup untuk ${m.sku || '#' + productId} ${m.product_name || ''} di ${m.warehouse_name || 'gudang #' + warehouseId}: tersedia 0, diminta ${Math.abs(qtyDelta)}`,
        'INSUFFICIENT_STOCK', 422,
        { product_id: productId, warehouse_id: warehouseId, available: 0, requested: Math.abs(qtyDelta) });
    }
    const ins = await db.query(
      `INSERT INTO stocks (product_id, warehouse_id, batch_no, expired_date, qty_on_hand, qty_reserved, avg_cost, last_updated)
       VALUES ($1,$2,$3,$4,$5,0,$6,NOW()) RETURNING id`,
      [productId, warehouseId, batchNo, p.expiryDate || null, qtyDelta, Number(p.unitCost) || 0]);
    const mv = await recordMovement(db, p, {
      productId, warehouseId, qtyDelta, unitCost: Number(p.unitCost) || 0, balance: qtyDelta,
    });
    return { stock_id: ins.rows[0].id, qty_before: 0, qty_after: qtyDelta, avg_cost: Number(p.unitCost) || 0, movement_id: mv };
  }

  const before = Number(row.qty_on_hand) || 0;
  const avgBefore = Number(row.avg_cost) || 0;
  const after = before + qtyDelta;

  if (after < 0 && !p.allowNegative) {
    throw new BusinessError(
      `Stok tidak cukup untuk ${row.sku} ${row.product_name} di ${row.warehouse_name}: tersedia ${Math.max(0, before - Number(row.qty_reserved || 0))}, diminta ${Math.abs(qtyDelta)}`,
      'INSUFFICIENT_STOCK', 422,
      { product_id: productId, warehouse_id: warehouseId, available: Math.max(0, before - Number(row.qty_reserved || 0)), requested: Math.abs(qtyDelta) });
  }

  let newAvg = avgBefore;
  const unitCost = num(p.unitCost);
  if (qtyDelta > 0 && unitCost !== null && unitCost > 0) {
    newAvg = after > 0 ? ((before * avgBefore) + (qtyDelta * unitCost)) / after : unitCost;
  } else if (qtyDelta > 0 && unitCost === null && avgBefore === 0) {
    newAvg = 0; // tidak ada dasar harga; dibiarkan 0 dan akan dilaporkan audit
  }

  await db.query(
    `UPDATE stocks SET qty_on_hand=$1, avg_cost=$2, last_updated=NOW(),
            expired_date=COALESCE($4, expired_date)
      WHERE id=$3`,
    [after, newAvg, row.id, p.expiryDate || null]);

  const mv = await recordMovement(db, p, { productId, warehouseId, qtyDelta, unitCost: unitCost ?? avgBefore, balance: after });
  return { stock_id: row.id, qty_before: before, qty_after: after, avg_cost: newAvg, movement_id: mv };
}

async function recordMovement(db, p, { productId, warehouseId, qtyDelta, unitCost, balance }) {
  const type = p.movementType || (qtyDelta > 0 ? 'IN' : 'OUT');
  const r = await db.query(
    `INSERT INTO stock_movements
       (product_id, warehouse_id, movement_type, reference_type, reference_id,
        qty_in, qty_out, unit_cost, balance_qty, movement_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamp, NOW()), $11)
     RETURNING id`,
    [productId, warehouseId, type, p.refType || 'MANUAL', p.refId || null,
      qtyDelta > 0 ? qtyDelta : 0, qtyDelta < 0 ? Math.abs(qtyDelta) : 0,
      unitCost || 0, balance, p.date || null, p.userId || null]);
  return r.rows[0].id;
}

/** HPP rata-rata tertimbang per produk untuk satu gudang (dipakai jurnal COGS). */
export async function weightedCost(db, productIds, warehouseId = 1) {
  const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const r = await db.query(
    `SELECT product_id,
            COALESCE(NULLIF(SUM(ABS(qty_on_hand)*COALESCE(avg_cost,0))/NULLIF(SUM(ABS(qty_on_hand)),0),0), MAX(avg_cost), 0)::numeric AS cost
       FROM stocks WHERE product_id = ANY($1) AND warehouse_id = $2 GROUP BY product_id`, [ids, warehouseId]);
  for (const x of r.rows) map.set(Number(x.product_id), Number(x.cost) || 0);
  return map;
}

/** Nilai HPP (COGS) untuk daftar item {product_id, qty}. */
export async function cogsValue(db, items, warehouseId = 1) {
  const costs = await weightedCost(db, (items || []).map((i) => i.product_id), warehouseId);
  return (items || []).reduce((a, it) => a + (Number(it.qty) || 0) * (costs.get(Number(it.product_id)) || 0), 0);
}

/**
 * Penjaga harga jual (mencegah insiden "nilai total masuk ke kolom harga satuan").
 * - unit_price > HPP × maxRatio  → ditolak selalu (indikasi salah input)
 * - unit_price < HPP atau < floor_price → boleh hanya untuk direktur/super_admin
 *   atau bila baris disertai price_reason (diteruskan ke approval).
 */
export async function assertPriceSanity(db, items, { user = {}, warehouseId = 1, maxRatio = 5, allowOverride = false } = {}) {
  const list = (items || []).filter((i) => Number(i.qty) > 0 && i.unit_price !== undefined);
  if (!list.length) return { ok: true };
  const costs = await weightedCost(db, list.map((i) => i.product_id), warehouseId);
  const ids = [...new Set(list.map((i) => Number(i.product_id)))];
  const floors = new Map();
  if (ids.length) {
    const r = await db.query('SELECT id, sku, name, COALESCE(floor_price,0)::numeric AS floor_price FROM products WHERE id = ANY($1)', [ids]);
    for (const p of r.rows) floors.set(Number(p.id), p);
  }
  const roles = (user.roles || []).map((r) => String(r).toLowerCase());
  const privileged = allowOverride || roles.includes('direktur') || roles.includes('super_admin');
  const violations = [];
  for (const it of list) {
    const pid = Number(it.product_id);
    const price = Number(it.unit_price) || 0;
    const cost = costs.get(pid) || 0;
    const prod = floors.get(pid) || {};
    const floor = Number(prod.floor_price) || 0;
    if (cost > 0 && price > cost * maxRatio) {
      violations.push({ product_id: pid, sku: prod.sku, code: 'PRICE_TOO_HIGH', price, cost,
        message: `Harga ${prod.sku || '#' + pid} Rp ${price.toLocaleString('id-ID')} > ${maxRatio}× HPP (Rp ${Math.round(cost).toLocaleString('id-ID')}) — kemungkinan nilai total terisi di kolom harga satuan` });
    } else if (!privileged && cost > 0 && price < cost) {
      violations.push({ product_id: pid, sku: prod.sku, code: 'BELOW_COST', price, cost,
        message: `Harga ${prod.sku || '#' + pid} Rp ${price.toLocaleString('id-ID')} di bawah HPP (Rp ${Math.round(cost).toLocaleString('id-ID')}) — perlu persetujuan direktur/super admin` });
    } else if (!privileged && floor > 0 && price < floor) {
      violations.push({ product_id: pid, sku: prod.sku, code: 'BELOW_FLOOR', price, floor,
        message: `Harga ${prod.sku || '#' + pid} Rp ${price.toLocaleString('id-ID')} di bawah harga lantai (Rp ${floor.toLocaleString('id-ID')})` });
    }
  }
  if (violations.length) {
    const blocked = violations.some((v) => v.code === 'PRICE_TOO_HIGH');
    throw new BusinessError(
      (blocked ? 'Harga tidak wajar: ' : 'Harga di bawah batas: ') + violations.map((v) => v.message).join('; '),
      blocked ? 'PRICE_OUTLIER_DETECTED' : 'PRICE_BELOW_LIMIT', 422, violations);
  }
  return { ok: true };
}

/** Helper route: kirim BusinessError sebagai JSON rapi, selain itu teruskan. */
export function sendBusinessError(res, e) {
  if (e instanceof BusinessError || e?.status && e?.code) {
    return res.status(e.status || 422).json({ error: e.message, code: e.code, detail: e.detail || null });
  }
  return null;
}
