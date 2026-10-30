import { useCallback, useEffect, useState } from 'react';
import { Boxes, TrendingUp, RefreshCw, AlertTriangle, Download } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnSecondary, PosChipRow, PosChip, PosSelect,
} from '../components/PosUI';

const nf = (n, d=0)=> new Intl.NumberFormat('id-ID',{maximumFractionDigits:d}).format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const thisMonth = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);

export default function InventoryReports(){
  const [tab,setTab]=useState('valuasi');
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [val,setVal]=useState(null);
  const [margin,setMargin]=useState(null);
  const [warehouseId,setWarehouseId]=useState('');
  const [start,setStart]=useState(thisMonth()+'-01');
  const [end,setEnd]=useState(new Date(Date.now()+7*3600*1000).toISOString().slice(0,10));

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      if(tab==='valuasi'){
        const r = await api.get('/reports/stock-valuation',{params: warehouseId? {warehouse_id:warehouseId}:{}});
        setVal(r.data);
      } else {
        const r = await api.get('/reports/product-margin',{params:{start,end}});
        setMargin(r.data);
      }
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat laporan'); }
    finally{ setLoading(false); }
  },[tab,warehouseId,start,end]);
  useEffect(()=>{ load(); },[load]);

  const exportCsv = ()=>{
    const rows = tab==='valuasi'
      ? [['SKU','Produk','Gudang','Qty','HPP Rata-rata','Nilai'], ...((val?.data||[]).map(x=>[x.sku,x.name,x.warehouse_name,x.qty,x.avg_cost,x.value]))]
      : [['SKU','Produk','Qty Terjual','Pendapatan','Estimasi HPP','Margin','Margin %'], ...((margin?.data||[]).map(x=>[x.sku,x.name,x.qty_sold,x.revenue,x.est_cost,x.gross_margin,x.margin_pct]))];
    const csv = rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url; a.download=`laporan-${tab}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Boxes} title="Laporan Persediaan & Margin"
        subtitle="Valuasi stok (qty × HPP rata-rata) dan margin kotor per produk"
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat</button>
          <button onClick={exportCsv} className={posBtnSecondary+' h-9 px-3 text-xs'}><Download size={13}/> Export CSV</button>
        </>}/>

      {tab==='valuasi' && val && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PosStat icon={Boxes} tone="bg-[#0051d5]/10 text-[#0051d5]" label="NILAI PERSEDIAAN" value={rupiah(val.total_value)} sub={`${(val.data||[]).length} baris • stok negatif dipisah`}/>
          <PosStat icon={Boxes} tone="bg-sky-50 text-sky-700" label="TOTAL QTY" value={nf(val.total_qty,2)} sub="unit (semua gudang)"/>
          <PosStat icon={AlertTriangle} tone="bg-red-50 text-red-700" label="STOK NEGATIF" value={String(val.negative_count||0)} sub={rupiah(val.negative_value||0)}/>
          <PosStat icon={TrendingUp} tone="bg-emerald-50 text-emerald-700" label="GUDANG" value={String((val.warehouses||[]).length)} sub="lokasi aktif"/>
        </div>
      )}
      {tab==='margin' && margin && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PosStat icon={TrendingUp} tone="bg-[#0051d5]/10 text-[#0051d5]" label="PENDAPATAN" value={rupiah(margin.totals?.revenue)} sub={`${margin.start} → ${margin.end}`}/>
          <PosStat icon={Boxes} tone="bg-amber-50 text-amber-700" label="ESTIMASI HPP" value={rupiah(margin.totals?.cost)} sub="qty × HPP rata-rata"/>
          <PosStat icon={TrendingUp} tone="bg-emerald-50 text-emerald-700" label="MARGIN KOTOR" value={rupiah(margin.totals?.margin)} sub="pendapatan − HPP"/>
          <PosStat icon={TrendingUp} tone="bg-violet-50 text-violet-700" label="MARGIN %" value={(margin.totals?.revenue? Math.round(margin.totals.margin/margin.totals.revenue*100):0)+'%'} sub="rata-rata tertimbang"/>
        </div>
      )}

      {tab==='margin' && Number(margin?.cost_missing||0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5"/>
          <div>
            <b>{margin.cost_missing} produk</b> terjual tanpa HPP (avg_cost = 0), jadi margin terlihat lebih tinggi dari sebenarnya.
            Isi HPP lewat <b>Penambahan Stok</b> (harga beli) atau <b>Stock Opname</b> agar laporan akurat.
          </div>
        </div>
      )}

      <PosCard>
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <PosChipRow>
            <PosChip active={tab==='valuasi'} onClick={()=>setTab('valuasi')}>Valuasi Stok</PosChip>
            <PosChip active={tab==='margin'} onClick={()=>setTab('margin')}>Margin per Produk</PosChip>
          </PosChipRow>
          {tab==='valuasi' ? (
            <div className="ml-auto min-w-[220px]">
              <PosSelect value={warehouseId} onChange={setWarehouseId}>
                <option value="">Semua gudang</option>
                {(val?.warehouses||[]).map(w=> <option key={w.id} value={w.id}>{w.name}</option>)}
              </PosSelect>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <input type="date" value={start} onChange={e=>setStart(e.target.value)} className={posInput+' h-9 w-[150px] text-xs'}/>
              <span className="text-[11px] text-[#76777d]">s/d</span>
              <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className={posInput+' h-9 w-[150px] text-xs'}/>
            </div>
          )}
        </PosCardBody>

        {loading ? <PosSkeleton rows={8} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : tab==='valuasi' ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                <PosTh>PRODUK</PosTh><PosTh>GUDANG</PosTh><PosTh align="right">QTY</PosTh>
                <PosTh align="right">HPP RATA-RATA</PosTh><PosTh align="right">NILAI</PosTh>
              </tr></thead>
              <tbody>
                {(val?.data||[]).map((x,i)=>(
                  <tr key={i} className={posTr}>
                    <td className={posTd}><div className="font-semibold">{x.name}</div><div className="text-[10px] font-mono text-[#76777d]">{x.sku}</div></td>
                    <td className={posTd+' text-xs'}>{x.warehouse_name}</td>
                    <td className={'p-3 text-right tabular-nums font-semibold '+(Number(x.qty)<0?'text-red-600':'')}>{nf(x.qty,2)}</td>
                    <td className={posTd+' text-right tabular-nums'}>{rupiah(x.avg_cost)}</td>
                    <td className={posTd+' text-right tabular-nums font-bold'}>{rupiah(x.value)}</td>
                  </tr>
                ))}
                {!(val?.data||[]).length && <PosEmpty colSpan={5} text="Tidak ada data stok"/>}
              </tbody>
              {val?.data?.length>0 && <tfoot><tr className="bg-[#131b2e] text-white font-bold"><td colSpan={2} className="p-2.5 text-right text-[11px] tracking-wider">TOTAL (QTY ≥ 0)</td><td className="p-2.5 text-right tabular-nums">{nf(val.total_qty,2)}</td><td/><td className="p-2.5 text-right tabular-nums">{rupiah(val.total_value)}</td></tr></tfoot>}
            </table>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                <PosTh>PRODUK</PosTh><PosTh align="right">QTY TERJUAL</PosTh><PosTh align="right">PENDAPATAN</PosTh>
                <PosTh align="right">EST. HPP</PosTh><PosTh align="right">MARGIN</PosTh><PosTh align="center">MARGIN %</PosTh>
              </tr></thead>
              <tbody>
                {(margin?.data||[]).map(x=>(
                  <tr key={x.product_id} className={posTr}>
                    <td className={posTd}><div className="font-semibold">{x.name}</div><div className="text-[10px] font-mono text-[#76777d]">{x.sku}</div></td>
                    <td className={posTd+' text-right tabular-nums'}>{nf(x.qty_sold,2)}</td>
                    <td className={posTd+' text-right tabular-nums'}>{rupiah(x.revenue)}</td>
                    <td className={posTd+' text-right tabular-nums text-[#45464d]'}>{rupiah(x.est_cost)}</td>
                    <td className={posTd+' text-right tabular-nums font-bold'}>{rupiah(x.gross_margin)}</td>
                    <td className={posTd+' text-center'}><PosBadge tone={Number(x.margin_pct)>=20?'emerald':Number(x.margin_pct)>=10?'amber':'red'}>{nf(x.margin_pct,1)}%</PosBadge></td>
                  </tr>
                ))}
                {!(margin?.data||[]).length && <PosEmpty colSpan={6} text="Belum ada penjualan pada periode ini"/>}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>

      <div className="text-[11px] text-[#76777d] px-1">
        Valuasi memakai HPP rata-rata (<span className="font-mono">stocks.avg_cost</span>). Stok negatif berarti ada transaksi keluar melebihi stok —
        perbaiki lewat <b>Stock Opname</b> agar nilai persediaan akurat.
      </div>
    </div>
  );
}
