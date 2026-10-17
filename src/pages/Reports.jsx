import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, ArrowUp, ArrowDown,
  ChevronsUpDown, X, MessageCircle, Loader2, Search, Calendar, Download, BarChart3,
  Percent, Wallet, Inbox
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from 'recharts';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import { PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosExportButtons } from '../components/PosUI';

/* ---------------- helpers ---------------- */
function rupiah(n){ return 'Rp '+new Intl.NumberFormat('id-ID').format(Math.round(n||0)); }
function num(n){ return new Intl.NumberFormat('id-ID').format(Math.round(n||0)); }
const pad2 = n => String(n).padStart(2,'0');
const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const monthStartISO = () => { const d = new Date(); return isoOf(new Date(d.getFullYear(), d.getMonth(), 1)); };
const monthEndISO = () => { const d = new Date(); return isoOf(new Date(d.getFullYear(), d.getMonth()+1, 0)); };
function shiftDate(s, years, months){
  if(!s) return s;
  const [y,m,d] = String(s).slice(0,10).split('-').map(Number);
  if(!y||!m||!d) return s;
  return isoOf(new Date(y+years, (m-1)+months, d));
}
function errMsg(e){ return e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Terjadi kesalahan'; }
function slug(s){ return String(s||'laporan').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function normPhone(p){
  const d = String(p||'').replace(/[^0-9]/g,'');
  if(!d) return '';
  if(d.startsWith('62')) return d;
  if(d.startsWith('0')) return '62'+d.slice(1);
  if(d.startsWith('8')) return '62'+d;
  return d;
}
function waText(nama, invNo, outstanding, due, telat){
  return `Halo ${nama}, kami dari bagian Keuangan. Kami mengingatkan invoice ${invNo} dengan sisa tagihan ${rupiah(outstanding)} yang jatuh tempo pada ${due}${telat > 0 ? ` (terlambat ${telat} hari)` : ''}. Mohon konfirmasi dan lakukan pembayaran segera. Terima kasih atas kerja samanya.`;
}
const BUCKET_TONE = {
  'Current':'bg-emerald-50 text-emerald-700 border-emerald-200',
  '1-30':'bg-amber-50 text-amber-700 border-amber-200',
  '31-60':'bg-orange-50 text-orange-700 border-orange-200',
  '61-90':'bg-red-50 text-red-700 border-red-200',
  '>90':'bg-red-100 text-red-800 border-red-300'
};
const BUCKETS = ['Semua','Current','1-30','31-60','61-90','>90'];

const inputCls = "h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition";
const btnPrimary = "h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnGhost = "h-[42px] px-4 bg-white border border-[#E2E8F0] rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition";
const thCls = "bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]";
const rowCls = "border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white";

/* ---------------- small building blocks ---------------- */
function SkeletonRows({ rows = 6, className = '' }){
  return (
    <div className={"space-y-2 animate-pulse " + className}>
      {Array.from({length: rows}).map((_,i)=>(
        <div key={i} className="h-9 rounded-xl bg-[#F1F5F9]" style={{ opacity: Math.max(0.35, 1 - i*0.1) }} />
      ))}
    </div>
  );
}
function EmptyState({ text = 'Belum ada data pada periode ini' }){
  return (
    <div className="py-10 text-center">
      <div className="w-11 h-11 mx-auto rounded-[20px] bg-[#F1F5F9] grid place-items-center text-[#94A3B8]"><Inbox size={20}/></div>
      <p className="text-xs text-[#64748B] mt-2">{text}</p>
    </div>
  );
}
function ErrorState({ message, onRetry }){
  return (
    <div className="py-8 text-center">
      <div className="w-11 h-11 mx-auto rounded-[20px] bg-red-50 grid place-items-center text-red-600"><AlertTriangle size={20}/></div>
      <p className="text-xs text-red-600 mt-2 font-semibold">Gagal memuat data</p>
      <p className="text-[11px] text-[#64748B] mt-0.5 break-words">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 h-9 px-4 rounded-xl bg-[#1E40AF] text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#1E3A8A] transition">
        <RefreshCw size={13}/> Coba Lagi
      </button>
    </div>
  );
}
function Pager({ page, setPage, total, size = 10 }){
  const pages = Math.max(1, Math.ceil((total||0)/size));
  if((total||0) <= size) return null;
  const from = (page-1)*size + 1;
  const to = Math.min(total, page*size);
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#F1F5F9] text-[11px] text-[#64748B]">
      <span className="tabular-nums">{from}-{to} dari {total}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page<=1} onClick={()=>setPage(Math.max(1,page-1))}
          className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition">
          <ChevronLeft size={13}/> Prev
        </button>
        <span className="px-2 font-bold text-[#0F172A] tabular-nums">{page}/{pages}</span>
        <button type="button" disabled={page>=pages} onClick={()=>setPage(Math.min(pages,page+1))}
          className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition">
          Next <ChevronRight size={13}/>
        </button>
      </div>
    </div>
  );
}
function SortTh({ label, k, sortKey, sortDir, onSort }){
  const active = sortKey === k;
  return (
    <th className={thCls + " px-3 py-2.5 text-right"}>
      <button type="button" onClick={()=>onSort(k)} title="Klik untuk urutkan"
        className={"inline-flex flex-row-reverse items-center gap-1 uppercase transition " + (active ? "text-[#1E40AF]" : "hover:text-[#1E40AF]")}>
        {label}
        {active ? (sortDir === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ChevronsUpDown size={12} className="opacity-40"/>}
      </button>
    </th>
  );
}

/* ---------------- page ---------------- */
export default function Reports(){
  const dialog = useDialog();

  const [f, setF] = useState({ start: monthStartISO(), end: monthEndISO(), branch_id:'', category_id:'', q:'' });
  const [applied, setApplied] = useState({ start: monthStartISO(), end: monthEndISO(), branch_id:'', category_id:'', q:'' });

  const [meta, setMeta] = useState({ branches:[], categories:[] });
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaErr, setMetaErr] = useState('');

  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesErr, setSalesErr] = useState('');
  const [sortKey, setSortKey] = useState('revenue');
  const [sortDir, setSortDir] = useState('desc');
  const [salesPage, setSalesPage] = useState(1);

  const [margin, setMargin] = useState([]);
  const [marginLoading, setMarginLoading] = useState(true);
  const [marginErr, setMarginErr] = useState('');
  const [marginPage, setMarginPage] = useState(1);

  const [aging, setAging] = useState([]);
  const [agingLoading, setAgingLoading] = useState(true);
  const [agingErr, setAgingErr] = useState('');
  const [bucket, setBucket] = useState('Semua');

  const [types, setTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesErr, setTypesErr] = useState('');
  const [busy, setBusy] = useState({});

  const [detail, setDetail] = useState(null);

  /* ------- loaders ------- */
  const loadMeta = useCallback(async ()=>{
    setMetaLoading(true); setMetaErr('');
    try{
      const r = await api.get('/reports/meta');
      setMeta({ branches: r.data?.branches || [], categories: r.data?.categories || [] });
    }catch(e){ setMetaErr(errMsg(e)); }
    finally{ setMetaLoading(false); }
  },[]);

  const loadTypes = useCallback(async ()=>{
    setTypesLoading(true); setTypesErr('');
    try{
      const r = await api.get('/reports/export/types');
      setTypes(Array.isArray(r.data) ? r.data : []);
    }catch(e){ setTypesErr(errMsg(e)); }
    finally{ setTypesLoading(false); }
  },[]);

  const loadSales = useCallback(async ()=>{
    setSalesLoading(true); setSalesErr('');
    try{
      const params = { start: applied.start, end: applied.end, group_by:'product' };
      if(applied.branch_id) params.branch_id = applied.branch_id;
      if(applied.category_id) params.category_id = applied.category_id;
      if(applied.q) params.q = applied.q;
      const r = await api.get('/reports/sales', { params });
      setSales(Array.isArray(r.data) ? r.data : []);
    }catch(e){ setSalesErr(errMsg(e)); setSales([]); }
    finally{ setSalesLoading(false); }
  },[applied]);

  const loadMargin = useCallback(async ()=>{
    setMarginLoading(true); setMarginErr('');
    try{
      const r = await api.get('/reports/margin');
      setMargin(Array.isArray(r.data) ? r.data : []);
    }catch(e){ setMarginErr(errMsg(e)); setMargin([]); }
    finally{ setMarginLoading(false); }
  },[]);

  const loadAging = useCallback(async ()=>{
    setAgingLoading(true); setAgingErr('');
    try{
      const params = {};
      if(bucket && bucket !== 'Semua') params.bucket = bucket;
      if(applied.q) params.q = applied.q;
      const r = await api.get('/reports/aging-ar', { params });
      setAging(Array.isArray(r.data) ? r.data : []);
    }catch(e){ setAgingErr(errMsg(e)); setAging([]); }
    finally{ setAgingLoading(false); }
  },[bucket, applied.q]);

  useEffect(()=>{ loadMeta(); loadTypes(); loadMargin(); }, [loadMeta, loadTypes, loadMargin]);
  useEffect(()=>{ loadSales(); }, [loadSales]);
  useEffect(()=>{ loadAging(); }, [loadAging]);

  useEffect(()=>{ setSalesPage(1); }, [applied, sortKey, sortDir]);
  useEffect(()=>{ setMarginPage(1); }, [margin.length]);

  /* ------- presets ------- */
  const applyPreset = (preset)=>{
    let start = f.start, end = f.end;
    if(preset === 'today'){ start = todayISO(); end = todayISO(); }
    else if(preset === 'month'){ start = monthStartISO(); end = monthEndISO(); }
    else if(preset === 'yoy'){ start = shiftDate(f.start || todayISO(), -1, 0); end = shiftDate(f.end || todayISO(), -1, 0); }
    else if(preset === 'mom'){
      const base = f.start || todayISO();
      const [y,m] = String(base).slice(0,10).split('-').map(Number);
      const prev = new Date(y, (m-1) - 1, 1);
      start = isoOf(prev);
      end = isoOf(new Date(prev.getFullYear(), prev.getMonth()+1, 0));
    }
    const next = { ...f, start, end };
    setF(next); setApplied(next);
  };
  const applyNow = ()=>{ setApplied({ ...f }); };
  const resetAll = ()=>{
    const next = { start: monthStartISO(), end: monthEndISO(), branch_id:'', category_id:'', q:'' };
    setF(next); setApplied(next); setBucket('Semua');
  };

  /* ------- derived ------- */
  const sortedSales = useMemo(()=>{
    const arr = [...sales];
    if(!sortKey) return arr;
    arr.sort((a,b)=>{
      const av = Number(a?.[sortKey] ?? 0), bv = Number(b?.[sortKey] ?? 0);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  },[sales, sortKey, sortDir]);

  const chartData = useMemo(()=>{
    return [...sales]
      .sort((a,b)=>Number(b?.revenue||0) - Number(a?.revenue||0))
      .slice(0,8)
      .map(s=>({ revenue: Number(s?.revenue||0), qty: Number(s?.qty||0), short: String(s?.name||'-').length > 18 ? String(s.name).slice(0,17)+'…' : String(s?.name||'-') }));
  },[sales]);

  const salesPageRows = useMemo(()=> sortedSales.slice((salesPage-1)*10, salesPage*10), [sortedSales, salesPage]);
  const marginPageRows = useMemo(()=> margin.slice((marginPage-1)*10, marginPage*10), [margin, marginPage]);

  const agingTotals = useMemo(()=>{
    const outstanding = aging.reduce((s,r)=> s + Number(r?.outstanding||0), 0);
    const customers = new Set(aging.map(r=> r?.customer_id ?? r?.name)).size;
    return { outstanding, customers, invoices: aging.length };
  },[aging]);

  const onSort = (k)=>{
    if(sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  /* ------- drill-down ------- */
  const openInvoice = async (row)=>{
    const id = row?.invoice_id;
    if(!id) return;
    const fallbackPhone = row?.phone || '';
    setDetail({ loading:true, error:'', invoice:null, items:[], payments:[], fallbackPhone });
    try{
      const r = await api.get('/reports/ar-invoice/' + id);
      setDetail({
        loading:false, error:'',
        invoice: r.data?.invoice || null,
        items: Array.isArray(r.data?.items) ? r.data.items : [],
        payments: Array.isArray(r.data?.payments) ? r.data.payments : [],
        fallbackPhone
      });
    }catch(e){
      setDetail({ loading:false, error: errMsg(e), invoice:null, items:[], payments:[], fallbackPhone });
    }
  };
  const closeDetail = ()=> setDetail(null);

  const waHref = (inv, fallbackPhone)=>{
    const phone = normPhone(inv?.phone || fallbackPhone);
    if(!phone) return '';
    const due = inv?.due_date ? String(inv.due_date).slice(0,10) : '-';
    const telat = Number(inv?.days_overdue || 0);
    return `https://wa.me/${phone}?text=${encodeURIComponent(waText(inv?.customer_name || 'Pelanggan', inv?.invoice_number || '-', inv?.outstanding, due, telat))}`;
  };

  /* ------- export ------- */
  const doExport = async (type, format)=>{
    const key = type + '|' + format;
    setBusy(b => ({ ...b, [key]: true }));
    try{
      const params = { type, format };
      if(applied.start) params.start = applied.start;
      if(applied.end) params.end = applied.end;
      if(applied.branch_id) params.branch_id = applied.branch_id;
      if(applied.category_id) params.category_id = applied.category_id;
      if(applied.q) params.q = applied.q;
      const r = await api.get('/reports/export', { params, responseType:'blob' });
      const label = types.find(t=>t.key === type)?.label || type;
      const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
      const filename = `${slug(label)}-${applied.end || todayISO()}.${ext}`;
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      if(typeof a.remove === 'function') a.remove(); else document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }catch(e){
      await dialog.alert(`Gagal mengunduh ${String(format).toUpperCase()}: ${errMsg(e)}`, { title:'Export Gagal' });
    }finally{
      setBusy(b => ({ ...b, [key]: false }));
    }
  };

  /* ------- render ------- */
  const presetChips = [
    { k:'today', label:'Hari ini' },
    { k:'month', label:'Bulan ini' },
    { k:'yoy',   label:'YoY' },
    { k:'mom',   label:'MoM' }
  ];

  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={FileText}
        title="Reporting & BI"
        subtitle="Report builder • Export PDF/Excel/CSV • Drill-down piutang • YoY/MoM"
        badge="Live"
      />

      {/* ---------- Filter bar ---------- */}
      <PosCard>
        <PosCardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-[#64748B] mr-1">
              <Calendar size={13}/> PERIODE CEPAT
            </div>
            {presetChips.map(p=>(
              <PosChip key={p.k} active={false} onClick={()=>applyPreset(p.k)}>{p.label}</PosChip>
            ))}
            <button type="button" onClick={resetAll} className="h-8 px-3.5 rounded-full text-xs font-bold border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC] transition shrink-0">Reset</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
            <div>
              <label className="text-[11px] font-bold tracking-widest text-[#64748B]">DARI</label>
              <input type="date" value={f.start} onChange={e=>setF({...f, start:e.target.value})} className={inputCls + " w-full mt-1"} />
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest text-[#64748B]">SAMPAI</label>
              <input type="date" value={f.end} onChange={e=>setF({...f, end:e.target.value})} className={inputCls + " w-full mt-1"} />
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest text-[#64748B]">CABANG</label>
              <div className="mt-1">
                <PosSelect value={f.branch_id} onChange={v=>setF({...f, branch_id:v})}>
                  <option value="">Semua Cabang</option>
                  {(meta.branches||[]).map(b=>(<option key={b.id} value={b.id}>{b.name}</option>))}
                </PosSelect>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest text-[#64748B]">KATEGORI</label>
              <div className="mt-1">
                <PosSelect value={f.category_id} onChange={v=>setF({...f, category_id:v})}>
                  <option value="">Semua Kategori</option>
                  {(meta.categories||[]).map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
                </PosSelect>
              </div>
            </div>
            <div className="xl:col-span-2">
              <label className="text-[11px] font-bold tracking-widest text-[#64748B]">CARI CUSTOMER / PRODUK</label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1 min-w-0">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
                  <input
                    value={f.q}
                    onChange={e=>setF({...f, q:e.target.value})}
                    onKeyDown={e=>{ if(e.key === 'Enter') applyNow(); }}
                    placeholder="Nama customer / produk…"
                    className={inputCls + " w-full pl-9"}
                  />
                </div>
                <button type="button" onClick={applyNow} className={btnPrimary}>
                  <Search size={15}/> Terapkan
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
            <span className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0]">Periode aktif: <b className="text-[#0F172A]">{applied.start} → {applied.end}</b></span>
            {applied.branch_id && <span className="px-2.5 py-1 rounded-full bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">Cabang terfilter</span>}
            {applied.category_id && <span className="px-2.5 py-1 rounded-full bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">Kategori terfilter</span>}
            {applied.q && <span className="px-2.5 py-1 rounded-full bg-[#FEF3C7] text-amber-700 border border-amber-200">Cari: “{applied.q}”</span>}
            {metaErr && <span className="text-red-600">Meta gagal dimuat: {metaErr}</span>}
            {metaLoading && <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> memuat cabang &amp; kategori…</span>}
          </div>
        </PosCardBody>
      </PosCard>

      <div className="grid lg:grid-cols-2 gap-4 items-stretch">
        {/* ---------- Penjualan per Produk ---------- */}
        <PosCard className="flex flex-col">
          <div className="p-4 border-b border-[#F1F5F9] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 grid place-items-center text-[#1E40AF]"><BarChart3 size={16}/></div>
              <h3 className="font-bold text-[#0F172A]">Penjualan per Produk</h3>
            </div>
            <span className="text-[11px] px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]">Top {Math.min(8, chartData.length)} revenue</span>
          </div>
          <PosCardBody>
            {salesLoading ? (
              <div className="h-[260px] animate-pulse rounded-xl bg-[#F1F5F9]" />
            ) : salesErr ? (
              <ErrorState message={salesErr} onRetry={loadSales} />
            ) : chartData.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top:4, right:12, bottom:4, left:4 }}>
                    <CartesianGrid stroke="#F1F5F9" horizontal={false}/>
                    <XAxis type="number" tick={{ fontSize:10 }} tickFormatter={v=> new Intl.NumberFormat('id-ID',{ notation:'compact' }).format(v||0)}/>
                    <YAxis type="category" dataKey="short" width={110} tick={{ fontSize:10 }}/>
                    <RTooltip formatter={(v)=> [rupiah(v),'Revenue']}/>
                    <Bar dataKey="revenue" fill="#1E40AF" radius={[0,6,6,0]} barSize={16}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </PosCardBody>

          <div className="border-t border-[#F1F5F9] flex-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 max-h-[420px] overflow-auto">
              {salesLoading ? (
                <SkeletonRows rows={5} className="p-3"/>
              ) : salesErr ? null : sales.length === 0 ? (
                <EmptyState />
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className={thCls}>
                    <th className="px-3 py-2.5 text-left">PRODUK</th>
                    <th className="px-3 py-2.5 text-left">KATEGORI</th>
                    <SortTh label="Qty" k="qty" sortKey={sortKey} sortDir={sortDir} onSort={onSort}/>
                    <SortTh label="Revenue" k="revenue" sortKey={sortKey} sortDir={sortDir} onSort={onSort}/>
                  </tr></thead>
                  <tbody>
                    {salesPageRows.map((s, i)=>(
                      <tr key={String(s?.name||'row')+i} className={rowCls}>
                        <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{s?.name}</td>
                        <td className="px-3 py-2.5 text-[#64748B]">{s?.category || '-'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(s?.qty)}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{rupiah(s?.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!salesLoading && !salesErr && sales.length > 0 && (
              <Pager page={salesPage} setPage={setSalesPage} total={sortedSales.length} size={10}/>
            )}
          </div>
        </PosCard>

        {/* ---------- Analisa Margin ---------- */}
        <PosCard className="flex flex-col">
          <div className="p-4 border-b border-[#F1F5F9] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 grid place-items-center text-amber-600"><Percent size={16}/></div>
              <h3 className="font-bold text-[#0F172A]">Analisa Margin per Produk</h3>
            </div>
            <span className="text-[11px] px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]">Urut margin terendah • {margin.length} produk</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 max-h-[420px] overflow-auto">
              {marginLoading ? (
                <SkeletonRows rows={6} className="p-4"/>
              ) : marginErr ? (
                <ErrorState message={marginErr} onRetry={loadMargin}/>
              ) : margin.length === 0 ? (
                <EmptyState/>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className={thCls}>
                    <th className="px-3 py-2.5 text-left">SKU</th>
                    <th className="px-3 py-2.5 text-left">PRODUK</th>
                    <th className="px-3 py-2.5 text-right">HARGA</th>
                    <th className="px-3 py-2.5 text-right">
                      <span title="HPP = harga pokok rata-rata (average cost) yang tersimpan di master stok (stocks.avg_cost)" className="cursor-help border-b border-dashed border-[#94A3B8]">HPP</span>
                    </th>
                    <th className="px-3 py-2.5 text-right">MARGIN Rp</th>
                    <th className="px-3 py-2.5 text-right">MARGIN %</th>
                  </tr></thead>
                  <tbody>
                    {marginPageRows.map((m, i)=>{
                      const pct = Number(m?.pct || 0);
                      const tone = pct > 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : pct > 15 ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200';
                      return (
                        <tr key={String(m?.sku||m?.name||'m')+i} className={rowCls}>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-[#64748B]">{m?.sku || '-'}</td>
                          <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{m?.name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{num(m?.price)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#64748B]" title="HPP = harga pokok rata-rata (average cost) dari stocks.avg_cost">{num(m?.cost)}</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums">{num(m?.margin)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={"px-2 py-1 rounded-full border font-bold tabular-nums "+tone} title={pct > 30 ? 'Margin sehat (>30%)' : pct > 15 ? 'Margin sedang (>15%)' : 'Margin rendah - review harga/HPP'}>
                              {pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!marginLoading && !marginErr && margin.length > 0 && (
              <Pager page={marginPage} setPage={setMarginPage} total={margin.length} size={10}/>
            )}
          </div>
        </PosCard>
      </div>

      {/* ---------- Aging Piutang ---------- */}
      <PosCard>
        <div className="p-4 border-b border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-50 grid place-items-center text-red-600"><Wallet size={16}/></div>
            <div>
              <h3 className="font-bold text-[#0F172A] leading-none">Aging Piutang - Drill-down</h3>
              <p className="text-[11px] text-[#64748B] mt-1">Klik baris untuk detail invoice &amp; pengiriman tagihan WhatsApp</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]">Outstanding: <b className="text-[#0F172A]">{rupiah(agingTotals.outstanding)}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]">Invoice: <b className="text-[#0F172A]">{num(agingTotals.invoices)}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]">Customer: <b className="text-[#0F172A]">{num(agingTotals.customers)}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">Menampilkan <b>{aging.length}</b> baris (semua)</span>
          </div>
        </div>

        <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest text-[#64748B] mr-1">BUCKET</span>
          {BUCKETS.map(b=>(
            <PosChip key={b} active={bucket === b} onClick={()=>setBucket(b)}>{b}</PosChip>
          ))}
        </div>

        <div className="mt-3 max-h-[620px] overflow-auto">
          {agingLoading ? (
            <SkeletonRows rows={6} className="p-4"/>
          ) : agingErr ? (
            <ErrorState message={agingErr} onRetry={loadAging}/>
          ) : aging.length === 0 ? (
            <EmptyState text="Tidak ada piutang pada filter ini"/>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className={thCls}>
                <th className="px-3 py-2.5 text-left">CUSTOMER</th>
                <th className="px-3 py-2.5 text-left">INVOICE</th>
                <th className="px-3 py-2.5 text-center">JATUH TEMPO</th>
                <th className="px-3 py-2.5 text-center">UMUR</th>
                <th className="px-3 py-2.5 text-right">OUTSTANDING</th>
                <th className="px-3 py-2.5 text-center">BUCKET</th>
                <th className="px-3 py-2.5 text-right">AKSI</th>
              </tr></thead>
              <tbody>
                {aging.map((a, i)=>{
                  const wa = normPhone(a?.phone);
                  const href = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(waText(a?.name || 'Pelanggan', a?.invoice_number || '-', a?.outstanding, a?.due_date ? String(a.due_date).slice(0,10) : '-', Number(a?.days_overdue||0)))}` : '';
                  return (
                    <tr key={String(a?.invoice_id || a?.invoice_number || 'a')+i} className={rowCls + " cursor-pointer"} onClick={()=>openInvoice(a)}>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-[#0F172A]">{a?.name}</div>
                        <div className="text-[10px] text-[#94A3B8]">{a?.phone || 'tanpa nomor telepon'}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#334155]">{a?.invoice_number}</td>
                      <td className="px-3 py-2.5 text-center text-[#64748B]">{a?.due_date ? String(a.due_date).slice(0,10) : '-'}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{num(a?.days_overdue)} hari</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{rupiah(a?.outstanding)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={"px-2 py-1 rounded-full border font-bold "+(BUCKET_TONE[a?.bucket] || 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]')}>{a?.bucket}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100 transition">
                            <MessageCircle size={12}/> Tagih
                          </a>
                        ) : (
                          <span title="Nomor telepon customer belum terdaftar" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0] text-[11px] font-bold cursor-not-allowed">
                            <MessageCircle size={12}/> Tagih
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </PosCard>

      {/* ---------- Export ---------- */}
      <div className="bg-[#0F172A] rounded-[20px] border border-[#0F172A] shadow-sm p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 grid place-items-center"><Download size={16}/></div>
            <div>
              <h3 className="font-bold leading-none">Export Laporan Wajib PRD</h3>
              <p className="text-[11px] text-white/60 mt-1">Unduhan asli sesuai filter periode, cabang, kategori &amp; pencarian di atas</p>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/70">
            Periode: {applied.end || todayISO()}
          </span>
        </div>

        {typesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-4 animate-pulse">
            {Array.from({length:8}).map((_,i)=>(<div key={i} className="h-[86px] rounded-xl bg-white/10"/>))}
          </div>
        ) : typesErr ? (
          <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <p className="text-xs text-red-300 font-semibold">Gagal memuat daftar laporan</p>
            <p className="text-[11px] text-white/50 mt-0.5 break-words">{typesErr}</p>
            <button type="button" onClick={loadTypes} className="mt-3 h-9 px-4 rounded-xl bg-white text-[#0F172A] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-white/90 transition">
              <RefreshCw size={13}/> Coba Lagi
            </button>
          </div>
        ) : types.length === 0 ? (
          <div className="mt-4 text-xs text-white/60">Belum ada tipe laporan yang tersedia.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-4">
            {types.map(t=>(
              <div key={t.key} className="bg-white/10 border border-white/10 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold leading-snug">{t.label}</span>
                  <span className="text-[10px] font-mono text-white/40 shrink-0">{t.key}</span>
                </div>
                <div className="mt-2.5"><PosExportButtons
                  onExport={(f)=>doExport(t.key, f)}
                  busyKey={['xlsx','pdf','csv'].find(f=> busy[t.key + '|' + f]) || ''}
                /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Modal drill-down ---------- */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center p-4 z-[60]" onClick={closeDetail}>
          <div className="bg-white rounded-[20px] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-pop" onClick={e=>e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-black text-[#0F172A] leading-tight">Detail Invoice Piutang</h3>
                <p className="text-[11px] text-[#64748B] mt-1">
                  {detail.invoice ? `${detail.invoice.invoice_number} • ${detail.invoice.customer_name}` : 'Memuat data invoice…'}
                </p>
              </div>
              <button type="button" onClick={closeDetail} aria-label="Tutup" className="w-8 h-8 rounded-full border border-[#E2E8F0] grid place-items-center hover:bg-[#F8FAFC] shrink-0">
                <X size={15}/>
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1">
              {detail.loading ? (
                <SkeletonRows rows={6}/>
              ) : detail.error ? (
                <ErrorState message={detail.error} onRetry={closeDetail}/>
              ) : !detail.invoice ? (
                <EmptyState text="Invoice tidak ditemukan"/>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5">
                      <div className="text-[10px] font-bold tracking-widest text-[#64748B]">CUSTOMER</div>
                      <div className="font-bold text-[#0F172A] truncate">{detail.invoice.customer_name || '-'}</div>
                      <div className="text-[10px] text-[#94A3B8]">{detail.invoice.customer_code || '-'} • {detail.invoice.phone || 'tanpa telepon'}</div>
                    </div>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5">
                      <div className="text-[10px] font-bold tracking-widest text-[#64748B]">TANGGAL / JATUH TEMPO</div>
                      <div className="font-bold text-[#0F172A]">{detail.invoice.invoice_date ? String(detail.invoice.invoice_date).slice(0,10) : '-'}</div>
                      <div className="text-[10px] text-[#94A3B8]">Due: {detail.invoice.due_date ? String(detail.invoice.due_date).slice(0,10) : '-'}</div>
                    </div>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5">
                      <div className="text-[10px] font-bold tracking-widest text-[#64748B]">STATUS</div>
                      <div className="font-bold text-[#0F172A]">{detail.invoice.status || '-'}</div>
                      <div className="text-[10px] text-[#94A3B8]">Terlambat {num(detail.invoice.days_overdue)} hari • Limit {rupiah(detail.invoice.credit_limit)}</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-2.5">
                      <div className="text-[10px] font-bold tracking-widest text-red-600">OUTSTANDING</div>
                      <div className="font-black text-red-700">{rupiah(detail.invoice.outstanding)}</div>
                      <div className="text-[10px] text-red-600">Total {rupiah(detail.invoice.total)} • Bayar {rupiah(detail.invoice.paid_amount)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-1.5">ITEM INVOICE</div>
                    <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className={thCls}>
                          <th className="px-3 py-2.5 text-left">PRODUK</th>
                          <th className="px-3 py-2.5 text-left">SKU</th>
                          <th className="px-3 py-2.5 text-right">QTY</th>
                          <th className="px-3 py-2.5 text-right">HARGA</th>
                          <th className="px-3 py-2.5 text-right">TOTAL</th>
                        </tr></thead>
                        <tbody>
                          {detail.items.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-[#94A3B8]">Tidak ada item</td></tr>
                          ) : detail.items.map((it, i)=>(
                            <tr key={i} className={rowCls}>
                              <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{it?.product_name}</td>
                              <td className="px-3 py-2.5 font-mono text-[11px] text-[#64748B]">{it?.sku || '-'}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{num(it?.qty)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(it?.unit_price)}</td>
                              <td className="px-3 py-2.5 text-right font-bold tabular-nums">{rupiah(it?.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-1.5">RIWAYAT PEMBAYARAN</div>
                    <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className={thCls}>
                          <th className="px-3 py-2.5 text-left">TANGGAL</th>
                          <th className="px-3 py-2.5 text-left">METODE / REF</th>
                          <th className="px-3 py-2.5 text-right">JUMLAH</th>
                        </tr></thead>
                        <tbody>
                          {detail.payments.length === 0 ? (
                            <tr><td colSpan={3} className="px-3 py-6 text-center text-[#94A3B8]">Belum ada pembayaran tercatat</td></tr>
                          ) : detail.payments.map((p, i)=>(
                            <tr key={i} className={rowCls}>
                              <td className="px-3 py-2.5">{String(p?.payment_date || p?.date || p?.created_at || '-').slice(0,10)}</td>
                              <td className="px-3 py-2.5 text-[#64748B]">{p?.method || p?.payment_method || p?.reference || p?.ref || '-'}</td>
                              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700">{rupiah(p?.amount ?? p?.total ?? p?.paid_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-[#64748B] min-w-0">
                {detail.invoice && !normPhone(detail.invoice.phone || detail.fallbackPhone)
                  ? 'Nomor WhatsApp customer belum terdaftar - tombol tagih dinonaktifkan.'
                  : detail.invoice ? `Tagihan akan dikirim ke +${normPhone(detail.invoice.phone || detail.fallbackPhone)}` : ''}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeDetail} className={btnGhost}>Tutup</button>
                {(()=>{
                  const href = detail.invoice ? waHref(detail.invoice, detail.fallbackPhone) : '';
                  return href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="h-[42px] px-5 bg-emerald-600 text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition">
                      <MessageCircle size={15}/> WA Tagih
                    </a>
                  ) : (
                    <button type="button" disabled title="Nomor telepon customer belum terdaftar"
                      className="h-[42px] px-5 bg-[#E2E8F0] text-[#94A3B8] rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold cursor-not-allowed">
                      <MessageCircle size={15}/> WA Tagih
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
