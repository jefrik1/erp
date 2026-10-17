import { useEffect, useState } from 'react';
import { ArrowLeft, Search, ChevronDown, Minus, Plus, Inbox, RefreshCw, FileSpreadsheet, FileText, FileCode2 } from 'lucide-react';

// POS template primitives - pakai di semua page agar konsisten dengan POS.jsx
// ponytail: tambah variant prop kalau butuh density compact/dense

export function PosPageHeader({ title, subtitle, badge, onBack, icon:Icon, actions }){
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="w-8 h-8 rounded-full border border-[#E2E8F0] bg-white grid place-items-center hover:bg-[#F8FAFC] text-[#334155] shrink-0">
          <ArrowLeft size={16}/>
        </button>
      ) : Icon ? (
        <div className="w-9 h-9 rounded-xl bg-[#1E40AF] text-white grid place-items-center shrink-0 shadow-sm"><Icon size={18} strokeWidth={2.2}/></div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">{title}</h1>
          {badge && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD] leading-none">{badge}</span>}
        </div>
        {subtitle && <p className="text-xs text-[#64748B] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">{actions}</div>}
    </div>
  )
}

export function PosCard({ children, className='' }){
  return <div className={"bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden "+className}>{children}</div>
}
export function PosCardBody({ children, className='' }){
  return <div className={"p-3 sm:p-4 "+className}>{children}</div>
}

export function PosSearch({ value, onChange, onSearch, placeholder, rightExtra }){
  return (
    <div className="flex gap-2 min-w-0 flex-1">
      <div className="flex-1 relative min-w-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
        <input
          value={value} onChange={e=>onChange(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&onSearch?.()}
          placeholder={placeholder}
          className="w-full h-[42px] pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"
        />
      </div>
      <button onClick={onSearch} className="hidden sm:inline-flex h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition shrink-0">Cari</button>
      {rightExtra}
    </div>
  )
}

export function PosChip({ active, children, onClick }){
  return <button onClick={onClick} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap transition shrink-0 "+(active?"bg-[#1E40AF] text-white border-[#1E40AF] shadow":"bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]")}>{children}</button>
}

export function PosTableWrap({ children }){
  return <div className="overflow-auto"><table className="w-full text-sm">{children}</table></div>
}
export function PosTableHead({ children }){
  return <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">{children}</tr></thead>
}
export function PosSelect({ value, onChange, children, size='sm' }){    // size: 'sm' = h-9 (toolbar), 'md' = h-[42px] (form)
  return (
    <div className="relative">
      <select value={value} onChange={e=>onChange(e.target.value)} className={(size==='md'?'h-[42px]':'h-9')+" w-full pl-3 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] outline-none focus:bg-white focus:border-[#1E40AF] appearance-none"}>
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"/>
    </div>
  )
}

// ---------------------------------------------------------------- tabel
export const posTh = "px-4 py-3 whitespace-nowrap text-[11px] font-bold tracking-widest text-[#64748B]";
export const posTr = "border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white";
export const posTd = "px-4 py-3.5 text-sm";

export function PosTh({ children, align='left', className='' }){
  return <th className={posTh+' text-'+align+' '+className}>{children}</th>;
}

// ------------------------------------------------------- status / badge
const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  sky:     'bg-sky-50 text-sky-700 border-sky-200',
  slate:   'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
  teal:    'bg-teal-50 text-teal-700 border-teal-200',
};
export function PosBadge({ tone='slate', children, title }){
  return <span title={title} className={"inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap "+(TONES[tone]||TONES.slate)}>{children}</span>
}

// --------------------------------------------------- state: kosong/loading
export function PosEmpty({ text='Belum ada data', colSpan }){
  const inner = (
    <div className="py-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#F1F5F9] text-[#94A3B8] grid place-items-center mx-auto"><Inbox size={20}/></div>
      <div className="mt-3 text-sm font-bold text-[#0F172A]">{text}</div>
      <div className="text-xs text-[#94A3B8] mt-1">Coba ubah filter atau muat ulang data.</div>
    </div>
  );
  if (colSpan) return <tr><td colSpan={colSpan}>{inner}</td></tr>;
  return inner;
}
export function PosSkeleton({ rows=5, cols=4 }){
  return (
    <div className="p-4 space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, r)=>(
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((__, c)=> <div key={c} className="h-4 bg-[#F1F5F9] rounded"/>)}
        </div>
      ))}
    </div>
  );
}
export function PosError({ message, onRetry }){
  return (
    <div className="p-6 text-center">
      <div className="text-sm font-bold text-red-600">Gagal memuat data</div>
      <div className="text-xs text-[#64748B] mt-1">{message}</div>
      {onRetry && <button onClick={onRetry} className={posBtnSecondary+' h-9 px-4 text-xs mt-3'}><RefreshCw size={13}/> Coba Lagi</button>}
    </div>
  );
}

