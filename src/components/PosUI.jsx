import { ArrowLeft, Search, ChevronDown } from 'lucide-react';

// POS template primitives — pakai di semua page agar konsisten dengan POS.jsx
// ponytail: tambah variant prop kalau butuh density compact/dense

export function PosPageHeader({ title, subtitle, badge, onBack, icon:Icon }){
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="w-8 h-8 rounded-full border border-[#E2E8F0] bg-white grid place-items-center hover:bg-[#F8FAFC] text-[#334155] shrink-0">
          <ArrowLeft size={16}/>
        </button>
      ) : Icon ? (
        <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><Icon size={18} strokeWidth={2.2}/></div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">{title}</h1>
          {badge && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD] leading-none">{badge}</span>}
        </div>
        {subtitle && <p className="text-xs text-[#64748B] mt-1">{subtitle}</p>}
      </div>
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
export function PosSelect({ value, onChange, children }){
  return (
    <div className="relative">
      <select value={value} onChange={e=>onChange(e.target.value)} className="h-9 pl-3 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] outline-none focus:bg-white focus:border-[#2563EB] appearance-none">
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"/>
    </div>
  )
}
export const posInput = "w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#2563EB] placeholder:text-[#94A3B8] transition";
export const posBtnPrimary = "h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition whitespace-nowrap";
export const posBtnSecondary = "h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition";
export const posBtnSm = "h-9 px-4 bg-white border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#334155] hover:bg-[#F8FAFC]";
