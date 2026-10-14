import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../lib/api';
export default function InventoryStocks(){
  const [data,setData]=useState([]); const [wh,setWh]=useState(''); const [warehouses,setWarehouses]=useState([]);
  const load=async()=>{
    try{
      const r=await api.get('/inventory/stocks',{params:{warehouse_id:wh||undefined}});
      setData(r.data?.data ?? r.data ?? []);
    }catch{ setData([]); }
  };
  useEffect(()=>{
    api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:(r.data?.data ?? []))).catch(()=>{});
    load();
  },[]);
  useEffect(()=>{ load(); },[wh]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div>
          <div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Inventory — Multi Gudang</h1><p className="text-xs text-[#64748B] mt-1">Real-time • Multi-satuan (sak/ton/kubik/batang) • FIFO/Average • Bin location • Barcode</p></div>
        </div>
        <select value={wh} onChange={e=>setWh(e.target.value)} className="h-[42px] pl-3 pr-8 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] outline-none focus:bg-white focus:border-[#1E40AF]">
          <option value="">Semua Gudang</option>{warehouses.map(w=> <option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">PRODUK</th><th className="text-left px-4 py-3 whitespace-nowrap">GUDANG</th><th className="text-right px-4 py-3 whitespace-nowrap">ON HAND</th><th className="text-right px-4 py-3 whitespace-nowrap">RESERVED</th><th className="text-right px-4 py-3 whitespace-nowrap">AVAILABLE</th><th className="text-right px-4 py-3 whitespace-nowrap">AVG COST</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((s,idx)=>(
          <tr key={s.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5"><div className="font-semibold text-[#0F172A]">{s.product_name}</div><div className="text-xs text-[#64748B]">{s.sku} • Min {s.min_stock} • Reorder {s.reorder_point}</div></td><td className="px-4 py-3.5 text-center text-xs"><span className="px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0]">{s.warehouse_code}</span></td><td className="px-4 py-3.5 text-right font-bold">{s.qty_on_hand}</td><td className="px-4 py-3.5 text-right text-amber-700">{s.qty_reserved}</td><td className={"px-4 py-3.5 text-right font-black "+(parseFloat(s.qty_available)<=parseFloat(s.reorder_point)?"text-red-600":"text-emerald-700")}>{s.qty_available}</td><td className="px-4 py-3.5 text-right text-xs">{new Intl.NumberFormat('id-ID').format(s.avg_cost ?? 0)}</td><td className="px-4 py-3.5">{parseFloat(s.qty_available)<=parseFloat(s.reorder_point)? <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">KRITIS</span> : parseFloat(s.qty_available)<=parseFloat(s.min_stock)*1.5? <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">WASPADA</span> : <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">AMAN</span>}</td></tr>
        ))}{data.length===0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-[#94A3B8]">Tidak ada stok{wh?' di gudang ini':''}</td></tr>}</tbody></table></div>
      </div>
    </div>
  )
}
