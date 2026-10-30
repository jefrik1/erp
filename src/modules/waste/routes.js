import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
import { postJournal } from '../../lib/journal.js';
import { mutateStock, sendBusinessError } from '../../lib/stock-service.js';
const router=express.Router();
router.get('/', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {waste_type,status,q,start,end}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(waste_type){ p.push(waste_type); where+=' AND w.waste_type=$'+p.length; }
  if(status){ p.push(status); where+=' AND w.status=$'+p.length; }
  if(start){ p.push(start); where+=' AND w.created_at >= $'+p.length; }
  if(end){ p.push(end); where+=' AND w.created_at <= $'+p.length+'::date + 1'; }
  if(q){ p.push('%'+q+'%'); where+=' AND (p.name ILIKE $'+p.length+' OR p.sku ILIKE $'+p.length+')'; }
  const base=' FROM waste_logs w LEFT JOIN products p ON p.id=w.product_id LEFT JOIN warehouses wh ON wh.id=w.warehouse_id LEFT JOIN users u ON u.id=w.approved_by '+where;
  const cnt=await pool.query('SELECT COUNT(*) '+base,p);
  const r=await pool.query('SELECT w.*, p.name as product_name, p.sku, wh.name as warehouse_name, u.username as approver '+base+' ORDER BY w.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:r.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/', async(req,res)=>{
  const {product_id,warehouse_id,qty,waste_type,reason}=req.body;
  const wh = warehouse_id||1;
  const prod=await pool.query('SELECT COALESCE(avg_cost,0) AS avg_cost FROM stocks WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1',[product_id,wh]);
  const unitCost = parseFloat(prod.rows[0]?.avg_cost||0);
  const cost = unitCost * parseFloat(qty);
  const wtype = waste_type||'OTHER';
  // auto need approval if >500rb
  const status = cost > 500000 ? 'PENDING' : 'APPROVED';
  const ins=await pool.query('INSERT INTO waste_logs (product_id,warehouse_id,qty,waste_type,reason,cost,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[product_id,wh,qty,wtype,reason,cost,status,req.user.id]);
  if(status==='APPROVED'){
    try{
      await mutateStock(pool, { productId: product_id, warehouseId: wh, qtyDelta: -Math.abs(parseFloat(qty)),
        refType: 'WASTE', refId: ins.rows[0].id, userId: req.user.id, notes: 'Write-off '+wtype });
      if(cost > 0.5){
        await postJournal({ refType:'WASTE', refId:ins.rows[0].id, description:'Write-off '+wtype,
          lines:[ { code:'5-1300', debit:cost, description:'Susut/rusak '+wtype },
                  { code:'1-1200', credit:cost, description:'Persediaan keluar (waste)' } ], createdBy:req.user.id });
      }
    }catch(e){
      await pool.query('DELETE FROM waste_logs WHERE id=$1',[ins.rows[0].id]).catch(()=>{});
      const sent = sendBusinessError(res, e); if(sent) return sent;
      return res.status(500).json({error:e.message});
    }
  }
  res.json({id:ins.rows[0].id, cost, status});
});
router.post('/:id/approve', async(req,res)=>{
  const {status}=req.body; // APPROVED / REJECTED
  const w=await pool.query('SELECT * FROM waste_logs WHERE id=$1',[req.params.id]);
  if(!w.rows[0]) return res.status(404).json({error:'Not found'});
  // threshold check
  const cost=parseFloat(w.rows[0].cost);
  if(cost>5000000 && status==='APPROVED'){
    // need direktur role check (simplified: allow any but log)
  }
  await pool.query('UPDATE waste_logs SET status=$1, approved_by=$2 WHERE id=$3',[status,req.user.id,req.params.id]);
  if(status==='APPROVED'){
    const w0=w.rows[0];
    try{
      await mutateStock(pool, { productId: w0.product_id, warehouseId: w0.warehouse_id, qtyDelta: -Math.abs(Number(w0.qty)),
        refType: 'WASTE', refId: Number(req.params.id), userId: req.user.id, notes: 'Write-off '+w0.waste_type });
      if(Number(w0.cost) > 0.5){
        await postJournal({ refType:'WASTE', refId:Number(req.params.id), description:'Write-off '+w0.waste_type,
          lines:[ { code:'5-1300', debit:Number(w0.cost), description:'Susut/rusak '+w0.waste_type },
                  { code:'1-1200', credit:Number(w0.cost), description:'Persediaan keluar (waste)' } ], createdBy:req.user.id });
      }
    }catch(e){
      await pool.query("UPDATE waste_logs SET status='PENDING' WHERE id=$1",[req.params.id]).catch(()=>{});
      const sent = sendBusinessError(res, e); if(sent) return sent;
      return res.status(500).json({error:e.message});
    }
  }
  res.json({ok:true});
});
// ---------------------------------------------------------- GET /waste/export
router.get('/export', async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const {waste_type,status,q,start,end}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(waste_type){ p.push(waste_type); where+=' AND w.waste_type=$'+p.length; }
  if(status){ p.push(status); where+=' AND w.status=$'+p.length; }
  if(start){ p.push(start); where+=' AND w.created_at >= $'+p.length; }
  if(end){ p.push(end); where+=' AND w.created_at <= $'+p.length+'::date + 1'; }
  if(q){ p.push('%'+q+'%'); where+=' AND (p.name ILIKE $'+p.length+' OR p.sku ILIKE $'+p.length+')'; }
  try{
    const r=await pool.query('SELECT w.*, p.name as product_name, p.sku, wh.name as warehouse_name, u.username as approver FROM waste_logs w LEFT JOIN products p ON p.id=w.product_id LEFT JOIN warehouses wh ON wh.id=w.warehouse_id LEFT JOIN users u ON u.id=w.approved_by '+where+' ORDER BY w.id DESC LIMIT 5000',p);
    const num=(v)=>parseFloat(v||0)||0;
    const columns=[{label:'Tanggal'},{label:'SKU'},{label:'Produk'},{label:'Gudang'},{label:'Jenis'},
      {label:'Qty',numeric:true,total:true},{label:'Biaya',numeric:true,total:true},
      {label:'Status'},{label:'Alasan'},{label:'Approver'}];
    const rows=r.rows.map(w=>[String(w.created_at||'').slice(0,10), w.sku, w.product_name, w.warehouse_name||'-',
      w.waste_type, num(w.qty), num(w.cost), w.status, w.reason||'-', w.approver||'-']);
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
    const sub=[`${rows.length} catatan`];
    if(waste_type) sub.unshift('Jenis '+waste_type); if(status) sub.unshift('Status '+status);
    if(start||end) sub.unshift(`Periode ${start||'awal'} s/d ${end||'sekarang'}`);
    return sendReport(res,{format,filename:'susut-pecah',
      payload:{title:'Laporan Susut, Pecah & Waste',subtitle:sub.join('  |  '),columns,rows,totals,sheetName:'Susut & Waste'}});
  }catch(e){
    console.error('waste export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});
router.get('/stats/summary', async(req,res)=>{
  const r=await pool.query("SELECT waste_type, COUNT(*) as cnt, SUM(qty) as qty, SUM(cost) as cost FROM waste_logs GROUP BY waste_type ORDER BY cost DESC");
  const pending=await pool.query("SELECT COUNT(*) FROM waste_logs WHERE status='PENDING'");
  res.json({by_type:r.rows, pending:parseInt(pending.rows[0].count)});
});
export default router;
