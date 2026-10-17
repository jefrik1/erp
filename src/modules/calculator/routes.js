import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();

async function enrichItems(items){
  if(!items?.length) return items;
  try{
    const skus = [...new Set(items.map(i=>i.sku).filter(Boolean))];
    if(!skus.length) return items.map(i=>({...i, unit_price:i.unit_price||65000, product_id:i.product_id||null, stock_available:0, options:[]}));
    const r = await pool.query(
      `SELECT p.id, p.sku, p.name, p.category_id,
       COALESCE((SELECT pu.selling_price FROM product_units pu WHERE pu.product_id=p.id ORDER BY pu.id LIMIT 1), 65000) as selling_price,
       COALESCE((SELECT SUM(s.qty_available) FROM stocks s WHERE s.product_id=p.id),0) as stock_available,
       COALESCE((SELECT SUM(s.qty_on_hand) FROM stocks s WHERE s.product_id=p.id),0) as stock_onhand
       FROM products p WHERE p.sku = ANY($1)`, [skus]
    );
    const m = new Map(r.rows.map(x=>[x.sku, x]));
    const catIds = [...new Set(r.rows.map(x=>x.category_id).filter(Boolean))];
    let catProducts=[];
    if(catIds.length){
      const catR = await pool.query(
        `SELECT p.id, p.sku, p.name, p.category_id,
         COALESCE((SELECT pu.selling_price FROM product_units pu WHERE pu.product_id=p.id ORDER BY pu.id LIMIT 1), 65000) as selling_price,
         COALESCE((SELECT SUM(s.qty_available) FROM stocks s WHERE s.product_id=p.id),0) as stock_available,
         COALESCE((SELECT SUM(s.qty_on_hand) FROM stocks s WHERE s.product_id=p.id),0) as stock_onhand
         FROM products p WHERE p.category_id = ANY($1) AND p.is_active=true ORDER BY p.name`, [catIds]
      );
      catProducts = catR.rows;
    }
    const byCat = new Map();
    for(const p of catProducts){
      if(!byCat.has(p.category_id)) byCat.set(p.category_id, []);
      byCat.get(p.category_id).push({id:p.id, sku:p.sku, name:p.name, selling_price:Number(p.selling_price), stock_available:Number(p.stock_available), stock_onhand:Number(p.stock_onhand)});
    }
    return items.map(it=>{
      const hit = m.get(it.sku);
      const opts = hit ? (byCat.get(hit.category_id)||[]) : [];
      return {
        ...it,
        product_id: hit?.id || it.product_id || null,
        name: hit?.name || it.name || it.sku,
        unit_price: hit ? Number(hit.selling_price) : (it.unit_price||65000),
        stock_available: hit ? Number(hit.stock_available) : 0,
        stock_onhand: hit ? Number(hit.stock_onhand) : 0,
        options: opts.length? opts : (hit? [{id:hit.id, sku:hit.sku, name:hit.name, selling_price:Number(hit.selling_price), stock_available:Number(hit.stock_available), stock_onhand:Number(hit.stock_onhand)}] : []),
      };
    });
  }catch(e){
    console.error('calc enrich err', e.message);
    return items.map(i=>({...i, unit_price:i.unit_price||65000, stock_available:0, options:[]}));
  }
}

