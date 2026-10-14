// @ts-nocheck
// PART: FILE penjualan.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useEffect, useMemo } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, Button, Label, TableShell, TableToolbar } from "@/components/ui"
import { AreaChart } from "@/components/charts"
import { rupiah, fmt } from "@/lib/utils"
import { getAutoSellPrice, creditCheck } from "@/lib/engine"
import { exportSalesExcel } from "@/lib/excel"
import { ArrowRight, Eye, Printer, Trash, FileXls, MagnifyingGlass, CheckCircle, Lock } from "@phosphor-icons/react"
import type { SalesOrder } from "@/lib/types"

// PART: Helper dlTxt — download txt (cetak SO)
function dlTxt(name:string, content:string){
 const blob=new Blob([content],{type:"text/plain;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function PenjualanFeature(){
 const s = useStore()
 const root = useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const els = root.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((entries)=> entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold:0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])

 // PART: Tren Penjualan — Grafik Penjualan 7 hari
  const trend = useMemo(()=>{
  const base = [4200000, 7800000, 5100000, 12215000, 2415000, 9300000, 5600000]
  const labels = ["10 Sep","11 Sep","12 Sep","13 Sep","14 Sep","15 Sep","16 Sep"]
  return labels.map((l,i)=>({label:l, value: base[i]}))
 },[])

 const selectedCustomer = s.customers.find(c=>c.id===s.newSO.customerId) ?? s.customers[1]
 const selectedProduct = s.products.find(p=>p.id===s.newSO.productId) ?? s.products[0]
 const selectedUnit = selectedProduct.units.find(u=>u.id===s.newSO.unitId) ?? selectedProduct.units[0]
 const autoSellPrice = getAutoSellPrice(selectedProduct, s.newSO.unitId, selectedCustomer.type as any)
 const soQty = Number(s.newSO.qty)||0
 const soSubtotal = soQty * autoSellPrice
 const pendingSO = useMemo(()=> s.soList.filter(x=>x.customerId===s.newSO.customerId && x.status!=="Completed" && x.status!=="Cancelled").reduce((a:any,x:any)=>a+x.total,0),[s.soList,s.newSO.customerId])
 // PART: Validasi Kredit — creditCheck untuk banner BLOCKED / Siap DO
  const check = creditCheck(selectedCustomer, soSubtotal, pendingSO)

 return (
  <div ref={root} className="w-full max-w-none mx-0 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-full overflow-x-clip">
   <section className="reveal relative overflow-hidden rounded-[12px] border-[#E2E8F0] bg-white">
    <div className="absolute inset-0 opacity-[0.04] grayscale" style={{backgroundImage:"url(https://picsum.photos/seed/pos-doc/1400/520)", backgroundSize:"cover"}}/>
    <div className="absolute inset-0" style={{background:"radial-gradient(at 18% 18%, rgba(120,90,40,0.05) 0, transparent 50%)"}}/>
    <div className="relative grid lg:grid-cols-12 max-w-full gap-8 p-8 lg:p-12 items-center">
     <div className="lg:col-span-7 min-w-0">
      <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs tracking-[0.06em] uppercase font-medium text-[#475569]">Penjualan — qty saja, harga jalan</span>
      <h1 className="mt-3 font-serif text-[36px] md:text-[44px] tracking-[-0.03em] leading-none text-balance">Input qty. <span className="font-medium">Harga ikut tier</span> otomatis.</h1>
      <div className="mt-4 flex flex-wrap gap-2">
       <select value={s.soStatus} onChange={e=>s.setSoStatus(e.target.value)} className="h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"><option value="all">Semua status</option><option value="Draft">Draft</option><option value="Approved">Approved</option><option value="Completed">Completed</option></select>
       <Button variant="outline" onClick={async()=>{ await exportSalesExcel({soList:s.soList, customers:s.customers}); s.showToast("Excel SO siap") }}><FileXls size={16} weight="bold"/> Export Excel</Button>
      </div>
     </div>
     <div className="lg:col-span-5 min-w-0">
      <div className="rounded-[12px] border-[#E2E8F0] bg-[#F1F5F9] p-3">
       <div className="rounded-[8px] border-[#E2E8F0] bg-white p-4">
        <div className="text-xs tracking-[0.06em] uppercase text-[#475569] font-medium">GUD-01 · Live</div>
        <div className="mt-2 text-2xl font-mono font-semibold tabular-nums">{s.soList.length} <span className="text-sm font-sans font-medium text-[#475569]">SO</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
         <div className="rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-3"><div className="text-xs text-[#475569]">Transaksi</div><div className="font-mono text-sm font-medium tabular-nums">{s.filteredSO.length}</div></div>
         <div className="rounded-[8px] bg-[#334155] text-white p-3"><div className="text-xs opacity-60">Tipe harga</div><div className="text-sm font-medium">{selectedCustomer.type}</div></div>
        </div>
       </div>
      </div>
     </div>
    </div>
   </section>

   <Card className="p-6 reveal">
    <div className="flex items-center justify-between flex-wrap gap-3"><div className="text-sm font-medium">Tren penjualan</div><Badge tone="emerald">{s.soList.length} SO</Badge></div>
    <div className="mt-4"><AreaChart data={trend} color="#334155"/></div>
   </Card>

    {/* PART: Tabel Sales Orders — desktop table + mobile card stack */}
    <TableShell toolbar={<TableToolbar icon={<span className="text-[11px] font-mono font-bold tracking-widest">#</span>} title="Sales Orders" subtitle="Transaksi live · filter di header" meta={<span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569]"><span className="size-2 rounded-full bg-emerald-500 animate-pulse"/>{s.filteredSO.length} transaksi</span>} actions={<div className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-full border border-[#E2E8F0] bg-white shadow-sm"><MagnifyingGlass size={14} weight="bold" className="text-[#94A3B8]"/><input value={s.q} onChange={e=>s.setQ(e.target.value)} placeholder="Cari SO" className="bg-transparent outline-none text-xs w-[140px] placeholder:text-[#94A3B8]"/></div>} />} >
     <div className="hidden md:block">
      <table className="w-full text-sm border-collapse">
       <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <tr className="text-left"><th className="px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">SO</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Pelanggan</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Sales</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Total</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Status</th><th className="px-4 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Aksi</th></tr>
       </thead>
       <tbody className="divide-y divide-[#F1F5F9]">
        {s.filteredSO.length===0 ? (
         <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="mx-auto max-w-sm rounded-[12px] border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6"><div className="text-sm font-semibold text-[#0F172A]">Belum ada SO</div><p className="text-xs text-[#475569] mt-1">Buat transaksi pertama di form POS di bawah.</p></div></td></tr>
        ) : s.filteredSO.map(so=>{
         const cust = s.customers.find(c=>c.id===so.customerId)
         const statusTone = so.status==="Approved"?"emerald": so.status==="Draft"?"zinc": so.status==="Cancelled"?"red":"blue"
         return (
          <tr key={so.id} className="group hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/40 transition-colors">
           <td className="px-4 py-4"><div className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#0F172A] shrink-0"/><span className="font-mono text-xs font-bold tabular-nums tracking-wide">{so.soNumber}</span></div><div className="text-xs text-[#64748B] tabular-nums mt-1 ml-3.5">{so.date} · {so.items.length} item</div></td>
           <td className="px-3 py-4"><div className="text-sm font-semibold tracking-tight text-[#0F172A] leading-none truncate max-w-[150px]">{cust?.name}</div><div className="inline-flex items-center gap-1 mt-1"><span className="px-1.5 py-0.5 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-[11px] font-mono font-medium text-[#475569]">{cust?.code}</span><span className="text-xs font-medium text-[#475569] truncate">{cust?.type}</span></div></td>
           <td className="px-3 py-4"><span className="inline-flex px-2 py-1 rounded-full bg-white border-[#E2E8F0] text-xs font-medium shadow-sm truncate max-w-[90px]">{so.salesperson}</span></td>
           <td className="px-3 py-4 text-right whitespace-nowrap"><span className="font-mono text-sm font-bold tabular-nums text-[#0F172A]">{rupiah(so.total)}</span></td>
           <td className="px-3 py-4"><Badge tone={statusTone as any}>{so.status}</Badge></td>
           <td className="px-4 py-4 text-right">
            <div className="flex gap-1 justify-end">
             <button onClick={()=>s.setDetailSO(so)} className="size-7 rounded-full bg-white border-[#E2E8F0] grid place-items-center hover:bg-[#0F172A] hover:text-white transition-colors shadow-sm"><Eye size={12} weight="bold"/></button>
             <button onClick={()=>{ dlTxt(`${so.soNumber}.txt`, `SO ${so.soNumber}\nPelanggan ${cust?.name}\nTotal ${rupiah(so.total)}\n`); s.showToast("SO dicetak")}} className="size-7 rounded-full bg-white border-[#E2E8F0] grid place-items-center hover:border-[#CBD5E1] transition-colors shadow-sm"><Printer size={12} weight="bold"/></button>
             <button onClick={()=>{ s.setSoList(v=> v.filter(x=>x.id!==so.id)); s.showToast("SO dihapus")}} className="size-7 rounded-full bg-white border-[#E2E8F0] grid place-items-center text-[#475569] hover:text-white hover:bg-rose-500 hover:border-rose-500 transition-colors shadow-sm"><Trash size={12} weight="bold"/></button>
            </div>
           </td>
          </tr>
         )
        })}
       </tbody>
      </table>
     </div>
     <div className="md:hidden divide-y divide-[#F1F5F9]">
      {s.filteredSO.length===0 ? (
        <div className="p-8 text-center"><div className="text-sm font-semibold text-[#0F172A]">Belum ada SO</div><p className="text-xs text-[#475569] mt-1">Buat transaksi pertama di form POS di bawah.</p></div>
      ) : s.filteredSO.map(so=>{
        const cust = s.customers.find(c=>c.id===so.customerId)
        const statusTone = so.status==="Approved"?"emerald": so.status==="Draft"?"zinc": so.status==="Cancelled"?"red":"blue"
        return (
          <div key={so.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div><div className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#0F172A]"/><span className="font-mono text-xs font-bold tracking-wide">{so.soNumber}</span></div><div className="text-xs text-[#64748B] mt-1">{so.date} · {so.items.length} item · {so.salesperson}</div></div>
              <Badge tone={statusTone as any}>{so.status}</Badge>
            </div>
            <div className="text-sm font-semibold text-[#0F172A] truncate">{cust?.name} <span className="font-mono text-xs text-[#64748B]">· {cust?.code} · {cust?.type}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-[#0F172A] break-all flex-1">{rupiah(so.total)}</span>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={()=>s.setDetailSO(so)} className="size-8 rounded-full bg-white border border-[#E2E8F0] grid place-items-center shadow-sm"><Eye size={14} weight="bold"/></button>
                <button onClick={()=>{ dlTxt(`${so.soNumber}.txt`, `SO ${so.soNumber}\nPelanggan ${cust?.name}\nTotal ${rupiah(so.total)}\n`); s.showToast("SO dicetak")}} className="size-8 rounded-full bg-white border border-[#E2E8F0] grid place-items-center shadow-sm"><Printer size={14} weight="bold"/></button>
                <button onClick={()=>{ s.setSoList(v=> v.filter(x=>x.id!==so.id)); s.showToast("SO dihapus")}} className="size-8 rounded-full bg-white border border-[#E2E8F0] grid place-items-center text-rose-600 shadow-sm"><Trash size={14} weight="bold"/></button>
              </div>
            </div>
          </div>
        )
      })}
     </div>
    </TableShell>

   {/* PART: Form POS — Pelanggan tier otomatis, Produk, Satuan, Qty, harga otomatis, subtotal */}
    <Card className="p-6 lg:p-8 reveal">
    <div className="flex items-center justify-between flex-wrap gap-3"><div className="text-sm font-medium">POS cepat — validasi kredit realtime · harga otomatis</div><Badge tone="blue">{selectedCustomer.type} price</Badge></div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
     <span className="px-3 py-1.5 rounded-full bg-[#334155] text-white text-xs">Input qty</span><ArrowRight size={14} weight="bold" className="text-[#E2E8F0]"/>
     <span className="px-3 py-1.5 rounded-full bg-white border-[#E2E8F0] text-xs">Harga otomatis</span><ArrowRight size={14} weight="bold" className="text-[#E2E8F0]"/>
     <span className="px-3 py-1.5 rounded-full bg-[#EDF3EC] text-[#346538] border-[#E2E8F0] text-xs">Cek kredit</span><ArrowRight size={14} weight="bold" className="text-[#E2E8F0]"/>
     <span className="px-3 py-1.5 rounded-full bg-[#334155] text-white text-xs">SO + DO</span>
    </div>

    <div className="mt-6 rounded-[12px] border-[#E2E8F0] overflow-hidden">
     <div className="px-6 py-4 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
      <div className="text-sm font-medium">Form POS — input qty saja</div>
      <span className="px-2.5 py-1 rounded-full bg-[#E1F3FE] text-[#1F6C9F] text-xs font-medium border-transparent">{selectedCustomer.type}</span>
     </div>
     <div className="p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4 min-w-0">
       <div><Label>Pelanggan — tier otomatis</Label>
        <select value={s.newSO.customerId} onChange={e=>s.setNewSO(v=>({...v, customerId: e.target.value}))} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none">
         {s.customers.map(c=> <option key={c.id} value={c.id}>{c.name} — {c.type}</option>)}
        </select>
        <div className="text-xs text-[#475569] mt-1">Harga pakai tier <span className="font-medium text-[#334155]">{selectedCustomer.type}</span></div>
       </div>
       <div><Label>Produk baja / meteran</Label>
        <select value={s.newSO.productId} onChange={e=>{
         const prod = s.products.find(p=>p.id===e.target.value)!; s.setNewSO(v=>({...v, productId: e.target.value, unitId: prod.units.find(u=>u.isBase)?.id ?? prod.units[0].id }))
        }} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none">
         {s.products.map(p=> <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
        </select>
       </div>
       <div><Label>Satuan</Label>
        <select value={s.newSO.unitId} onChange={e=>s.setNewSO(v=>({...v, unitId:e.target.value}))} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none">
         {selectedProduct.units.map(u=> <option key={u.id} value={u.id}>{u.name} ×{u.factor} {selectedProduct.units.find(b=>b.isBase)?.name} {u.isBase?"basis":""}</option>)}
        </select>
       </div>
       <div>
        <Label>Qty — angka saja</Label>
        <input value={s.newSO.qty} onChange={e=>s.setNewSO(v=>({...v, qty:e.target.value}))} inputMode="decimal" placeholder="misal 24" className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none placeholder:text-[#475569]"/>
        <div className="text-xs text-[#475569] mt-1 tabular-nums">{selectedUnit.name} = {selectedUnit.factor} {selectedProduct.units.find(u=>u.isBase)?.name} · stok {fmt(s.calcStock(selectedProduct.id))}</div>
       </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 min-w-0">
       <div className="rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-4"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Harga otomatis / {selectedUnit.name}</div><div className="font-mono font-medium mt-1 tabular-nums">{rupiah(autoSellPrice)}</div><div className="text-xs text-[#475569]">Tier {selectedCustomer.type}</div></div>
       <div className="rounded-[8px] border-[#E2E8F0] bg-white p-4"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Qty</div><div className="font-mono font-medium mt-1 tabular-nums">{fmt(soQty)} {selectedUnit.name}</div><div className="text-xs text-[#475569] tabular-nums">{fmt(soQty * selectedUnit.factor)} basis</div></div>
       <div className="rounded-[8px] bg-[#334155] text-white p-4"><div className="text-xs tracking-[0.06em] uppercase opacity-60">Subtotal otomatis</div><div className="font-mono font-semibold mt-1 text-lg tabular-nums">{rupiah(soSubtotal)}</div><div className="text-xs opacity-60 tabular-nums">{fmt(soQty)} × {rupiah(autoSellPrice)}</div></div>
      </div>

      <div className={`rounded-[8px] border min-w-0 overflow-hidden px-4 py-3 flex items-start gap-3 text-sm ${check.blocked ? "bg-[#FDEBEC] border-[#E2E8F0]" : "bg-[#EDF3EC] border-[#E2E8F0]"}`}>
       {check.blocked ? <Lock size={18} weight="bold" className="text-[#9F2F2D] mt-0.5"/> : <CheckCircle size={18} weight="fill" className="text-[#346538] mt-0.5"/>}
       <div className="flex-1 leading-relaxed">
        <div className="font-medium">{check.blocked ? "SYSTEM BLOCKED — butuh override" : "Lolos validasi kredit"}</div>
        <div className="text-xs text-[#475569] mt-1 font-mono tabular-nums">Total Risiko {rupiah(check.totalRisk)} / Limit {rupiah(selectedCustomer.creditLimit)} · Overdue {selectedCustomer.overdueDays} hari</div>
        {check.blocked && <div className="text-xs text-[#9F2F2D] mt-2">{check.overLimit ? "Melebihi limit" : ""} {check.overLimit && check.overdueBlock ? " dan " : ""} {check.overdueBlock ? "Ada faktur overdue" : ""}{selectedCustomer.isBlocked ? " · "+selectedCustomer.blockedReason : ""}</div>}
       </div>
       {check.blocked ? <Button onClick={()=>s.setOverrideOpen(true)} className="shrink-0">Minta override</Button> : <Badge tone="emerald">Siap terbitkan DO</Badge>}
      </div>

      <div className="flex gap-2">
       <Button className="flex-1" disabled={check.blocked || soQty<=0} onClick={()=>{
        if(soQty<=0) return s.showToast("Qty harus > 0")
        const soNumber = `SO-2409-${String(s.soList.length+13).padStart(3,"0")}`
        const so: SalesOrder = { id: `so${Date.now()}`, soNumber, customerId: s.newSO.customerId, salesperson:"Kasir-01", date:"2026-09-16", status:"Approved", items:[{ productId:s.newSO.productId, unitId:s.newSO.unitId, qty:soQty, price:autoSellPrice, subtotal: soSubtotal }], total: soSubtotal }
        s.setSoList(v=>[so, ...v]); s.setDoList(v=> [{id:`do${Date.now()}`, doNumber:`DO-${soNumber.slice(3)}`, soId: so.id, driver:"-", vehicle:"-", status:"Scheduled"}, ...v]); s.showToast("SO dan DO dibuat")
       }}>Terbitkan SO dan DO</Button>
       <Button variant="outline" onClick={()=>s.setNewSO(v=>({...v, qty:""}))}>Reset qty</Button>
      </div>
     </div>
    </div>
   </Card>
  </div>
 )
}
