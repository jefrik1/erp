#!/usr/bin/env node
// Perbaikan buku besar & harga jual (lanjutan audit data persediaan).
//
// Langkah (idempoten, aman diulang):
//   HARGA_INVOICE    Harga jual di invoice yang >5x / <0,2x HPP (biasanya nilai total
//                    terisi di kolom harga satuan) dikembalikan ke harga daftar produk,
//                    lalu subtotal/PPN/total invoice, pembayaran, dan SO ikut dihitung ulang.
//   JURNAL_INVOICE   Invoice jalur DO yang jurnalnya hanya "kerangka" (tanpa baris) dibuat
//                    ulang lewat postJournal: Dr Piutang / Cr Penjualan / Cr PPN
//                    + Dr HPP / Cr Persediaan, plus jurnal pelunasan bila sudah dibayar.
//   KARTU_STOK_AWAL  Baris stok yang belum punya riwayat pergerakan diberi kartu stok
//                    pembukaan (qty tidak berubah, hanya jejak audit).
//   KAPITALISASI     Selisih saldo GL 1-1200 vs nilai stok dibukukan sebagai saldo awal
//                    (Dr Persediaan / Cr Modal) supaya neraca = nilai persediaan.
//
// Pakai:
//   node scripts/repair-ledger.mjs                  → rencana (dry-run)
//   node scripts/repair-ledger.mjs --apply          → eksekusi
//   node scripts/repair-ledger.mjs --apply --only=JURNAL_INVOICE
import dotenv from 'dotenv';
import pg from 'pg';
import { postJournal } from '../src/lib/journal.js';
import { assertRepairAllowed } from '../src/lib/repair-guard.js';
assertRepairAllowed('repair-ledger.mjs');

dotenv.config();
pg.types.setTypeParser(1114, v => v ? String(v).replace(' ','T').slice(0,23) : v);
pg.types.setTypeParser(1082, v => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find(a=>a.startsWith('--only=')) || '').split('=')[1]?.split(',').filter(Boolean) || null;
const want = (s)=> !ONLY || ONLY.includes(s);

const nf = (n)=> new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n)||0);
const rp = (n)=> 'Rp ' + nf(n);
const log = (...a)=> console.log(...a);
const q = async (sql,p)=> (await pool.query(sql,p)).rows;

const HPP_SQL = `COALESCE(NULLIF(SUM(ABS(s.qty_on_hand)*COALESCE(s.avg_cost,0))/NULLIF(SUM(ABS(s.qty_on_hand)),0),0), MAX(s.avg_cost), 0)`;

