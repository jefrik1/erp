import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Search, RefreshCw, AlertTriangle, Warehouse, Layers, PackagePlus, Boxes,
  ArrowRightLeft, ShoppingCart, Flame, Info, Eye,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager,
  PosBadge, PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 12;
const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);

// status stok dipakai bareng oleh chip filter + badge baris
const stockStatus = (s)=>{
  const avail = Number(s.qty_available)||0;
  const rop = Number(s.reorder_point)||0;
  const min = Number(s.min_stock)||0;
  if (avail <= rop) return 'KRITIS';
  if (avail <= Math.max(min, rop) * 1.5) return 'WASPADA';
  return 'AMAN';
};
const STATUS_TONE = { KRITIS: 'red', WASPADA: 'amber', AMAN: 'emerald' };
const FILTERS = ['Semua','KRITIS','WASPADA','AMAN'];

export default function InventoryStocks(){
  const navigate = useNavigate();
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [wh, setWh] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [view, setView] = useState('ringkas');     // ringkas = per produk, detail = per gudang/batch
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit: 3000, offset: 0 };
      if (wh) params.warehouse_id = wh;
      if (appliedQ) params.search = appliedQ;
      const [detailRes, sumRes] = await Promise.all([
        api.get('/inventory/stocks', { params }),
        api.get('/inventory/stocks/summary', { params:{ warehouse_id: wh || undefined, search: appliedQ || undefined } }),
      ]);
      const data = Array.isArray(detailRes.data?.data) ? detailRes.data.data : (Array.isArray(detailRes.data) ? detailRes.data : []);
      setRows(data);
      setTotal(Number(detailRes.data?.total) || data.length);
      setSummary(Array.isArray(sumRes.data) ? sumRes.data : []);
    }catch(e){
      setErr(e.response?.data?.error || e.message); setRows([]); setSummary([]); setTotal(0);
    }finally{ setLoading(false); }
  },[wh, appliedQ]);

  useEffect(()=>{ api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:(r.data?.data||[]))).catch(()=>{}); },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[wh, appliedQ, statusFilter, view]);

  // Ringkas: satu baris per produk. Detail: satu baris per gudang+batch.
  const source = view === 'ringkas'
    ? summary.map(s=>({ ...s, warehouse_code: s.warehouse_count>1 ? (s.warehouse_count+' gudang') : (wh ? 'gudang ini' : '1 gudang') }))
    : rows;
  const filtered = statusFilter === 'Semua' ? source : source.filter(s=> stockStatus(s) === statusFilter);
  const pageRows = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const kritis = source.filter(s=> stockStatus(s) === 'KRITIS').length;
  const waspada = source.filter(s=> stockStatus(s) === 'WASPADA').length;
  const nilaiStok = source.reduce((a,s)=> a + (Number(s.qty_on_hand)||0) * (Number(s.avg_cost)||0), 0);
  const totalQty = source.reduce((a,s)=> a + (Number(s.qty_on_hand)||0), 0);

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { dataset:'stocks', format };
      if (wh) params.warehouse_id = wh;
      if (appliedQ) params.search = appliedQ;
      const r = await api.get('/inventory/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'stok-inventory.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal mengunduh laporan'); }
    finally{ setExpBusy(''); }
  };

  const kelola = (productId)=> navigate('/inventory/stock-in' + (productId ? '?product_id='+productId : ''));

  // Perawatan: gabungkan baris stok ganda (1 produk 1 gudang seharusnya 1 baris).
  const [rapiBusy, setRapiBusy] = useState(false);
  const rapikan = async ()=>{
    setRapiBusy(true);
    try{
      const dry = await api.post('/inventory/stocks/merge-duplicates', { dry_run:true });
      const d = dry.data || {};
      if (!d.groups){
        await dialog.alert('Tidak ada baris stok ganda. Data sudah rapi.', { title:'Rapikan Baris Stok' });
        return;
      }
      const contoh = (d.detail||[]).slice(0,5).map(x=>'• produk #'+x.product_id+' gudang #'+x.warehouse_id+': '+x.n+' baris').join('\n');
      const ok = await dialog.confirm(
        'Gabungkan baris stok ganda?\n\n'+d.groups+' kelompok ('+d.rows_removed+' baris berlebih) akan digabung menjadi satu baris per produk per gudang.\n'+
        'Jumlah qty dan total nilai stok tetap sama, hanya barisnya dirapikan.\n\n'+contoh,
        { title:'Rapikan Baris Stok' });
      if (!ok) return;
      const r = await api.post('/inventory/stocks/merge-duplicates', {});
      await dialog.alert('Selesai. '+(r.data?.groups||0)+' kelompok digabung, '+(r.data?.rows_removed||0)+' baris berlebih dihapus.', { title:'Baris Stok Dirapikan' });
      load();
    }catch(e){
      await dialog.alert(e.response?.data?.error || e.message || 'Gagal merapikan baris stok', { title:'Gagal' });
    }finally{ setRapiBusy(false); }
  };

  const jumlahBaris = useMemo(()=> view==='ringkas' ? summary.length : total, [view, summary.length, total]);

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Package} title="Stok per Gudang"
        subtitle="Posisi stok semua gudang. Angka di sini berasal dari barang masuk/keluar - bukan diketik manual."
        badge={`${angka(jumlahBaris)} ${view==='ringkas'?'produk':'baris stok'}`}
        actions={<>
          <button onClick={()=>navigate('/inventory/movements')} className={posBtnSecondary+' h-9 px-4 text-xs'}><Boxes size={14}/> Kartu Stok</button>
          <button onClick={()=>navigate('/inventory/stock-in')} className={posBtnPrimary+' h-9 px-4 text-xs'}><PackagePlus size={14}/> Tambah Stok</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Layers} tone="bg-[#EFF6FF] text-[#1E40AF]" label={view==='ringkas'?'PRODUK BERSTOK':'BARIS STOK'} value={angka(jumlahBaris)} sub={`${angka(totalQty)} unit • ${warehouses.length} gudang`}/>
        <PosStat icon={AlertTriangle} tone="bg-red-50 text-red-700" label="STOK KRITIS" value={angka(kritis)} sub="≤ reorder point"/>
        <PosStat icon={AlertTriangle} tone="bg-amber-50 text-amber-700" label="WASPADA" value={angka(waspada)} sub="mendekati batas minimum"/>
        <PosStat icon={Warehouse} tone="bg-emerald-50 text-emerald-700" label="NILAI STOK" value={rupiah(nilaiStok)} sub="qty on hand × avg cost"/>
      </div>

      {/* penjelasan: dari mana stok bertambah/berkurang */}
      <PosCard>
        <PosCardBody className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-[#1E40AF]/10 text-[#1E40AF] shrink-0"><Info size={14}/></span>
          <div className="text-xs text-[#475569] leading-relaxed">
            <b className="text-[#0F172A]">Dari mana angka stok datang?</b> Stok <b>bertambah</b> lewat:
            <span className="font-semibold"> Goods Receipt</span> (barang dari Purchase Order),
            <span className="font-semibold"> Penambahan Stok</span> (stok awal, pembelian tanpa PO, retur customer),
            dan <span className="font-semibold">Transfer</span> masuk.
            Stok <b>berkurang</b> lewat: <span className="font-semibold">POS / Sales Order</span> (penjualan),
            <span className="font-semibold"> Susut &amp; Pecah</span>, <span className="font-semibold">Transfer</span> keluar,
            dan <span className="font-semibold">Pengurangan Stok</span> (rusak/pakai internal).
            <span className="text-[#64748B]"> Semua jejaknya bisa dilihat di Kartu Stok.</span>
          </div>
          <div className="hidden lg:flex flex-col gap-1.5 shrink-0">
            <button onClick={()=>navigate('/purchase/receipts')} className={posBtnSm}><Warehouse size={13}/> Goods Receipt</button>
            <button onClick={()=>navigate('/inventory/stock-in')} className={posBtnSm}><PackagePlus size={13}/> Penambahan Stok</button>
            <button onClick={()=>navigate('/inventory/transfers')} className={posBtnSm}><ArrowRightLeft size={13}/> Transfer</button>
            <button onClick={()=>navigate('/waste')} className={posBtnSm}><Flame size={13}/> Susut &amp; Pecah</button>
          </div>
        </PosCardBody>
      </PosCard>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
            <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Stok"/>
            <button onClick={rapikan} disabled={rapiBusy} title="Gabungkan baris stok ganda (1 produk 1 gudang = 1 baris)"
              className={posBtnSecondary+' h-9 px-4 text-xs disabled:opacity-50'}>
              <RefreshCw size={13} className={rapiBusy?'animate-spin':''}/> Rapikan Baris
            </button>
            <button onClick={()=>navigate('/inventory/stock-in')} className={posBtnPrimary+' h-9 px-4 text-xs'}><PackagePlus size={14}/> Tambah Stok</button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari nama produk / SKU lalu Enter..." className={posInput+' pl-9'}/>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={wh} onChange={setWh}>
                <option value="">Semua Gudang</option>
                {warehouses.map(w=> <option key={w.id} value={String(w.id)}>{w.code} • {w.name}</option>)}
              </PosSelect>
            </div>
          </PosToolbar>

          <PosChipRow label="TAMPILAN">
            <PosChip active={view==='ringkas'} onClick={()=>setView('ringkas')}>Ringkas (per produk)</PosChip>
            <PosChip active={view==='detail'} onClick={()=>setView('detail')}>Detail (per gudang/batch)</PosChip>
            <span className="text-[11px] font-bold tracking-widest text-[#64748B] ml-3">STATUS</span>
            {FILTERS.map(f=> <PosChip key={f} active={statusFilter===f} onClick={()=>setStatusFilter(f)}>{f}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : filtered.length===0 ? (
          <PosEmpty text={source.length ? 'Tidak ada baris pada filter ini' : `Belum ada stok${wh?' di gudang ini':''} - tambahkan lewat Penambahan Stok atau Goods Receipt`}/>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                  <PosTh>PRODUK</PosTh>
                  <PosTh align="center">{view==='ringkas' ? 'GUDANG' : 'GUDANG / BATCH'}</PosTh>
                  <PosTh align="right">ON HAND</PosTh>
                  {view==='detail' && <PosTh align="right">RESERVED</PosTh>}
                  <PosTh align="right">AVAILABLE</PosTh>
                  <PosTh align="right">AVG COST</PosTh>
                  <PosTh align="right">NILAI</PosTh>
                  <PosTh align="center">STATUS</PosTh>
                  <PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map((s, idx)=>{
                    const st = stockStatus(s);
                    const key = view==='ringkas' ? s.product_id : s.id;
                    return (
                      <tr key={key ?? idx} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-[#0F172A]">{s.product_name}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {s.sku} • Min {angka(s.min_stock)} • Reorder {angka(s.reorder_point)}
                            {view==='ringkas' && s.row_count>1 && <span className="text-[#94A3B8]"> • {s.row_count} baris batch</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center"><PosBadge tone="slate">{s.warehouse_code||'-'}</PosBadge></td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{angka(s.qty_on_hand)}</td>
                        {view==='detail' && <td className="px-4 py-3.5 text-right text-amber-700 tabular-nums">{angka(s.qty_reserved)}</td>}
                        <td className={'px-4 py-3.5 text-right font-black tabular-nums '+(st==='KRITIS'?'text-red-600':st==='WASPADA'?'text-amber-600':'text-emerald-700')}>{angka(s.qty_available)}</td>
                        <td className="px-4 py-3.5 text-right text-xs text-[#334155] tabular-nums">{rupiah(s.avg_cost)}</td>
                        <td className="px-4 py-3.5 text-right text-xs text-[#334155] tabular-nums">{rupiah((Number(s.qty_on_hand)||0)*(Number(s.avg_cost)||0))}</td>
                        <td className="px-4 py-3.5 text-center"><PosBadge tone={STATUS_TONE[st]}>{st}</PosBadge></td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end">
                            <button onClick={()=>kelola(view==='ringkas' ? s.product_id : s.product_id)}
                              className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}
                              title="Tambah / sesuaikan stok produk ini">
                              <PackagePlus size={13}/> Stok
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <PosCardBody><PosPager page={page} setPage={setPage} total={filtered.length} size={PAGE_SIZE} unit={view==='ringkas'?'produk':'baris'}/></PosCardBody>
            )}
          </>
        )}
      </PosCard>
    </div>
  );
}
