import { useEffect, useState } from 'react';
import { ArrowLeft, Search, ChevronDown, Minus, Plus, Inbox, RefreshCw, FileSpreadsheet, FileText, FileCode2 } from 'lucide-react';

// Primitif UI bersama — diselaraskan dengan Stitch "UI Redesign and Polish":
// kartu putih tanpa border + shadow-card, radius 12, aksen biru #0051d5,
// judul Plus Jakarta Sans, label 11px uppercase, angka tabular.

// ------------------------------------------------------------- page header
export function PosPageHeader({ title, subtitle, badge, onBack, icon:Icon, actions }){
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onBack ? (
        <button onClick={onBack} aria-label="Kembali"
          className="w-10 h-10 rounded-lg bg-surface shadow-card grid place-items-center hover:bg-surface-2 text-ink shrink-0 transition-colors">
          <ArrowLeft size={18}/>
        </button>
      ) : Icon ? (
        <div className="w-12 h-12 rounded-xl bg-brand-tint text-white grid place-items-center shrink-0 shadow-sm">
          <Icon size={24} strokeWidth={2}/>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-display text-headline-lg font-bold tracking-tight text-ink leading-tight">{title}</h1>
          {badge && <span className="text-label-sm px-2.5 py-1 rounded-full bg-brand-soft text-[#00174b] leading-none">{badge}</span>}
        </div>
        {subtitle && <p className="text-body-sm text-ink-2 mt-1 max-w-[90ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">{actions}</div>}
    </div>
  )
}

// -------------------------------------------------------------------- card
export function PosCard({ children, className='' }){
  return <div className={"bg-surface rounded-xl shadow-card overflow-hidden "+className}>{children}</div>;
}
export function PosCardBody({ children, className='' }){
  return <div className={"p-4 "+className}>{children}</div>;
}

// ------------------------------------------------------------------ search
export function PosSearch({ value, onChange, onSearch, placeholder, rightExtra }){
  return (
    <div className="flex gap-2 min-w-0 flex-1">
      <div className="flex-1 relative min-w-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          value={value} onChange={e=>onChange(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&onSearch?.()}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-3 bg-surface-2 border border-transparent rounded-lg text-body-md text-ink placeholder:text-ink-3 outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 transition"
        />
      </div>
      <button onClick={onSearch} className="hidden sm:inline-flex h-10 px-4 bg-surface shadow-card rounded-lg text-label-md text-ink hover:bg-surface-2 active:scale-[.98] transition shrink-0">Cari</button>
      {rightExtra}
    </div>
  )
}

// -------------------------------------------------------------------- chip
export function PosChip({ active, children, onClick }){
  return (
    <button onClick={onClick}
      className={"h-8 px-3.5 rounded-full text-label-sm border whitespace-nowrap transition shrink-0 "+
        (active
          ? "bg-navy text-white border-navy shadow-sm"
          : "bg-surface-2 text-ink-2 border-transparent hover:bg-surface-3")}>
      {children}
    </button>
  )
}

// ------------------------------------------------------------------- table
export function PosTableWrap({ children }){
  return <div className="overflow-auto"><table className="w-full text-left border-collapse">{children}</table></div>;
}
export function PosTableHead({ children }){
  return <thead><tr className="bg-surface-2 text-ink-2 text-label-sm uppercase tracking-wider">{children}</tr></thead>;
}
export function PosSelect({ value, onChange, children, size='sm' }){    // size: 'sm' = h-8 (toolbar), 'md' = h-10 (form)
  return (
    <div className="relative">
      <select value={value} onChange={e=>onChange(e.target.value)}
        className={(size==='md'?'h-10':'h-8')+" w-full pl-3 pr-8 bg-surface-2 border border-transparent rounded-lg text-body-md font-medium text-ink outline-none focus:bg-surface focus:border-brand-tint/40 appearance-none transition"}>
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"/>
    </div>
  )
}

export const posTh = "px-4 py-3 whitespace-nowrap text-label-sm uppercase tracking-wider text-ink-2 font-semibold";
export const posTr = "border-b border-line hover:bg-surface-2/70 transition-colors";
export const posTd = "px-4 py-3 text-body-md text-ink";

export function PosTh({ children, align='left', className='' }){
  return <th className={posTh+' text-'+align+' '+className}>{children}</th>;
}