/* ───────────────────────── HARGA INVOICE ───────────────────────── */
async function stepHargaInvoice(){
  const rows = await q(`
    SELECT d.id, d.invoice_id, d.product_id, d.qty, d.unit_price, i.invoice_number, i.status, i.paid_amount,
           hpp.cost,
           (SELECT pu.selling_price FROM product_units pu WHERE pu.product_id=d.product_id ORDER BY pu.id LIMIT 1) AS list_price
      FROM invoice_details d
      JOIN invoices i ON i.id=d.invoice_id
      LEFT JOIN LATERAL (SELECT ${HPP_SQL} AS cost FROM stocks s WHERE s.product_id=d.product_id) hpp ON true
     WHERE COALESCE(hpp.cost,0) > 0
       AND (d.unit_price > hpp.cost*5 OR d.unit_price < hpp.cost*0.2)
     ORDER BY i.invoice_date, d.id`);
  if(!rows.length) return { step:'HARGA_INVOICE', changed:0, invoices:0 };

  const byInvoice = new Map();
  for(const r of rows){
    const target = Number(r.list_price) > 0 ? Number(r.list_price) : Math.round(Number(r.cost)*1.15);
    if(!byInvoice.has(r.invoice_id)) byInvoice.set(r.invoice_id, { number:r.invoice_number, status:r.status, paid:Number(r.paid_amount), items:[] });
    byInvoice.get(r.invoice_id).items.push({ id:r.id, sku:null, product_id:r.product_id, qty:Number(r.qty), from:Number(r.unit_price), to:target });
  }

  log(`\n[HARGA_INVOICE] ${rows.length} baris di ${byInvoice.size} invoice`);
  for(const [invId, inv] of byInvoice){
    for(const it of inv.items.slice(0,3)) log(`   - ${inv.number} produk#${it.product_id} qty ${nf(it.qty)}: ${rp(it.from)} → ${rp(it.to)}`);
    if(inv.items.length>3) log(`     … ${inv.items.length-3} baris lain`);
  }
  if(!APPLY) return { step:'HARGA_INVOICE', changed:rows.length, invoices:byInvoice.size };

  for(const [invId, inv] of byInvoice){
    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SET LOCAL app.allow_ledger_mutation='on'");
      for(const it of inv.items){
        await client.query('UPDATE invoice_details SET unit_price=$1::numeric, total=$1::numeric*$2::numeric WHERE id=$3', [it.to, it.qty, it.id]);
      }
      const sum = await client.query('SELECT COALESCE(SUM(total),0)::numeric subtotal FROM invoice_details WHERE invoice_id=$1', [invId]);
      const subtotal = Number(sum.rows[0].subtotal);
      const head = await client.query('SELECT discount, status FROM invoices WHERE id=$1', [invId]);
      const discount = Math.min(subtotal, Number(head.rows[0].discount||0));
      const taxable = subtotal - discount;
      const tax = Math.round(taxable*0.11);
      const total = taxable + tax;
      const paid = String(head.rows[0].status).toUpperCase()==='PAID' ? total : Math.min(Number(inv.paid||0), total);
      const status = paid >= total - 0.5 ? 'PAID' : (paid > 0 ? 'PARTIAL' : head.rows[0].status);
      await client.query('UPDATE invoices SET subtotal=$1, discount=$2, tax=$3, total=$4, paid_amount=$5, status=$6 WHERE id=$7',
        [subtotal, discount, tax, total, paid, status, invId]);
      // Pembayaran (AR) harus sama dengan nominal yang benar-benar masuk
      const pays = await client.query("SELECT id, amount FROM payments WHERE invoice_id=$1 AND type='AR' ORDER BY id", [invId]);
      if(pays.rows.length === 1) await client.query('UPDATE payments SET amount=$1 WHERE id=$2', [paid, pays.rows[0].id]);
      else if(pays.rows.length === 0 && paid > 0){
        await client.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,'TRANSFER',$3,1)",
          ['PAY-FIX-'+invId, invId, paid]);
      }
      // Jurnal lama invoice ini dibuang, akan dibangun ulang oleh JURNAL_INVOICE
      await client.query("DELETE FROM journal_entries WHERE reference_type IN ('INVOICE','PAYMENT') AND reference_id IN ($1,$2)",
        [invId, pays.rows[0]?.id || -1]);
      // SO terkait: harga baris & total ikut dikoreksi
      const invRow = await client.query('SELECT so_id FROM invoices WHERE id=$1', [invId]);
      const soId = invRow.rows[0]?.so_id;
      if(soId){
        for(const it of inv.items){
          await client.query(`UPDATE so_details SET unit_price=$1::numeric, total=$1::numeric*qty
                               WHERE so_id=$2 AND product_id=$3 AND (unit_price > $1::numeric*5 OR unit_price < $1::numeric*0.2)`,
            [it.to, soId, it.product_id]);
        }
        const soSum = await client.query('SELECT COALESCE(SUM(total),0)::numeric s FROM so_details WHERE so_id=$1', [soId]);
        const soSub = Number(soSum.rows[0].s);
        const soHead = await client.query('SELECT discount FROM sales_orders WHERE id=$1', [soId]);
        const soDisc = Math.min(soSub, Number(soHead.rows[0]?.discount||0));
        const soTax = Math.round((soSub-soDisc)*0.11);
        await client.query('UPDATE sales_orders SET subtotal=$1, discount=$2, tax=$3, total=$4 WHERE id=$5',
          [soSub, soDisc, soTax, soSub-soDisc+soTax, soId]);
      }
      await client.query('COMMIT');
    }catch(e){ await client.query('ROLLBACK').catch(()=>{}); console.error('  ! gagal invoice '+inv.number+': '+e.message); }
    finally{ client.release(); }
  }
  return { step:'HARGA_INVOICE', changed:rows.length, invoices:byInvoice.size };
}

