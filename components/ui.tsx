// PART: FILE components/ui.tsx — Primitives: Card, TableShell/Toolbar, Badge, Button, KpiCard — lihat DOKUMENTASI.md §5.2
"use client"
import { cn } from "@/lib/utils"

// PART: Card — bg-white rounded-[16px] shadow-sm
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
 return <div className={cn("bg-white border-[#E2E8F0] rounded-[16px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden min-w-0", className)}>{children}</div>
}
// PART: TableShell — container tabel tanpa slider horizontal (overflow-hidden)
export function TableShell({ toolbar, children, foot }: { toolbar?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
 return <div className="overflow-hidden rounded-[16px] border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0 w-full max-w-full">{toolbar}<div className="overflow-hidden max-w-full">{children}</div>{foot}</div>
}
// PART: TableToolbar — header tabel bg-[#F8FAFC] + icon bubble + title/subtitle
export function TableToolbar({ icon, title, subtitle, meta, actions }: { icon?: React.ReactNode; title: string; subtitle?: string; meta?: React.ReactNode; actions?: React.ReactNode }) {
 return <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] min-w-0">{icon || subtitle || meta || actions ? <div className="flex items-center gap-3 min-w-0 flex-1"><span className="size-9 rounded-[12px] bg-white border-[#E2E8F0] grid place-items-center text-[#334155] shrink-0 shadow-sm">{icon}</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold tracking-tight text-[#0F172A] leading-none truncate">{title}</div>{subtitle && <div className="text-xs text-[#475569] mt-1 line-clamp-1">{subtitle}</div>}</div>{meta && <span className="hidden sm:inline-flex ml-2 shrink-0">{meta}</span>}</div> : <div className="text-sm font-semibold text-[#0F172A] truncate">{title}</div>}<div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div></div>
}

// PART: Badge — tone emerald/amber/red/zinc/blue
export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "emerald" | "amber" | "red" | "zinc" | "blue" }) {
 const m = {
  emerald: "bg-[#DCFCE7] text-[#166534] border-transparent",
  amber: "bg-[#FEF3C7] text-[#92400E] border-transparent",
  red: "bg-[#FEE2E2] text-[#991B1B] border-transparent",
  zinc: "bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]",
  blue: "bg-[#DBEAFE] text-[#1E40AF] border-transparent",
 } as const
 return <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium tracking-wide uppercase border", m[tone])}>{children}</span>
}

// PART: Button — variant primary/ghost/outline
export function Button({ children, variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
 const v = {
  primary: "bg-[#334155] text-white hover:bg-[#475569] border-[#334155]",
  ghost: "bg-transparent hover:bg-[#F1F5F9] text-[#475569] border-transparent",
  outline: "bg-white hover:bg-[#F1F5F9] text-[#334155] border-[#E2E8F0]",
 } as const
 return (
  <button {...p} className={cn("inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[6px] text-sm font-medium border transition-all duration-200 active:scale-[0.98]", v[variant], className)}>
   {children}
  </button>
 )
}

export function IslandButton({ children, icon, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
 return (
  <button {...p} className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-[#334155] text-white text-sm font-medium border-[#334155] hover:bg-[#475569] active:scale-[0.98] transition-all", className)}>
   <span>{children}</span>
   {icon ? <span className="opacity-80">{icon}</span> : null}
  </button>
 )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
 return <input {...props} className={cn("w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none placeholder:text-[#94A3B8] focus:border-[#334155] focus:ring-1 focus:ring-[#334155]/10 transition-colors", props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
 return <select {...props} className={cn("w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none focus:border-[#334155] focus:ring-1 focus:ring-[#334155]/10 transition-colors", props.className)} />
}

export function Label({ children }: { children: React.ReactNode }) {
 return <label className="text-xs font-semibold tracking-wide uppercase text-[#475569]">{children}</label>
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
 return <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs font-semibold tracking-wide uppercase text-[#475569]">{children}</span>
}

// PART: KpiCard — KPI card Dashboard: label+dot, value break-all, sub, accent progress, action slot
export function KpiCard({ label, value, sub, accent, action }: { label: string; value: string; sub: string; accent?: string; action?: React.ReactNode }) {
 return (
  <div className="bg-white border-[#E2E8F0] rounded-[16px] p-5 sm:p-6 flex flex-col min-w-0 overflow-hidden h-full shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
   <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#475569] leading-none truncate"><span className="size-1.5 rounded-full bg-[#334155] shrink-0" />{label}</div>
   <div className="text-[20px] sm:text-[22px] font-bold tracking-tight leading-none mt-3.5 text-[#0F172A] tabular-nums min-w-0 break-words [overflow-wrap:anywhere]">{value}</div>
   <div className="text-[13px] leading-relaxed text-[#475569] mt-2 break-words [overflow-wrap:anywhere]">{sub}</div>
   {accent && <div className="mt-4 h-1.5 rounded-full bg-[#F1F5F9] border-[#E2E8F0] p-0.5"><div className="h-full rounded-full bg-[#334155]" style={{ width: accent }} /></div>}
   {action && <div className="mt-auto pt-5 min-w-0">{action}</div>}
  </div>
 )
}
