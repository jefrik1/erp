// @ts-nocheck
// PART: FILE pengiriman.tsx — lihat DOKUMENTASI.md §6 untuk peta part-by-part
"use client"
import { useRef, useEffect } from "react"
import { useStore } from "@/lib/store"
import { Card, Badge, Button, TableShell, TableToolbar } from "@/components/ui"
import { fmt } from "@/lib/utils"
import { exportDOExcel } from "@/lib/excel"
import { Scales, CheckCircle, Printer, UploadSimple, Signature, FileXls } from "@phosphor-icons/react"

function dlTxt(name:string, content:string){
 const blob=new Blob([content],{type:"text/plain;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function PengirimanFeature(){
 const s = useStore()
 const root = useRef<HTMLDivElement>(null)
 const fileRef = useRef<HTMLInputElement>(null)
 useEffect(()=>{
  const els = root.current?.querySelectorAll(".reveal") ?? []
  const io = new IntersectionObserver((es)=> es.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in") }), {threshold:0.12})
  els.forEach(el=> io.observe(el as Element))
  return ()=> io.disconnect()
 },[])
 // PART: doReadScale — simulasi RS232 jitter +-80kg
  function doReadScale(){
  s.setReading(true)
  setTimeout(()=>{
   const jitter = Math.floor(Math.random()*160)-80
   s.setWeigh(v=>({ tare: Math.max(7000, v.tare + Math.floor(jitter/3)), gross: Math.max(8000, v.gross + jitter) }))
   s.setReading(false); s.showToast("Berat terbaca dari RS232")
  }, 900)
 }
 return (
  <div ref={root} className="w-full max-w-none mx-0 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-full overflow-x-clip">
   <section className="reveal relative overflow-hidden rounded-[12px] border-[#E2E8F0] bg-white">
    <div className="absolute inset-0 opacity-[0.035] grayscale" style={{backgroundImage:"url(https://picsum.photos/seed/truck-doc/1400/320)", backgroundSize:"cover"}}/>
    <div className="absolute inset-0" style={{background:"radial-gradient(at 85% 30%, rgba(120,90,40,0.05) 0, transparent 50%)"}}/>
    <div className="relative flex flex-wrap gap-4 items-end justify-between p-8 lg:p-10">
     <div>
      <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F1F5F9] border-[#E2E8F0] text-xs tracking-[0.06em] uppercase font-medium text-[#475569]">Pengiriman & timbangan</span>
      <h1 className="mt-3 font-serif text-[36px] md:text-[44px] tracking-[-0.03em] leading-none text-balance">Surat jalan <span className="font-medium">presisi.</span> Timbangan bicara.</h1>
     </div>
     <div className="flex gap-2">
      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-[6px] border-[#E2E8F0] bg-[#EDF3EC] text-xs font-medium text-[#346538]"><span className="size-1.5 rounded-full bg-[#346538] animate-pulse"/> Scale Agent — Online · RS232</span>
      <Button variant="outline" onClick={async()=>{ await exportDOExcel({doList:s.doList, soList:s.soList}); s.showToast("Excel DO siap") }}><FileXls size={16} weight="bold"/> Export Excel</Button>
     </div>
    </div>
   </section>

   {/* PART: Tabel Delivery Orders — DO/SO/Supir/Netto/Status */}
    <TableShell toolbar={<TableToolbar icon={<Truck size={16} weight="bold"/>} title="Delivery Orders" subtitle="Surat jalan · timbangan RS232" meta={<span className="text-xs font-mono px-2.5 py-1 rounded-full bg-white border border-[#E2E8F0] text-[#475569] shadow-sm">{s.doList.length} DO</span>} />} >
     <div className="hidden md:block">
      <table className="w-full text-sm border-collapse">
       <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <tr className="text-left"><th className="px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">DO</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">SO</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Supir</th><th className="px-3 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Netto</th><th className="px-3 py-3 text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Status</th><th className="px-4 py-3 text-right text-[11px] font-semibold tracking-widest uppercase text-[#64748B]">Aksi</th></tr>
       </thead>
       <tbody className="divide-y divide-[#F1F5F9]">
        {s.doList.length===0 ? (
         <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="mx-auto max-w-sm rounded-[12px] border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6"><div className="text-sm font-semibold text-[#0F172A]">Belum ada DO</div><p className="text-xs text-[#475569] mt-1">DO dibuat otomatis saat SO diterbitkan.</p></div></td></tr>
        ) : s.doList.map(d=>{
         const so = s.soList.find(x=>x.id===d.soId)
         const tone = d.status==="Delivered"?"emerald": d.status==="In Transit"?"blue": d.status==="Loading"?"amber":"zinc"
         return (
          <tr key={d.id} className="group hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/40 transition-colors">
           <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums tracking-wide"><span className="size-1.5 rounded-full bg-[#0F172A] shrink-0"/>{d.doNumber}</span></td>
           <td className="px-3 py-4"><span className="px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-mono font-medium text-[#475569]">{so?.soNumber}</span></td>
           <td className="px-3 py-4"><div className="text-sm font-medium text-[#0F172A] leading-none truncate max-w-[110px]">{d.driver || "—"}</div><div className="text-xs font-mono text-[#64748B] mt-1 truncate max-w-[110px]">{d.vehicle || "—"}</div></td>
           <td className="px-3 py-4 text-right whitespace-nowrap"><span className={d.netto ? "inline-flex px-2 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold tabular-nums" : "text-xs text-[#94A3B8]"}>{d.netto ? fmt(d.netto)+" kg" : "—"}</span></td>
           <td className="px-3 py-4"><Badge tone={tone as any}>{d.status}</Badge></td>
           <td className="px-4 py-4 text-right">
            <div className="flex gap-1 justify-end">
             <Button className="h-7 text-xs rounded-full px-2.5" onClick={()=>{ const next = d.status==="Scheduled"?"Loading": d.status==="Loading"?"In Transit":"Delivered"; s.setDoList(v=> v.map(x=> x.id===d.id? {...x, status: next as any, driver: "CurrentDriver", vehicle: "VehicleX" }:x)); s.showToast(`DO ${d.doNumber} → ${next}`)}}>Claim</Button>
             <button onClick={()=>{ dlTxt(`${d.doNumber}.txt`, `Surat Jalan ${d.doNumber}\nSO ${so?.soNumber}\nSupir ${d.driver} Kendaraan ${d.vehicle}\nNetto ${d.netto??"-"} kg\nStatus ${d.status}\n`); s.showToast("Surat jalan tercetak")}} className="size-7 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-[#0F172A] hover:text-white transition-colors shadow-sm"><Printer size={12} weight="bold"/></button>
            </div>
           </td>
          </tr>
         )
        })}
       </tbody>
      </table>
     </div>
     <div className="md:hidden divide-y divide-[#F1F5F9]">
      {s.doList.length===0 ? (
        <div className="p-8 text-center"><div className="text-sm font-semibold text-[#0F172A]">Belum ada DO</div><p className="text-xs text-[#475569] mt-1">DO dibuat otomatis saat SO diterbitkan.</p></div>
      ) : s.doList.map(d=>{
        const so = s.soList.find(x=>x.id===d.soId)
        const tone = d.status==="Delivered"?"emerald": d.status==="In Transit"?"blue": d.status==="Loading"?"amber":"zinc"
        return (
          <div key={d.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#0F172A]"/><span className="font-mono text-xs font-bold tracking-wide">{d.doNumber}</span><span className="text-xs text-[#94A3B8]">·</span><span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-mono">{so?.soNumber}</span></div>
              <Badge tone={tone as any}>{d.status}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="text-sm font-semibold text-[#0F172A] truncate">{d.driver || "Supir —"}</div><div className="text-xs font-mono text-[#64748B] truncate">{d.vehicle || "Kendaraan —"}</div></div>
              <span className={d.netto ? "inline-flex px-3 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold shrink-0" : "text-xs text-[#94A3B8] shrink-0"}>{d.netto ? fmt(d.netto)+" kg" : "—"}</span>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 h-9 rounded-full text-xs" onClick={()=>{ const next = d.status==="Scheduled"?"Loading": d.status==="Loading"?"In Transit":"Delivered"; s.setDoList(v=> v.map(x=> x.id===d.id? {...x, status: next as any}:x)); s.showToast(`DO ${d.doNumber} → ${next}`)}}>Next: {d.status==="Scheduled"?"Loading": d.status==="Loading"?"In Transit":"Delivered"}</Button>
              <button onClick={()=>{ dlTxt(`${d.doNumber}.txt`, `Surat Jalan ${d.doNumber}\nSO ${so?.soNumber}\nSupir ${d.driver} Kendaraan ${d.vehicle}\nNetto ${d.netto??"-"} kg\nStatus ${d.status}\n`); s.showToast("Surat jalan tercetak")}} className="size-9 rounded-full bg-white border border-[#E2E8F0] grid place-items-center shadow-sm"><Printer size={14} weight="bold"/></button>
            </div>
          </div>
        )
      })}
     </div>
    </TableShell>

   {/* PART: Bawah — Weighbridge Tare/Gross/Netto + POD foto dan tanda tangan */}
    <div className="grid lg:grid-cols-12 gap-6 reveal">
    <Card className="lg:col-span-7 p-6">
     <div className="text-sm font-medium flex items-center gap-2"><span className="size-7 rounded-[6px] bg-[#334155] text-white grid place-items-center"><Scales size={14} weight="bold"/></span> Integrasi timbangan digital</div>
     <p className="mt-1 text-xs leading-relaxed text-[#475569]">Middleware lokal http://localhost:8080/api/v1/scale/read — RS232, RS485, TCP/IP, USB. Netto otomatis Gross − Tare.</p>
     <div className="mt-5 grid grid-cols-3 gap-3">
      <div className="rounded-[8px] border-[#E2E8F0] bg-white p-4 text-center">
       <div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Tare</div>
       <div className="text-xl font-mono font-semibold tabular-nums mt-1">{fmt(s.weigh.tare)}</div>
       <div className="text-xs text-[#475569]">kg · kosong</div>
       <Button variant="outline" className="w-full mt-3" onClick={doReadScale}>{s.reading?"Membaca...":"Timbang tare"}</Button>
      </div>
      <div className="rounded-[8px] border-[#E2E8F0] bg-white p-4 text-center">
       <div className="text-xs tracking-[0.06em] uppercase text-[#475569]">Gross</div>
       <div className="text-xl font-mono font-semibold tabular-nums mt-1">{fmt(s.weigh.gross)}</div>
       <div className="text-xs text-[#475569]">kg · isi</div>
       <Button variant="outline" className="w-full mt-3" onClick={doReadScale}>{s.reading?"Membaca...":"Timbang gross"}</Button>
      </div>
      <div className="rounded-[8px] border-[#E2E8F0] bg-[#EDF3EC] p-4 text-center">
       <div className="text-xs tracking-[0.06em] uppercase text-[#346538]">Netto</div>
       <div className="text-2xl font-mono font-semibold tabular-nums mt-1 text-[#334155]">{fmt(s.weigh.gross - s.weigh.tare)}</div>
       <div className="text-xs text-[#475569]">kg · otomatis</div>
       <div className="mt-3 text-xs font-mono px-2 py-1 rounded-[4px] bg-white border-[#E2E8F0] inline-flex">Gross − Tare</div>
      </div>
     </div>
     <div className="mt-4 rounded-[6px] border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2.5 flex items-center gap-2 text-xs font-mono tabular-nums"><span className="size-2 rounded-full bg-[#346538] animate-pulse"/> WebSocket connected · {s.weigh.gross - s.weigh.tare} kg</div>
     <div className="mt-4 flex gap-2">
      <Button className="flex-1" onClick={()=>{ s.setDoList(v=> v.map(d=> d.id==="do1" ? {...d, tare: s.weigh.tare, gross: s.weigh.gross, netto: s.weigh.gross-s.weigh.tare, status: "In Transit"} : d)); s.showToast("Netto disimpan ke DO-2409-011")}}>Simpan ke DO-2409-011</Button>
      <Button variant="outline" onClick={()=>{ dlTxt("surat-jalan-DO-2409-011.txt", `SURAT JALAN DO-2409-011\nTare ${s.weigh.tare} kg\nGross ${s.weigh.gross} kg\nNetto ${s.weigh.gross-s.weigh.tare} kg\n`); s.showToast("Surat jalan tercetak")}}><Printer size={16} weight="bold"/> Cetak</Button>
     </div>
    </Card>
    <Card className="lg:col-span-5 p-6">
     <div className="text-sm font-medium">Proof of Delivery</div>
     <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={()=>s.showToast("Foto POD terupload")}/>
     <div className="mt-3 rounded-[8px] border-dashed border-[#E2E8F0] bg-[#F1F5F9] p-3">
      <img src="https://picsum.photos/seed/pod/640/360" alt="" className="w-full h-[160px] object-cover rounded-[8px] border-[#E2E8F0] grayscale opacity-70" />
      <div className="p-3">
       <div className="text-sm font-medium">POD foto & tanda tangan</div>
       <p className="text-xs leading-relaxed text-[#475569] mt-1">Driver upload foto bongkar + tanda tangan penerima. Status jadi Delivered + timestamp.</p>
       <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EDF3EC] border-[#E2E8F0] text-xs text-[#346538]"><CheckCircle size={14} weight="fill"/> Delivered 14:31 WIB</div>
      </div>
     </div>
     <div className="mt-3 flex gap-2">
      <Button variant="outline" className="flex-1" onClick={()=>fileRef.current?.click()}><UploadSimple size={16} weight="bold"/> Upload POD</Button>
      <Button variant="outline" onClick={()=>s.showToast("Tanda tangan dibuka")}><Signature size={16} weight="bold"/> Tanda tangan</Button>
     </div>
     <div className="mt-3 flex gap-2">
      <Button className="flex-1" onClick={()=>{ s.setDoList(v=> v.map(d=> d.id==="do1"? {...d, status:"Delivered"}:d)); s.showToast("DO ditandai Delivered")}}><CheckCircle size={16} weight="bold"/> Tandai delivered</Button>
      <Button variant="outline" onClick={()=>s.showToast("POD dikirim")}>Kirim POD</Button>
     </div>
    </Card>
   </div>
  </div>
 )
}
