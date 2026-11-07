import { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Search, ChevronDown, Minus, Plus, Inbox, RefreshCw, FileSpreadsheet, FileText, FileCode2 } from 'lucide-react';

// Primitif UI bersama — Linear / Stripe / Stitch Enterprise Design:
// Kartu berdaya haptik, spring entrance, micro-interactions, Plus Jakarta Sans display,
// tabular nums, dan visual feedback interaktif.

// ------------------------------------------------------------- Animated Number Helper
function AnimatedNumber({ value }){
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(null);

  useEffect(() => {
    if (value == null) { setDisplay(''); return; }
    const str = String(value);
    const numPart = str.replace(/[^0-9]/g, '');
    if (!numPart || numPart.length > 15) { setDisplay(value); return; }

    const isRupiah = str.startsWith('Rp');
    const target = parseFloat(numPart);
    if (isNaN(target)) { setDisplay(value); return; }

    const start = prevRef.current != null ? prevRef.current : 0;
    prevRef.current = target;
    const startTime = performance.now();
    const duration = 650;

    let animId;
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * ease);

      if (isRupiah) {
        setDisplay('Rp ' + new Intl.NumberFormat('id-ID').format(current));
      } else {
        setDisplay(str.replace(/[\d,.]+/, new Intl.NumberFormat('id-ID').format(current)));
      }

      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [value]);

  return <span>{display}</span>;
}

