
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Marketplace(){
  const [channels,setChannels]=useState([]); const [orders,setOrders]=useState([]);
  const load=()=>{ api.get('/marketplace/channels').then(r=>setChannels(r.data)); api.get('/marketplace/orders').then(r=>setOrders(r.data)); };
  useEffect(()=>{load()},[]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Marketplace B2C</h1></div></div>
      <p className="text-xs text-[#64748B]">Sync stok & order Tokopedia/Shopee/Lazada • Auto SO • Rekonsiliasi settlement</p>
      <div className="grid md:grid-cols-2 gap-4">{channels.map(ch=>(
        <div key={ch.id} className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5"><div className="flex flex-wrap justify-between gap-3 items-start"><div><div className="font-black">{ch.name}</div><div className="text-xs text-[#64748B]">{ch.store_id} • {ch.is_active? 'Aktif':'Nonaktif'} • Sync {ch.last_sync?.slice(0,16)||'—'}</div></div><button onClick={async()=>{ await api.post('/marketplace/sync',{channel_id: ch.id}); load(); }} className="h-8 px-3 bg-[#1E40AF] text-white rounded-full text-xs font-bold">Sync</button></div></div>
      ))}</div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="p-4 font-bold border-b">Pesanan Marketplace — Auto-convert ke SO</div><div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">EXT ORDER</th><th className="px-4 py-3.5">CHANNEL</th><th className="px-4 py-3.5">PEMBELI</th><th className="px-4 py-3.5 text-right">TOTAL</th><th className="px-4 py-3.5">STATUS</th><th></th></tr></thead><tbody>{orders.map(o=>(
        <tr key={o.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 font-mono">{o.external_order_id}</td><td className="px-4 py-3.5"><Badge status={o.channel_name}/></td><td className="px-4 py-3.5">{o.buyer_name} <span className="text-[#94A3B8]">{o.buyer_phone}</span></td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(o.total)}</td><td className="p-2 text-center"><Badge status={o.status}/></td><td className="px-4 py-3.5">{o.status==='PENDING' && <button onClick={async()=>{ await api.post('/marketplace/orders/'+o.id+'/convert'); load(); }} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-full">Convert SO</button>}{o.so_id && <span className="text-xs text-emerald-700">SO #{o.so_id}</span>}</td></tr>
      ))} {orders.length===0 && <tr><td colSpan={6} className="p-6 text-center text-[#94A3B8]">Belum ada order — klik Sync di channel</td></tr>}</tbody></table></div></div>
    </div>
  )
}
