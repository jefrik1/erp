// @ts-nocheck
// PART: FILE pembelian.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useEffect } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, Button, Label, TableShell, TableToolbar } from "@/components/ui"
import { BarChart } from "@/components/charts"
import { rupiah, fmt } from "@/lib/utils"
import { getBuyPrice } from "@/lib/engine"
import { exportPOExcel } from "@/lib/excel"
import { ShoppingBag, Plus, Eye, Trash, Printer, FileXls } from "@phosphor-icons/react"
import type { PurchaseOrder } from "@/lib/types"

function dlTxt(name:string, content:string){
 const blob=new Blob([content],{type:"text/plain;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function PembelianFeature(){
 const s = useStore()
 const root = useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const els = root.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((entries)=> entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold:0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])
 // PART: Logika PO — poProduct, poUnit, autoBuyPrice, poQty, poSubtotal
  const poProduct = s.products.find(p=>p.id===s.newPO.productId) ?? s.products[2]
 const poUnit = poProduct.units.find(u=>u.id===s.newPO.unitId) ?? poProduct.units[0]
 const autoBuyPrice = getBuyPrice(poProduct, s.newPO.unitId)
 const poQty = Number(s.newPO.qty)||0
 const poSubtotal = poQty * autoBuyPrice

 return (
  <div ref={root} className="w-full max-w-none mx-0 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-full overflow-x-clip">
   <section className="reveal flex flex-wrap gap-4 max-w-full overflow-hidden items-end justify-between">
    <div>
     <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs tracking-[0.06em] uppercase font-medium text-[#475569]">Pembelian — GUD-01</span>
     <h1 className="mt-3 font-serif text-[36px] md:text-[44px] tracking-[-0.03em] leading-none text-balance">Baja datang <span className="font-medium">meteran.</span> Stok otomatis.</h1>
    </div>
    <div className="flex gap-2">
     <select value={s.poStatus} onChange={e=>s.setPoStatus(e.target.value)} className="h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"><option value="all">Semua status</option><option value="Draft">Draft</option><option value="Ordered">Ordered</option><option value="Received">Received</option></select>
     <Button variant="outline" onClick={async()=>{ await exportPOExcel({poList:s.poList, suppliers:s.suppliers as any}); s.showToast("Excel PO siap") }}><FileXls size={16} weight="bold"/> Export Excel</Button>
    </div>
   </section>

    <div className="reveal grid max-w-full min-w-0 lg:grid-cols-12 gap-6">
     <div className="lg:col-span-7 min-w-0">
     {/* PART: Tabel Purchase Orders — Supplier ke GUD-01 */}
    <TableShell toolbar={<TableToolbar icon={<ShoppingBag size={16} weight="bold"/>} title="Purchase Orders" subtitle="Supplier → GUD-01" meta={<span className="text-xs font-mono px-2.5 py-1 rounded-full bg-white border border-[#E2E8F0] text-[#475569] shadow-sm">{s.filteredPO.length} / {s.poList.length} PO</span>} />} >
      <div className="hidden md:block">
       <table className="w-full text-sm border-collapse">
        <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
         <tr className="text-left"><th className="px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">PO</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Supplier</th><th className="hidden lg:table-cell px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Gudang</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Total</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Status</th><th className="px-4 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Aksi</th></tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
         {s.filteredPO.length===0 ? (
          <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="mx-auto max-w-sm rounded-[12px] border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6"><div className="text-sm font-semibold text-[#0F172A]">Belum ada PO</div><p className="text-xs text-[#475569] mt-1">Buat PO pertama — stok akan masuk GUD-01 otomatis.</p></div></td></tr>
         ) : s.filteredPO.map(po=>{
          const sup = s.suppliers.find(x=>x.id===po.supplierId)
          const wh = s.warehouses.find(w=>w.id===po.warehouseId)
          return (
           <tr key={po.id} className="group hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/40 transition-colors">
            <td className="px-4 py-4"><span className="font-mono text-xs font-bold tabular-nums tracking-wide">{po.poNumber}</span><div className="text-xs text-[#64748B] mt-1 truncate">{po.date} · {po.items.length} item</div></td>
            <td className="px-3 py-4"><div className="min-w-0"><div className="text-sm font-semibold text-[#0F172A] leading-none truncate max-w-[150px]">{sup?.name}</div><div className="font-mono text-xs text-[#64748B] mt-1 truncate">{sup?.code}</div></div></td>
            <td className="hidden lg:table-cell px-3 py-4"><span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-[#E2E8F0] text-xs font-mono font-semibold shadow-sm">◈ {wh?.code}</span></td>
            <td className="px-3 py-4 text-right whitespace-nowrap"><span className="font-mono text-sm font-bold tabular-nums text-[#0F172A]">{rupiah(po.total)}</span></td>
            <td className="px-3 py-4"><Badge tone={po.status==="Received"?"emerald": po.status==="Ordered"?"blue":"zinc"}>{po.status}</Badge></td>
            <td className="px-4 py-4 text-right">
             <div className="flex gap-1 justify-end">
              <button onClick={()=>s.setDetailPO(po)} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-[#0F172A] hover:text-white transition-colors shadow-sm"><Eye size={12} weight="bold"/></button>
              {po.status==="Ordered" ? <button onClick={()=>{ s.setPoList(v=> v.map(x=> x.id===po.id ? {...x, status:"Received"} as PurchaseOrder : x)); s.showToast("Barang diterima, stok GUD-01 bertambah")}} className="h-7 px-2.5 rounded-full bg-[#0F172A] text-white text-xs font-bold hover:bg-black transition-colors shadow-sm whitespace-nowrap">Terima</button> : <button onClick={()=>{ s.setPoList(v=> v.filter(x=>x.id!==po.id)); s.showToast("PO dihapus")}} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-rose-50 hover:text-rose-600 transition-colors shadow-sm"><Trash size={12} weight="bold"/></button>}
              <button onClick={()=>{ dlTxt(`${po.poNumber}.txt`, `PO ${po.poNumber}\nSupplier ${sup?.name}\nTotal ${rupiah(po.total)}\n`); s.showToast("PO dicetak")}} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:border-[#CBD5E1] transition-colors shadow-sm"><Printer size={12} weight="bold"/></button>
             </div>
            </td>
           </tr>
          )
         })}
        </tbody>
       </table>
      </div>
      <div className="md:hidden divide-y divide-[#F1F5F9]">
       {s.filteredPO.length===0 ? (
         <div className="p-8 text-center"><div className="text-sm font-semibold text-[#0F172A]">Belum ada PO</div><p className="text-xs text-[#475569] mt-1">Buat PO pertama — stok akan masuk GUD-01 otomatis.</p></div>
       ) : s.filteredPO.map(po=>{
         const sup = s.suppliers.find(x=>x.id===po.supplierId)
         const wh = s.warehouses.find(w=>w.id===po.warehouseId)
         return (
           <div key={po.id} className="p-4 flex flex-col gap-3">
             <div className="flex items-start justify-between gap-2">
               <div><div className="font-mono text-xs font-bold tracking-wide">{po.poNumber}</div><div className="text-xs text-[#64748B] mt-1">{po.date} · {sup?.name}</div></div>
               <Badge tone={po.status==="Received"?"emerald": po.status==="Ordered"?"blue":"zinc"}>{po.status}</Badge>
             </div>
             <div className="flex items-center justify-between gap-2">
               <span className="inline-flex gap-1 px-2 py-1 rounded-full bg-white border border-[#E2E8F0] text-xs font-mono">{wh?.code} · {sup?.code}</span>
               <span className="font-mono text-sm font-bold text-[#0F172A] break-all">{rupiah(po.total)}</span>
             </div>
             <div className="flex gap-1.5">
               <button onClick={()=>s.setDetailPO(po)} className="flex-1 h-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center text-xs font-medium"><Eye size={14} weight="bold"/> Detail</button>
               {po.status==="Ordered" ? <button onClick={()=>{ s.setPoList(v=> v.map(x=> x.id===po.id ? {...x, status:"Received"} as PurchaseOrder : x)); s.showToast("Barang diterima, stok GUD-01 bertambah")}} className="flex-1 h-9 rounded-full bg-[#0F172A] text-white text-xs font-bold">Terima</button> : <button onClick={()=>{ s.setPoList(v=> v.filter(x=>x.id!==po.id)); s.showToast("PO dihapus")}} className="size-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center text-rose-600"><Trash size={14} weight="bold"/></button>}
               <button onClick={()=>{ dlTxt(`${po.poNumber}.txt`, `PO ${po.poNumber}\nSupplier ${sup?.name}\nTotal ${rupiah(po.total)}\n`); s.showToast("PO dicetak")}} className="size-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center"><Printer size={14} weight="bold"/></button>
             </div>
           </div>
         )
       })}
      </div>
     </TableShell>
     </div>
    <Card className="lg:col-span-5 p-6 reveal overflow-hidden">
     <div className="text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Nilai pembelian per supplier</div>
     <div className="mt-3 overflow-hidden rounded-[8px] border-[#E2E8F0]"><img src="https://picsum.photos/seed/supplier-doc/640/280" alt="" className="w-full h-28 object-cover grayscale opacity-60" /></div>
     <div className="mt-4"><BarChart data={s.suppliers.map(x=>({label:x.name.split(" ").slice(0,2).join(" "), value: s.poList.filter(p=>p.supplierId===x.id).reduce((a:any,b:any)=>a+b.total,0)/1000}))} color="#334155"/></div>
    </Card>
   </div>

   {/* PART: Form Buat PO — Supplier, Gudang terkunci, Produk baja, Satuan, Qty */}
    <Card className="p-6 lg:p-8 reveal">
    <div className="flex items-center gap-2 text-sm font-medium"><span className="size-7 rounded-[6px] bg-[#334155] text-white grid place-items-center"><ShoppingBag size={14} weight="bold"/></span> Buat PO baru — qty saja, harga otomatis</div>
    <p className="text-xs text-[#475569] mt-1">Gudang tujuan terkunci di GUD-01. Satuan Lonjor/Batang otomatis dikonversi ke meter basis.</p>
    <div className="mt-6 grid lg:grid-cols-12 gap-6">
     <div className="lg:col-span-7 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4 min-w-0">
       <div><Label>Supplier</Label><select value={s.newPO.supplierId} onChange={e=>s.setNewPO(v=>({...v, supplierId:e.target.value}))} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none">{s.suppliers.map(x=> <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
       <div><Label>Gudang tujuan</Label><div className="h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-[#334155] text-white text-sm font-medium flex items-center">[ GUD-01 ] GUDANG PUSAT CIBITUNG</div></div>
       <div><Label>Produk baja</Label><select value={s.newPO.productId} onChange={e=>{
        const p = s.products.find(x=>x.id===e.target.value)!
        s.setNewPO(v=>({...v, productId:e.target.value, unitId: p.units.find(u=>u.isBase)?.id ?? p.units[0].id}))
       }} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none">{s.products.filter(p=> p.category==="Besi & Baja").map(p=> <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}</select></div>
       <div><Label>Satuan</Label><select value={s.newPO.unitId} onChange={e=>s.setNewPO(v=>({...v, unitId:e.target.value}))} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none">{poProduct.units.map(u=> <option key={u.id} value={u.id}>{u.name} ×{u.factor} {poProduct.units.find(b=>b.isBase)?.name} {u.isBase?"basis":""}</option>)}</select></div>
       <div>
        <Label>Qty — angka saja</Label>
        <input value={s.newPO.qty} onChange={e=>s.setNewPO(v=>({...v, qty:e.target.value}))} inputMode="decimal" placeholder="misal 120" className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none placeholder:text-[#475569]"/>
        <div className="text-xs text-[#475569] mt-1.5 tabular-nums">{poUnit.name} = {poUnit.factor} {poProduct.units.find(u=>u.isBase)?.name}</div>
       </div>
       <div>
        <Label>Harga beli otomatis</Label>
        <div className="h-9 px-3 flex items-center rounded-[6px] border-[#E2E8F0] bg-[#F1F5F9] font-mono text-sm tabular-nums">{rupiah(autoBuyPrice)} / {poUnit.name}</div>
       </div>
      </div>
      <div className="rounded-[8px] border-[#334155] bg-[#334155] text-white p-4 flex items-center justify-between">
       <div><div className="text-xs tracking-[0.06em] uppercase opacity-60">Subtotal otomatis</div><div className="text-xs opacity-60 font-mono tabular-nums">{poQty} {poUnit.name} × {rupiah(autoBuyPrice)}</div></div>
       <div className="text-xl font-mono font-semibold tabular-nums">{rupiah(poSubtotal)}</div>
      </div>
      <div className="flex gap-2">
       <Button className="flex-1" disabled={poQty<=0} onClick={()=>{
        if(poQty<=0) return s.showToast("Qty harus > 0")
        const poNumber = `PO-2026-${String(s.poList.length+3).padStart(3,"0")}`
        const item = { productId: s.newPO.productId, unitId: s.newPO.unitId, qty: poQty, price: autoBuyPrice, subtotal: poSubtotal }
        s.setPoList(v=> [{ id:`po${Date.now()}`, poNumber, supplierId: s.newPO.supplierId, date:"2026-09-16", status:"Ordered", items:[item], total: poSubtotal, warehouseId: s.newPO.warehouseId } as any, ...v]); s.showToast("PO dibuat")
       }}><Plus size={16} weight="bold"/> Buat PO</Button>
       <Button variant="outline" onClick={()=>s.setNewPO(v=>({...v, qty:""}))}>Reset qty</Button>
      </div>
     </div>
     <div className="lg:col-span-5 min-w-0">
      <div className="rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-5">
       <div className="text-sm font-medium">Contoh baja meteran</div>
       <div className="mt-3 space-y-2 text-xs font-mono tabular-nums">
        <div className="flex justify-between p-3 rounded-[8px] border-[#E2E8F0] bg-white"><span>Besi 12mm 1 Meter</span><span>{rupiah(6542)}</span></div>
        <div className="flex justify-between p-3 rounded-[8px] border-[#E2E8F0] bg-white"><span>Input 18 Meter</span><span className="font-semibold">{rupiah(6542*18)}</span></div>
        <div className="flex justify-between p-3 rounded-[8px] bg-[#334155] text-white"><span>Input 10 Lonjor</span><span>{rupiah(78500*10)}</span></div>
        <div className="text-[#475569] leading-relaxed font-sans">Lonjor = 12 Meter. Sistem simpan basis Meter, 10 Lonjor = 120 Meter di ledger GUD-01.</div>
       </div>
      </div>
     </div>
    </div>
   </Card>
  </div>
 )
}
