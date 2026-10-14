// @ts-nocheck
// PART: FILE dashboard.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useMemo, useEffect } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, KpiCard, Eyebrow, Button, TableShell, TableToolbar } from "@/components/ui"
import { AreaChart, BarChart, Donut, MiniBars } from "@/components/charts"
import { rupiah, cn, fmt } from "@/lib/utils"
import { getAutoSellPrice } from "@/lib/engine"
import { exportStokExcel, exportSalesExcel } from "@/lib/excel"
import { Warning, TrendUp, ArrowRight, QrCode, MagnifyingGlass, X, FileXls } from "@phosphor-icons/react"

export function DashboardFeature(){
 const s = useStore()
 const rootRef = useRef<HTMLDivElement>(null)

 useEffect(()=>{
  const els = rootRef.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((entries)=> entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold: 0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])

 const trendData = useMemo(()=>{
  const pools: Record<string,{labels:string[];values:number[]}> = {
   "7HARI": { labels:["10 Sep","11 Sep","12 Sep","13 Sep","14 Sep","15 Sep","16 Sep"], values:[4200000,7800000,5100000,12215000,2415000,9300000, 5600000] },
   "14HARI": { labels:Array.from({length:14},(_,i)=> `${i+3} Sep`), values: Array.from({length:14},(_,i)=> 3200000 + Math.round(Math.sin(i*0.9)*2800000 + (i%3)*1200000)) },
   "30HARI": { labels:["W1","W2","W3","W4","16 Sep"], values:[18400000,22100000,19800000,26700000, 5600000] },
   "60HARI": { labels:["Jul W4","Agu W1","Agu W2","Agu W3","Agu W4","Sep W2"], values:[28400000,32100000,29800000,36700000,33200000,18200000] },
   "90HARI": { labels:["Jun","Jul","Agu","Sep*"], values:[84200000,92300000,101500000,54200000] },
   "YTD":  { labels:["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep"], values:[64200000,71200000,82300000,78400000,92300000,84200000,92300000,101500000,54200000] },
  }
  const p = (pools as any)[s.range] ?? pools["7HARI"]
  return p.labels.map((l:string,i:number)=>({label:l, value: p.values[i] ?? 0}))
 },[s.range])

 const soQty = Number(s.newSO.qty)||0
 const selectedCustomer = s.customers.find(c=>c.id===s.newSO.customerId) ?? s.customers[1]
 const selectedProduct = s.products.find(p=>p.id===s.newSO.productId) ?? s.products[0]
 const autoSellPrice = getAutoSellPrice(selectedProduct, s.newSO.unitId, selectedCustomer.type as any)
 const soTotalPreview = soQty * autoSellPrice
  // PART: Grafik Penjualan — AreaChart poolsOverride (live dari SO)
  const poolsOverride = useMemo(()=>{
  const base = trendData.map((d:any)=>d.value)
  if(soTotalPreview>0) base[base.length-1] += soTotalPreview*0.35
  return trendData.map((d:any,i:number)=>({label:d.label, value: base[i]}))
 },[trendData, soTotalPreview])

  // PART: Top Produk Penjualan (aggregasi SO)
  const topProducts = useMemo(()=>{
  const map:Record<string,number>={}
  s.soList.forEach(so=> so.items.forEach(it=>{ const p=s.products.find(x=>x.id===it.productId); const k=p? p.name : it.productId; map[k]=(map[k]||0)+ it.qty*it.price }))
  const arr = Object.entries(map).map(([label,value])=>({label, value})).sort((a,b)=>b.value-a.value).slice(0,5)
  return arr.length? arr : [{label:"Besi Beton 12mm", value: 9450000},{label:"Hollow Galvanis", value: 6120000},{label:"Baja WF 150", value: 4240000},{label:"Semen Tiga Roda", value: 11430000},{label:"Wiremesh M8", value: 2725000}]
 },[s.soList,s.products])
  // PART: Donut Kategori Produk
  const catDonut = useMemo(()=>{
  const cats:Record<string,number>={}
  s.products.forEach(p=> cats[p.category]=(cats[p.category]||0)+1)
  const colors=["#334155","#346538","#1F6C9F","#956400","#475569"]
  return Object.entries(cats).map(([label,value],i)=>({label,value,color:colors[i%colors.length]}))
 },[s.products])
  // PART: MiniBars Stok 6 produk pertama
  const stockBars = useMemo(()=> s.products.slice(0,6).map(p=> s.calcStock(p.id)),[s.products,s.ledger])
  // PART: Aging Piutang — 3 bucket Lancar/1-7/>7
  const piutangAging = useMemo(()=>[
    {label:"Lancar", value: s.customers.filter(c=>c.overdueDays===0).reduce((a,c)=>a+c.balance,0)},
  {label:"1-7 hari", value: s.customers.filter(c=>c.overdueDays>0 && c.overdueDays<=7).reduce((a,c)=>a+c.balance,0)},
  {label:">7 hari", value: s.customers.filter(c=>c.overdueDays>7).reduce((a,c)=>a+c.balance,0)},
 ],[s.customers])

 return (
  <div ref={rootRef} className="w-full max-w-none mx-0">
   <section className="reveal relative overflow-hidden rounded-[12px] border-[#E2E8F0] bg-white">
    <div className="absolute inset-0 pointer-events-none" style={{background: "radial-gradient(at 20% 10%, rgba(120,90,40,0.04) 0, transparent 50%), radial-gradient(at 90% 80%, rgba(160,130,90,0.03) 0, transparent 45%)"}}/>
    <img src="https://picsum.photos/seed/steel-doc/1400/520" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.04] grayscale" aria-hidden/>
    <div className="relative grid lg:grid-cols-12 max-w-full gap-8 p-6 sm:p-8 lg:p-12 min-w-0">
     <div className="lg:col-span-7 min-w-0">
      <Eyebrow>GUD-01 · Gudang Pusat Cibitung — Live</Eyebrow>
      <h1 className="mt-4 font-serif text-[28px] sm:text-[36px] lg:text-[44px] tracking-[-0.03em] leading-none text-[#334155] text-balance break-words [overflow-wrap:anywhere]">Ringkasan <span className="font-medium">operasional</span></h1>
      {s.q && <div className="mt-4 inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-[6px] border-[#E2E8F0] bg-[#F1F5F9] text-sm max-w-full flex-wrap"><MagnifyingGlass size={14} weight="bold"/> <span className="truncate">Hasil “{s.q}” — {s.filteredProducts.length + s.filteredSO.length} cocok</span> <button onClick={()=>s.setQ("")} className="ml-1 size-6 rounded-[4px] bg-[#334155] text-white grid place-items-center shrink-0"><X size={10} weight="bold"/></button></div>}
      {s.blockedCustomers.length>0 && (
       <div className="mt-6 flex items-start gap-3 p-3 rounded-[8px] border-[#E2E8F0] bg-[#FDEBEC] min-w-0 overflow-hidden">
        <span className="size-7 rounded-[6px] bg-white border-[#E2E8F0] grid place-items-center shrink-0"><Warning size={14} weight="fill" className="text-[#9F2F2D]"/></span>
        <div className="text-sm leading-relaxed min-w-0 flex-1 break-words [overflow-wrap:anywhere]"><span className="font-semibold">{s.blockedCustomers.length} pelanggan terblokir</span> — melebihi limit atau overdue &gt;7 hari. Surat jalan ditahan. <button onClick={()=>s.setActive("pelanggan")} className="underline decoration-[#9F2F2D]/30 underline-offset-4 font-medium">Tinjau</button></div>
        <Badge tone="red">{s.customers.filter(c=>c.overdueDays>7).length} overdue</Badge>
       </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
       <Button onClick={()=>s.setActive("penjualan")}>POS qty auto — harga jalan <ArrowRight size={14} weight="bold"/></Button>
       <Button variant="outline" onClick={()=>s.setActive("pembelian")}>Buat PO baja</Button>
      </div>
     </div>
     <div className="lg:col-span-5 min-w-0">
      <div className="rounded-[16px] border-[#E2E8F0] bg-[#F1F5F9] p-4 min-w-0 overflow-hidden">
       <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-semibold tracking-widest uppercase text-[#475569] truncate">Rentang waktu</span>
        <span className="text-xs px-2 py-1 rounded-full bg-[#EDF3EC] text-[#346538] border-transparent font-medium shrink-0">Live dari SO</span>
       </div>
       <div className="mt-3">
        <select value={s.range} onChange={e=>s.setRange(e.target.value as any)} className="w-full h-9 px-3 rounded-[6px] border-[#E2E8F0] bg-white text-sm outline-none focus:border-[#334155] min-w-0">
         {(Object.keys(s.RANGE_LABEL) as Array<keyof typeof s.RANGE_LABEL>).map(k=> <option key={k} value={k}>{s.RANGE_LABEL[k]}</option>)}
        </select>
       </div>
       <div className="mt-4 grid grid-cols-3 gap-2 text-center min-w-0">
        <div className="rounded-[8px] border-[#E2E8F0] bg-white p-2 sm:p-3 min-w-0 overflow-hidden"><div className="text-xs tracking-widest uppercase text-[#475569] truncate">Hari ini</div><div className="font-mono text-xs font-bold mt-1 tabular-nums break-all [overflow-wrap:anywhere] leading-none">{rupiah(poolsOverride[poolsOverride.length-1].value)}</div></div>
        <div className="rounded-[8px] border-[#E2E8F0] bg-white p-2 sm:p-3 min-w-0 overflow-hidden"><div className="text-xs tracking-widest uppercase text-[#475569] truncate">Rata-rata</div><div className="font-mono text-xs font-bold mt-1 tabular-nums break-all [overflow-wrap:anywhere] leading-none">{rupiah(Math.round(poolsOverride.reduce((a:any,d:any)=>a+d.value,0)/poolsOverride.length))}</div></div>
        <div className="rounded-[8px] bg-[#334155] text-white p-2 sm:p-3 min-w-0 overflow-hidden"><div className="text-xs tracking-widest uppercase opacity-60 truncate">Total SO</div><div className="font-mono text-xs font-bold mt-1 tabular-nums break-all leading-none">{s.soList.length} trx</div></div>
       </div>
       <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={async()=>{ await exportSalesExcel({soList:s.soList, customers:s.customers}); s.showToast("Excel SO siap") }}>Excel <FileXls size={14} weight="bold"/></Button>
        <span className="text-xs text-[#475569] self-center">{s.ledger.length} entri ledger</span>
       </div>
      </div>
     </div>
    </div>
   </section>

   <section className="reveal mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-fr">
    <div className="h-full">
     <KpiCard label="Total SKU aktif" value={`${s.products.length} SKU`} sub="Baja · Hollow · WF · Wiremesh — per meter · basis GUD-01" accent={s.lowStockCount? "46%":"100%"} action={<><MiniBars data={stockBars} /><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={()=>s.setActive("produk")}>Lihat stok</Button><Button variant="outline" onClick={async()=>{ await exportStokExcel({products:s.products, calcStock:s.calcStock}); s.showToast("Excel stok siap") }}><FileXls size={14} weight="bold"/> Excel</Button></div><div className="mt-3 text-xs text-[#475569]">{s.lowStockCount} kritis · {s.bins.length} bin · <span className="px-1.5 py-0.5 rounded-[4px] bg-[#FEF3C7] text-[#92400E] text-xs font-medium border-[#FDE68A]">{s.lowStockCount ? "Perlu PO":"Aman"}</span></div></>} />
    </div>
    <div className="bg-white border-[#E2E8F0] rounded-[16px] p-6 lg:p-7 h-full flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
     <div className="flex items-start justify-between gap-4 min-w-0">
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#475569]"><span className="size-1.5 rounded-full bg-[#0EA5E9]"/>Piutang berjalan</div><div className="font-mono text-[22px] sm:text-[24px] font-bold tracking-tight tabular-nums leading-none mt-3 break-all [overflow-wrap:anywhere] text-[#0F172A]">{rupiah(s.customers.reduce((a:any,c:any)=>a+c.balance,0))}</div><p className="text-xs text-[#475569] mt-2">Aging terkonsolidasi — arahkan kursor ke bar untuk nilai.</p></div>
      <span className="size-9 rounded-[10px] bg-[#F1F5F9] border-[#E2E8F0] grid place-items-center shrink-0 text-[#334155]"><TrendUp size={18} weight="bold"/></span>
     </div>
     <div className="mt-auto pt-6"><BarChart data={piutangAging.map(d=>({label:d.label, value: d.value/1000}))} color="#0F172A"/></div>
    </div>
    <div className="bg-white border-[#E2E8F0] rounded-[16px] p-6 lg:p-7 h-full flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
     <div className="flex items-start justify-between"><div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#475569]"><span className="size-1.5 rounded-full bg-[#334155]"/>PO pembelian</div><span className="text-xs font-mono px-2 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-[#475569]">{s.poList.length} PO</span></div>
     <div className="text-[34px] font-bold tracking-tight tabular-nums leading-none mt-4 text-[#0F172A]">{s.poList.length} <span className="text-sm font-semibold text-[#475569] tracking-wide">PO</span></div>
     <p className="text-xs text-[#475569] mt-2 leading-relaxed">{s.pendingPO} menunggu terima · {s.poList.filter(p=>p.status==="Received").length} sudah masuk stok</p>
     <div className="mt-5 h-2 rounded-full bg-[#F1F5F9] border-[#E2E8F0] p-1"><div className="h-full rounded-full bg-[#0F172A]" style={{width: s.pendingPO? "62%":"18%"}}/></div>
     <Button className="mt-auto w-full" onClick={()=>s.setActive("pembelian")}>Kelola PO <ArrowRight size={14} weight="bold"/></Button>
    </div>
    <div className="bg-[#0F172A] text-white rounded-[16px] p-6 lg:p-7 h-full border-[#0F172A] relative overflow-hidden flex flex-col shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
     <div className="absolute inset-0 opacity-[0.06]" style={{backgroundImage:"radial-gradient(#fff 1px, transparent 1px)", backgroundSize:"18px 18px"}}/>
     <div className="absolute -right-10 -top-10 size-32 rounded-full bg-white/5 blur-2xl"/>
     <div className="relative flex items-center justify-between"><span className="px-2.5 py-1 rounded-full bg-white/10 border-white/15 text-xs tracking-widest uppercase font-semibold">PPN Efektif</span><span className="size-9 rounded-[10px] bg-white text-[#0F172A] grid place-items-center"><QrCode size={18} weight="bold"/></span></div>
     <div className="relative mt-5 flex items-baseline gap-3"><span className="font-serif text-[42px] font-bold tracking-tight leading-none">11%</span><span className="text-sm text-white/70 font-medium">dari harga jual</span></div>
     <p className="relative text-xs text-white/60 mt-2 leading-relaxed">12% × DPP Nilai Lain 11/12 — sesuai PMK terbaru.</p>
     <div className="relative mt-auto pt-6 h-2 rounded-full bg-white/10 p-1"><div className="h-full rounded-full bg-white" style={{width:"72%"}}/></div>
     <Button className="relative w-full mt-5 bg-white text-[#0F172A] hover:bg-[#F1F5F9] border-white font-semibold" onClick={()=>s.setActive("invoice")}>Buka e-Faktur <QrCode size={14} weight="bold"/></Button>
    </div>
   </section>

   <section className="reveal mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
    <div className="lg:col-span-8 min-w-0">
     <Card className="p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
       <div><div className="text-sm font-medium">Penjualan — {s.RANGE_LABEL[s.range]}</div><div className="text-xs text-[#475569] mt-1">Arahkan kursor ke titik — tampil harga & tanggal</div></div>
       <Button variant="outline" onClick={async()=>{ await exportSalesExcel({soList:s.soList, customers:s.customers}); s.showToast("Excel SO siap") }}><FileXls size={14} weight="bold"/> Excel</Button>
      </div>
      <div className="mt-6"><AreaChart data={poolsOverride} /></div>
      <div className="mt-6 grid grid-cols-3 gap-3">
       <div className="rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-3"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Hari ini</div><div className="font-mono text-sm font-medium mt-1 tabular-nums">{rupiah(poolsOverride[poolsOverride.length-1].value)}</div></div>
       <div className="rounded-[8px] border-[#E2E8F0] bg-white p-3"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Rata-rata</div><div className="font-mono text-sm font-medium mt-1 tabular-nums">{rupiah(Math.round(poolsOverride.reduce((a:any,d:any)=>a+d.value,0)/poolsOverride.length))}</div></div>
       <div className="rounded-[8px] bg-[#334155] text-white p-3"><div className="text-xs tracking-[0.06em] uppercase opacity-60">Total SO</div><div className="font-mono text-sm font-medium mt-1 tabular-nums">{s.soList.length} trx · {rupiah(s.soList.reduce((a:any,x:any)=>a+x.total,0))}</div></div>
      </div>
     </Card>
    </div>
    <div className="lg:col-span-4 space-y-6">
     <Card className="p-6">
      <div className="text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Kategori produk</div>
      <div className="mt-4"><Donut data={catDonut} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3">
       <div className="rounded-[8px] border-[#E2E8F0] bg-[#FDEBEC] p-3"><div className="text-xs text-[#9F2F2D] font-medium">Stok kritis</div><div className="text-lg font-semibold text-[#9F2F2D]">{s.lowStockCount} <span className="text-xs font-medium">SKU</span></div></div>
       <div className="rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9] p-3"><div className="text-xs text-[#475569]">Gudang aktif</div><div className="text-sm font-semibold">[ GUD-01 ] · {s.bins.length} bin</div></div>
      </div>
     </Card>
     <Card className="p-6">
      <div className="text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Top produk penjualan</div>
      <div className="mt-4"><BarChart data={topProducts} /></div>
      <Button variant="outline" className="mt-4 w-full" onClick={()=>s.setActive("penjualan")}>Buka POS</Button>
     </Card>
    </div>
   </section>

   <section className="reveal mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
    <div className="lg:col-span-5 min-w-0">
     <Card className="p-6">
      <div className="text-xs font-medium tracking-[0.06em] uppercase text-[#475569]">Aging piutang</div>
      <div className="text-xs text-[#475569] mt-1">Klik detail untuk kredit & override.</div>
      <div className="mt-4 space-y-2">
       {piutangAging.map(a=>(
        <div key={a.label} className="flex items-center justify-between p-3 rounded-[8px] border-[#E2E8F0] bg-[#F1F5F9]">
         <span className="text-sm font-medium">{a.label}</span><span className="font-mono text-sm font-medium tabular-nums">{rupiah(a.value)}</span>
         <Button variant="outline" className="h-7 text-xs" onClick={()=>s.setActive("pelanggan")}>Detail</Button>
        </div>
       ))}
      </div>
      <Button className="w-full mt-4" onClick={()=>s.setActive("pelanggan")}>Kelola kredit & override</Button>
     </Card>
    </div>
     <div className="lg:col-span-7 min-w-0">
          <TableShell toolbar={<TableToolbar icon={<span className="text-[11px] font-mono font-bold tracking-widest">≡</span>} title="Ledger stok terbaru" subtitle="GUD-01 · live dari penerimaan & DO" meta={<Badge tone="zinc">{s.ledger.length} entri</Badge>} actions={<Button variant="outline" className="h-8 text-xs rounded-full" onClick={async()=>{ await exportStokExcel({products:s.products, calcStock:s.calcStock}); s.showToast("Excel stok siap") }}><FileXls size={14} weight="bold"/> Excel</Button>} />} >
            <div className="hidden sm:block">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr className="text-left">
                    <th className="px-5 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Waktu</th>
                    <th className="px-5 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Produk</th>
                    <th className="px-5 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Gudang / Bin</th>
                    <th className="px-5 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Qty base</th>
                    <th className="px-5 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {s.ledger.map(l=>{
                    const p=s.products.find(x=>x.id===l.productId)
                    const w=s.warehouses.find(x=>x.id===l.warehouseId)
                    const b=s.bins.find(x=>x.id===l.binId)
                    const isPlus = l.qty>0
                    return (
                      <tr key={l.id} className="group hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/40 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap"><span className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-[#475569]"><span className={`size-1.5 rounded-full ${isPlus?"bg-emerald-500":"bg-rose-400"}`} />{l.createdAt}</span></td>
                        <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-8 rounded-[10px] bg-[#F1F5F9] border border-[#E2E8F0] place-items-center text-[10px] font-mono font-bold text-[#475569]">{p?.sku?.slice(-3) ?? "—"}</span><div><div className="text-sm font-semibold tracking-tight text-[#0F172A] leading-none break-words">{p?.name}</div><div className="text-xs font-mono text-[#64748B] mt-1 break-words">{p?.sku} · {p?.units.find(u=>u.id===l.unitId)?.name}</div></div></div></td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#E2E8F0] text-xs font-mono font-medium shadow-sm">{w?.code}<span className="text-[#CBD5E1]">/</span>{b?.code}</span></td>
                        <td className="px-5 py-4 text-right"><span className={cn("inline-flex items-center justify-end gap-1 font-mono text-sm font-bold tabular-nums px-2.5 py-1 rounded-full border", isPlus ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100")}>{isPlus?"+":""}{fmt(l.qty)}<span className="text-xs font-medium opacity-60">{p?.units.find(u=>u.id===l.unitId)?.name}</span></span></td>
                        <td className="px-5 py-4"><Badge tone="zinc">{l.refType} {l.refId}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden divide-y divide-[#F1F5F9]">
              {s.ledger.map(l=>{
                const p=s.products.find(x=>x.id===l.productId)
                const w=s.warehouses.find(x=>x.id===l.warehouseId)
                const b=s.bins.find(x=>x.id===l.binId)
                const isPlus=l.qty>0
                return (
                  <div key={l.id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#475569]"><span className={`size-1.5 rounded-full ${isPlus?"bg-emerald-500":"bg-rose-400"}`} />{l.createdAt}</span><Badge tone="zinc">{l.refType} {l.refId}</Badge></div>
                    <div className="font-semibold text-sm text-[#0F172A] break-words">{p?.name} <span className="font-mono text-xs text-[#64748B]">· {p?.sku}</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-[#E2E8F0] text-xs font-mono">{w?.code}/{b?.code}</span><span className={cn("inline-flex gap-1 font-mono text-sm font-bold tabular-nums px-2.5 py-1 rounded-full border", isPlus?"bg-emerald-50 text-emerald-700 border-emerald-100":"bg-rose-50 text-rose-700 border-rose-100")}>{isPlus?"+":""}{fmt(l.qty)} {p?.units.find(u=>u.id===l.unitId)?.name}</span></div>
                  </div>
                )
              })}
            </div>
          </TableShell>
        </div>
   </section>
  </div>
 )
}
