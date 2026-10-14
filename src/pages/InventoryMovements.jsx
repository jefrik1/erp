import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../lib/api';
export default function InventoryMovements(){
  const [data,setData]=useState([]);
  const [err,setErr]=useState('');
  useEffect(()=>{
    api.get('/inventory/movements').then(r=>setData(r.data?.data ?? r.data ?? [])).catch(e=>setErr(e.response?.data?.error||e.message));
  },[]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div>
        <div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Kartu Stok</h1><p className="text-xs text-[#64748B] mt-1">Audit trail pergerakan IN/OUT/TRF/ADJ • FIFO • Batch/Serial</p></div>
      </div>
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">{err}</div>}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm">
          <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
            <th className="text-left px-4 py-3 whitespace-nowrap">TANGGAL</th><th className="text-left px-4 py-3 whitespace-nowrap">PRODUK</th><th className="text-left px-4 py-3 whitespace-nowrap">GUDANG</th><th className="text-left px-4 py-3 whitespace-nowrap">TIPE</th><th className="text-left px-4 py-3 whitespace-nowrap">REF</th><th className="text-right px-4 py-3 whitespace-nowrap">MASUK</th><th className="text-right px-4 py-3 whitespace-nowrap">KELUAR</th><th className="text-left px-4 py-3 whitespace-nowrap">SALDO</th>
          </tr></thead>
          <tbody>{(Array.isArray(data)?data:[]).map((m,idx)=>(
            <tr key={m.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}>
              <td className="px-4 py-3.5 text-xs">{m.movement_date?.slice(0,16).replace('T',' ')}</td>
              <td className="px-4 py-3.5"><div className="font-semibold text-xs text-[#0F172A]">{m.product_name}</div><div className="text-xs text-[#64748B]">{m.sku}</div></td>
              <td className="px-4 py-3.5 text-xs text-center">{m.warehouse_name||'-'}</td>
              <td className="px-4 py-3.5 text-center"><span className={"text-xs px-2 py-1 rounded-full border "+(m.movement_type==='IN'?"bg-emerald-50 text-emerald-700 border-emerald-200":m.movement_type==='OUT'?"bg-red-50 text-red-700 border-red-200":"bg-sky-50 text-sky-700 border-sky-200")}>{m.movement_type}</span></td>
              <td className="px-4 py-3.5 text-xs">{m.reference_type} #{m.reference_id||'-'}</td>
              <td className="px-4 py-3.5 text-right text-emerald-700 font-medium">{m.qty_in>0? m.qty_in:''}</td>
              <td className="px-4 py-3.5 text-right text-red-600 font-medium">{m.qty_out>0? m.qty_out:''}</td>
              <td className="px-4 py-3.5 text-xs">{m.balance_qty??'-'}</td>
            </tr>
          ))}{data.length===0 && !err && <tr><td colSpan={8} className="p-8 text-center text-sm text-[#94A3B8]">Belum ada pergerakan</td></tr>}</tbody>
        </table></div>
      </div>
    </div>
  )
}