// ------------------------------------------------------- status / badge
const TONES = {
  emerald: 'bg-success-soft text-success border-success-line/60',
  amber:   'bg-warning-soft text-warning border-warning-line/60',
  red:     'bg-danger-soft text-danger border-danger-line/60',
  sky:     'bg-info-soft text-info border-info-line/60',
  slate:   'bg-surface-2 text-ink-2 border-line',
  teal:    'bg-success-soft text-success border-success-line/60',
  purple:  'bg-[#f3efff] text-[#5b3fd6] border-[#e8ddff]',
};
export function PosBadge({ tone='slate', children, title }){
  return <span title={title} className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-label-sm whitespace-nowrap "+(TONES[tone]||TONES.slate)}>{children}</span>
}

// --------------------------------------------------- state: kosong/loading
export function PosEmpty({ text='Belum ada data', colSpan, hint }){
  const inner = (
    <div className="py-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-surface-2 text-ink-3 grid place-items-center mx-auto"><Inbox size={22}/></div>
      <div className="mt-3 text-label-lg text-ink">{text}</div>
      <div className="text-body-sm text-ink-3 mt-1">{hint || 'Coba ubah filter atau muat ulang data.'}</div>
    </div>
  );
  if (colSpan) return <tr><td colSpan={colSpan}>{inner}</td></tr>;
  return inner;
}
export function PosSkeleton({ rows=5, cols=4 }){
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r)=>(
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((__, c)=> <div key={c} className="h-4 skeleton rounded"/>) }
        </div>
      ))}
    </div>
  );
}
export function PosError({ message, onRetry }){
  return (
    <div className="p-8 text-center">
      <div className="text-label-lg text-danger">Gagal memuat data</div>
      <div className="text-body-sm text-ink-2 mt-1">{message}</div>
      {onRetry && <button onClick={onRetry} className={posBtnSecondary+' h-9 px-4 text-label-md mt-4'}><RefreshCw size={14}/> Coba Lagi</button>}
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line bg-surface">
      <span className="text-label-sm text-ink-2 font-normal">
        Menampilkan <b className="text-ink num">{from}-{to}</b> dari <b className="text-ink num">{total}</b> {unit}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={p <= 1} onClick={()=>setPage(p - 1)}
          className="h-8 px-3 rounded-lg bg-surface-2 text-label-sm text-ink hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Sebelumnya
        </button>
        <span className="text-label-sm text-ink num px-1.5">{p}/{pages}</span>
        <button type="button" disabled={p >= pages} onClick={()=>setPage(p + 1)}
          className="h-8 px-3 rounded-lg bg-surface-2 text-label-sm text-ink hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Berikutnya
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------- kartu ringkasan (statistik)
export function PosStat({ label, value, sub, tone='bg-surface-2 text-ink-2', icon:Icon }){
  return (
    <div className="bg-surface rounded-lg shadow-card border border-line p-4 min-h-[104px] flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[.04em] text-ink-3 font-semibold">{label}</span>
        {Icon && <span className={"w-7 h-7 rounded grid place-items-center shrink-0 "+tone}><Icon size={18} strokeWidth={2}/></span>}
      </div>
      <div className="text-[22px] font-bold text-ink mt-2 num leading-none tracking-tight">{value}</div>
      {sub && <div className="text-body-sm text-ink-3 mt-1.5">{sub}</div>}
    </div>
  );
}

// --------------------------------------------------------- toolbar filter
export function PosToolbar({ children, actions }){
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">{actions}</div>}
    </div>
  );
}
export function PosChipRow({ label, children }){
  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line">
      {label && <span className="text-label-sm uppercase tracking-wider text-ink-2 font-semibold mr-1">{label}</span>}
      {children}
    </div>
  );
}
export const posSearchWrap = 'relative flex-1 min-w-[220px]';
export const posSelectWrap = 'w-full sm:w-[200px] shrink-0';

