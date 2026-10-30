// @ts-nocheck
// PART: FILE invoice.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useEffect } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, Button, TableShell, TableToolbar } from "@/components/ui"
import { BarChart } from "@/components/charts"
import { rupiah } from "@/lib/utils"
import { exportDJPExcel } from "@/lib/excel"
import { QrCode, CheckCircle, Printer, FileXls, Receipt } from "@phosphor-icons/react"

function dlTxt(name:string, content:string){
 const blob=new Blob([content],{type:"text/plain;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function InvoiceFeature(){
 const s = useStore()
 const root = useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const els = root.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((es)=> es.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold:0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])
 // PART: Aging Piutang vs Tertagih — Unpaid/Overdue/Paid
  const aging = [
  {label:"Unpaid", value: s.invList.filter(i=>i.status==="Unpaid").reduce((a:any,x:any)=>a+x.total,0)/1000},
  {label:"Overdue", value: s.invList.filter(i=>i.status==="Overdue").reduce((a:any,x:any)=>a+x.total,0)/1000},
  {label:"Paid", value: 18200000/1000},
 ]
 return (
  <div ref={root} className="w-full max-w-none mx-0 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-full overflow-x-clip">
   <section className="reveal relative overflow-hidden rounded-[12px] border-[#E2E8F0] bg-white">
    <div className="absolute inset-0 pointer-events-none" style={{background:"radial-gradient(at 24% 18%, rgba(120,90,40,0.04) 0, transparent 50%), radial-gradient(at 88% 70%, rgba(31,108,159,0.03) 0, transparent 45%)"}}/>
    <img src="https://picsum.photos/seed/invoice-doc/1400/520" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.035] grayscale" aria-hidden/>
    <div className="relative grid lg:grid-cols-12 max-w-full gap-8 p-8 lg:p-10 items-end">
     <div className="lg:col-span-7 min-w-0">
      <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs tracking-[0.06em] uppercase font-medium text-[#475569]">Invoice · AR · e-Faktur DJP</span>
      <h1 className="mt-3 font-serif text-[36px] md:text-[44px] tracking-[-0.03em] leading-none text-balance">Piutang <span className="font-medium">terkendali.</span> Faktur rapi.</h1>
     </div>
     <div className="lg:col-span-5 flex flex-wrap gap-2 justify-start lg:justify-end">
      <Button variant="outline" onClick={async()=>{ await exportDJPExcel({invList:s.invList, customers:s.customers}); s.showToast("Excel DJP siap") }}><FileXls size={16} weight="bold"/> Export Excel DJP</Button>
      <Button onClick={()=>s.showToast("Kirim PJAP Host-to-Host — QR diterima")}><QrCode size={16} weight="bold"/> Kirim PJAP</Button>
     </div>
    </div>
   </section>

   {/* PART: Cards — BarChart Aging + PPN 11 persen Infografis (Harga jual/DPP/PPN) */}
    <div className="reveal grid max-w-full min-w-0 lg:grid-cols-12 min-w-0 gap-6">
    <Card className="lg:col-span-7 p-6">
     <div className="flex items-center justify-between">
      <div className="text-sm font-medium">Aging piutang vs tertagih</div>
      <span className="text-xs px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-[#475569]">{s.invList.length} faktur</span>
     </div>
     <div className="mt-4"><BarChart data={aging} color="#334155"/></div>
     <div className="mt-4 overflow-hidden rounded-[8px] border-[#E2E8F0] hidden md:block"><img src="https://picsum.photos/seed/aging-doc/720/160" alt="" className="w-full h-20 object-cover grayscale opacity-60" /></div>
     <p className="mt-3 text-xs leading-relaxed text-[#475569]">Tombol <span className="font-medium text-[#334155]">Bayar</span> memindahkan faktur ke Paid — angka aging di atas ikut hidup.</p>
    </Card>
    <Card className="lg:col-span-5 p-6">
     <div className="text-sm font-medium">PPN 11% efektif</div>
     <p className="text-xs text-[#475569] mt-1">Infografis akuntansi yang sebenarnya dibaca — tanpa gradien neon.</p>
     <div className="mt-4 rounded-[8px] border-[#E2E8F0] overflow-hidden">
      <div className="grid grid-cols-3 text-xs font-mono tabular-nums">
       <div className="px-4 py-4 bg-[#F1F5F9] border-r border-[#E2E8F0]"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Harga jual</div><div className="font-semibold mt-1">10.000.000</div></div>
       <div className="px-4 py-4 bg-white border-r border-[#E2E8F0]"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">DPP LN 11/12</div><div className="font-semibold mt-1">9.166.667</div></div>
       <div className="px-4 py-4 bg-[#EDF3EC]"><div className="text-xs tracking-[0.06em] uppercase text-[#475569]">PPN 12%</div><div className="font-semibold mt-1 text-[#346538]">1.100.000</div></div>
      </div>
      <div className="px-4 py-3 bg-[#334155] text-white flex items-center justify-between text-sm"><span>Total invoice</span><span className="font-mono font-semibold tabular-nums">11.100.000</span></div>
     </div>
     <Button variant="outline" className="w-full mt-4" onClick={async()=>{ await exportDJPExcel({invList:s.invList, customers:s.customers}); s.showToast("Excel e-Faktur siap") }}><FileXls size={16} weight="bold"/> Download Excel e-Faktur</Button>
     <div className="mt-3 text-xs leading-relaxed text-[#475569]">Header tinta · garis halus · angka Rupiah format akuntansi — kebuka cantik di Excel.</div>
    </Card>
   </div>

   {/* PART: Tabel Faktur Penjualan — Invoice/Pelanggan/DPP/PPN/Total/Status */}
    <TableShell toolbar={<TableToolbar icon={<Receipt size={16} weight="bold"/>} title="Faktur penjualan" subtitle="PPN 11% efektif · DJP PJAP" meta={<Badge tone="zinc">{s.invList.length} faktur</Badge>} actions={<span className="hidden sm:inline-flex text-xs font-mono px-2.5 py-1 rounded-full bg-white border border-[#E2E8F0] text-[#475569] shadow-sm">GUD-01</span>} />} >
     <div className="hidden lg:block">
      <table className="w-full text-sm border-collapse">
       <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <tr className="text-left"><th className="px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Invoice</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Pelanggan</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">DPP</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">DPP Lain</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">PPN</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Total</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Status</th><th className="px-4 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Aksi</th></tr>
       </thead>
       <tbody className="divide-y divide-[#F1F5F9]">
        {s.invList.length===0 ? (
         <tr><td colSpan={8} className="px-6 py-12 text-center"><div className="mx-auto max-w-sm rounded-[12px] border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6"><div className="text-sm font-semibold text-[#0F172A]">Belum ada faktur</div><p className="text-xs text-[#475569] mt-1">Faktur dibuat otomatis dari SO yang disetujui.</p></div></td></tr>
        ) : s.invList.map(inv=>{
         const cust = s.customers.find(c=>c.id===inv.customerId)
         const tone = inv.status==="Paid"?"emerald": inv.status==="Overdue"?"red":"amber"
         return (
          <tr key={inv.id} className="group hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/40 transition-colors">
           <td className="px-4 py-4"><a className="font-mono text-xs font-bold tabular-nums tracking-wide cursor-pointer underline" onClick={()=>router.push(`/invoice/${inv.id}`)}>{inv.invNumber}</a><div className="text-xs text-[#64748B] tabular-nums mt-1">Jt {inv.dueDate}</div></td>
           <td className="px-3 py-4"><div className="text-sm font-semibold text-[#0F172A] leading-none truncate max-w-[130px]">{cust?.name}</div><div className="text-xs text-[#64748B] mt-1 truncate max-w-[130px]">{cust?.code}</div></td>
           <td className="px-3 py-4 text-right whitespace-nowrap font-mono text-sm tabular-nums text-[#475569]">{rupiah(inv.dpp)}</td>
           <td className="px-3 py-4 text-right whitespace-nowrap font-mono text-sm tabular-nums text-[#475569]">{rupiah(inv.dppLain)}</td>
           <td className="px-3 py-4 text-right"><span className="inline-flex px-2 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold tabular-nums whitespace-nowrap">{rupiah(inv.ppn)}</span></td>
           <td className="px-3 py-4 text-right whitespace-nowrap"><span className="font-mono text-sm font-bold tabular-nums text-[#0F172A]">{rupiah(inv.total)}</span></td>
           <td className="px-3 py-4"><Badge tone={tone as any}>{inv.status}</Badge></td>
           <td className="px-4 py-4 text-right">
            <div className="flex gap-1 justify-end">
             {inv.status!=="Paid" ? <Button className="h-7 text-xs rounded-full" onClick={()=>{ s.setInvList(v=> v.map(x=> x.id===inv.id? {...x, status:"Paid"}:x)); s.showToast("Invoice ditandai Lunas") }}><CheckCircle size={12} weight="fill"/> Bayar</Button> : <Badge tone="emerald">Lunas</Badge>}
             <button onClick={()=>{ dlTxt(`${inv.invNumber}.txt`, `Invoice ${inv.invNumber}\nPelanggan ${cust?.name}\nDPP ${rupiah(inv.dpp)}\nPPN ${rupiah(inv.ppn)}\nTotal ${rupiah(inv.total)}\n`); s.showToast("Invoice dicetak")}} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-[#0F172A] hover:text-white transition-colors shadow-sm"><Printer size={12} weight="bold"/></button>
            </div>
           </td>
          </tr>
         )
        })}
       </tbody>
      </table>
     </div>
     <div className="lg:hidden divide-y divide-[#F1F5F9]">
      {s.invList.length===0 ? (
        <div className="p-8 text-center"><div className="text-sm font-semibold text-[#0F172A]">Belum ada faktur</div><p className="text-xs text-[#475569] mt-1">Faktur dibuat otomatis dari SO yang disetujui.</p></div>
      ) : s.invList.map(inv=>{
        const cust = s.customers.find(c=>c.id===inv.customerId)
        const tone = inv.status==="Paid"?"emerald": inv.status==="Overdue"?"red":"amber"
        return (
          <div key={inv.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-mono text-xs font-bold tracking-wide">{inv.invNumber}</div><div className="text-xs text-[#64748B] mt-1">Jt {inv.dueDate} · {cust?.name}</div></div>
              <Badge tone={tone as any}>{inv.status}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[10px] border border-[#E2E8F0] bg-white p-2"><div className="text-xs text-[#64748B]">DPP</div><div className="font-mono text-xs font-bold mt-1 break-all">{rupiah(inv.dpp)}</div></div>
              <div className="rounded-[10px] border border-[#E2E8F0] bg-amber-50 p-2"><div className="text-xs text-amber-700">PPN</div><div className="font-mono text-xs font-bold mt-1 break-all">{rupiah(inv.ppn)}</div></div>
              <div className="rounded-[10px] border border-[#0F172A] bg-[#0F172A] text-white p-2"><div className="text-xs opacity-70">Total</div><div className="font-mono text-xs font-bold mt-1 break-all">{rupiah(inv.total)}</div></div>
            </div>
            <div className="flex gap-2">
              {inv.status!=="Paid" ? <Button className="flex-1 h-9 rounded-full text-xs" onClick={()=>{ s.setInvList(v=> v.map(x=> x.id===inv.id? {...x, status:"Paid"}:x)); s.showToast("Invoice ditandai Lunas") }}><CheckCircle size={14} weight="fill"/> Bayar</Button> : <div className="flex-1 flex items-center justify-center"><Badge tone="emerald">Lunas</Badge></div>}
              <button onClick={()=>{ dlTxt(`${inv.invNumber}.txt`, `Invoice ${inv.invNumber}\nPelanggan ${cust?.name}\nDPP ${rupiah(inv.dpp)}\nPPN ${rupiah(inv.ppn)}\nTotal ${rupiah(inv.total)}\n`); s.showToast("Invoice dicetak")}} className="size-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center shadow-sm"><Printer size={14} weight="bold"/></button>
            </div>
          </div>
        )
      })}
     </div>
    </TableShell>
  </div>
 )
}
