// PART: FILE components/shell.tsx — App Shell: Sidebar + Header + Mobile nav — lihat DOKUMENTASI.md §5.1
"use client"
import { useEffect, useState } from "react"
import { House, Package, Users, ShoppingCart, Truck, Receipt, MagnifyingGlass, Bell, ShoppingBag, Warning, CheckCircle, Buildings, SignOut } from "@phosphor-icons/react"
// PART: NavKey + nav[] — 7 rute: dashboard/produk/pembelian/pelanggan/penjualan/pengiriman/invoice
export type NavKey = "dashboard"|"produk"|"pembelian"|"pelanggan"|"penjualan"|"pengiriman"|"invoice"
const nav: {k:NavKey;label:string;icon:any}[] = [
 {k:"dashboard", label:"Dashboard", icon: House},
 {k:"produk", label:"Produk & Stok", icon: Package},
 {k:"pembelian", label:"Pembelian", icon: ShoppingBag},
 {k:"pelanggan", label:"Pelanggan", icon: Users},
 {k:"penjualan", label:"Penjualan", icon: ShoppingCart},
 {k:"pengiriman", label:"Pengiriman", icon: Truck},
 {k:"invoice", label:"Invoice & Pajak", icon: Receipt},
]
// PART: Shell — layout chrome: aside 280px + header 64px sticky + main full-width
export function Shell({active,onChange,children,searchValue,onSearch,notifCount,notifs,onNotifAction}:{active:NavKey;onChange:(k:NavKey)=>void;children:React.ReactNode; searchValue?:string; onSearch?:(v:string)=>void; notifCount?:number; notifs?:{title:string;desc:string;actionLabel?:string;onAction?:()=>void}[]; onNotifAction?:()=>void}){
 const [now,setNow]=useState<Date|null>(null)
 const [notifOpen,setNotifOpen]=useState(false)
 const [menuOpen,setMenuOpen]=useState(false)
 const [q,setQ]=useState(searchValue??"")
 useEffect(()=>{ setNow(new Date()); const t=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(t)},[])
 useEffect(()=>{ setQ(searchValue??"") },[searchValue])
 const dateStr = now ? new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"long",year:"numeric"}).format(now) : "—"
 const timeStr = now ? new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",hour12:false}).format(now) : "—"
 return (
  <div className="min-h-[100dvh] flex bg-[#F8FAFC] text-[#334155]">
   <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white sticky top-0 h-[100dvh]">
    <div className="h-[64px] px-6 flex items-center gap-3 border-b border-[#E2E8F0]">
     <div className="size-8 rounded-[6px] bg-[#334155] text-white grid place-items-center"><Buildings size={16} weight="fill"/></div>
     <div className="leading-none"><div className="text-[14px] font-semibold tracking-tight text-[#334155]">BuildERP</div><div className="text-xs tracking-[0.06em] text-[#475569]">Bahan Bangunan</div></div>
     <span className="ml-auto text-xs font-mono px-2 py-1 rounded-[4px] bg-[#F1F5F9] border-[#E2E8F0] text-[#475569]">REV 2.6</span>
    </div>
    <nav className="p-4 flex-1 overflow-auto space-y-1">
     {nav.map(n=>(
      <button key={n.k} onClick={()=>onChange(n.k)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[13px] font-medium text-left transition-colors ${active===n.k ? "bg-[#334155] text-white" : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#334155]"}`}>
       <n.icon size={18} weight={active===n.k?"fill":"bold"} /> {n.label}
      </button>
     ))}
     <div className="pt-4 mt-4 border-t border-[#E2E8F0] space-y-2">
      <div className="px-3 text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Integrasi</div>
      <div className="mx-1 px-3 py-2.5 rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] flex items-center gap-2 text-xs"><span className="size-1.5 rounded-full bg-[#346538] animate-pulse"/> Scale Agent — Online</div>
      <div className="mx-1 px-3 py-2.5 rounded-[8px] border-[#E2E8F0] bg-white flex items-center gap-2 text-xs text-[#475569]">DJP e-Faktur <span className="ml-auto text-xs font-mono border-[#E2E8F0] px-1.5 py-0.5 rounded-[4px] bg-[#F1F5F9]">PJAP</span></div>
     </div>
    </nav>
    <div className="p-4 border-t border-[#E2E8F0]">
     <div className="flex items-center gap-3 px-2 py-2 rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9]">
      <img src="https://picsum.photos/seed/adm/64/64" alt="Sinta W." className="size-8 rounded-[6px] object-cover"/>
      <div className="leading-none"><div className="text-[13px] font-medium">Sinta W.</div><div className="text-xs text-[#475569]">Finance Manager</div></div>
      <SignOut size={16} className="ml-auto text-[#475569]"/>
     </div>
    </div>
   </aside>
   <div className="flex-1 min-w-0 flex flex-col min-h-0">
    <header className="h-[64px] shrink-0 sticky top-0 z-30 bg-white/95 backdrop-blur-[8px] border-b border-[#E2E8F0] flex items-center gap-3 px-4 lg:px-8 supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_rgba(226,232,240,1)]">
     <div className="flex items-center gap-2 lg:hidden"><div className="size-8 rounded-[6px] bg-[#334155] grid place-items-center text-white"><Buildings size={14} weight="fill"/></div><span className="font-semibold text-sm tracking-tight">BuildERP</span></div>
     <div className="hidden md:flex items-center gap-2 flex-1 max-w-[520px]">
      <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white">
       <MagnifyingGlass size={16} weight="bold" className="text-[#475569]"/>
       <input value={q} onChange={e=>{ setQ(e.target.value); onSearch?.(e.target.value)}} placeholder="Cari SKU, pelanggan, SO / DO…" className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#475569]"/>
       {q ? <button onClick={()=>{setQ(""); onSearch?.("")}} className="text-xs px-2 py-1 rounded-[4px] border-[#E2E8F0] bg-[#F1F5F9]">Hapus</button> : <kbd className="hidden sm:inline-flex text-xs font-mono px-1.5 py-0.5 rounded-[4px] border-[#E2E8F0] bg-[#F1F5F9] text-[#475569]">/</kbd>}
      </div>
     </div>
     <div className="ml-auto flex items-center gap-2">
      <div className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-[6px] border-[#E2E8F0] bg-[#F1F5F9] text-xs">
       <span className="font-medium">[ GUD-01 ]</span><span className="text-[#475569]">Gudang Pusat</span><span className="size-1.5 rounded-full bg-[#346538] animate-pulse"/>
      </div>
      <div className="relative">
       <button onClick={()=>setNotifOpen(v=>!v)} className="size-9 grid place-items-center rounded-[6px] border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] relative transition-colors"><Bell size={18} weight="bold"/>{(notifCount??0)>0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#334155] text-white text-xs font-medium grid place-items-center">{notifCount}</span>}</button>
       {notifOpen && (
        <div className="absolute right-0 top-[44px] w-[360px] rounded-[12px] border-[#E2E8F0] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden">
         <div className="px-4 py-3 flex items-center justify-between border-b border-[#E2E8F0] bg-[#F1F5F9]"><span className="text-xs font-medium tracking-[0.06em] uppercase">Notifikasi — {notifCount} item</span><button onClick={()=>setNotifOpen(false)} className="text-xs px-2 py-1 rounded-[4px] border-[#E2E8F0] bg-white">Tutup</button></div>
         <div className="max-h-[340px] overflow-auto divide-y divide-[#E2E8F0]">
          {(notifs??[]).length===0 && <div className="p-6 text-sm text-[#475569] flex items-center gap-2"><CheckCircle size={16} weight="fill"/> Sistem normal</div>}
          {(notifs??[]).map((n,i)=>(
           <div key={i} className="p-4 flex gap-3 hover:bg-[#F8FAFC]">
            <span className="size-7 rounded-[6px] bg-[#FBF3DB] border-[#E2E8F0] grid place-items-center shrink-0"><Warning size={14} weight="fill" className="text-[#956400]"/></span>
            <div className="flex-1"><div className="text-[13px] font-medium leading-tight">{n.title}</div><div className="text-xs text-[#475569] mt-1 leading-relaxed">{n.desc}</div>{n.actionLabel && <button onClick={()=>{ n.onAction?.(); setNotifOpen(false)}} className="mt-2 text-xs px-3 py-1.5 rounded-[6px] bg-[#334155] text-white hover:bg-[#333333] transition-colors">{n.actionLabel}</button>}</div>
           </div>
          ))}
         </div>
        </div>
       )}
      </div>
      <div className="hidden sm:flex flex-col items-end leading-none pl-3 ml-1 border-l border-[#E2E8F0]">
       <div className="text-xs font-medium">{dateStr}</div><div className="text-xs font-mono text-[#475569]">{timeStr} WIB</div>
      </div>
      <button onClick={()=>setMenuOpen(v=>!v)} className="lg:hidden size-9 rounded-[6px] bg-[#334155] text-white grid place-items-center">
       <span className="relative w-4 h-3.5 block">
        <span className={`absolute left-0 w-4 h-[1.5px] bg-white transition-all ${menuOpen ? "top-[6px] rotate-45" : "top-0"}`} />
        <span className={`absolute left-0 w-4 h-[1.5px] bg-white transition-all ${menuOpen ? "opacity-0" : "top-[6px] opacity-100"}`} />
        <span className={`absolute left-0 w-4 h-[1.5px] bg-white transition-all ${menuOpen ? "top-[6px] -rotate-45" : "top-[12px]"}`} />
       </span>
      </button>
     </div>
    </header>
    {menuOpen && (
     <div className="lg:hidden sticky top-[64px] z-20 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-[8px] p-3 shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <div className="grid grid-cols-2 gap-2">
       {nav.map(n=>(
        <button key={n.k} onClick={()=>{ onChange(n.k); setMenuOpen(false)}} className={`flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-sm font-medium text-left border ${active===n.k ? "bg-[#334155] text-white border-[#334155] shadow-sm" : "bg-white text-[#475569] border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>
         <n.icon size={16} weight="bold"/> {n.label}
        </button>
       ))}
      </div>
     </div>
    )}
     <main className="flex-1 min-w-0 w-full max-w-none px-4 lg:px-6 xl:px-8 pb-10 overflow-x-clip">{children}</main>
   </div>
  </div>
 )
}
