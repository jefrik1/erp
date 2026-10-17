import express from 'express';
import { pool } from '../../config/db.js';
const router = express.Router();

const REGISTER_WEB = 1; // register default untuk POS web (satu kasir = satu shift terbuka)

async function cashSince(userId, since){
  const r = await pool.query(
    "SELECT COALESCE(SUM(amount),0)::numeric AS cash, COUNT(*)::int AS n FROM payments WHERE created_by=$1 AND method='CASH' AND created_at >= $2",
    [userId, since]);
  return { cash: parseFloat(r.rows[0].cash)||0, n: r.rows[0].n };
}

// Shift terbuka milik saya + penjualan cash berjalan
router.get('/current', async (req,res)=>{
  try{
    const r = await pool.query("SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND status='OPEN' ORDER BY id DESC LIMIT 1",[req.user.id]);
    const shift = r.rows[0]||null;
    const sales = shift ? await cashSince(req.user.id, shift.login_time) : null;
    res.json({ shift, sales });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Buka shift (kas awal). Kalau hari ini sudah ada shift yang CLOSED, baris itu dibuka ulang.
router.post('/open', async (req,res)=>{
  const opening = parseFloat(req.body?.opening_cash)||0;
  try{
    const open = await pool.query("SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND status='OPEN' ORDER BY id DESC LIMIT 1",[req.user.id]);
    if(open.rows[0]) return res.json({ ok:true, already:true, shift:open.rows[0] });
    const todayRow = await pool.query(
      "SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND register_id=$2 AND shift_date=(NOW() AT TIME ZONE 'Asia/Jakarta')::date ORDER BY id DESC LIMIT 1",
      [req.user.id, REGISTER_WEB]);
    let shift;
    if(todayRow.rows[0]){
      const upd = await pool.query(
        `UPDATE pos_cashier_shifts SET status='OPEN', login_time=NOW(), opening_cash=$1,
           logout_time=NULL, closing_cash=NULL, expected_closing=NULL, variance=NULL, variance_pct=NULL, notes=NULL
         WHERE id=$2 RETURNING *`, [opening, todayRow.rows[0].id]);
      shift = upd.rows[0];
    } else {
      const ins = await pool.query(
        `INSERT INTO pos_cashier_shifts (cashier_id, register_id, shift_date, login_time, opening_cash, status)
         VALUES ($1,$2,(NOW() AT TIME ZONE 'Asia/Jakarta')::date,NOW(),$3,'OPEN') RETURNING *`,
        [req.user.id, REGISTER_WEB, opening]);
      shift = ins.rows[0];
    }
    res.json({ ok:true, shift });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Tutup shift: hitung kas seharusnya (kas awal + penjualan CASH sejak buka) vs kas aktual
router.post('/close', async (req,res)=>{
  const closing = parseFloat(req.body?.closing_cash)||0;
  const notes = req.body?.notes||null;
  try{
    const r = await pool.query("SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 AND status='OPEN' ORDER BY id DESC LIMIT 1",[req.user.id]);
    const shift = r.rows[0];
    if(!shift) return res.status(400).json({error:'Tidak ada shift yang sedang terbuka'});
    const s = await cashSince(req.user.id, shift.login_time);
    const opening = parseFloat(shift.opening_cash||0);
    const expected = opening + s.cash;
    const variance = closing - expected;
    const variance_pct = expected>0 ? Math.round((variance/expected)*10000)/100 : 0;
    const upd = await pool.query(
      `UPDATE pos_cashier_shifts SET status='CLOSED', logout_time=NOW(),
         closing_cash=$1, expected_closing=$2, variance=$3, variance_pct=$4, notes=$5
       WHERE id=$6 RETURNING *`,
      [closing, expected, variance, variance_pct, notes, shift.id]);
    res.json({ ok:true, shift:upd.rows[0],
      summary:{ opening, cash_sales:s.cash, transaksi_cash:s.n, expected, closing, variance } });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Riwayat 10 shift terakhir milik saya
router.get('/history', async (req,res)=>{
  try{
    const r = await pool.query("SELECT * FROM pos_cashier_shifts WHERE cashier_id=$1 ORDER BY id DESC LIMIT 10",[req.user.id]);
    res.json(r.rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
