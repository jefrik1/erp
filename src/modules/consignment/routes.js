import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
import { postJournal } from '../../lib/journal.js';
import { mutateStock, weightedCost, sendBusinessError } from '../../lib/stock-service.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const {type,status,q}=req.query; let where='WHERE 1=1'; const p=[];
  if(type){ p.push(type); where+=' AND type=$'+p.length; }
  if(status){ p.push(status); where+=' AND status=$'+p.length; }
  if(q){ p.push('%'+q+'%'); where+=' AND (consignment_number ILIKE $'+p.length+' OR location_name ILIKE $'+p.length+')'; }
  const data=await pool.query('SELECT c.*, coalesce(json_agg(json_build_object(\'product_name\',p.name,\'sku\',p.sku,\'qty_sent\',ci.qty_sent,\'qty_sold\',ci.qty_sold) ORDER BY ci.id),\'[]\') as items FROM consignments c LEFT JOIN consignment_items ci ON ci.consignment_id=c.id LEFT JOIN products p ON p.id=ci.product_id '+where+' GROUP BY c.id ORDER BY c.id DESC',p);
  const stats=await pool.query("SELECT type, status, COUNT(*) FROM consignments GROUP BY type,status");
  res.json({data:data.rows, stats:stats.rows});
});
// ---------------------------------------------------- GET /consignments/export
// WAJIB di atas '/:id' supaya 'export' tidak dianggap id.
router.get('/export', async(req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const {type,status,q}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(type){ p.push(type); where+=' AND type=$'+p.length; }
  if(status){ p.push(status); where+=' AND status=$'+p.length; }
  if(q){ p.push('%'+q+'%'); where+=' AND (consignment_number ILIKE $'+p.length+' OR location_name ILIKE $'+p.length+')'; }
  try{
    const data=await pool.query("SELECT c.*, coalesce(json_agg(json_build_object('product_name',p.name,'sku',p.sku,'qty_sent',ci.qty_sent,'qty_sold',ci.qty_sold,'qty_returned',ci.qty_returned,'qty_lost',ci.qty_lost) ORDER BY ci.id),'[]') as items FROM consignments c LEFT JOIN consignment_items ci ON ci.consignment_id=c.id LEFT JOIN products p ON p.id=ci.product_id "+where+' GROUP BY c.id ORDER BY c.id DESC',p);
    const columns=[{label:'No Konsinyasi'},{label:'Tipe'},{label:'Partner'},{label:'Lokasi'},{label:'Alamat'},
      {label:'Tgl Mulai'},{label:'Status'},{label:'Qty Dikirim',numeric:true,total:true},
      {label:'Qty Terjual',numeric:true,total:true},{label:'Sisa',numeric:true,total:true},{label:'Daftar Produk'}];
    const rows=data.rows.map(c=>{
      const items=Array.isArray(c.items)?c.items:[];
      const sent=items.reduce((a,i)=>a+(parseFloat(i.qty_sent)||0),0);
      const sold=items.reduce((a,i)=>a+(parseFloat(i.qty_sold)||0),0);
      const back=items.reduce((a,i)=>a+(parseFloat(i.qty_returned)||0),0);
      const lost=items.reduce((a,i)=>a+(parseFloat(i.qty_lost)||0),0);
      return [c.consignment_number, c.type, `${c.partner_type||''}${c.partner_id?' #'+c.partner_id:''}`.trim(),
        c.location_name||'-', c.location_address||'-', String(c.start_date||'').slice(0,10), c.status,
        sent, sold, sent-sold-back-lost, items.map(i=>`${i.product_name} (${i.qty_sent})`).join(', ')||'-'];
    });
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
    const sub=[`${rows.length} dokumen`]; if(type) sub.unshift('Tipe '+type); if(status) sub.unshift('Status '+status); if(q) sub.unshift('Pencarian "'+q+'"');
    return sendReport(res,{format,filename:'konsinyasi',
      payload:{title:'Laporan Konsinyasi In & Out',subtitle:sub.join('  |  '),columns,rows,totals,sheetName:'Konsinyasi'}});
  }catch(e){
    console.error('consignment export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});

router.get('/:id', async(req,res)=>{
  const c=await pool.query('SELECT * FROM consignments WHERE id=$1',[req.params.id]);
  if(!c.rows[0]) return res.status(404).json({error:'Not found'});
  const items=await pool.query('SELECT ci.*, p.name as product_name, p.sku FROM consignment_items ci JOIN products p ON p.id=ci.product_id WHERE ci.consignment_id=$1',[req.params.id]);
  const moves=await pool.query('SELECT cm.*, p.name FROM consignment_movements cm JOIN consignment_items ci ON ci.id=cm.consignment_item_id JOIN products p ON p.id=ci.product_id WHERE ci.consignment_id=$1 ORDER BY cm.id DESC',[req.params.id]);
  res.json({...c.rows[0], items:items.rows, movements:moves.rows});
});
router.post('/', async(req,res)=>{
  const {type, partner_type, partner_id, location_name, location_address, start_date, end_date, notes, items}=req.body;
  if(!location_name||!items?.length) return res.status(400).json({error:'location_name & items required'});
  const num=(type==='IN'?'CSI-':'CSO-')+Date.now().toString().slice(-6);
  const ins=await pool.query('INSERT INTO consignments (consignment_number,type,partner_type,partner_id,location_name,location_address,start_date,end_date,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [num,type||'OUT',partner_type||'CUSTOMER',partner_id,location_name,location_address,start_date||new Date().toISOString().slice(0,10),end_date,notes,req.user.id]);
  const cid=ins.rows[0].id;
  const hpp = await weightedCost(pool, items.map(it=>it.product_id), 1);
  let consignValue = 0;
  for(const it of items){
    const itIns=await pool.query('INSERT INTO consignment_items (consignment_id,product_id,qty_sent,selling_price) VALUES ($1,$2,$3,$4) RETURNING id',[cid,it.product_id,it.qty_sent||it.qty,it.selling_price||65000]);
    await pool.query('INSERT INTO consignment_movements (consignment_item_id,type,qty) VALUES ($1,\'SENT\',$2)',[itIns.rows[0].id, it.qty_sent||it.qty]);
    const cost = Number(hpp.get(Number(it.product_id))) || 0;
    // Barang titipan keluar dari stok gudang (wh1) tetapi tetap milik perusahaan:
    // dipindah ke akun Persediaan Konsinyasi (1-1250).
    try{
      await mutateStock(pool, { productId: it.product_id, warehouseId: 1, qtyDelta: -Math.abs(Number(it.qty_sent||it.qty)),
        refType: 'CONSIGNMENT', refId: cid, userId: req.user.id, notes: `Kirim konsinyasi ${num}` });
    }catch(e){
      await pool.query('DELETE FROM consignments WHERE id=$1',[cid]).catch(()=>{});
      const sent = sendBusinessError(res, e); if(sent) return sent;
      return res.status(422).json({error:e.message});
    }
    consignValue += Math.abs(Number(it.qty_sent||it.qty)) * cost;
  }
  if(consignValue > 0.5){
    try{
      await postJournal({ refType:'CONSIGNMENT', refId:cid, description:`Kirim konsinyasi ${num}`,
        lines:[ { code:'1-1250', debit:consignValue, description:'Persediaan konsinyasi '+num },
                { code:'1-1200', credit:consignValue, description:'Persediaan keluar (konsinyasi) '+num } ],
        createdBy:req.user.id });
    }catch(e){ console.error('[consignment journal]', e.message); }
  }
  await pool.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\'CREATE\',\'CONSIGNMENT\',$2,$3)',[req.user.id,cid,JSON.stringify({num,type})]);
  res.json({id:cid, consignment_number:num});
});
router.post('/:id/movement', async(req,res)=>{
  const {item_id,type,qty,notes}=req.body;
  await pool.query('INSERT INTO consignment_movements (consignment_item_id,type,qty,notes) VALUES ($1,$2,$3,$4)',[item_id,type,qty,notes]);
  if(type==='SOLD') await pool.query('UPDATE consignment_items SET qty_sold = qty_sold + $1 WHERE id=$2',[qty,item_id]);
  if(type==='RETURNED'){ await pool.query('UPDATE consignment_items SET qty_returned = qty_returned + $1 WHERE id=$2',[qty,item_id]); // balik ke gudang
    const it=await pool.query('SELECT product_id FROM consignment_items WHERE id=$1',[item_id]);
    const hpp = await weightedCost(pool, [it.rows[0].product_id], 1);
    try{
      await mutateStock(pool, { productId: it.rows[0].product_id, warehouseId: 1, qtyDelta: Math.abs(Number(qty)),
        unitCost: Number(hpp.get(Number(it.rows[0].product_id))) || 0,
        refType: 'CONSIGNMENT', refId: Number(req.params.id), userId: req.user.id, notes: 'Retur konsinyasi' });
    }catch(e){ const sent = sendBusinessError(res, e); if(sent) return sent; }
  }
  if(type==='LOST') await pool.query('UPDATE consignment_items SET qty_lost = qty_lost + $1 WHERE id=$2',[qty,item_id]);
  // auto close check
  res.json({ok:true});
});
router.post('/:id/close', async(req,res)=>{
  await pool.query("UPDATE consignments SET status='CLOSED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});
router.get('/stats/summary', async(req,res)=>{
  const s=await pool.query("SELECT COUNT(*) FILTER (WHERE type='OUT' AND status='ACTIVE') as out_active, COUNT(*) FILTER (WHERE type='IN' AND status='ACTIVE') as in_active, COUNT(*) FILTER (WHERE status='CLOSED') as closed FROM consignments");
  const aging=await pool.query("SELECT consignment_number, location_name, CURRENT_DATE - start_date as umur_hari FROM consignments WHERE type='OUT' AND status='ACTIVE' AND CURRENT_DATE - start_date > 90");
  res.json({...s.rows[0], long_pending:aging.rows});
});
export default router;
