// @ts-nocheck
// PART: FILE produk.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useEffect } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, Button, Label } from "@/components/ui"
import { BarChart } from "@/components/charts"
import { rupiah, cn, fmt } from "@/lib/utils"
import { exportStokExcel } from "@/lib/excel"
import { MagnifyingGlass, FileXls, Plus, PencilSimple, Trash, Eye } from "@phosphor-icons/react"

export function ProdukFeature(){
 const s = useStore()
 const root = useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const els = root.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((entries)=> entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold:0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])
 return (
   <div ref={root} className="w-full max-w-none mx-0 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-full overflow-x-clip">
    <section className="reveal flex flex-wrap gap-4 max-w-full overflow-hidden items-end justify-between max-w-full overflow-hidden">
    <div>
     <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs tracking-[0.06em] uppercase font-medium text-[#475569]">Produk & Stok — GUD-01</span>
     <h1 className="mt-3 font-serif text-[36px] md:text-[44px] tracking-[-0.03em] leading-none text-balance">Stok presisi <span className="font-medium">per meter.</span></h1>
    </div>
    <div className="flex gap-2 w-full lg:w-auto">
     <div className="flex-1 lg:w-[320px] flex items-center gap-2 h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white"><MagnifyingGlass size={16} weight="bold" className="text-[#475569]"/><input value={s.q} onChange={e=>s.setQ(e.target.value)} placeholder="Cari SKU atau nama" className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#475569]"/></div>
     <select value={s.prodCat} onChange={e=>s.setProdCat(e.target.value)} className="h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none"><option value="all">Semua kategori</option><option value="Besi & Baja">Besi & Baja</option><option value="Semen">Semen</option><option value="Atap">Atap</option><option value="Cat">Cat</option><option value="Agregat">Agregat</option></select>
     <Button variant="outline" onClick={async()=>{ await exportStokExcel({products:s.products, calcStock:s.calcStock}); s.showToast("Excel stok siap") }}><FileXls size={16} weight="bold"/> Excel</Button>
     <Button onClick={()=>{ s.setEditProd({ id:`p${Date.now()}`, sku:`SKU-${String(s.products.length+1).padStart(3,"0")}`, name:"Produk Baja Baru", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:40, buyPrice:10000, units:[{id:`u${Date.now()}`, name:"Meter", factor:1, isBase:true},{id:`u${Date.now()+1}`, name:"Batang", factor:6, isBase:false}], prices:[{unitId:`u${Date.now()}`, tier:"Retail", price:12750}] } as any); s.setAddProdOpen(true)}}><Plus size={16} weight="bold"/> Tambah</Button>
    </div>
   </section>

   {/* PART: BarChart Stok per Produk — basis Meter/M2 */}
    <Card className="p-6 reveal">
    <div className="flex items-center justify-between flex-wrap gap-3"><div className="text-sm font-medium">Stok per produk — basis Meter / M2</div><span className="text-xs text-[#475569]">{s.filteredProducts.length} produk · <button onClick={()=>{ s.setQ(""); s.setProdCat("all"); s.showToast("Filter direset")}} className="underline decoration-[#E2E8F0] underline-offset-4">Reset</button></span></div>
    <div className="mt-4"><BarChart data={s.filteredProducts.slice(0,6).map(p=>({label:p.sku, value: s.calcStock(p.id)}))} color="#334155"/></div>
   </Card>

   <div className="grid lg:grid-cols-12 gap-6 min-w-0">
    <div className="lg:col-span-8 space-y-4">
     {s.filteredProducts.length===0 ? (
      <Card className="p-10 text-center reveal"><div className="text-sm font-medium">Tidak ada produk</div><p className="text-xs text-[#475569] mt-1">Coba ubah kata kunci atau kategori.</p></Card>
     ) : // PART: Kartu Produk — loop SKU, stok basis, konversi, harga tier, lokasi rak
      s.filteredProducts.map((p,i)=> {
      const stock = s.calcStock(p.id)
      const base = p.units.find(u=>u.isBase)
      return (
       <Card key={p.id} className="p-6 reveal overflow-hidden relative" style={{"--index": i} as any}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{backgroundImage:`url(https://picsum.photos/seed/${p.sku}/800/400)`, backgroundSize:"cover"}}/>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
         <div>
          <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs px-2 py-1 rounded-[4px] bg-[#334155] text-white">{p.sku}</span><Badge tone={p.isDimension?"blue":"zinc"}>{p.isDimension ? `Dimensi ${p.dimensionUnit}` : "Satuan"}</Badge><span className="text-xs text-[#475569]">{p.category}</span></div>
          <div className="mt-2 font-serif text-[18px] font-medium tracking-tight">{p.name}</div>
          <div className="text-xs text-[#475569] mt-1">Beli {rupiah(p.buyPrice)}/{base?.name} · Jual {rupiah(p.prices[0]?.price ?? p.buyPrice)}/{p.units.find(u=>u.id===p.prices[0]?.unitId)?.name ?? base?.name} · Min {p.minStock} {base?.name}</div>
         </div>
         <div className="text-right"><div className={cn("text-lg font-mono font-medium tabular-nums", stock<=p.minStock?"text-[#9F2F2D]":"text-[#334155]")}>{fmt(stock)} <span className="text-xs font-sans text-[#475569]">{base?.name}</span></div><div className="text-xs text-[#475569]">stok basis</div>
          <div className="mt-3 flex gap-2 justify-end">
           <Button variant="outline" className="h-8 text-xs" onClick={()=>{ s.setEditProd(p); s.setAddProdOpen(true)}}><PencilSimple size={14} weight="bold"/> Edit</Button>
           <Button variant="outline" className="h-8 text-xs" onClick={()=>{ s.setProducts(v=> v.filter(x=>x.id!==p.id)); s.showToast("Produk dihapus")}}><Trash size={14} weight="bold"/> Hapus</Button>
          </div>
         </div>
        </div>
        <div className="relative mt-5 grid sm:grid-cols-3 gap-3">
         <div className="rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-4">
          <div className="text-xs tracking-[0.06em] uppercase text-[#475569] font-medium">Konversi · basis {base?.name}</div>
          <div className="mt-2 space-y-1.5 text-xs font-mono tabular-nums">
           {p.units.map(u=>(
            <div key={u.id} className="flex items-center justify-between"><span className={cn(u.isBase&&"font-semibold")}>{u.name} {u.isBase?"· basis":""}</span><span className="text-[#475569]">× {u.factor}</span></div>
           ))}
          </div>
         </div>
         <div className="rounded-[8px] border-[#E2E8F0] bg-white p-4">
          <div className="text-xs tracking-[0.06em] uppercase text-[#475569] font-medium">Harga bertingkat</div>
          <div className="mt-2 space-y-1.5 text-xs">
           {p.prices.map((pr,j)=>(
            <div key={j} className="flex justify-between"><span className="text-[#475569]">{pr.tier} · {p.units.find(u=>u.id===pr.unitId)?.name}</span><span className="font-mono font-medium tabular-nums">{rupiah(pr.price)}</span></div>
           ))}
           <div className="flex justify-between pt-2 mt-2 border-t border-[#E2E8F0]"><span className="text-[#475569]">Harga beli</span><span className="font-mono tabular-nums">{rupiah(p.buyPrice)}/{base?.name}</span></div>
          </div>
         </div>
         <div className="rounded-[8px] border-[#E2E8F0] bg-white p-4">
          <div className="text-xs tracking-[0.06em] uppercase text-[#475569] font-medium">Lokasi rak — GUD-01</div>
          <div className="mt-2 space-y-1 text-xs font-mono">
           {s.bins.slice(0,3).map(b=>{
            const w = s.warehouses.find(x=>x.id===b.warehouseId)
            return <div key={b.id} className="flex justify-between"><span>{b.code}</span><span className="text-[#475569]">{w?.code}</span></div>
           })}
          </div>
          <Button variant="outline" className="w-full mt-4 h-8 text-xs" onClick={()=>s.showToast(`Bin ${p.sku}: ${s.bins.length} lokasi di GUD-01`)}><Eye size={14} weight="bold"/> Lihat rak</Button>
         </div>
        </div>
       </Card>
      )
     })}
    </div>
    <div className="lg:col-span-4 space-y-4 reveal">
     <Card className="p-6">
      <div className="text-sm font-medium">Gudang aktif — tunggal</div>
      <p className="text-xs text-[#475569] mt-1">Satu gudang pusat, semua stok terpusat.</p>
      <div className="mt-4 space-y-3">
       {s.warehouses.map(w=>(
        <div key={w.id} className="flex items-center gap-3 p-3 rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9]">
         <div className="size-8 rounded-[6px] bg-[#334155] text-white grid place-items-center font-mono text-xs">{w.code.split("-")[1]}</div>
         <div className="text-sm leading-none"><div className="font-medium">{w.name}</div><div className="text-xs text-[#475569] line-clamp-1">{w.address}</div></div>
        </div>
       ))}
      </div>
      <Button variant="outline" className="w-full mt-4" onClick={async()=>{ await exportStokExcel({products:s.products, calcStock:s.calcStock}); s.showToast("Excel stok siap") }}><FileXls size={16} weight="bold"/> Export Excel</Button>
     </Card>
     <div className="rounded-[12px] border-[#E2E8F0] bg-white p-6">
      <div className="text-sm font-medium">Ekspor rapi</div>
      <p className="text-sm leading-relaxed text-[#475569] mt-2">Semua tabel bisa diekspor jadi <span className="font-mono text-[#334155]">.xlsx</span> dengan header tinta, garis halus, zebra, Rupiah akuntansi, filter & cetak rapi.</p>
      <img src="https://picsum.photos/seed/excel-produk/600/220" alt="" className="mt-4 w-full h-28 object-cover rounded-[8px] border-[#E2E8F0] grayscale opacity-80" />
     </div>
    </div>
   </div>
  </div>
 )
}
