import { LOCATION } from '../config/location';
import { useEffect, useState, useMemo } from 'react';
import { Search, MoreVertical, ChevronDown, FileText, Plus, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { PosPageHeader, PosSkeleton, PosEmpty, PosError } from '../components/PosUI';

function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }

const LIMIT=20;
const STATUSES = [
  { id:'', label:'SEMUA' },
  { id:'DRAFT', label:'DRAFT' },
  { id:'PENDING', label:'PENDING' },
  { id:'APPROVED', label:'APPROVED' },
  { id:'PICKING', label:'PICKING' },
  { id:'SHIPPED', label:'SHIPPED' },
  { id:'PARTIAL', label:'PARTIAL*' },
  { id:'COMPLETED', label:'COMPLETED' },
  { id:'CANCELLED', label:'CANCELLED' },
];

const WF = [
  { n:1, label:'Quotation', to:'/approvals', active:true },
  { n:2, label:'SO', to:'/sales/orders' },
  { n:3, label:'Approval', to:'/approvals' },
  { n:4, label:'Picking', to:'/sales/orders?status=PICKING' },
  { n:5, label:'DO', to:'/logistics' },
  { n:6, label:'Invoice', to:'/sales/invoices' },
];

function StatusBadge({s}){
  const map={
    DRAFT:'bg-surface-3 text-ink-2 border-line',
    PENDING:'bg-amber-100 text-amber-800 border-amber-200',
    APPROVED:'bg-blue-100 text-blue-800 border-blue-200',
    PICKING:'bg-purple-100 text-purple-800 border-purple-200',
    SHIPPED:'bg-sky-100 text-sky-800 border-sky-200',
    PARTIAL:'bg-orange-100 text-orange-800 border-orange-200',
    COMPLETED:'bg-success-soft text-[#166534] border-[#a8ebc4]',
    CANCELLED:'bg-zinc-100 text-zinc-600 border-zinc-200',
  };
  return <span className={"inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border tracking-wide "+(map[s]||'bg-gray-100 text-gray-600 border-gray-200')}>{s}</span>
}

