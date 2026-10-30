import express from 'express';
import crypto from 'node:crypto';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// JEMBATAN TIMBANG (weighbridge) — gerbang timbang truk material & baja.
// Agen lokal (PC timbangan) mengirim gross/tare + tanda tangan HMAC supaya angka
// berat tidak bisa diketik manual oleh orang gudang.
//   POST /logistics/scale/readings   (ingest, HMAC opsional bila SCALE_HMAC_KEY diisi)
//   GET  /logistics/scale/readings   (daftar, filter status/tanggal)
//   POST /logistics/scale/readings/:id/bind  (ikat ke GRN / DO + hitung variance)
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const KEY = process.env.SCALE_HMAC_KEY || '';

function verifySignature(raw, signature) {
  if (!KEY) return true; // mode dev: kunci belum diisi
  if (!signature) return false;
  const expect = crypto.createHmac('sha256', KEY).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expect, 'utf8'), Buffer.from(String(signature), 'utf8'));
  } catch { return false; }
}

router.post('/readings', async (req, res) => {
  try {
    const b = req.body || {};
    const gross = num(b.gross_kg) ?? num(b.reading_kg);
    const tare = num(b.tare_kg) ?? 0;
    if (gross === null || gross <= 0) return res.status(400).json({ error: 'gross_kg wajib (> 0)' });
    const net = num(b.net_kg) ?? Math.max(0, gross - (tare || 0));

    const raw = [b.device_id || '', b.vehicle_plate || '', gross, tare, net, b.reading_timestamp || ''].join('|');
    if (!verifySignature(raw, b.signature_hmac)) {
      return res.status(401).json({ error: 'Tanda tangan timbangan tidak valid', code: 'SCALE_SIGNATURE_INVALID' });
    }

    const r = await pool.query(
      `INSERT INTO scale_readings
        (reference_type, reference_id, scale_device_id, reading_kg, reading_timestamp,
         gross_kg, tare_kg, net_kg, vehicle_plate, photo_url, signature_hmac, status, notes)
       VALUES ($1,$2,$3,$4,COALESCE($5::timestamp, NOW()),$4,$6,$7,$8,$9,$10,'UNBOUND',$11)
       RETURNING *`,
      [b.reference_type || null, b.reference_id || null, b.device_id || null, gross,
        b.reading_timestamp || null, tare, net, b.vehicle_plate || null,
        b.photo_url || null, b.signature_hmac || null, b.notes || null]);

    await pool.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
                      VALUES ($1,'CREATE','SCALE_READING',$2,$3)`,
      [req.user?.id || null, r.rows[0].id, JSON.stringify({ net_kg: net, plate: b.vehicle_plate || null })]);

    res.status(201).json({ ok: true, reading: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/readings', async (req, res) => {
  try {
    const { status, start, end, plate } = req.query;
    let where = 'WHERE 1=1'; const p = [];
    if (status) { p.push(status); where += ` AND status=$${p.length}`; }
    if (plate) { p.push('%' + String(plate).toUpperCase() + '%'); where += ` AND UPPER(vehicle_plate) LIKE $${p.length}`; }
    if (start) { p.push(start); where += ` AND created_at::date >= $${p.length}`; }
    if (end) { p.push(end); where += ` AND created_at::date <= $${p.length}`; }
    const r = await pool.query(
      `SELECT s.*, u.username AS bound_by_name FROM scale_readings s
         LEFT JOIN users u ON u.id=s.bound_by ${where} ORDER BY s.id DESC LIMIT 200`, p);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ikat hasil timbang ke dokumen (GRN/DO). Bila dokumen punya berat teoretis
// (qty × berat produk), selisih dihitung dan di luar toleransi SNI ditandai HOLD.
router.post('/readings/:id/bind', async (req, res) => {
  const { reference_type, reference_id, override_reason } = req.body || {};
  const refType = String(reference_type || '').toUpperCase();
  if (!['GRN', 'DO'].includes(refType)) return res.status(400).json({ error: 'reference_type harus GRN atau DO' });
  if (!reference_id) return res.status(400).json({ error: 'reference_id wajib' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rd = await client.query('SELECT * FROM scale_readings WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!rd.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pembacaan timbangan tidak ditemukan' }); }
    if (rd.rows[0].status === 'BOUND') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Pembacaan sudah diikat ke dokumen lain' }); }

    const net = Number(rd.rows[0].net_kg ?? rd.rows[0].reading_kg ?? 0);
    const theoretical = refType === 'GRN'
      ? await client.query(`SELECT COALESCE(SUM(gd.qty_received * COALESCE(p.weight_kg,0)),0)::numeric AS kg
                              FROM grn_details gd JOIN products p ON p.id=gd.product_id WHERE gd.grn_id=$1`, [reference_id])
      : await client.query(`SELECT COALESCE(SUM(dd.qty * COALESCE(p.weight_kg,0)),0)::numeric AS kg
                              FROM do_details dd JOIN products p ON p.id=dd.product_id WHERE dd.do_id=$1`, [reference_id]);
    const theo = Number(theoretical.rows[0]?.kg || 0);
    const varianceKg = theo > 0 ? net - theo : 0;
    const variancePct = theo > 0 ? (varianceKg / theo) * 100 : 0;

    // Toleransi SNI per produk (maksimum dari item dokumen); default 3,5%
    const tol = await client.query(
      refType === 'GRN'
        ? `SELECT COALESCE(MAX(COALESCE(ss.tolerance_pct,3.5)),3.5)::numeric AS t
             FROM grn_details gd JOIN product_steel_specs ss ON ss.product_id=gd.product_id WHERE gd.grn_id=$1`
        : `SELECT COALESCE(MAX(COALESCE(ss.tolerance_pct,3.5)),3.5)::numeric AS t
             FROM do_details dd JOIN product_steel_specs ss ON ss.product_id=dd.product_id WHERE dd.do_id=$1`,
      [reference_id]);
    const tolerance = Number(tol.rows[0]?.t || 3.5);
    const outOfTolerance = theo > 0 && Math.abs(variancePct) > tolerance;
    const roles = (req.user?.roles || []).map((x) => String(x).toLowerCase());
    const privileged = roles.includes('direktur') || roles.includes('super_admin');
    if (outOfTolerance && !privileged && !override_reason) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: `Selisih berat ${variancePct.toFixed(2)}% melewati toleransi SNI ${tolerance}% — perlu persetujuan supervisor (kirim override_reason).`,
        code: 'WEIGHT_VARIANCE_HOLD',
        detail: { net_kg: net, theoretical_kg: theo, variance_kg: varianceKg, variance_pct: variancePct, tolerance_pct: tolerance },
      });
    }

    await client.query(
      `UPDATE scale_readings SET reference_type=$1, reference_id=$2, net_kg=$3,
              theoretical_kg=$4, reading_kg=$3, status='BOUND',
              bound_at=NOW(), bound_by=$5, notes=COALESCE($6, notes)
        WHERE id=$7`,
      [refType, reference_id, net, theo, req.user?.id || null, override_reason || null, req.params.id]);
    // variance_kg & variance_pct adalah kolom GENERATED (reading_kg - theoretical_kg) —
    // jangan di-update; nilai dibaca ulang setelah UPDATE.

    if (outOfTolerance) {
      if (refType === 'GRN') {
        await client.query(`UPDATE grn_details SET hold_status='WEIGHT_VARIANCE_HOLD'
                             WHERE grn_id=$1`, [reference_id]);
      } else {
        await client.query(`UPDATE delivery_orders SET status='WEIGHT_VARIANCE_HOLD' WHERE id=$1`, [reference_id]);
      }
    }
    await client.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
                        VALUES ($1,'UPDATE','SCALE_BIND',$2,$3)`,
      [req.user?.id || null, req.params.id, JSON.stringify({ refType, reference_id, variance_pct: variancePct, hold: outOfTolerance })]);

    await client.query('COMMIT');
    res.json({ ok: true, net_kg: net, theoretical_kg: theo, variance_kg: varianceKg, variance_pct: variancePct, tolerance_pct: tolerance, hold: outOfTolerance });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

export default router;
