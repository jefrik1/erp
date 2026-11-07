import express from 'express';
import { pool } from '../../config/db.js';
import { creditCash } from '../finance/routes.js';
import { withTx } from '../../lib/journal.js';

const router = express.Router();

async function cashSince(client, userId, since){
  const db = client || pool;
  const r = await db.query(
    "SELECT COALESCE(SUM(amount),0)::numeric AS cash, COUNT(*)::int AS n FROM payments WHERE created_by=$1 AND method='CASH' AND created_at >= $2",
    [userId, since]);
  return { cash: parseFloat(r.rows[0].cash)||0, n: r.rows[0].n };
}

// Shift terbuka milik saya + penjualan cash berjalan
router.get('/current', async (req,res)=>{
  try{
    const r = await pool.query("SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND status='OPEN' ORDER BY id DESC LIMIT 1",[req.user.id]);
    const shift = r.rows[0]||null;
    const sales = shift ? await cashSince(null, req.user.id, shift.login_time) : null;
    res.json({ shift, sales });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Buka shift (kas awal) dengan transaksi aman & lock konkurensi register dinamis.
router.post('/open', async (req,res)=>{
  const opening = parseFloat(req.body?.opening_cash)||0;
  const registerId = parseInt(req.body?.register_id || req.headers['x-register-id'] || req.user?.register_id || 1, 10);
  try{
    const result = await withTx(async (client) => {
      const open = await client.query(
        "SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND status='OPEN' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [req.user.id]);
      if(open.rows[0]) return { ok:true, already:true, shift:open.rows[0] };

      // Pastikan register ini tidak sedang dibuka oleh kasir lain secara bersamaan
      const regLock = await client.query(
        "SELECT * FROM pos_cashier_shifts WHERE register_id=$1 AND status='OPEN' FOR UPDATE",
        [registerId]);
      if(regLock.rows[0] && regLock.rows[0].cashier_id !== req.user.id){
        throw new Error(`Register #${registerId} sedang digunakan oleh kasir lain (Shift #${regLock.rows[0].id})`);
      }

      const todayRow = await client.query(
        "SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND register_id=$2 AND shift_date=(NOW() AT TIME ZONE 'Asia/Jakarta')::date ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [req.user.id, registerId]);

      let shift;
      if(todayRow.rows[0]){
        const upd = await client.query(
          `UPDATE pos_cashier_shifts SET status='OPEN', login_time=NOW(), opening_cash=$1,
             logout_time=NULL, closing_cash=NULL, expected_closing=NULL, variance=NULL, variance_pct=NULL, notes=NULL
           WHERE id=$2 RETURNING *`, [opening, todayRow.rows[0].id]);
        shift = upd.rows[0];
      } else {
        const ins = await client.query(
          `INSERT INTO pos_cashier_shifts (cashier_id, register_id, shift_date, login_time, opening_cash, status)
           VALUES ($1,$2,(NOW() AT TIME ZONE 'Asia/Jakarta')::date,NOW(),$3,'OPEN') RETURNING *`,
          [req.user.id, registerId, opening]);
        shift = ins.rows[0];
      }
      return { ok:true, shift };
    }, req.user);

    res.json(result);
  }catch(e){ res.status(400).json({error:e.message}); }
});

// Tutup shift: transaksi atomik dengan SELECT ... FOR UPDATE untuk integritas kas
router.post('/close', async (req,res)=>{
  const closing = parseFloat(req.body?.closing_cash)||0;
  const notes = req.body?.notes||null;
  try{
    const result = await withTx(async (client) => {
      const r = await client.query(
        "SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND status='OPEN' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [req.user.id]);
      const shift = r.rows[0];
      if(!shift) throw new Error('Tidak ada shift yang sedang terbuka');

      const s = await cashSince(client, req.user.id, shift.login_time);
      const opening = parseFloat(shift.opening_cash||0);
      const expected = opening + s.cash;
      const variance = closing - expected;
      const variance_pct = expected>0 ? Math.round((variance/expected)*10000)/100 : 0;
      const upd = await client.query(
        `UPDATE pos_cashier_shifts SET status='CLOSED', logout_time=NOW(),
           closing_cash=$1, expected_closing=$2, variance=$3, variance_pct=$4, notes=$5
         WHERE id=$6 RETURNING *`,
        [closing, expected, variance, variance_pct, notes, shift.id]);

      const masukKas = Math.max(0, closing - opening);
      return {
        shift: upd.rows[0],
        summary: { opening, cash_sales:s.cash, transaksi_cash:s.n, expected, closing, variance, masuk_kas:masukKas }
      };
    }, req.user);

    // Pencatatan kas masuk ke cash_movements
    let cash = null;
    if(result.summary.masuk_kas > 0){
      try{
        const already = await pool.query(
          `SELECT 1 FROM cash_movements WHERE source='SHIFT_CLOSE' AND reference_type='SHIFT' AND reference_id=$1 AND created_at >= $2 LIMIT 1`,
          [result.shift.id, result.shift.login_time]);
        if(!already.rows[0]){
          cash = await creditCash({
            amount: result.summary.masuk_kas,
            source: 'SHIFT_CLOSE',
            referenceType: 'SHIFT',
            referenceId: result.shift.id,
            notes: `Tutup shift #${result.shift.id} - penjualan tunai (kas ${closing} - kas awal ${result.summary.opening})`,
            createdBy: req.user.id,
            withJournal: false,
          });
        }
      }catch(err){ console.error('[shift cash]', err.message); }
    }

    res.json({ ok:true, shift:result.shift, summary:result.summary, cash_account:cash });
  }catch(e){ res.status(400).json({error:e.message}); }
});

// Riwayat 10 shift terakhir milik saya
router.get('/history', async (req,res)=>{
  try{
    const r = await pool.query("SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 ORDER BY id DESC LIMIT 10",[req.user.id]);
    res.json(r.rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