export default function SalesOrders(){
  const nav = useNavigate();
  const [data,setData]=useState([]);
  const [filter,setFilter]=useState('');
  const [source,setSource]=useState('');
  const [q,setQ]=useState('');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');

  useEffect(()=>{
    const sp=new URLSearchParams(location.search);
    const qs=sp.get('status'); if(qs) setFilter(qs);
    const src=sp.get('source'); if(src) setSource(src);
  },[]);

  const load=async()=>{
    setLoading(true); setErr('');
    try{
      const r=await api.get('/sales/orders',{params:{status:filter||undefined, source:source||undefined, search:search||undefined, limit:LIMIT, page}});
      setData(r.data.data||[]); setTotal(r.data.total||0);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat Sales Order'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[filter,source,search,page]);
  useEffect(()=>{ setPage(1); },[filter,source,search]);

  const pages=Math.max(1, Math.ceil(total/LIMIT));

  const counts = useMemo(()=>{
    const m={}; for(const o of data) m[o.status]=(m[o.status]||0)+1; return m;
  },[data]);

  return (
    <div className="space-y-3">
      {/* Header - judul + workflow - mirip screenshot */}
      <PosPageHeader icon={FileText} title="Sales Order" subtitle={`${total} order • Halaman ${page}/${pages} • ${source==='pos'?'POS saja':'Semua sumber'}`}/>

      {/* Stepper 1..6 - pill + chevron */}
      <div className="flex items-center gap-1.5 overflow-auto pb-1 -mx-1 px-1 scrollbar-thin">
        <div className="flex items-center gap-1 bg-white rounded-full border border-line p-1 shadow-card shrink-0">
          {WF.map((w,i)=>(
            <span key={w.label} className="flex items-center gap-1">
              <button onClick={()=>nav(w.to)} className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap "+(w.active?"bg-brand text-white border-brand shadow-card":"bg-surface-2 text-ink-2 border-line hover:bg-white hover:border-[#cbdbf5]")}>
                <span className={"w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold leading-none shrink-0 "+(w.active?"bg-white text-brand":"bg-white text-ink-2 border border-line")}>{w.n}</span>
                {w.label}
                <ChevronDown size={12} className={"opacity-60 "+(w.active?"text-white/80":"text-ink-2")} />
              </button>
              {i < WF.length-1 && <span className="text-ink-3 px-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 18 6-6-6-6"/></svg></span>}
            </span>
          ))}
        </div>
      </div>

      {/* Card utama - search + filter + tabel */}
      <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden">
        <div className="p-3 sm:p-4 space-y-3">
          {/* search row */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="flex-1 flex gap-2 min-w-0">
              <div className="flex-1 relative min-w-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <input
                  value={q}
                  onChange={e=>setQ(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&(setSearch(q),setPage(1))}
                  placeholder="Cari SO number / pelanggan / kode..."
                  className="w-full h-[42px] pl-9 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"
                />
              </div>
              <button onClick={()=>{setSearch(q); setPage(1);}} className="hidden sm:inline-flex h-[42px] px-5 bg-white border border-line rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2 active:scale-[0.98] transition shrink-0">Cari</button>
              {search && <button onClick={()=>{setQ(''); setSearch('');}} aria-label="Bersihkan pencarian" className="h-[42px] w-[42px] grid place-items-center bg-white border border-line rounded-xl text-ink-2 hover:bg-surface-2 shrink-0"><X size={16}/></button>}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button onClick={()=>setSource('')} className={"h-[42px] px-5 rounded-xl text-xs font-bold border transition whitespace-nowrap "+(source===''?"bg-brand text-white border-brand shadow":"bg-white text-ink-2 border-line hover:bg-surface-2")}>SEMUA</button>
              <button onClick={()=>setSource(source==='pos'?'':'pos')} className={"h-[42px] px-5 rounded-xl text-xs font-bold border transition whitespace-nowrap "+(source==='pos'?"bg-brand text-white border-brand shadow":"bg-white text-ink-2 border-line hover:bg-surface-2")}>POS saja</button>
              <Link to="/sales/orders/new" className="h-[42px] px-5 bg-brand text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-card hover:bg-brand-strong active:scale-[0.98] transition whitespace-nowrap">
                <Plus size={15}/> Buat SO
              </Link>
            </div>
          </div>

          {/* status pills */}
          <div className="flex gap-2 overflow-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {STATUSES.map(s=>{
              const active=filter===s.id;
              const cnt = s.id==='' ? total : (counts[s.id]||0);
              return (
                <button key={s.id||'all'} onClick={()=>setFilter(s.id)}
                  className={"inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition shrink-0 "+(active?"bg-brand text-white border-brand shadow":"bg-white text-ink-2 border-line hover:bg-surface-2")}>
                  {s.label}
                  <span className={"min-w-[22px] h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-bold leading-none "+(active?"bg-white text-brand":"bg-surface-3 text-ink-2")}>{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* tabel */}
        <div className="border-t border-line overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-3 border-b border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <th className="text-left px-4 py-3 whitespace-nowrap">NO NUMBER</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">PELANGGAN</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">TANGGAL</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="p-0"><PosSkeleton rows={5} cols={4}/></td></tr>}
                {err && !loading && <tr><td colSpan={6} className="p-0"><PosError message={err} onRetry={load}/></td></tr>}
                {!loading && !err && data.length===0 && <tr><td colSpan={6} className="p-0"><PosEmpty text={"Tidak ada data "+(source==='pos'?'POS ':'')+(search?`untuk "${search}" `:'')+(filter?`status ${filter}`:'')}/></td></tr>}
                {!loading && data.map((o,idx)=>(
                  <tr key={o.id} className={"border-b border-line hover:bg-surface-2 transition "+(idx%2===1?"bg-surface-2/70":"bg-white")}>
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[13px] font-bold text-ink tracking-tight">{o.so_number}</span>
                        {o.is_pos && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-warning-soft text-[#7a4f01] border border-[#ffd8a8] leading-none">POS</span>}
                      </div>
                      <div className="text-[11px] text-ink-3 leading-none mt-1">{LOCATION.name}</div>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <div className="font-semibold text-[13px] text-ink leading-none">{o.customer_name}</div>
                      <div className="text-[11px] text-ink-2 font-mono mt-1">{o.customer_code}</div>
                    </td>
                    <td className="px-4 py-3.5 align-middle text-[13px] text-ink-2 whitespace-nowrap">{o.so_date?.slice(0,10)}</td>
                    <td className="px-4 py-3.5 align-middle text-right font-bold text-[13px] text-ink whitespace-nowrap">{rupiah(o.total)}</td>
                    <td className="px-4 py-3.5 align-middle"><StatusBadge s={o.status} /></td>
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={"/sales/orders/detail/"+o.id} className="text-brand hover:text-brand text-xs font-bold hover:underline underline-offset-4 px-2 py-1">Lihat</Link>
                        <Link to={"/sales/orders/detail/"+o.id} aria-label="Detail" className="w-7 h-7 grid place-items-center rounded-full hover:bg-surface-3 text-ink-3 hover:text-ink-2 transition"><MoreVertical size={14} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-surface-2 border-t border-line text-xs">
            <div className="text-ink-2">{data.length?`Menampilkan ${(page-1)*LIMIT+1}-${(page-1)*LIMIT+data.length} dari ${total}`:`0 dari ${total}`} {source==='pos'?'• POS':''}</div>
            <div className="flex items-center gap-1">
              <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="h-8 px-3 bg-white border border-line rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-surface-2">‹ Prev</button>
              <span className="h-8 px-3 grid place-items-center text-xs font-bold text-ink-2">{page} / {pages}</span>
              <button disabled={page>=pages} onClick={()=>setPage(p=>p+1)} className="h-8 px-3 bg-white border border-line rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-surface-2">Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