/* ───────────────────────── JURNAL INVOICE ───────────────────────── */
async function stepJurnalInvoice(){
  const invoices = await q(`
    SELECT i.*, (SELECT COUNT(*) FROM journal_entries je JOIN journal_details jd ON jd.journal_id=je.id
                  WHERE je.reference_type='INVOICE' AND je.reference_id=i.id) AS lines,
           (SELECT COUNT(*) FROM invoice_details d WHERE d.invoice_id=i.id) AS items
      FROM invoices i
     WHERE i.invoice_number NOT LIKE 'INV-POS-%'
       AND UPPER(COALESCE(i.status,'')) NOT IN ('CANCELLED','VOID')
     ORDER BY i.id`);
  const noItems = invoices.filter(i=> Number(i.items) === 0);
  if(noItems.length) log(`\n[JURNAL_INVOICE] ${noItems.length} invoice tanpa rincian item: pendapatan tetap dijurnal, HPP dilewati (` + noItems.map(i=>i.invoice_number).join(', ') + ')');
  const todo = invoices.filter(i=> Number(i.lines) === 0);
  if(!todo.length) return { step:'JURNAL_INVOICE', invoices:0 };

  log(`\n[JURNAL_INVOICE] ${todo.length} invoice tanpa baris jurnal`);
  for(const i of todo.slice(0,5)) log(`   - ${i.invoice_number} total ${rp(i.total)} (${i.status})`);
  if(todo.length>5) log(`     … ${todo.length-5} invoice lain`);
  if(!APPLY) return { step:'JURNAL_INVOICE', invoices:todo.length };

  let done=0;
  for(const inv of todo){
    try{
      const items = await q('SELECT product_id, qty FROM invoice_details WHERE invoice_id=$1', [inv.id]);
      const costs = await q(`SELECT s.product_id, ${HPP_SQL} AS cost FROM stocks s WHERE s.product_id = ANY($1) GROUP BY s.product_id`,
        [items.map(x=>x.product_id)]);
      const costMap = new Map(costs.map(c=>[Number(c.product_id), Number(c.cost)||0]));
      const cogs = items.reduce((a,x)=> a + Number(x.qty||0) * (costMap.get(Number(x.product_id))||0), 0);
      const taxable = Number(inv.subtotal) - Number(inv.discount||0);
      const tax = Number(inv.tax||0);
      const lines = [
        { code:'1-1100', debit:Number(inv.total), description:'Piutang invoice '+inv.invoice_number },
        { code:'4-1000', credit:taxable, description:'Penjualan '+inv.invoice_number },
      ];
      if(tax > 0) lines.push({ code:'2-1100', credit:tax, description:'PPN invoice '+inv.invoice_number });
      if(cogs > 0.5){
        lines.push({ code:'5-1000', debit:cogs, description:'HPP invoice '+inv.invoice_number });
        lines.push({ code:'1-1200', credit:cogs, description:'Persediaan keluar '+inv.invoice_number });
      }
      // Hapus kerangka lama (tanpa baris) supaya tidak dobel
      const delClient = await pool.connect();
      try{
        await delClient.query('BEGIN');
        await delClient.query("SET LOCAL app.allow_ledger_mutation='on'");
        await delClient.query(`DELETE FROM journal_entries WHERE reference_type='INVOICE' AND reference_id=$1
                         AND NOT EXISTS (SELECT 1 FROM journal_details jd WHERE jd.journal_id=journal_entries.id)`, [inv.id]);
        await delClient.query('COMMIT');
      }catch(e){ await delClient.query('ROLLBACK').catch(()=>{}); throw e; }
      finally{ delClient.release(); }
      await postJournal({ date: inv.invoice_date, refType:'INVOICE', refId:inv.id,
        description:'Invoice '+inv.invoice_number, lines, createdBy:1 });
      // Pelunasan yang sudah terjadi tapi belum dijurnal. Bila paid_amount lebih besar
      // dari total baris payments, selisihnya dibuatkan baris pembayaran agar
      // saldo Piutang di GL = sisa tagihan invoice.
      const paid = Number(inv.paid_amount||0);
      if(paid > 0){
        let pays = await q("SELECT id, amount FROM payments WHERE invoice_id=$1 AND type='AR' ORDER BY id", [inv.id]);
        const sumPays = pays.reduce((a,p)=> a + Number(p.amount||0), 0);
        if(paid - sumPays > 0.5){
          const ins = await pool.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,$3,'TRANSFER',$4,1) RETURNING id",
            ['PAY-FIX-'+inv.id, inv.id, inv.invoice_date, paid - sumPays]);
          pays = [...pays, { id: ins.rows[0].id, amount: paid - sumPays }];
        }
        for(const p of pays){
          if(Number(p.amount) <= 0) continue;
          await postJournal({ date: inv.invoice_date, refType:'PAYMENT', refId:p.id,
            description:'Pelunasan '+inv.invoice_number,
            lines:[ { code:'1-1000', debit:Number(p.amount), description:'Terima pembayaran '+inv.invoice_number },
                    { code:'1-1100', credit:Number(p.amount), description:'Pelunasan piutang '+inv.invoice_number } ],
            createdBy:1 });
        }
      }
      done++;
    }catch(e){ console.error('  ! gagal '+inv.invoice_number+': '+e.message); }
  }
  return { step:'JURNAL_INVOICE', invoices:done };
}