// ------------------------------------------------------------ tombol export
const EXPORT_META = {
  xlsx: { label:'Excel', Icon:FileSpreadsheet, cls:'bg-success-soft text-success hover:bg-success-line/40' },
  pdf:  { label:'PDF',   Icon:FileText,        cls:'bg-danger-soft text-danger hover:bg-danger-line/40' },
  csv:  { label:'CSV',   Icon:FileCode2,       cls:'bg-info-soft text-info hover:bg-info-line/40' },
};
export function PosExportButtons({ onExport, busyKey='', formats=['xlsx','pdf','csv'], prefix='', disabled=false, size='sm', className='' }){
  return (
    <div className={"flex flex-wrap items-center gap-1.5 "+className}>
      {formats.map(f=>{
        const m = EXPORT_META[f] || { label:f, Icon:FileCode2, cls:'bg-surface-2 text-ink-2 hover:bg-surface-3' };
        const Ico = m.Icon;
        const busy = busyKey === f;
        return (
          <button key={f} type="button" disabled={disabled || !!busyKey} onClick={()=>onExport(f)}
            title={`Unduh ${prefix ? prefix+' ' : ''}sebagai ${m.label}`}
            className={(size === 'sm' ? 'h-8 px-3 text-label-sm' : 'h-10 px-4 text-label-md') +
              ' inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed ' + m.cls}>
            {busy ? <RefreshCw size={13} className="animate-spin"/> : <Ico size={13}/>}
            {prefix ? <span>{prefix}</span> : null}<span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}


export const posInput = "w-full h-10 px-3 bg-surface-2 border border-transparent rounded-lg text-body-md text-ink outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 placeholder:text-ink-3 transition";
export const posBtnPrimary = "h-10 px-4 bg-brand text-white rounded-lg inline-flex items-center justify-center gap-1.5 text-label-md font-semibold shadow-sm hover:bg-brand-strong active:scale-[.98] transition whitespace-nowrap";
export const posBtnSecondary = "h-10 px-4 bg-surface text-ink rounded-lg shadow-card inline-flex items-center justify-center gap-1.5 text-label-md font-semibold hover:bg-surface-2 active:scale-[.98] transition whitespace-nowrap";
export const posBtnSm = "h-8 px-3 bg-surface-2 rounded-lg inline-flex items-center justify-center gap-1.5 text-label-sm font-semibold text-ink-2 hover:bg-surface-3 transition whitespace-nowrap";

// Stepper qty keranjang: tombol − / + dengan angka yang bisa diketik langsung.
// Draft lokal supaya field boleh kosong saat mengetik; clamp saat blur/Enter.
// onExceed(nilaiAsli) dipanggil SEBELUM nilai di-clamp ke `max`, jadi pemanggil bisa
// menampilkan peringatan (mis. stok kurang). Callback ini murni notifikasi: tidak
// mengubah draft/qty di sini, urutan tetap onExceed → onChange(nilaiTer-clamp).
export function PosQtyInput({ value, onChange, onExceed, min=1, max=9999, className='' }){
  const [draft,setDraft]=useState(String(value ?? min));
  useEffect(()=>{ setDraft(String(value ?? min)); },[value]);
  const toInt=(n)=>{ const v=Math.round(Number(n)); return Number.isFinite(v)?v:min; };
  const clamp=(n)=>{ const v=toInt(n); return Math.min(max, Math.max(min, v)); };
  const notifyOver=(n)=>{ if(n>max) onExceed?.(n); };
  const commit=()=>{
    const n=toInt(String(draft).replace(/[^0-9]/g,''));
    notifyOver(n);
    const v=clamp(n);
    setDraft(String(v));
    if(v!==Number(value)) onChange(v);
  };
  return (
    <div className={"inline-flex items-center gap-1 bg-surface-2 rounded-full p-1 "+className}>
      <button type="button" aria-label="Kurangi qty" onClick={()=>onChange(clamp(Number(value)-1))} className="w-6 h-6 rounded-full bg-surface grid place-items-center hover:bg-surface-3 text-ink-2 shrink-0"><Minus size={12}/></button>
      <input
        type="text" inputMode="numeric" aria-label="Qty" value={draft}
        onChange={e=>{
          const raw=e.target.value.replace(/[^0-9]/g,'');
          if(raw===''){ setDraft(''); return; }               // kosong = biarkan user mengetik ulang
          const n=toInt(raw);
          notifyOver(n);                                      // peringatan dulu...
          const v=clamp(n);                                   // ...lalu qty dipaksa ke stok
          setDraft(String(v));                                // input langsung ikut nilai stok, bukan angka ketikan
          onChange(v);
        }}
        onFocus={e=>e.target.select()}
        onBlur={commit}
        onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } }}
        className="w-9 text-center text-label-md bg-transparent outline-none num text-ink"
      />
      <button type="button" aria-label="Tambah qty" onClick={()=>{ const n=toInt(Number(value)+1); notifyOver(n); onChange(clamp(n)); }} className="w-6 h-6 rounded-full bg-surface shadow-sm grid place-items-center hover:bg-surface-3 text-ink-2 shrink-0"><Plus size={12}/></button>
    </div>
  )
}
