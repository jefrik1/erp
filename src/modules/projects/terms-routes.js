import express from 'express';
import { pool } from '../../config/db.js';
import { postJournal, ensureCoa, withTx } from '../../lib/journal.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   TERMIN PROYEK → INVOICE OTOMATIS
   Proyek punya termin (DP, termin 1..n, retensi). Setiap termin bisa ditagih
   menjadi invoice AR tanpa membuat Sales Order manual.
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
async function ensureTables(){
  if(ensured) return;
  // Skema lama: term_number, description, percentage. Jangan ubah nama kolom —
  // tambahkan kolom penagihan yang belum ada.
  await pool.query(`CREATE TABLE IF NOT EXISTS project_terms (
    id SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    term_number INT NOT NULL DEFAULT 1,
    description VARCHAR(200) NOT NULL,
    percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING'
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE project_terms ADD COLUMN IF NOT EXISTS invoice_id INT`).catch(()=>{});
  await pool.query(`ALTER TABLE project_terms ADD COLUMN IF NOT EXISTS created_by INT`).catch(()=>{});
  await pool.query(`ALTER TABLE project_terms ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id INT`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_term_id INT`).catch(()=>{});
  await ensureCoa([
    { code:'1-1100', name:'Piutang Usaha', type:'ASSET' },
    { code:'2-1100', name:'Hutang Pajak', type:'LIABILITY' },
    { code:'4-1000', name:'Penjualan', type:'REVENUE' },
  ]);
  ensured = true;
}

const rp = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));

// GET /project-terms?project_id=
router.get('/', async (req,res)=>{
  await ensureTables();
  const pid = parseInt(req.query.project_id);
  if(!pid) return res.status(400).json({error:'project_id wajib diisi'});
  try{
    const p = await pool.query(`SELECT p.*, c.name AS customer_name FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.id=$1`,[pid]);
    if(!p.rows[0]) return res.status(404).json({error:'Proyek tidak ditemukan'});
    const t = await pool.query(`SELECT t.*, i.invoice_number, i.status AS invoice_status, i.total AS invoice_total, i.paid_amount
      FROM project_terms t LEFT JOIN invoices i ON i.id=t.invoice_id WHERE t.project_id=$1 ORDER BY t.term_number, t.id`,[pid]);
    const sum = t.rows.reduce((a,x)=>({ planned:a.planned + Number(x.amount||0), invoiced:a.invoiced + (x.invoice_id? Number(x.amount||0):0), paid:a.paid + (x.invoice_id? Number(x.paid_amount||0):0) }), {planned:0,invoiced:0,paid:0});
    res.json({ project: p.rows[0], terms: t.rows, summary: sum, contract_value: Number(p.rows[0].contract_value||0) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /project-terms  { project_id, description, percentage?, amount?, due_date?, term_number? }
router.post('/', async (req,res)=>{
  await ensureTables();
  const pid = parseInt(req.body?.project_id);
  if(!pid) return res.status(400).json({error:'project_id wajib diisi'});
  try{
    const p = await pool.query('SELECT * FROM projects WHERE id=$1',[pid]);
    if(!p.rows[0]) return res.status(404).json({error:'Proyek tidak ditemukan'});
    const contract = Number(p.rows[0].contract_value||0);
    const pct = Number(req.body?.percentage ?? req.body?.percent ?? 0)||0;
    const amount = req.body?.amount!=null ? Number(req.body.amount) : Math.round(contract*pct/100);
    if(amount<=0) return res.status(400).json({error:'Nominal termin harus lebih dari 0 (isi amount atau percentage)'});
    const maxNo = await pool.query('SELECT COALESCE(MAX(term_number),0)::int AS n FROM project_terms WHERE project_id=$1',[pid]);
    const no = req.body?.term_number || maxNo.rows[0].n+1;
    const r = await pool.query(`INSERT INTO project_terms (project_id, term_number, description, percentage, amount, due_date, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7) RETURNING *`,
      [pid, no, req.body?.description || req.body?.name || ('Termin '+no), pct, amount, req.body?.due_date||null, req.user.id]);
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /project-terms/generate  { project_id, terms:[{name,percent,due_date}], replace_pending? }
router.post('/generate', async (req,res)=>{
  await ensureTables();
  const pid = parseInt(req.body?.project_id);
  const terms = Array.isArray(req.body?.terms)? req.body.terms : [];
  if(!pid) return res.status(400).json({error:'project_id wajib diisi'});
  if(!terms.length) return res.status(400).json({error:'Daftar termin kosong'});
  const pctOf = (t)=> Number(t.percentage ?? t.percent ?? 0) || 0;
  const totalPct = terms.reduce((s,t)=>s+pctOf(t),0);
  if(Math.abs(totalPct-100) > 0.01) return res.status(400).json({error:`Total persentase termin harus 100% (sekarang ${totalPct}%)`});
  try{
    const p = await pool.query('SELECT * FROM projects WHERE id=$1',[pid]);
    if(!p.rows[0]) return res.status(404).json({error:'Proyek tidak ditemukan'});
    const contract = Number(p.rows[0].contract_value||0);
    if(contract<=0) return res.status(400).json({error:'Nilai kontrak proyek masih 0 — isi contract_value dulu'});
    const out = await withTx(async (c)=>{
      if(req.body?.replace_pending!==false){
        await c.query(`DELETE FROM project_terms WHERE project_id=$1 AND status='PENDING' AND invoice_id IS NULL`,[pid]);
      }
      const base = await c.query('SELECT COALESCE(MAX(term_number),0)::int AS n FROM project_terms WHERE project_id=$1',[pid]);
      let n = base.rows[0].n;
      const rows=[];
      for(const t of terms){
        n += 1;
        const pct = pctOf(t);
        const amount = Math.round(contract * pct / 100);
        const r = await c.query(`INSERT INTO project_terms (project_id, term_number, description, percentage, amount, due_date, status, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7) RETURNING *`,
          [pid, n, t.description||t.name||('Termin '+n), pct, amount, t.due_date||null, req.user.id]);
        rows.push(r.rows[0]);
      }
      return rows;
    });
    res.json({ ok:true, created: out.length, terms: out });
  }catch(e){ console.error('[terms generate]',e); res.status(500).json({error:e.message}); }
});

// POST /project-terms/:id/invoice → terbitkan invoice AR untuk termin ini
router.post('/:id/invoice', async (req,res)=>{
  await ensureTables();
  try{
    const t = await pool.query(`SELECT t.*, p.project_code, p.name AS project_name, p.customer_id, c.name AS customer_name
      FROM project_terms t JOIN projects p ON p.id=t.project_id LEFT JOIN customers c ON c.id=p.customer_id WHERE t.id=$1`,[req.params.id]);
    const term = t.rows[0];
    if(!term) return res.status(404).json({error:'Termin tidak ditemukan'});
    if(term.invoice_id) return res.status(400).json({error:`Termin ini sudah ditagihkan (invoice #${term.invoice_id})`});
    if(!term.customer_id) return res.status(400).json({error:'Proyek belum punya pelanggan — isi customer proyek dulu'});
    const subtotal = Number(term.amount)||0;
    const tax = Math.round(subtotal * 0.11);
    const total = subtotal + tax;
    const dueDate = req.body?.due_date || term.due_date || new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    const invNumber = `INV-PRJ-${term.project_id}-${term.term_number}-${String(Date.now()).slice(-6)}`;
    const out = await withTx(async (c)=>{
      const inv = await c.query(`INSERT INTO invoices (invoice_number, customer_id, so_id, do_id, invoice_date, due_date, status, subtotal, tax, total, paid_amount, project_id, project_term_id)
        VALUES ($1,$2,NULL,NULL,CURRENT_DATE,$3,'SENT',$4,$5,$6,0,$7,$8) RETURNING *`,
        [invNumber, term.customer_id, dueDate, subtotal, tax, total, term.project_id, term.id]);
      const invId = inv.rows[0].id;
      const journalId = await postJournal({
        refType:'INVOICE', refId:invId, description:`Invoice termin ${term.description} - ${term.project_code}`,
        lines:[
          { code:'1-1100', debit:total, description:'Piutang termin proyek' },
          { code:'4-1000', credit:subtotal, description:'Pendapatan termin proyek' },
          { code:'2-1100', credit:tax, description:'PPN keluaran' },
        ], createdBy:req.user.id, client:c,
      });
      await c.query(`UPDATE project_terms SET status='INVOICED', invoice_id=$1, invoiced_at=NOW() WHERE id=$2`,[invId, term.id]);
      return { invId, journalId };
    });
    res.json({ ok:true, invoice_id:out.invId, invoice_number:invNumber, subtotal, tax, total, due_date:dueDate, journal_id:out.journalId, message:`Invoice ${invNumber} (${rp(total)}) dibuat untuk ${term.description}.` });
  }catch(e){ console.error('[term invoice]',e); res.status(500).json({error:e.message}); }
});

// DELETE /project-terms/:id  (hanya PENDING)
router.delete('/:id', async (req,res)=>{
  await ensureTables();
  try{
    const t = await pool.query('SELECT * FROM project_terms WHERE id=$1',[req.params.id]);
    if(!t.rows[0]) return res.status(404).json({error:'Termin tidak ditemukan'});
    if(t.rows[0].invoice_id) return res.status(400).json({error:'Termin sudah ditagihkan — tidak bisa dihapus'});
    await pool.query('DELETE FROM project_terms WHERE id=$1',[req.params.id]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