/* ───────────────────────── KARTU STOK AWAL ───────────────────────── */
async function stepKartuStok(){
  const rows = await q(`
    SELECT s.id, s.product_id, s.warehouse_id, s.qty_on_hand, COALESCE(s.avg_cost,0) avg_cost, p.sku, w.code
      FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
     WHERE NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id=s.product_id AND m.warehouse_id=s.warehouse_id)
     ORDER BY p.sku`);
  if(!rows.length) return { step:'KARTU_STOK_AWAL', rows:0 };
  log(`\n[KARTU_STOK_AWAL] ${rows.length} baris stok tanpa riwayat`);
  for(const r of rows.slice(0,5)) log(`   - ${r.sku} @ ${r.code}: qty ${nf(r.qty_on_hand)} @ ${rp(r.avg_cost)}`);
  if(rows.length>5) log(`     … ${rows.length-5} baris lain`);
  if(!APPLY) return { step:'KARTU_STOK_AWAL', rows:rows.length };
  for(const r of rows){
    await pool.query(`INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id,
                        qty_in, qty_out, unit_cost, balance_qty, movement_date, created_by)
                      VALUES ($1,$2,'IN','OPENING',NULL,$3,0,$4,$3,CURRENT_DATE,1)`,
      [r.product_id, r.warehouse_id, Number(r.qty_on_hand), Number(r.avg_cost)]);
  }
  return { step:'KARTU_STOK_AWAL', rows:rows.length };
}

/* ───────────────────────── KAPITALISASI ───────────────────────── */
async function stepKapitalisasi(){
  const stock = (await q('SELECT COALESCE(SUM(qty_on_hand*COALESCE(avg_cost,0)),0)::numeric v FROM stocks'))[0].v;
  const gl = (await q(`SELECT COALESCE(SUM(jd.debit-jd.credit),0)::numeric v FROM journal_details jd
                        JOIN accounts a ON a.id=jd.account_id WHERE a.code='1-1200'`))[0].v;
  const delta = Number(stock) - Number(gl);
  log(`\n[KAPITALISASI] nilai stok ${rp(stock)} · GL 1-1200 ${rp(gl)} · selisih ${rp(delta)}`);
  if(Math.abs(delta) < 1) return { step:'KAPITALISASI', delta:0 };
  if(!APPLY) return { step:'KAPITALISASI', delta };
  const lines = delta > 0
    ? [ { code:'1-1200', debit:delta, description:'Saldo awal persediaan (perbaikan data)' },
        { code:'3-1000', credit:delta, description:'Saldo awal persediaan (perbaikan data)' } ]
    : [ { code:'3-1000', debit:Math.abs(delta), description:'Koreksi saldo awal persediaan' },
        { code:'1-1200', credit:Math.abs(delta), description:'Koreksi saldo awal persediaan' } ];
  const id = await postJournal({ refType:'OPENING', refId:null, description:'Penetapan saldo awal persediaan', lines, createdBy:1 });
  log(`   ✓ jurnal #${id}`);
  return { step:'KAPITALISASI', delta, journal:id };
}