// ------------------------------------------------------------------ pager
export function PosPager({ page, setPage, total, size=10, unit='baris' }){
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (p - 1) * size + 1;
  const to = Math.min(total, p * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-[#F1F5F9] bg-[#FCFDFE]">
      <span className="text-[11px] text-[#64748B]">
        Menampilkan <b className="text-[#0F172A] tabular-nums">{from}-{to}</b> dari <b className="text-[#0F172A] tabular-nums">{total}</b> {unit}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={p <= 1} onClick={()=>setPage(p - 1)}
          className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">
          Sebelumnya
        </button>
        <span className="text-[11px] font-bold text-[#0F172A] tabular-nums px-1">{p}/{pages}</span>
        <button type="button" disabled={p >= pages} onClick={()=>setPage(p + 1)}
          className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">
          Berikutnya
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------- kartu ringkasan (statistik)
export function PosStat({ label, value, sub, tone='bg-[#F1F5F9] text-[#475569]', icon:Icon }){
  return (
    <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
      <div className="flex items-center gap-2">
        {Icon && <span className={"w-7 h-7 rounded-lg grid place-items-center "+tone}><Icon size={14} strokeWidth={2.4}/></span>}
        <span className="text-[11px] font-bold tracking-widest text-[#64748B]">{label}</span>
      </div>
      <div className="text-[18px] font-black text-[#0F172A] mt-2 tabular-nums leading-none">{value}</div>
      {sub && <div className="text-[11px] text-[#94A3B8] mt-1">{sub}</div>}
    </div>
  );
}

// --------------------------------------------------------- toolbar filter
// Baris 1: pencarian + dropdown di kiri, tombol aksi selalu rata kanan (tidak ikut wrap aneh).
// Baris 2: chip filter dengan garis pemisah, punya label sendiri.
export function PosToolbar({ children, actions }){
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">{actions}</div>}
    </div>
  );
}
export function PosChipRow({ label, children }){
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[#F1F5F9]">
      {label && <span className="text-[11px] font-bold tracking-widest text-[#64748B] mr-1">{label}</span>}
      {children}
    </div>
  );
}
export const posSearchWrap = 'relative flex-1 min-w-[220px]';
export const posSelectWrap = 'w-full sm:w-[200px] shrink-0';

// ------------------------------------------------------------ tombol export
// Satu komponen untuk semua tombol export di aplikasi: warna per format
// (Excel hijau, PDF merah, CSV biru) + spinner saat mengunduh.
const EXPORT_META = {
  xlsx: { label:'Excel', Icon:FileSpreadsheet, cls:'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
  pdf:  { label:'PDF',   Icon:FileText,        cls:'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
  csv:  { label:'CSV',   Icon:FileCode2,       cls:'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100' },
};
export function PosExportButtons({ onExport, busyKey='', formats=['xlsx','pdf','csv'], prefix='', disabled=false, size='sm', className='' }){
  return (
    <div className={"flex flex-wrap items-center gap-1.5 "+className}>
      {formats.map(f=>{
        const m = EXPORT_META[f] || { label:f, Icon:FileCode2, cls:'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]' };
        const Ico = m.Icon;
        const busy = busyKey === f;
        return (
          <button key={f} type="button" disabled={disabled || !!busyKey} onClick={()=>onExport(f)}
            title={`Unduh ${prefix ? prefix+' ' : ''}sebagai ${m.label}`}
            className={(size === 'sm' ? 'h-9 px-3 text-xs' : 'h-[42px] px-4 text-sm') +
              ' inline-flex items-center justify-center gap-1.5 rounded-xl border font-bold whitespace-nowrap transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ' + m.cls}>
            {busy ? <RefreshCw size={13} className="animate-spin"/> : <Ico size={13}/>}
            {prefix ? <span>{prefix}</span> : null}<span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}


export const posInput = "w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] placeholder:text-[#94A3B8] transition";
export const posBtnPrimary = "h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition whitespace-nowrap";
export const posBtnSecondary = "h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition";
export const posBtnSm = "h-9 px-4 bg-white border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#334155] hover:bg-[#F8FAFC]";

// Stepper qty keranjang: tombol − / + dengan angka yang bisa diketik langsung.
// Draft lokal supaya field boleh kosong saat mengetik; clamp saat blur/Enter.
export function PosQtyInput({ value, onChange, min=1, max=9999, className='' }){
  const [draft,setDraft]=useState(String(value ?? min));
  useEffect(()=>{ setDraft(String(value ?? min)); },[value]);
  const clamp=(n)=>{ const v=Math.round(Number(n)); if(!Number.isFinite(v)) return min; return Math.min(max, Math.max(min, v)); };
  const commit=()=>{ const v=clamp(String(draft).replace(/[^0-9]/g,'')); setDraft(String(v)); if(v!==Number(value)) onChange(v); };
  return (
    <div className={"inline-flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-full p-1 "+className}>
      <button type="button" aria-label="Kurangi qty" onClick={()=>onChange(clamp(Number(value)-1))} className="w-6 h-6 rounded-full bg-[#F1F5F9] grid place-items-center hover:bg-[#E2E8F0] shrink-0"><Minus size={12}/></button>
      <input
        type="text" inputMode="numeric" aria-label="Qty" value={draft}
        onChange={e=>{ const raw=e.target.value.replace(/[^0-9]/g,''); setDraft(raw); if(raw!=='') onChange(clamp(raw)); }}
        onFocus={e=>e.target.select()}
        onBlur={commit}
        onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } }}
        className="w-9 text-center text-xs font-bold bg-transparent outline-none tabular-nums text-[#0F172A]"
      />
      <button type="button" aria-label="Tambah qty" onClick={()=>onChange(clamp(Number(value)+1))} className="w-6 h-6 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-[#F8FAFC] shrink-0"><Plus size={12}/></button>
    </div>
  )
}
