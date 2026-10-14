// @ts-nocheck
// PART: FILE pelanggan.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useEffect } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, Button, TableShell, TableToolbar } from "@/components/ui"
import { BarChart } from "@/components/charts"
import { rupiah, cn } from "@/lib/utils"
import { creditCheck } from "@/lib/engine"
import { Warning, Lock, Eye, Trash, Plus, MagnifyingGlass, Users } from "@phosphor-icons/react"

export function PelangganFeature(){
 const s = useStore()
 const root = useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const els = root.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((entries)=> entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold:0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])

 // PART: Aging Piutang — 3 bucket Lancar/1-7 hari/lbh 7 hari sum balance
  const piutangAging = [
  {label:"Lancar", value: s.customers.filter(c=>c.overdueDays===0).reduce((acc,c)=>acc+c.balance,0)},
  {label:"1-7 hari", value: s.customers.filter(c=>c.overdueDays>0 && c.overdueDays<=7).reduce((acc,c)=>acc+c.balance,0)},
  {label:">7 hari", value: s.customers.filter(c=>c.overdueDays>7).reduce((acc,c)=>acc+c.balance,0)},
 ]

 return (
  <div ref={root} className="w-full max-w-none mx-0 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-full overflow-x-clip">
   <section className="reveal flex flex-wrap gap-4 max-w-full overflow-hidden items-end justify-between">
    <div>
     <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs tracking-[0.06em] uppercase font-medium text-[#475569]">Pelanggan & kontrol kredit</span>
     <h1 className="mt-3 font-serif text-[36px] md:text-[44px] tracking-[-0.03em] leading-none text-balance">Kredit yang <span className="font-medium">tegas.</span> Gudang tetap jalan.</h1>
    </div>
    <div className="flex gap-2">
     <select value={s.custFilter} onChange={e=>s.setCustFilter(e.target.value)} className="h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"><option value="all">Semua tipe</option><option value="Retail">Retail</option><option value="Proyek">Proyek</option><option value="Reseller">Reseller</option><option value="Tukang">Tukang</option></select>
     <div className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white"><MagnifyingGlass size={16} weight="bold" className="text-[#475569]"/><input value={s.q} onChange={e=>s.setQ(e.target.value)} placeholder="Cari pelanggan" className="bg-transparent outline-none text-sm w-[160px] placeholder:text-[#475569]"/></div>
     <Button onClick={()=>s.setAddCustOpen(true)}><Plus size={16} weight="bold"/> Tambah</Button>
    </div>
   </section>

   {s.blockedCustomers.length>0 && (
    <div className="reveal flex items-center gap-3 p-3 rounded-[8px] border-[#E2E8F0] bg-[#FDEBEC]">
     <span className="size-7 rounded-[6px] bg-white border-[#E2E8F0] grid place-items-center shrink-0"><Warning size={14} weight="fill" className="text-[#9F2F2D]"/></span>
     <span className="text-sm"><span className="font-semibold">{s.blockedCustomers.length} terblokir</span> — Surat Jalan ditahan hingga pembayaran/override.</span>
     <Badge tone="amber">{s.customers.filter(c=>c.overdueDays>7).length} overdue</Badge>
    </div>
   )}

    {/* PART: Tabel Daftar Pelanggan — 7 kolom + row blocked rose, Sisa chip */}
    <TableShell toolbar={<TableToolbar icon={<Users size={16} weight="bold"/>} title="Daftar Pelanggan" subtitle="Kredit & piutang · filter di header" meta={<Badge tone="zinc">{s.filteredCustomers.length} pelanggan</Badge>} actions={<div className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-full border border-[#E2E8F0] bg-white shadow-sm"><MagnifyingGlass size={14} weight="bold" className="text-[#94A3B8]"/><input value={s.q} onChange={e=>s.setQ(e.target.value)} placeholder="Cari pelanggan" className="bg-transparent outline-none text-xs w-[150px] placeholder:text-[#94A3B8]"/></div>} />} >
     <div className="hidden lg:block">
      <table className="w-full text-sm border-collapse">
       <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <tr className="text-left"><th className="px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Pelanggan</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Tipe</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Limit</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Piutang</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Sisa</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Status</th><th className="px-4 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Aksi</th></tr>
       </thead>
       <tbody className="divide-y divide-[#F1F5F9]">
        {s.filteredCustomers.length===0 ? (
         <tr><td colSpan={7} className="px-6 py-12 text-center"><div className="mx-auto max-w-sm rounded-[12px] border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6"><div className="text-sm font-semibold text-[#0F172A]">Tidak ada pelanggan</div><p className="text-xs text-[#475569] mt-1">Coba ubah filter atau tambah pelanggan baru.</p><Button className="mt-3 rounded-full" onClick={()=>{s.setQ(""); s.setCustFilter("all")}}><Plus size={14} weight="bold"/> Reset</Button></div></td></tr>
        ) : s.filteredCustomers.map(c=>{
         const chk = creditCheck(c,0,0)
         const sisa = c.creditLimit - c.balance
         return (
          <tr key={c.id} className={cn("group transition-colors hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/40", chk.blocked && "!bg-rose-50/60 hover:!bg-rose-50")}>
           <td className="px-4 py-4">
            <div className="flex items-center gap-3 min-w-0"><span className="grid size-8 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-white place-items-center text-xs font-bold shrink-0">{c.name.slice(0,2).toUpperCase()}</span><div className="min-w-0"><div className="text-sm font-semibold tracking-tight text-[#0F172A] leading-none truncate">{c.name}</div><div className="text-xs font-mono text-[#64748B] mt-1 truncate">{c.code} · {c.phone}</div>{c.isBlocked && <div className="text-xs text-rose-600 mt-1 flex items-center gap-1 font-medium truncate"><Lock size={12} weight="bold"/>{c.blockedReason}</div>}</div></div>
           </td>
           <td className="px-3 py-4"><div className="flex flex-col gap-1"><Badge tone="zinc">{c.type}</Badge><span className="text-xs font-mono tabular-nums text-[#475569] whitespace-nowrap">NET {c.terms} · <span className={c.overdueDays>7?"text-rose-600 font-semibold":""}>{c.overdueDays}h</span></span></div></td>
           <td className="px-3 py-4 text-right whitespace-nowrap"><span className="font-mono text-sm font-semibold tabular-nums text-[#334155]">{rupiah(c.creditLimit)}</span></td>
           <td className="px-3 py-4 text-right whitespace-nowrap"><span className="font-mono text-sm tabular-nums text-[#475569]">{rupiah(c.balance)}</span></td>
           <td className="px-3 py-4 text-right whitespace-nowrap"><span className={cn("inline-flex px-2 py-1 rounded-full text-xs font-bold tabular-nums border", sisa<0?"bg-rose-50 text-rose-700 border-rose-100": sisa<20000000?"bg-amber-50 text-amber-700 border-amber-100":"bg-emerald-50 text-emerald-700 border-emerald-100")}>{rupiah(sisa)}</span></td>
           <td className="px-3 py-4 whitespace-nowrap">{chk.blocked ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold"><Lock size={10} weight="bold"/> BLOCKED</span> : chk.overLimit ? <Badge tone="amber">Over limit</Badge> : <Badge tone="emerald">Approved</Badge>}</td>
           <td className="px-4 py-4 text-right">
            <div className="flex gap-1 justify-end">
             <button onClick={()=>s.showToast(`${c.name} · ${c.phone}`)} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-[#0F172A] hover:text-white transition-colors shadow-sm"><Eye size={12} weight="bold"/></button>
             <button onClick={()=>{ s.setCustomers(v=> v.map(x=> x.id===c.id? {...x, isBlocked: !x.isBlocked, blockedReason: !x.isBlocked? "Diblokir manual": undefined}:x)); s.showToast(c.isBlocked? "Dibuka blokir":"Diblokir")}} className="h-7 px-2.5 rounded-full bg-[#0F172A] text-white text-xs font-semibold hover:bg-black transition-colors shadow-sm whitespace-nowrap">{c.isBlocked?"Buka":"Blokir"}</button>
             <button onClick={()=>{ s.setCustomers(v=> v.filter(x=>x.id!==c.id)); s.showToast("Pelanggan dihapus")}} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center text-[#475569] hover:text-white hover:bg-rose-500 hover:border-rose-500 transition-colors shadow-sm"><Trash size={12} weight="bold"/></button>
            </div>
           </td>
          </tr>
         )
        })}
       </tbody>
      </table>
     </div>
     <div className="lg:hidden divide-y divide-[#F1F5F9]">
      {s.filteredCustomers.length===0 ? (
        <div className="p-8 text-center"><div className="text-sm font-semibold text-[#0F172A]">Tidak ada pelanggan</div><p className="text-xs text-[#475569] mt-1">Coba ubah filter atau tambah pelanggan baru.</p></div>
      ) : s.filteredCustomers.map(c=>{
        const chk = creditCheck(c,0,0)
        const sisa = c.creditLimit - c.balance
        return (
          <div key={c.id} className={cn("p-4 flex flex-col gap-3", chk.blocked && "bg-rose-50/60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3 min-w-0"><span className="grid size-9 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-white place-items-center text-xs font-bold shrink-0">{c.name.slice(0,2).toUpperCase()}</span><div className="min-w-0"><div className="text-sm font-semibold text-[#0F172A] truncate">{c.name}</div><div className="text-xs font-mono text-[#64748B] truncate">{c.code}</div><div className="text-xs text-[#64748B]">{c.phone}</div></div></div>
              {chk.blocked ? <span className="inline-flex gap-1 px-2 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold shrink-0"><Lock size={10} weight="bold"/> BLOCKED</span> : chk.overLimit ? <Badge tone="amber">Over limit</Badge> : <Badge tone="emerald">Approved</Badge>}
            </div>
            <div className="flex flex-wrap gap-1.5"><Badge tone="zinc">{c.type}</Badge><span className="text-xs px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] font-mono">NET {c.terms} · {c.overdueDays}h overdue</span></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[10px] border border-[#E2E8F0] bg-white p-2"><div className="text-xs text-[#64748B]">Limit</div><div className="font-mono text-xs font-bold mt-1 break-all">{rupiah(c.creditLimit)}</div></div>
              <div className="rounded-[10px] border border-[#E2E8F0] bg-white p-2"><div className="text-xs text-[#64748B]">Piutang</div><div className="font-mono text-xs font-bold mt-1 break-all">{rupiah(c.balance)}</div></div>
              <div className={cn("rounded-[10px] border p-2", sisa<0?"bg-rose-50 border-rose-100": sisa<20000000?"bg-amber-50 border-amber-100":"bg-emerald-50 border-emerald-100")}><div className="text-xs opacity-70">Sisa</div><div className="font-mono text-xs font-bold mt-1 break-all">{rupiah(sisa)}</div></div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>s.showToast(`${c.name} · ${c.phone}`)} className="flex-1 h-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center text-xs font-medium"><Eye size={14} weight="bold"/> Detail</button>
              <button onClick={()=>{ s.setCustomers(v=> v.map(x=> x.id===c.id? {...x, isBlocked: !x.isBlocked, blockedReason: !x.isBlocked? "Diblokir manual": undefined}:x)); s.showToast(c.isBlocked? "Dibuka blokir":"Diblokir")}} className="flex-1 h-9 rounded-full bg-[#0F172A] text-white text-xs font-semibold">{c.isBlocked?"Buka Blokir":"Blokir"}</button>
              <button onClick={()=>{ s.setCustomers(v=> v.filter(x=>x.id!==c.id)); s.showToast("Pelanggan dihapus")}} className="size-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center text-rose-600"><Trash size={14} weight="bold"/></button>
            </div>
          </div>
        )
      })}
     </div>
    </TableShell>

   {/* PART: Bawah — Aging BarChart + Aturan Kredit (Total Risiko, AUTO/HARD BLOCK) */}
    <div className="grid lg:grid-cols-12 gap-6 reveal">
    <Card className="lg:col-span-6 p-6">
     <div className="text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Aging piutang</div>
     <div className="mt-4"><BarChart data={piutangAging.map(d=>({label:d.label, value:d.value/1000}))} color="#334155"/></div>
    </Card>
    <Card className="lg:col-span-6 p-6">
     <div className="text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Aturan kredit</div>
     <div className="mt-4 rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-4 font-mono text-xs leading-relaxed">
      <div>Total Risiko = Saldo Piutang + Nilai Transaksi Baru + SO Belum Invoice</div>
      <div className="mt-2">Over limit → <span className="px-2 py-0.5 rounded-[4px] bg-[#FDEBEC] text-[#9F2F2D] border-[#E2E8F0]">AUTO BLOCK</span> · Overdue &gt;7 hari → <span className="px-2 py-0.5 rounded-[4px] bg-[#334155] text-white">HARD BLOCK DO</span></div>
     </div>
     <Button className="w-full mt-4" onClick={()=>s.setActive("penjualan")}>Coba di POS</Button>
    </Card>
   </div>
  </div>
 )
}