/* ───────────────────── JURNAL GRN & INVOICE PEMASOK ───────────────────── */
// Penerimaan barang (GRN) dan invoice pemasok lama belum pernah dijurnal, sehingga
// Hutang Usaha bersaldo debit dan GR/IR kosong. Jurnal dibangun dari dokumen sumber
// (grn_details & purchase_invoices), bukan angka karangan.
async function stepJurnalGrnPinv(){
  const grns = await q(`
    SELECT gr.id, gr.grn_number, gr.po_id,
           COALESCE(SUM(gd.qty_received * gd.unit_cost),0)::numeric AS nilai
      FROM goods_receipts gr JOIN grn_details gd ON gd.grn_id = gr.id
     WHERE gr.is_dropship IS NOT TRUE
       AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='GRN' AND je.reference_id=gr.id)
     GROUP BY gr.id, gr.grn_number, gr.po_id
    HAVING COALESCE(SUM(gd.qty_received * gd.unit_cost),0) > 0.5
     ORDER BY gr.id`);
  const pinvs = await q(`
    SELECT pi.* FROM purchase_invoices pi
     WHERE UPPER(COALESCE(pi.status,'')) IN ('PAID','MATCHED','APPROVED')
       AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='PINV' AND je.reference_id=pi.id)
     ORDER BY pi.id`);
  if(!grns.length && !pinvs.length) return { step:'JURNAL_GRN_PINV', grn:0, pinv:0 };

  log(`\n[JURNAL_GRN_PINV] ${grns.length} GRN dan ${pinvs.length} invoice pemasok belum berjurnal`);
  for(const g of grns.slice(0,5)) log(`   - ${g.grn_number} (PO #${g.po_id}) nilai ${rp(g.nilai)}`);
  for(const p of pinvs.slice(0,5)) log(`   - ${p.inv_number} (PO #${p.po_id}) total ${rp(p.total)} status ${p.status}`);
  if(!APPLY) return { step:'JURNAL_GRN_PINV', grn:grns.length, pinv:pinvs.length };

  let nGrn = 0, nPinv = 0;
  for(const g of grns){
    try{
      await postJournal({ refType:'GRN', refId:g.id, description:'Penerimaan barang '+g.grn_number,
        lines:[ { code:'1-1200', debit:Number(g.nilai), description:'Persediaan masuk '+g.grn_number },
                { code:'2-1150', credit:Number(g.nilai), description:'GR/IR '+g.grn_number } ], createdBy:1 });
      nGrn++;
    }catch(e){ console.error('  ! GRN '+g.grn_number+': '+e.message); }
  }
  for(const p of pinvs){
    try{
      const grn = await q(`SELECT COALESCE(SUM(gd.qty_received*gd.unit_cost),0)::numeric v
          FROM grn_details gd JOIN goods_receipts gr ON gr.id=gd.grn_id WHERE gr.po_id=$1 AND gr.is_dropship IS NOT TRUE`, [p.po_id]);
      const grir = Number(grn[0].v) || 0;
      const ppn = Number(p.tax) || 0;
      const ap = Number(p.total) || 0;
      const ppv = ap - ppn - grir;
      const lines = [
        { code:'2-1150', debit:grir, description:'Kliring GR/IR '+p.inv_number },
        { code:'2-1000', credit:ap, description:'Hutang usaha '+p.inv_number },
      ];
      if(ppn > 0) lines.push({ code:'1-1410', debit:ppn, description:'PPN Masukan '+p.inv_number });
      if(ppv > 0.5) lines.push({ code:'5-1200', debit:ppv, description:'Selisih harga beli '+p.inv_number });
      else if(ppv < -0.5) lines.push({ code:'5-1200', credit:Math.abs(ppv), description:'Selisih harga beli '+p.inv_number });
      await postJournal({ refType:'PINV', refId:p.id, description:'Invoice pemasok '+p.inv_number, lines, createdBy:1 });
      nPinv++;
    }catch(e){ console.error('  ! PINV '+p.inv_number+': '+e.message); }
  }
  log(`   ✓ ${nGrn} jurnal GRN, ${nPinv} jurnal invoice pemasok`);
  return { step:'JURNAL_GRN_PINV', grn:nGrn, pinv:nPinv };
}