router.post('/estimate', async(req,res)=>{
  const {type, length, width, thickness, height, area_override, waste_pct}=req.body;
  let area = area_override || (parseFloat(length||0)*parseFloat(width||0));
  if(!area || isNaN(area)) area=0;
  let base={area}, items=[];

  if(type==='keramik' || type==='keramik60'){
    const tileSize = parseFloat(req.body.tile_size||0.36);
    const tiles = Math.ceil(area / tileSize * (1+parseFloat(waste_pct||10)/100));
    const dus = Math.ceil(tiles / 4);
    const semen = Math.ceil(area*0.02);
    const pasir = parseFloat((area*0.03).toFixed(2));
    base={area, tiles, dus, semen: semen+' sak', pasir: pasir+' m3', catatan:'1 dus 60x60 = 1.44m2, waste '+ (waste_pct||10)+'% included'};
    items=[
      {sku:'KRM-001', name:'Keramik 40x40 Putih', qty:dus, unit:'DUS'},
      {sku:'SEM-001', name:'Semen Gresik 50kg', qty:semen, unit:'SAK'},
      {sku:'PAS-001', name:'Pasir Mundu Halus', qty:pasir, unit:'M3'},
    ];
    base.items = await enrichItems(items);
    return res.json(base);
  } else if(type==='cat'){
    const daya_sebar = 8;
    const liter = Math.ceil(area / daya_sebar * 1.15);
    const kaleng5kg = Math.ceil(liter/5);
    base={area, liter, kaleng5kg, liter_per_coat: liter, catatan:'Daya sebar 8m2/L, 2 lapis + waste 15%'};
    items=[
      {sku:'CAT-001', name:'Cat Tembok Dulux 25kg', qty:kaleng5kg, unit:'KALENG'},
    ];
    base.items = await enrichItems(items);
    return res.json(base);
  } else if(type==='baja' || type==='besi' || type==='steel'){
    const btg = Math.ceil(area * 1.2);
    const kawat = parseFloat((area * 0.05).toFixed(2));
    base={area, batang: btg+' btg (12m)', kawat_kg: kawat+' kg', catatan:'Baja/besi beton ulir - estimasi rangka @1.2 btg/m²'};
    items=[
      {sku:'BES-010', name:'Besi Beton 10mm x12m', qty:btg, unit:'BTG'},
    ];
    base.items = await enrichItems(items);
    return res.json(base);
  } else if(type==='bata' || type==='bata_merah' || type==='batako'){
    const isBatako = type==='batako';
    const perM2 = isBatako? 12 : 70;
    const qty = Math.ceil(area * perM2 * 1.05);
    const semen = Math.ceil(area*0.1);
    const pasir = parseFloat((area*0.05).toFixed(2));
    base={area, qty, semen: semen+' sak', pasir: pasir+' m3', catatan: (isBatako?'Batako 12/m2':'Bata merah 70/m2')+' + waste 5%'};
    items=[
      {sku: isBatako?'BTK-001':'BTB-001', name: isBatako?'Batako Putih':'Bata Merah Press', qty, unit:'PCS'},
      {sku:'SEM-001', name:'Semen Gresik 50kg', qty:semen, unit:'SAK'},
      {sku:'PAS-001', name:'Pasir Mundu Halus', qty:pasir, unit:'M3'},
    ];
    base.items = await enrichItems(items);
    return res.json(base);
  } else if(type==='plester'){
    const semen = Math.ceil(area*0.12);
    const pasir = parseFloat((area*0.02).toFixed(2));
    base={area, semen: semen+' sak (50kg)', pasir: pasir+' m3', thickness: thickness||'1.5cm', catatan:'Plester 1.5cm: 0.12 sak/m2'};
    items=[
      {sku:'SEM-001', name:'Semen Gresik 50kg', qty:semen, unit:'SAK'},
      {sku:'PAS-001', name:'Pasir Mundu Halus', qty:pasir, unit:'M3'},
    ];
    base.items = await enrichItems(items);
    return res.json(base);
  } else if(type==='semua' || type==='combo' || type==='full'){
    const tileSize = parseFloat(req.body.tile_size||0.36);
    const tiles = Math.ceil(area / tileSize * (1+parseFloat(waste_pct||10)/100));
    const dus = Math.ceil(tiles / 4);
    const kSemen = Math.ceil(area*0.02);
    const kPasir = area*0.03;
    const liter = Math.ceil(area / 8 * 1.15);
    const kaleng = Math.ceil(liter/5);
    const bataQty = Math.ceil(area * 70 * 1.05);
    const bSemen = Math.ceil(area*0.1);
    const bPasir = area*0.05;
    const pSemen = Math.ceil(area*0.12);
    const pPasir = area*0.02;
    const bajaQty = Math.ceil(area * 1.2);
    const totSemen = kSemen + bSemen + pSemen;
    const totPasir = parseFloat((kPasir + bPasir + pPasir).toFixed(2));
    base={
      area,
      dus, tiles,
      liter, kaleng5kg: kaleng,
      bata: bataQty,
      baja_batang: bajaQty+' btg',
      semen_total: totSemen+' sak',
      pasir_total: totPasir+' m3',
      catatan:'KOMBO: keramik + cat (2 lapis) + bata merah + plester + baja - semua dari luas '+area+' m²'
    };
    items=[
      {sku:'KRM-001', name:'Keramik 40x40 Putih', qty:dus, unit:'DUS'},
      {sku:'CAT-001', name:'Cat Tembok Dulux 25kg', qty:kaleng, unit:'KALENG'},
      {sku:'BES-010', name:'Besi Beton 10mm x12m', qty:bajaQty, unit:'BTG'},
      {sku:'BTB-001', name:'Bata Merah Press', qty:bataQty, unit:'PCS'},
      {sku:'SEM-001', name:'Semen Gresik 50kg', qty:totSemen, unit:'SAK'},
      {sku:'PAS-001', name:'Pasir Mundu Halus', qty:totPasir, unit:'M3'},
    ];
    base.items = await enrichItems(items);
    return res.json(base);
  } else {
    return res.json({area, estimate: 'Pilih tipe: keramik | cat | baja | bata | plester | semua', area_m2:area});
  }
});
router.post('/quotation', async(req,res)=>{
  const est = req.body;
  res.json({quotation_number:'QUO-'+Date.now().toString().slice(-6), estimate:est, valid_days:14, note:'Auto dari kalkulator material'});
});
export default router;
