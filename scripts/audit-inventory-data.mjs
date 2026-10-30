#!/usr/bin/env node
// Audit kualitas data persediaan — dipakai untuk "temuan data yang perlu dibereskan".
// Membaca DB langsung (read-only), tidak mengubah apa pun.
//   node scripts/audit-inventory-data.mjs           → ringkasan temuan
//   node scripts/audit-inventory-data.mjs --json    → keluaran JSON
// Exit code 1 bila ada temuan P1 (stok minus / HPP nol / baris kembar).
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Tanggal disimpan sebagai WIB wall-clock (tanpa zona): jangan diubah jadi Date.
pg.types.setTypeParser(1114, v => v ? String(v).replace(' ','T').slice(0,23) : v);
pg.types.setTypeParser(1082, v => v);
const JSON_OUT = process.argv.includes('--json');

const nf = (n)=> new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(n)||0);
const rp = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.round(Number(n)||0));

async function main(){
  const q = async (sql,p)=> (await pool.query(sql,p)).rows;
  const findings = [];

  // 1. Stok minus (nilai persediaan jadi negatif)
  const neg = await q(`SELECT p.sku, p.name, w.code, w.name AS warehouse, s.qty_on_hand, s.avg_cost,
                              (s.qty_on_hand*s.avg_cost) AS value
                         FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                        WHERE s.qty_on_hand < 0 ORDER BY value ASC`);
  findings.push({
    id:'STOK_MINUS', level:'P1',
    title:'Stok minus (qty_on_hand < 0)',
    count: neg.length,
    value: neg.reduce((a,r)=> a + Number(r.value||0), 0),
    rows: neg.map(r=>({ sku:r.sku, name:r.name, warehouse:r.code, qty:Number(r.qty_on_hand), avg_cost:Number(r.avg_cost), value:Number(r.value) })),
    fix:'Stock Opname per gudang: isi jumlah fisik nyata. Bila nilai minus itu warisan impor tanpa jurnal, set HPP baris opname = 0 supaya tidak membukukan aset fiktif.',
  });

  // 2. HPP nol padahal ada stok → margin tampak 100%
  const zero = await q(`SELECT p.sku, p.name, w.code, w.name AS warehouse, s.qty_on_hand, s.avg_cost
                          FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                         WHERE COALESCE(s.avg_cost,0) = 0 AND COALESCE(s.qty_on_hand,0) <> 0
                         ORDER BY s.qty_on_hand DESC`);
  findings.push({
    id:'HPP_NOL', level:'P1',
    title:'Stok ber-HPP 0 (margin terlihat ~100%)',
    count: zero.length,
    rows: zero.map(r=>({ sku:r.sku, name:r.name, warehouse:r.code, qty:Number(r.qty_on_hand), avg_cost:Number(r.avg_cost) })),
    fix:'Isi lewat Penambahan Stok (jenis Opname Fisik / SET) dengan HPP dari harga beli terakhir; untuk transfer, HPP kini ikut terbawa otomatis.',
  });

  // 3. Baris stok kembar untuk (produk, gudang) yang sama → stok & nilai dobel
  const dup = await q(`SELECT p.sku, p.name, w.code, COUNT(*)::int AS baris, SUM(s.qty_on_hand)::numeric AS qty,
                              MIN(s.id) AS keep_id
                         FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                        GROUP BY p.sku, p.name, w.code HAVING COUNT(*) > 1 ORDER BY baris DESC`);
  findings.push({
    id:'BARIS_KEMBAR', level:'P1',
    title:'Baris stok kembar (produk+gudang sama, lebih dari satu baris)',
    count: dup.length,
    rows: dup.map(r=>({ sku:r.sku, name:r.name, warehouse:r.code, baris:r.baris, qty:Number(r.qty) })),
    fix:'Stock Opname gudang tsb (posting sekarang melebur semua baris jadi satu = hasil hitung), atau POST /inventory/stocks/merge-duplicates untuk baris non-batch.',
  });

  // 4. Baris batch pada produk yang tidak melacak batch
  const stray = await q(`SELECT p.sku, p.name, w.code, s.batch_no, s.qty_on_hand
                           FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                          WHERE s.batch_no IS NOT NULL AND COALESCE(p.is_batch_tracked,false) = false`);
  findings.push({
    id:'BATCH_NYASAR', level:'P2',
    title:'Baris batch pada produk non-batch',
    count: stray.length,
    rows: stray.map(r=>({ sku:r.sku, name:r.name, warehouse:r.code, batch_no:r.batch_no, qty:Number(r.qty_on_hand) })),
    fix:'Ikut dilebur saat Stock Opname gudang tsb.',
  });

  // 5. Nilai persediaan: total, minus, dan selisihnya
  const val = (await q(`SELECT COALESCE(SUM(qty_on_hand*avg_cost),0) AS total,
                               COALESCE(SUM(CASE WHEN qty_on_hand < 0 THEN qty_on_hand*avg_cost ELSE 0 END),0) AS negative,
                               COUNT(*)::int AS baris FROM stocks`))[0];
  const gl = (await q(`SELECT COALESCE(SUM(jd.debit-jd.credit),0) AS saldo
                         FROM journal_details jd JOIN accounts a ON a.id=jd.account_id WHERE a.code='1-1200'`))[0];
  const glGap = Number(val.total||0) - Number(gl.saldo||0);
  findings.push({
    id:'GL_VS_STOK', level: Math.abs(glGap) > 1000 ? 'P1' : 'OK',
    title:'Saldo GL Persediaan (1-1200) vs nilai stok',
    count: Math.abs(glGap) > 1000 ? 1 : 0,
    rows: [{ nilai_stok:Number(val.total), nilai_gl:Number(gl.saldo), selisih:glGap, nilai_minus:Number(val.negative), baris_stok:val.baris }],
    fix:'Penerimaan barang (GRN) belum membukukan Dr Persediaan/Cr Utang. Butuh keputusan finance: jurnal kapitalisasi awal atau sambungkan GRN ke jurnal.',
  });

  // 6. Kartu stok kosong: ada stok tapi tidak ada riwayat pergerakan
  const noMove = await q(`SELECT p.sku, p.name, w.code, s.qty_on_hand
                            FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                           WHERE NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id=s.product_id AND m.warehouse_id=s.warehouse_id)
                           ORDER BY p.sku`);
  findings.push({
    id:'KARTU_STOK_KOSONG', level:'P2',
    title:'Stok tanpa riwayat kartu stok',
    count: noMove.length,
    rows: noMove.map(r=>({ sku:r.sku, name:r.name, warehouse:r.code, qty:Number(r.qty_on_hand) })),
    fix:'Normal setelah opname/penerimaan pertama tercatat. Selama kosong, audit stok tidak bisa dilacak ke dokumen.',
  });

  // 7. Produk terjual tapi HPP 0 → margin 100% menyesatkan
  const soldNoCost = await q(`
    WITH cost AS (SELECT product_id,
                         COALESCE(NULLIF(SUM(ABS(qty_on_hand)*avg_cost)/NULLIF(SUM(ABS(qty_on_hand)),0),0), MAX(avg_cost), 0) AS avg_cost
                    FROM stocks GROUP BY product_id)
    SELECT p.sku, p.name, SUM(d.qty)::numeric AS qty_sold, SUM(d.total)::numeric AS revenue
      FROM invoice_details d JOIN invoices i ON i.id=d.invoice_id JOIN products p ON p.id=d.product_id
      LEFT JOIN cost c ON c.product_id=p.id
     WHERE UPPER(COALESCE(i.status,'')) NOT IN ('CANCELLED','VOID') AND COALESCE(c.avg_cost,0)=0
     GROUP BY p.sku,p.name HAVING SUM(d.total) > 0 ORDER BY revenue DESC`);
  findings.push({
    id:'MARGIN_TANPA_HPP', level:'P2',
    title:'Produk terjual tanpa HPP (margin 100%)',
    count: soldNoCost.length,
    rows: soldNoCost.map(r=>({ sku:r.sku, name:r.name, qty_sold:Number(r.qty_sold), revenue:Number(r.revenue) })),
    fix:'Laporan margin sudah menandai (banner peringatan). Isi HPP produk ini lewat Penambahan Stok.',
  });

  // 8. Harga jual di baris invoice tidak wajar dibanding HPP → revenue/margin menggelembung
  const priceOdd = await q(`
    WITH cost AS (SELECT product_id,
                         COALESCE(NULLIF(SUM(ABS(qty_on_hand)*avg_cost)/NULLIF(SUM(ABS(qty_on_hand)),0),0), MAX(avg_cost), 0) AS avg_cost
                    FROM stocks GROUP BY product_id)
    SELECT i.invoice_number, i.invoice_date, p.sku, p.name, d.qty, d.unit_price, d.total,
           c.avg_cost, CASE WHEN COALESCE(c.avg_cost,0) > 0 THEN d.unit_price / c.avg_cost ELSE NULL END AS ratio
      FROM invoice_details d JOIN invoices i ON i.id=d.invoice_id JOIN products p ON p.id=d.product_id
      LEFT JOIN cost c ON c.product_id=p.id
     WHERE UPPER(COALESCE(i.status,'')) NOT IN ('CANCELLED','VOID')
       AND COALESCE(c.avg_cost,0) > 0
       AND (d.unit_price > c.avg_cost * 5 OR d.unit_price < c.avg_cost * 0.2)
     ORDER BY d.unit_price DESC`);
  findings.push({
    id:'HARGA_JUAL_ANEH', level:'P1',
    title:'Harga jual di invoice tidak wajar vs HPP (>5x atau <0,2x)',
    count: priceOdd.length,
    rows: priceOdd.slice(0,10).map(r=>({ invoice:r.invoice_number, tgl:r.invoice_date, sku:r.sku, qty:Number(r.qty),
      unit_price:Number(r.unit_price), hpp:Number(r.avg_cost), rasio:Number(r.ratio).toFixed(2) })),
    fix:'Biasanya harga baris (total) terisi di kolom harga satuan. Perbaiki lewat revisi invoice; menyentuh piutang, PPN & jurnal, jadi perlu persetujuan finance.',
  });

  // 9. Penjualan di bawah HPP (rugi per transaksi)
  const belowCost = await q(`
    WITH cost AS (SELECT product_id,
                         COALESCE(NULLIF(SUM(ABS(qty_on_hand)*avg_cost)/NULLIF(SUM(ABS(qty_on_hand)),0),0), MAX(avg_cost), 0) AS avg_cost
                    FROM stocks GROUP BY product_id)
    SELECT p.sku, p.name, c.avg_cost, d.unit_price,
           ROUND(((d.unit_price - c.avg_cost) / NULLIF(c.avg_cost,0) * 100)::numeric, 1) AS margin_pct,
           i.invoice_number, d.qty
      FROM invoice_details d JOIN invoices i ON i.id=d.invoice_id JOIN products p ON p.id=d.product_id
      JOIN cost c ON c.product_id=p.id
     WHERE UPPER(COALESCE(i.status,'')) NOT IN ('CANCELLED','VOID')
       AND COALESCE(c.avg_cost,0) > 0 AND d.unit_price > 0 AND d.unit_price < c.avg_cost * 0.98
     ORDER BY margin_pct ASC`);
  findings.push({
    id:'JUAL_DI_BAWAH_HPP', level:'P2',
    title:'Penjualan di bawah HPP (margin negatif per transaksi)',
    count: belowCost.length,
    rows: belowCost.slice(0,10).map(r=>({ invoice:r.invoice_number, sku:r.sku, qty:Number(r.qty), hpp:Number(r.avg_cost), harga_jual:Number(r.unit_price), margin:Number(r.margin_pct)+'%' })),
    fix:'Naikkan harga jual atau koreksi HPP (harga beli) lewat Penambahan Stok. Jangan ditutupi dengan mengubah angka margin.',
  });

  // 10. Produk aktif tanpa baris stok sama sekali (informasi)
  const noStock = await q(`SELECT p.sku, p.name FROM products p
                            WHERE p.is_active AND NOT EXISTS (SELECT 1 FROM stocks s WHERE s.product_id=p.id)
                            ORDER BY p.sku`);
  findings.push({
    id:'TANPA_BARIS_STOK', level:'INFO',
    title:'Produk aktif belum punya baris stok',
    count: noStock.length,
    rows: noStock.map(r=>({ sku:r.sku, name:r.name })),
    fix:'Tidak berdampak nilai. HPP terisi saat penerimaan/penambahan stok pertama.',
  });

  if (JSON_OUT){ console.log(JSON.stringify({ generated_at:new Date().toISOString(), findings }, null, 2)); }
  else {
    console.log('=== AUDIT DATA PERSEDIAAN ===\n');
    for(const f of findings){
      const flag = f.level==='OK' ? '  OK  ' : '['+f.level+']';
      console.log(`${flag} ${f.title}: ${f.count} temuan`);
      for(const r of f.rows.slice(0,10)){
        const detail = Object.entries(r).map(([k,v])=> `${k}=${typeof v==='number'? nf(v) : v}`).join('  ');
        console.log('       - '+detail);
      }
      if(f.rows.length>10) console.log(`       ... ${f.rows.length-10} lainnya`);
      if(f.count && f.level!=='OK') console.log('       → '+f.fix);
      console.log('');
    }
    console.log(`Nilai persediaan: ${rp(val.total)} (baris minus ${rp(val.negative)}) | GL 1-1200: ${rp(gl.saldo)} | selisih ${rp(glGap)}`);
  }
  const p1 = findings.filter(f=> f.level==='P1' && f.count>0).length;
  await pool.end();
  process.exit(p1 ? 1 : 0);
}

main().catch(async (e)=>{ console.error('audit gagal:', e.message); try{ await pool.end(); }catch{} process.exit(2); });