// ------------------------------------------------------------- page header
export function PosPageHeader({ title, subtitle, badge, onBack, icon:Icon, actions }){
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="flex flex-wrap items-center gap-3"
    >
      {onBack ? (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onBack} aria-label="Kembali"
          className="w-10 h-10 rounded-xl bg-surface border border-line shadow-card grid place-items-center hover:bg-surface-2 text-ink shrink-0 transition-colors"
        >
          <ArrowLeft size={18}/>
        </motion.button>
      ) : Icon ? (
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand to-brand-tint text-white grid place-items-center shrink-0 shadow-md shadow-brand/10">
          <Icon size={24} strokeWidth={2}/>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="font-display text-headline-lg font-bold tracking-tight text-ink leading-tight">{title}</h1>
          {badge && (
            <span className="text-label-sm px-2.5 py-1 rounded-full bg-brand-soft text-brand-strong border border-brand/20 font-semibold leading-none shadow-sm">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-body-sm text-ink-2 mt-1 max-w-[90ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">{actions}</div>}
    </motion.div>
  );
}

// -------------------------------------------------------------------- card
export function PosCard({ children, className='' }){
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={"bg-surface rounded-xl shadow-card border border-line/80 hover:shadow-raised hover:border-brand/20 transition-all duration-200 overflow-hidden "+className}
    >
      {children}
    </motion.div>
  );
}
export function PosCardBody({ children, className='' }){
  return <div className={"p-4 sm:p-5 "+className}>{children}</div>;
}

// ------------------------------------------------------------------ search
export function PosSearch({ value, onChange, onSearch, placeholder, rightExtra }){
  return (
    <div className="flex gap-2 min-w-0 flex-1">
      <div className="flex-1 relative min-w-0">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
        <input
          value={value} onChange={e=>onChange(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&onSearch?.()}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-3 bg-surface-2 border border-transparent rounded-xl text-body-md text-ink placeholder:text-ink-3 outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 transition-all"
        />
      </div>
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={onSearch}
        className="hidden sm:inline-flex items-center h-10 px-4 bg-surface border border-line shadow-card rounded-xl text-label-md font-semibold text-ink hover:bg-surface-2 transition shrink-0"
      >
        Cari
      </motion.button>
      {rightExtra}
    </div>
  );
}

// -------------------------------------------------------------------- chip
export function PosChip({ active, children, onClick }){
  return (
    <button
      onClick={onClick}
      className={"relative h-8 px-3.5 rounded-full text-label-sm border whitespace-nowrap transition-colors shrink-0 outline-none "+
        (active
          ? "text-white border-transparent font-semibold"
          : "bg-surface-2 text-ink-2 border-transparent hover:bg-surface-3 hover:text-ink")}
    >
      {active && (
        <motion.span
          layoutId="pos-chip-active-pill"
          className="absolute inset-0 bg-navy dark:bg-brand-tint rounded-full shadow-sm -z-0"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

// ------------------------------------------------------------------- table
export function PosTableWrap({ children }){
  return (
    <div className="overflow-auto border border-line rounded-xl bg-surface">
      <table className="w-full text-left border-collapse">{children}</table>
    </div>
  );
}
export function PosTableHead({ children }){
  return (
    <thead>
      <tr className="sticky top-0 z-10 backdrop-blur-md bg-surface-2/90 text-ink-2 text-label-sm uppercase tracking-wider border-b border-line shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        {children}
      </tr>
    </thead>
  );
}
export function PosSelect({ value, onChange, children, size='sm' }){
  return (
    <div className="relative">
      <select
        value={value} onChange={e=>onChange(e.target.value)}
        className={(size==='md'?'h-10':'h-8')+" w-full pl-3 pr-8 bg-surface-2 border border-transparent rounded-lg text-body-md font-medium text-ink outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 appearance-none transition-all"}
      >
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"/>
    </div>
  );
}

export const posTh = "px-4 py-3 whitespace-nowrap text-label-sm uppercase tracking-wider text-ink-2 font-semibold";
export const posTr = "border-b border-line/80 hover:bg-brand-soft/40 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] hover:before:bg-brand transition-colors duration-150";
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
  const strChildren = typeof children === 'string' ? children : '';
  const isPulse = /red|danger|amber|warning/i.test(tone) ||
    /kritis|danger|overdue|warning|in_transit|pending|loading|waspada|proses|picking/i.test(strChildren);

  return (
    <span
      title={title}
      className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-label-sm font-semibold whitespace-nowrap shadow-sm "+(TONES[tone]||TONES.slate)}
    >
      {isPulse ? (
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"/>
      )}
      {children}
    </span>
  );
}

// --------------------------------------------------- state: kosong/loading
export function PosEmpty({ text='Belum ada data', colSpan, hint }){
  const inner = (
    <div className="py-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 text-ink-3 grid place-items-center mx-auto shadow-inner"><Inbox size={22}/></div>
      <div className="mt-3 text-label-lg font-semibold text-ink">{text}</div>
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
          {Array.from({ length: cols }).map((__, c)=> <div key={c} className="h-4 skeleton rounded-lg"/>) }
        </div>
      ))}
    </div>
  );
}
export function PosError({ message, onRetry }){
  return (
    <div className="p-8 text-center">
      <div className="text-label-lg font-bold text-danger">Gagal memuat data</div>
      <div className="text-body-sm text-ink-2 mt-1">{message}</div>
      {onRetry && (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onRetry}
          className={posBtnSecondary+' h-9 px-4 text-label-md mt-4'}
        >
          <RefreshCw size={14}/> Coba Lagi
        </motion.button>
      )}
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
        Menampilkan <b className="text-ink num font-semibold">{from}-{to}</b> dari <b className="text-ink num font-semibold">{total}</b> {unit}
      </span>
      <div className="flex items-center gap-1.5">
        <motion.button
          whileTap={{ scale: 0.94 }}
          type="button" disabled={p <= 1} onClick={()=>setPage(p - 1)}
          className="h-8 px-3 rounded-lg bg-surface-2 text-label-sm font-semibold text-ink hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Sebelumnya
        </motion.button>
        <span className="text-label-sm text-ink num font-semibold px-2">{p}/{pages}</span>
        <motion.button
          whileTap={{ scale: 0.94 }}
          type="button" disabled={p >= pages} onClick={()=>setPage(p + 1)}
          className="h-8 px-3 rounded-lg bg-surface-2 text-label-sm font-semibold text-ink hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Berikutnya
        </motion.button>
      </div>
    </div>
  );
}

// ---------------------------------------------- kartu ringkasan (statistik)
export function PosStat({ label, value, sub, tone='bg-surface-2 text-ink-2', icon:Icon }){
  return (
    <div className="group relative bg-surface rounded-xl shadow-card border border-line/80 hover:shadow-raised hover:border-brand/30 transition-all duration-200 p-4 min-h-[104px] flex flex-col justify-between overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-lg before:bg-gradient-to-r before:from-brand-tint before:to-sky-400">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[.06em] text-ink-3 font-semibold">{label}</span>
        {Icon && (
          <span className={"w-7 h-7 rounded-lg grid place-items-center shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-110 "+tone}>
            <Icon size={16} strokeWidth={2}/>
          </span>
        )}
      </div>
      <div className="text-[22px] font-bold text-ink mt-2 num leading-none tracking-tight">
        <AnimatedNumber value={value} />
      </div>
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
          <motion.button
            whileTap={{ scale: 0.94 }}
            key={f} type="button" disabled={disabled || !!busyKey} onClick={()=>onExport(f)}
            title={`Unduh ${prefix ? prefix+' ' : ''}sebagai ${m.label}`}
            className={(size === 'sm' ? 'h-8 px-3 text-label-sm' : 'h-10 px-4 text-label-md') +
              ' inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed ' + m.cls}
          >
            {busy ? <RefreshCw size={13} className="animate-spin"/> : <Ico size={13}/>}
            {prefix ? <span>{prefix}</span> : null}<span>{m.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export const posInput = "w-full h-10 px-3 bg-surface-2 border border-transparent rounded-lg text-body-md text-ink outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 placeholder:text-ink-3 transition-all";
export const posBtnPrimary = "h-10 px-4 bg-brand text-white rounded-lg inline-flex items-center justify-center gap-1.5 text-label-md font-semibold shadow-sm hover:bg-brand-strong active:scale-[.96] transition-all whitespace-nowrap";
export const posBtnSecondary = "h-10 px-4 bg-surface text-ink rounded-lg shadow-card border border-line inline-flex items-center justify-center gap-1.5 text-label-md font-semibold hover:bg-surface-2 active:scale-[.96] transition-all whitespace-nowrap";
export const posBtnSm = "h-8 px-3 bg-surface-2 rounded-lg inline-flex items-center justify-center gap-1.5 text-label-sm font-semibold text-ink-2 hover:bg-surface-3 active:scale-[.96] transition-all whitespace-nowrap";

// Stepper qty keranjang: tombol − / + dengan getaran kinetik jika melebihi batas stok.
export function PosQtyInput({ value, onChange, onExceed, min=1, max=9999, className='' }){
  const [draft,setDraft]=useState(String(value ?? min));
  const [isOver, setIsOver]=useState(false);

  useEffect(()=>{ setDraft(String(value ?? min)); },[value]);
  const toInt=(n)=>{ const v=Math.round(Number(n)); return Number.isFinite(v)?v:min; };
  const clamp=(n)=>{ const v=toInt(n); return Math.min(max, Math.max(min, v)); };
  const notifyOver=(n)=>{
    if(n>max) {
      setIsOver(true);
      setTimeout(()=>setIsOver(false), 500);
      onExceed?.(n);
    }
  };
  const commit=()=>{
    const n=toInt(String(draft).replace(/[^0-9]/g,''));
    notifyOver(n);
    const v=clamp(n);
    setDraft(String(v));
    if(v!==Number(value)) onChange(v);
  };
  return (
    <motion.div
      animate={isOver ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      className={"inline-flex items-center gap-1 bg-surface-2 rounded-full p-1 border transition-colors " +
        (isOver ? "border-amber-500 bg-amber-500/10" : "border-transparent") + " " + className}
    >
      <motion.button
        whileTap={{ scale: 0.94 }}
        type="button" aria-label="Kurangi qty" onClick={()=>onChange(clamp(Number(value)-1))}
        className="w-6 h-6 rounded-full bg-surface grid place-items-center hover:bg-surface-3 text-ink-2 shrink-0 shadow-sm"
      >
        <Minus size={12}/>
      </motion.button>
      <input
        type="text" inputMode="numeric" aria-label="Qty" value={draft}
        onChange={e=>{
          const raw=e.target.value.replace(/[^0-9]/g,'');
          if(raw===''){ setDraft(''); return; }
          const n=toInt(raw);
          notifyOver(n);
          const v=clamp(n);
          setDraft(String(v));
          onChange(v);
        }}
        onFocus={e=>e.target.select()}
        onBlur={commit}
        onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } }}
        className="w-9 text-center text-label-md bg-transparent outline-none num text-ink font-semibold"
      />
      <motion.button
        whileTap={{ scale: 0.94 }}
        type="button" aria-label="Tambah qty"
        onClick={()=>{ const n=toInt(Number(value)+1); notifyOver(n); onChange(clamp(n)); }}
        className="w-6 h-6 rounded-full bg-surface shadow-sm grid place-items-center hover:bg-surface-3 text-ink-2 shrink-0"
      >
        <Plus size={12}/>
      </motion.button>
    </motion.div>
  );
}
