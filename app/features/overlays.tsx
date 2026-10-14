// @ts-nocheck
// PART: FILE overlays.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useStore } from "@/lib/store"
import { Button, Label } from "@/components/ui"
import { rupiah } from "@/lib/utils"
import { getAutoSellPrice } from "@/lib/engine"
import { exportDetailSOExcel } from "@/lib/excel"
import { Lock, Printer, X, FileXls } from "@phosphor-icons/react"

function dlTxt(name:string, content:string){
 const blob=new Blob([content],{type:"text/plain;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function Overlays(){
 const s = useStore()
 const selectedCustomer = s.customers.find(c=>c.id===s.newSO.customerId) ?? s.customers[1]
 const selectedProduct = s.products.find(p=>p.id===s.newSO.productId) ?? s.products[0]
 const autoSellPrice = getAutoSellPrice(selectedProduct, s.newSO.unitId, selectedCustomer.type as any)
 const soQty = Number(s.newSO.qty)||0
 const soSubtotal = soQty * autoSellPrice

 function handleAddProduct(){
  if(!s.editProd) return
  s.setProducts(v=> v.some(x=>x.id===s.editProd!.id) ? v.map(x=> x.id===s.editProd!.id? s.editProd! : x) : [...v, s.editProd!])
  s.setAddProdOpen(false); s.setEditProd(null); s.showToast("Produk disimpan")
 }
 function handleAddCustomer(){
  if(!s.addCust.name.trim()) return s.showToast("Nama wajib diisi")
  const c={ id:`c${Date.now()}`, code:`C-${s.addCust.type.slice(0,3).toUpperCase()}-${String(s.customers.length+1).padStart(3,"0")}`, name:s.addCust.name, type:s.addCust.type, phone:s.addCust.phone, npwp:"-", creditLimit:Number(s.addCust.limit)||0, balance:0, terms: s.addCust.type==="Proyek"?30: s.addCust.type==="Reseller"?14:7, isBlocked:false, overdueDays:0 } as any
  s.setCustomers(v=>[c,...v]); s.setAddCustOpen(false); s.setAddCust({name:"",phone:"",type:"Retail",limit:"0"}); s.showToast("Pelanggan ditambahkan")
 }

 return (
  <>
   {/* PART: SO Detail Modal — overlay blur, items, total dark, Export/Cetak */}
      {s.detailSO && (
    <div className="fixed inset-0 z-40 grid place-items-center p-4 bg-[#334155]/30 backdrop-blur-[4px]" onClick={()=>s.setDetailSO(null)}>
     <div onClick={e=>e.stopPropagation()} className="w-full max-w-[560px] rounded-[12px] border-[#E2E8F0] bg-white p-6">
      <div className="flex items-start justify-between gap-3">
       <div><div className="font-mono text-sm font-semibold">{s.detailSO.soNumber}</div><div className="text-xs text-[#475569] tabular-nums">{s.detailSO.date} · {s.detailSO.status}</div></div>
       <button onClick={()=>s.setDetailSO(null)} className="size-8 rounded-[6px] border-[#E2E8F0] bg-[#F1F5F9] grid place-items-center"><X size={14} weight="bold"/></button>
      </div>
      <div className="mt-4 overflow-hidden rounded-[8px] border-[#E2E8F0]">
       <div className="px-4 py-2.5 bg-[#F1F5F9] border-b border-[#E2E8F0] text-xs font-medium">Items — qty saja, harga otomatis · {s.customers.find(c=>c.id===s.detailSO!.customerId)?.type}</div>
       {s.detailSO.items.map((it,i)=>{ const p=s.products.find(x=>x.id===it.productId); const u=p?.units.find(x=>x.id===it.unitId); return <div key={i} className="flex justify-between px-4 py-3 text-sm border-t border-[#E2E8F0]"><span className="truncate pr-4">{p?.name} · {it.qty} {u?.name} × {rupiah(it.price)}</span><span className="font-mono font-medium tabular-nums shrink-0">{rupiah(it.subtotal)}</span></div>})}
       <div className="flex justify-between px-4 py-3 bg-[#334155] text-white font-mono text-sm font-semibold"><span>Total</span><span className="tabular-nums">{rupiah(s.detailSO.total)}</span></div>
      </div>
      <div className="mt-4 flex gap-2">
       <Button className="flex-1" onClick={async()=>{ await exportDetailSOExcel({so: s.detailSO!, customers: s.customers, products: s.products}); s.showToast("Excel SO siap") }}><FileXls size={16} weight="bold"/> Export Excel</Button>
       <Button variant="outline" onClick={()=>{ dlTxt(`${s.detailSO!.soNumber}.txt`, `SO ${s.detailSO!.soNumber}\n`); s.showToast("Cetak SO");}}><Printer size={16} weight="bold"/> Cetak</Button>
      </div>
     </div>
    </div>
   )}
   {/* PART: PO Detail Modal */}
      {s.detailPO && (
    <div className="fixed inset-0 z-40 grid place-items-center p-4 bg-[#334155]/30 backdrop-blur-[4px]" onClick={()=>s.setDetailPO(null)}>
     <div onClick={e=>e.stopPropagation()} className="w-full max-w-[520px] rounded-[12px] border-[#E2E8F0] bg-white p-6">
      <div className="flex items-center justify-between"><div className="font-mono font-semibold">{s.detailPO.poNumber}</div><button onClick={()=>s.setDetailPO(null)} className="size-8 rounded-[6px] border-[#E2E8F0] bg-[#F1F5F9] grid place-items-center"><X size={14} weight="bold"/></button></div>
      <div className="mt-4 space-y-2 text-sm">
       {s.detailPO.items.map((it,i)=>{ const p=s.products.find(x=>x.id===it.productId); const u=p?.units.find(x=>x.id===it.unitId); return <div key={i} className="flex justify-between p-3 rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9]"><span>{p?.name} · {it.qty} {u?.name}</span><span className="font-mono font-medium tabular-nums">{rupiah(it.subtotal)}</span></div>})}
       <div className="flex justify-between font-mono font-semibold p-3 rounded-[8px] bg-[#334155] text-white"><span>Total</span><span className="tabular-nums">{rupiah(s.detailPO.total)}</span></div>
      </div>
      <Button className="w-full mt-4" onClick={()=>s.setDetailPO(null)}>Tutup</Button>
     </div>
    </div>
   )}
   {/* PART: Add/Edit Product Modal — SKU, Kategori, Nama, buyPrice, minStock */}
      {s.addProdOpen && s.editProd && (
    <div className="fixed inset-0 z-40 grid place-items-center p-4 bg-[#334155]/30 backdrop-blur-[4px]" onClick={()=>s.setAddProdOpen(false)}>
     <div onClick={e=>e.stopPropagation()} className="w-full max-w-[520px] rounded-[12px] border-[#E2E8F0] bg-white p-6">
      <div className="text-[15px] font-semibold">{s.products.some(p=>p.id===s.editProd!.id) ? "Edit produk":"Tambah produk baja"}</div>
      <p className="text-xs text-[#475569] mt-1">Input qty saja harga otomatis — atur SKU, nama, buyPrice per basis.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
       <div><Label>SKU</Label><input value={s.editProd.sku} onChange={e=>s.setEditProd({...s.editProd!, sku:e.target.value})} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"/></div>
       <div><Label>Kategori</Label><select value={s.editProd.category} onChange={e=>s.setEditProd({...s.editProd!, category:e.target.value})} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"><option>Besi & Baja</option><option>Semen</option><option>Atap</option><option>Cat</option><option>Agregat</option><option>Bata</option></select></div>
       <div className="col-span-2"><Label>Nama</Label><input value={s.editProd.name} onChange={e=>s.setEditProd({...s.editProd!, name:e.target.value})} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"/></div>
       <div><Label>Harga beli / basis</Label><input value={String(s.editProd.buyPrice)} onChange={e=>s.setEditProd({...s.editProd!, buyPrice: Number(e.target.value)||0})} inputMode="numeric" className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"/></div>
       <div><Label>Min stok</Label><input value={String(s.editProd.minStock)} onChange={e=>s.setEditProd({...s.editProd!, minStock: Number(e.target.value)||0})} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"/></div>
      </div>
      <div className="mt-6 flex gap-2"><Button className="flex-1" onClick={handleAddProduct}>Simpan</Button><Button variant="outline" onClick={()=>s.setAddProdOpen(false)}>Batal</Button></div>
     </div>
    </div>
   )}
   {/* PART: Add Customer Modal — Nama, Telepon, Tipe, Limit */}
      {s.addCustOpen && (
    <div className="fixed inset-0 z-40 grid place-items-center p-4 bg-[#334155]/30 backdrop-blur-[4px]" onClick={()=>s.setAddCustOpen(false)}>
     <div onClick={e=>e.stopPropagation()} className="w-full max-w-[420px] rounded-[12px] border-[#E2E8F0] bg-white p-6">
      <div className="text-[15px] font-semibold">Tambah pelanggan</div>
      <div className="mt-4 space-y-3">
       <div><Label>Nama</Label><input value={s.addCust.name} onChange={e=>s.setAddCust({...s.addCust, name:e.target.value})} placeholder="CV / PT / Toko" className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none placeholder:text-[#475569]"/></div>
       <div><Label>Telepon</Label><input value={s.addCust.phone} onChange={e=>s.setAddCust({...s.addCust, phone:e.target.value})} placeholder="0812 ..." className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none placeholder:text-[#475569]"/></div>
       <div className="grid grid-cols-2 gap-3"><div><Label>Tipe</Label><select value={s.addCust.type} onChange={e=>s.setAddCust({...s.addCust, type:e.target.value})} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"><option>Retail</option><option>Tukang</option><option>Reseller</option><option>Proyek</option></select></div><div><Label>Credit limit</Label><input value={s.addCust.limit} onChange={e=>s.setAddCust({...s.addCust, limit:e.target.value})} inputMode="numeric" className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"/></div></div>
       <div className="flex gap-2"><Button className="flex-1" onClick={handleAddCustomer}>Simpan</Button><Button variant="outline" onClick={()=>s.setAddCustOpen(false)}>Batal</Button></div>
      </div>
     </div>
    </div>
   )}
   {/* PART: Override Finance Modal — PIN 6-digit + alasan audit, buat SO override */}
      {s.overrideOpen && (
    <div className="fixed inset-0 z-40 grid place-items-center p-4 bg-[#334155]/30 backdrop-blur-[4px]" onClick={()=>s.setOverrideOpen(false)}>
     <div onClick={e=>e.stopPropagation()} className="w-full max-w-[420px] rounded-[12px] border-[#E2E8F0] bg-white p-6">
      <div className="flex items-start gap-3">
       <div className="size-9 rounded-[6px] bg-[#FBF3DB] border-[#E2E8F0] text-[#956400] grid place-items-center shrink-0"><Lock size={18} weight="bold"/></div>
       <div className="flex-1">
        <div className="text-[14px] font-semibold">Override Finance Manager</div>
        <div className="text-xs text-[#475569] mt-1">Pelanggan <span className="font-medium text-[#334155]">{selectedCustomer.name}</span> terblokir. PIN 6 digit + alasan audit trail.</div>
       </div>
      </div>
      <div className="mt-4 space-y-3">
       <div><Label>PIN 6 digit</Label><input value={s.pin} onChange={e=>s.setPin(e.target.value)} placeholder="••••••" inputMode="numeric" maxLength={6} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none tracking-[0.2em] font-mono"/></div>
       <div><Label>Alasan override</Label><input placeholder="Misal: janji bayar H+2, ada PO proyek" className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none placeholder:text-[#475569]"/></div>
       <div className="flex gap-2">
        <Button className="flex-1" onClick={()=>{
         if(s.pin.length===6){
          const soNumber = `SO-2409-${String(s.soList.length+13).padStart(3,"0")}`
          const so = { id:`so${Date.now()}`, soNumber, customerId:s.newSO.customerId, salesperson:"Kasir-01 (override)", date:"2026-09-16", status:"Approved", items:[{ productId:s.newSO.productId, unitId:s.newSO.unitId, qty:soQty, price:autoSellPrice, subtotal: soSubtotal }], total:soSubtotal } as any
          s.setSoList(v=>[so, ...v]); s.setDoList(v=> [{id:`do${Date.now()}`, doNumber:`DO-${soNumber.slice(3)}`, soId: so.id, driver:"-", vehicle:"-", status:"Scheduled"}, ...v]); s.setOverrideOpen(false); s.setPin(""); s.showToast("Override disetujui — SO diterbitkan")
         } else s.showToast("PIN harus 6 digit")
        }}>Approve dan terbitkan</Button>
        <Button variant="outline" onClick={()=>s.setOverrideOpen(false)}>Batal</Button>
       </div>
       <div className="text-xs text-[#475569] text-center">PIN salah 3× akan lock 15 menit.</div>
      </div>
     </div>
    </div>
   )}
  </>
 )
}