/* ─────────────────── KAS: PENERIMAAN AR BELUM MASUK REKENING ─────────────────── */
// Pembayaran pelanggan sudah dijurnal (Dr Kas & Bank / Cr Piutang) tetapi tidak pernah
// menambah saldo master bank/cash_movements, sehingga rekonsiliasi kas selalu selisih.
async function stepKasAr(){
  const rows = await q(`
    SELECT p.id, p.payment_number, p.amount, p.payment_date, p.method
      FROM payments p
     WHERE p.type='AR' AND COALESCE(p.amount,0) > 0.5
       AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='PAYMENT' AND je.reference_id=p.id)
       AND NOT EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.reference_type='PAYMENT' AND cm.reference_id=p.id)
     ORDER BY p.id`);
  if(!rows.length) return { step:'KAS_AR', rows:0 };
  log(`\n[KAS_AR] ${rows.length} penerimaan pelanggan belum masuk saldo rekening (total ${rp(rows.reduce((a,r)=>a+Number(r.amount||0),0))})`);
  for(const r of rows.slice(0,5)) log(`   - ${r.payment_number} ${rp(r.amount)} (${r.method||'-'})`);
  if(!APPLY) return { step:'KAS_AR', rows:rows.length };

  const acc = (await q(`SELECT id, balance FROM bank_accounts WHERE bank_name ILIKE '%kas%' ORDER BY id LIMIT 1`))[0]
    || (await q('SELECT id, balance FROM bank_accounts ORDER BY id LIMIT 1'))[0];
  if(!acc){ log('   ! tidak ada rekening kas/bank — dilewati'); return { step:'KAS_AR', rows:0 }; }
  let n = 0;
  for(const r of rows){
    await pool.query(
      `INSERT INTO cash_movements (account_id, direction, amount, source, reference_type, reference_id, notes, created_by)
       VALUES ($1,'IN',$2,'AR_RECEIPT','PAYMENT',$3,$4,1)`,
      [acc.id, Number(r.amount), r.id, 'Penerimaan ' + r.payment_number]);
    n++;
  }
  const total = rows.reduce((a,r)=> a + Number(r.amount||0), 0);
  await pool.query('UPDATE bank_accounts SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [total, acc.id]);
  log(`   ✓ ${n} mutasi kas dicatat, saldo rekening +${rp(total)}`);
  return { step:'KAS_AR', rows:n, total };
}

/* ───────────────────────── KAS AWAL ───────────────────────── */
// Saldo awal kas & bank dari data awal (migrations/001_init.sql: BCA 1,5 M + Mandiri 800 jt)
// tidak pernah dibukukan, sehingga akun Kas & Bank minus karena pembayaran AP dijurnal
// sebagai kas keluar. Dibukukan sekali sebagai saldo awal.
const OPENING_CASH = 2300000000;
async function stepKasAwal(){
  const existing = (await q("SELECT id FROM journal_entries WHERE reference_type='OPENING_CASH' LIMIT 1"))[0];
  const gl = Number((await q(`SELECT COALESCE(SUM(jd.debit-jd.credit),0)::numeric v FROM journal_details jd
                               JOIN accounts a ON a.id=jd.account_id WHERE a.code IN ('1-1000','1-1010','1-1020')`))[0].v);
  log(`\n[KAS_AWAL] saldo kas & bank di GL ${rp(gl)} · saldo awal data ${rp(OPENING_CASH)}`);
  if(existing){ log('   sudah pernah dibukukan — dilewati'); return { step:'KAS_AWAL', delta:0 }; }
  if(!APPLY) return { step:'KAS_AWAL', delta:OPENING_CASH };
  const id = await postJournal({ refType:'OPENING_CASH', refId:null, description:'Saldo awal kas & bank (data awal)',
    lines:[ { code:'1-1000', debit:OPENING_CASH, description:'Saldo awal kas & bank' },
            { code:'3-1000', credit:OPENING_CASH, description:'Saldo awal kas & bank' } ], createdBy:1 });
  log(`   ✓ jurnal #${id}`);
  return { step:'KAS_AWAL', delta:OPENING_CASH, journal:id };
}

/* ───────────────────────── verifikasi ───────────────────────── */
async function verify(){
  const tb = await q(`
    SELECT a.code, a.name, COALESCE(SUM(jd.debit),0)::numeric d, COALESCE(SUM(jd.credit),0)::numeric c,
           COALESCE(SUM(jd.debit-jd.credit),0)::numeric saldo
      FROM accounts a LEFT JOIN journal_details jd ON jd.account_id=a.id
     GROUP BY a.code, a.name HAVING COALESCE(SUM(jd.debit),0)+COALESCE(SUM(jd.credit),0) <> 0
     ORDER BY a.code`);
  const totD = tb.reduce((s,r)=>s+Number(r.d),0), totC = tb.reduce((s,r)=>s+Number(r.c),0);
  const arGl = Number(tb.find(r=>r.code==='1-1100')?.saldo || 0);
  const inv = (await q(`SELECT COALESCE(SUM(total-paid_amount),0)::numeric v FROM invoices
                         WHERE UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','VOID')
                           AND invoice_number NOT LIKE 'INV-POS-%'`))[0].v;
  const stock = (await q('SELECT COALESCE(SUM(qty_on_hand*COALESCE(avg_cost,0)),0)::numeric v FROM stocks'))[0].v;
  const persGl = Number(tb.find(r=>r.code==='1-1200')?.saldo || 0);
  log('\n=== NERACA SALDO ===');
  for(const r of tb) log(`  ${r.code} ${String(r.name).padEnd(22)} D ${rp(r.d).padStart(18)}  K ${rp(r.c).padStart(18)}  saldo ${rp(r.saldo).padStart(18)}`);
  log(`\n  Total debit ${rp(totD)} · total kredit ${rp(totC)} · ${Math.abs(totD-totC)<1?'SEIMBANG ✓':'TIDAK SEIMBANG ✗'}`);
  log(`  Piutang GL ${rp(arGl)} vs sisa tagihan invoice ${rp(inv)}  (selisih ${rp(Number(inv)-arGl)})`);
  log(`  Persediaan GL ${rp(persGl)} vs nilai stok ${rp(stock)}  (selisih ${rp(Number(stock)-persGl)})`);
}

/* ───────────────────────── main ───────────────────────── */
log(`=== PERBAIKAN BUKU BESAR ${APPLY ? '(EKSEKUSI)' : '(DRY-RUN)'} ===`);
const results = [];
if(want('HARGA_INVOICE'))  results.push(await stepHargaInvoice());
if(want('JURNAL_INVOICE')) results.push(await stepJurnalInvoice());
if(want('KARTU_STOK_AWAL'))results.push(await stepKartuStok());
if(want('JURNAL_GRN_PINV')) results.push(await stepJurnalGrnPinv());
if(want('KAS_AR'))         results.push(await stepKasAr());
if(want('KAS_AWAL'))       results.push(await stepKasAwal());
if(want('KAPITALISASI'))   results.push(await stepKapitalisasi());
if(APPLY) await verify();
else log('\nDry-run selesai. Jalankan dengan --apply untuk mengeksekusi.');
await pool.end();
