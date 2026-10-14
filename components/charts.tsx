// PART: FILE components/charts.tsx — SVG Charts (tanpa lib eksternal): AreaChart, BarChart, MiniBars, Donut — lihat DOKUMENTASI.md §5.3
"use client"
import { useState, useRef } from "react"
import { rupiah } from "@/lib/utils"

// PART: AreaChart — PART: Grafik Penjualan (tren SO), hover tooltip rupiah
export function AreaChart({ data, color="#334155" }: { data:{label:string;value:number}[]; color?:string }){
 const w=640, h=180, padL=36, padR=16, padT=16, padB=28
 const max = Math.max(...data.map(d=>d.value),1)
 const min = Math.min(...data.map(d=>d.value),0)
 const range = max - min || 1
 const stepX = (w - padL - padR) / Math.max(data.length-1,1)
 const pts = data.map((d,i)=> {
  const x = padL + i*stepX
  const y = padT + (h - padT - padB) * (1 - (d.value - min)/range)
  return { x, y, v:d.value, label:d.label }
 })
 const path = pts.map((p,i)=> `${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ")
 const area = `${path} L ${pts[pts.length-1].x} ${h-padB} L ${pts[0].x} ${h-padB} Z`
 const [hover,setHover]=useState<number|null>(null)
 const svgRef=useRef<SVGSVGElement>(null)
 function onMove(e: React.MouseEvent){
  const rect = svgRef.current?.getBoundingClientRect()
  if(!rect) return
  const scaleX = w / rect.width
  const x = (e.clientX - rect.left) * scaleX
  const idx = Math.round((x - padL)/stepX)
  const clamped = Math.max(0, Math.min(data.length-1, idx))
  if(x < padL-10 || x > w - padR + 10) setHover(null)
  else setHover(clamped)
 }
 return (
  <div className="w-full relative select-none" onMouseLeave={()=>setHover(null)}>
   <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="w-full h-[192px] rounded-[8px] bg-white border-[#E2E8F0]" onMouseMove={onMove}>
    {[0,0.5,1].map(t=>{
     const v = min + range*t
     const y = padT + (h - padT - padB) * (1 - t)
     return <g key={t}><line x1={padL} x2={w-padR} y1={y} y2={y} stroke="#E2E8F0" strokeWidth={1} /><text x={8} y={y+3} fontSize={9} fill="#475569" style={{fontFamily:"Geist Mono"}}>{(v/1_000_000).toFixed(1)} JT</text></g>
    })}
    <path d={area} fill={color} opacity={0.06} />
    <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
    {pts.map((p,i)=> <g key={i}><circle cx={p.x} cy={p.y} r={hover===i?4:3} fill={hover===i? color :"white"} stroke={color} strokeWidth={1.4} /><text x={p.x} y={h-8} textAnchor="middle" fontSize={8} fill={hover===i?"#334155":"#475569"} style={{fontFamily:"Geist Mono"}}>{p.label}</text></g>)}
    {hover!==null && <line x1={pts[hover].x} x2={pts[hover].x} y1={padT} y2={h-padB} stroke="#E2E8F0" strokeWidth={1} strokeDasharray="3 3"/>}
   </svg>
   {hover!==null && (
    <div className="pointer-events-none absolute z-10 rounded-[8px] border-[#E2E8F0] bg-white px-3 py-2" style={{ left:`min(calc(${ (pts[hover].x / w)*100}% + 8px), calc(100% - 160px))`, top: 8 }}>
     <div className="text-xs tracking-[0.06em] uppercase text-[#475569] font-mono">{pts[hover].label}</div>
     <div className="text-[13px] font-semibold tracking-tight">{rupiah(pts[hover].v)}</div>
    </div>
   )}
  </div>
 )
}

// PART: BarChart — bar horizontal untuk Aging, Top Produk, Kategori
export function BarChart({ data, color="#334155" }: { data:{label:string;value:number}[]; color?:string }){
 const max = Math.max(...data.map(d=>d.value),1)
 return (
  <div className="space-y-3">
   {data.map((d)=>(
    <div key={d.label} className="flex items-center gap-3">
     <div className="w-[108px] shrink-0 text-[12px] font-medium text-[#475569] truncate">{d.label}</div>
     <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] border-[#E2E8F0] overflow-hidden p-0.5">
      <div className="h-full rounded-full" style={{ width:`${(d.value/max)*100}%`, background: color }} />
     </div>
     <div className="w-[78px] text-right font-mono text-xs font-medium tabular-nums">{(d.value/1000).toFixed(0)}k</div>
    </div>
   ))}
  </div>
 )
}

// PART: MiniBars — sparkline di KpiCard SKU
export function MiniBars({ data, color="#334155" }: { data:number[]; color?:string }){
 const max = Math.max(...data,1)
 return (
  <div className="flex items-end gap-1.5 h-[44px] rounded-[8px] bg-[#F1F5F9] border-[#E2E8F0] p-2">
   {data.map((v,i)=> <div key={i} className="flex-1 rounded-[4px]" style={{ height:`${Math.max(14,(v/max)*100)}%`, background: i===data.length-1 ? color : "#E2E8F0", minHeight:6 }} />)}
  </div>
 )
}

// PART: Donut — kategori produk, center KAT + legend %
export function Donut({ data, size=120 }: { data:{label:string;value:number;color:string}[]; size?:number }){
 const total = data.reduce((s,d)=>s+d.value,0) || 1
 let acc = 0
 const r=46, cx=size/2, cy=size/2, stroke=14
 return (
  <div className="flex items-center gap-5">
   <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-[8px] bg-white border-[#E2E8F0]">
    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke}/>
    {data.map((d,i)=>{
     const start = acc/total*2*Math.PI - Math.PI/2
     acc += d.value
     const end = acc/total*2*Math.PI - Math.PI/2
     const large = (end-start) > Math.PI ? 1 : 0
     const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start)
     const x2 = cx + r*Math.cos(end), y2 = cy + r*Math.sin(end)
     return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`} fill="none" stroke={d.color} strokeWidth={stroke} strokeLinecap="round"/>
    })}
    <text x={cx} y={cy+4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155" style={{fontFamily:"Geist"}}>{data.length} KAT</text>
   </svg>
   <div className="space-y-2">
    {data.map(d=>(
     <div key={d.label} className="flex items-center gap-2.5 text-xs"><span className="size-2.5 rounded-full border-[#E2E8F0]" style={{background:d.color}}/><span className="text-[#475569]">{d.label}</span><span className="ml-auto font-mono font-medium tabular-nums">{((d.value/total)*100).toFixed(0)}%</span></div>
    ))}
   </div>
  </div>
 )
}
