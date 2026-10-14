import fs from 'fs'; import path from 'path';
const r='C:/Users/jefri/Downloads/erptest';
const w=(p,c)=>{ fs.mkdirSync(path.dirname(path.join(r,p)),{recursive:true}); fs.writeFileSync(path.join(r,p), c); console.log('w',p); };

// Update Layout nav for new modules
w('src/components/Layout.jsx', `
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, Wallet, Users, Kanban, BarChart3, LogOut, Menu, X, Search, Bell, Building2, Handshake, Calculator, BadgeDollarSign, Wrench, Gift, PiggyBank, Store, ShieldAlert, Workflow, FileWarning, Flame } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useState } from 'react';
const nav = [
  { label:'Dashboard', to:'/', icon:LayoutDashboard, desc:'KPI & Analytics' },
  { label:'PENJUALAN', heading:true },
  { label:'Sales Order', to:'/sales/orders', icon:ShoppingCart },
  { label:'Invoice (AR)', to:'/sales/invoices', icon:Wallet },
  { label:'POS Kasir', to:'/sales/pos', icon:Kanban },
  { label:'Kalkulator Material', to:'/calculator', icon:Calculator },
  { label:'CRM & Leads', to:'/crm', icon:Users },
  { label:'PROYEK', heading:true },
  { label:'Proyek & Tender', to:'/projects', icon:Building2 },
  { label:'PEMBELIAN', heading:true },
  { label:'Purchase Order', to:'/purchase/orders', icon:Truck },
  { label:'Goods Receipt', to:'/purchase/receipts', icon:Warehouse },
  { label:'Landed Cost', to:'/landed-costs', icon:BadgeDollarSign },
  { label:'OPERASIONAL', heading:true },
  { label:'Inventory', to:'/inventory/stocks', icon:Package },
  { label:'Kartu Stok', to:'/inventory/movements', icon:BarChart3 },
  { label:'Transfer', to:'/inventory/transfers', icon:Truck },
  { label:'Konsinyasi', to:'/consignments', icon:Handshake },
  { label:'Susut & Pecah', to:'/waste', icon:Flame },
  { label:'Logistik (DO)', to:'/logistics', icon:Truck },
  { label:'Armada & Trip', to:'/fleet', icon:Wrench },
  { label:'KEUANGAN', heading:true },
  { label:'COA & Jurnal', to:'/finance/coa', icon:Wallet },
  { label:'Jurnal Umum', to:'/finance/journals', icon:Wallet },
  { label:'AR / AP', to:'/finance/arap', icon:Wallet },
  { label:'Kontrol Piutang', to:'/credit', icon:ShieldAlert },
  { label:'Laporan BI', to:'/reports', icon:BarChart3 },
  { label:'Budget & Cashflow', to:'/budgets', icon:PiggyBank },
  { label:'Aset Tetap', to:'/assets', icon:Building2 },
  { label:'LOYALTY', heading:true },
  { label:'Loyalty & Tier', to:'/loyalty', icon:Gift },
  { label:'Pricing Engine', to:'/pricing', icon:BadgeDollarSign },
  { label:'Retur & Klaim', to:'/returns', icon:FileWarning },
  { label:'Marketplace', to:'/marketplace', icon:Store },
  { label:'SDM', heading:true },
  { label:'Karyawan & HR', to:'/hr', icon:Users },
  { label:'MASTER', heading:true },
  { label:'Produk', to:'/master/products', icon:Package },
  { label:'Pelanggan', to:'/master/customers', icon:Users },
  { label:'Supplier', to:'/master/suppliers', icon:Truck },
  { label:'Audit & GRC', to:'/audit', icon:ShieldAlert },
  { label:'Approval', to:'/approvals', icon:Workflow },
];
export function Badge({status}){
  const m={ DRAFT:'bg-gray-100 text-gray-700 border-gray-200', PENDING:'bg-amber-100 text-amber-800 border-amber-200', APPROVED:'bg-blue-100 text-blue-800 border-blue-200', PROCESSING:'bg-purple-100 text-purple-800 border-purple-200', IN_TRANSIT:'bg-cyan-100 text-cyan-800 border-cyan-200', PARTIAL:'bg-orange-100 text-orange-800 border-orange-200', COMPLETED:'bg-emerald-100 text-emerald-800 border-emerald-200', PAID:'bg-green-100 text-green-800 border-green-200', OVERDUE:'bg-red-100 text-red-700 border-red-200', CANCELLED:'bg-zinc-200 text-zinc-700', ON_HOLD:'bg-amber-900/10 text-amber-900 border-amber-200', CONSIGNED:'bg-teal-100 text-teal-800 border-teal-200', ACTIVE:'bg-emerald-100 text-emerald-800', CLOSED:'bg-zinc-100 text-zinc-600', SUBMITTED:'bg-blue-100 text-blue-800', IN_REVIEW:'bg-amber-100 text-amber-800' };
  return <span className={"badge border "+(m[status]||'bg-gray-100')}>{status}</span>
}
export default function Layout({children}){
  const {user, logout} = useAuth();
  const [open,setOpen]=useState(false);
  const role = user?.roles?.[0] || 'staff';
  return (
    <div className="min-h-screen flex">
      <aside className={"w-[268px] bg-[#0F172A] text-white hidden lg:flex flex-col sticky top-0 h-screen overflow-hidden"}>
        <div className="h-[64px] flex items-center gap-3 px-6 border-b border-white/10 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#1E40AF] flex items-center justify-center font-black text-white">M</div>
          <div><div className="font-extrabold leading-none text-[15px]">MATERIAL ERP</div><div className="text-[11px] text-white/60 tracking-widest">SUMBER MATERIAL JAYA • v1.1</div></div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map((n,i)=> n.heading ? <div key={i} className="pt-4 pb-1 px-3 text-[10px] tracking-[.14em] font-bold text-white/40">{n.label}</div> :
            <NavLink key={n.to} to={n.to} className={({isActive})=> "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition "+(isActive?"bg-white text-[#0F172A] shadow":"text-white/80 hover:bg-white/10 hover:text-white") }>
              <n.icon size={18} strokeWidth={n.label==='Dashboard'?2:1.8}/>{n.label}
            </NavLink>
          )}
        </div>
        <div className="p-3 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F59E0B] flex items-center justify-center font-bold text-[#0F172A]">{(user?.username||'A')[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{user?.username}</div><div className="text-xs text-white/60 capitalize truncate">{role}</div></div>
            <button onClick={logout} className="p-1.5 hover:bg-white/10 rounded-lg"><LogOut size={16}/></button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={()=>setOpen(false)}/><div className="absolute inset-y-0 left-0 w-[280px] bg-[#0F172A] text-white p-4 overflow-auto"><div className="flex justify-between items-center mb-4"><span className="font-black">MATERIAL ERP</span><button onClick={()=>setOpen(false)}><X/></button></div>{nav.map((n,i)=> n.heading ? <div key={i} className="pt-3 pb-1 text-[10px] tracking-widest text-white/40">{n.label}</div> : <NavLink key={n.to} to={n.to} onClick={()=>setOpen(false)} className={({isActive})=>"flex gap-2 px-3 py-2 rounded-lg "+(isActive?"bg-white text-[#0F172A]":"text-white/80")}><n.icon size={16}/>{n.label}</NavLink>)}</div></div>}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[64px] bg-white border-b border-gray-200 sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-6">
          <button className="lg:hidden p-2" onClick={()=>setOpen(true)}><Menu size={20}/></button>
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>System online • Addendum v1.1 • Ctrl+K command</div>
          <div className="flex-1 flex justify-center"><div className="hidden lg:flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 w-[420px]"><Search size={16} className="text-gray-400"/><input placeholder="Cari SO, PO, proyek, konsinyasi ( / )" className="bg-transparent outline-none text-sm w-full"/></div></div>
          <div className="flex items-center gap-2">
            <a href="/approvals" className="relative p-2 hover:bg-gray-100 rounded-xl"><Bell size={18}/><span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"/></a>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l ml-1">
              <div className="text-right leading-tight"><div className="text-sm font-semibold">{user?.username}</div><div className="text-xs text-gray-500">{user?.branch_id? 'Cabang '+user.branch_id : ''}</div></div>
              <div className="w-8 h-8 rounded-full bg-[#1E40AF] text-white grid place-items-center font-bold text-xs">{(user?.username||'U')[0].toUpperCase()}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 bg-[#F9FAFB]">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-3">© 2024 PT Sumber Material Jaya • ERP v1.1 Addendum • Konsinyasi • Proyek • Landed Cost • Loyalty</footer>
      </div>
      <button onClick={()=>{ const p=prompt('Quick: so | po | proyek | kalkulator | stok'); if(p==='so') location.href='/sales/orders/new'; if(p==='kalkulator') location.href='/calculator'; if(p==='stok') location.href='/inventory/stocks'; if(p==='proyek') location.href='/projects'; }} className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#1E40AF] text-white shadow-xl grid place-items-center text-2xl font-black hover:bg-blue-800">+</button>
    </div>
  )
}
`);

// --- PAGE: Projects
w('src/pages/Projects.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function Projects(){
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [customers,setCustomers]=useState([]);
  const [form,setForm]=useState({name:'', customer_id:'', contract_value:'', start_date:'', end_date:'', location:'', pic_name:'', retention_pct:5});
  const [detail,setDetail]=useState(null);
  const load=()=> api.get('/projects').then(r=>setData(r.data));
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); },[]);
  const create=async(e)=>{
    e.preventDefault();
    const r=await api.post('/projects',{...form, customer_id: parseInt(form.customer_id)||null, contract_value: parseFloat(form.contract_value)||0, retention_pct: parseFloat(form.retention_pct)});
    setShow(false); load(); setDetail(null);
  };
  const open=async(id)=>{
    const r=await api.get('/projects/'+id);
    setDetail(r.data);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Proyek & Tender</h1><p className="text-sm text-gray-500">Master proyek • Termin • RAB vs Realisasi • Dokumen • Harga khusus proyek</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl font-semibold">+ Proyek</button></div>
      <div className="grid md:grid-cols-3 gap-4">
        {data.map(p=>(
          <div key={p.id} onClick={()=>open(p.id)} className="bg-white rounded-2xl border p-5 cursor-pointer hover:shadow-lg transition">
            <div className="flex justify-between items-start"><span className="font-mono text-xs font-bold bg-gray-100 border px-2 py-1 rounded-full">{p.project_code}</span><Badge status={p.status}/></div>
            <div className="font-bold mt-3 leading-tight">{p.name}</div>
            <div className="text-xs text-gray-500 mt-1">{p.customer_name} • {p.location?.slice(0,30)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 border rounded-xl p-2"><div className="text-gray-500">Nilai Kontrak</div><div className="font-black">{rupiah(p.contract_value)}</div></div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2"><div className="text-blue-700">Terbayar</div><div className="font-black">{rupiah(p.paid_amount||0)}</div></div>
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#1E40AF]" style={{width: Math.min(100, (parseFloat(p.paid_amount||0)/parseFloat(p.contract_value||1)*100))+'%'}}/></div>
            <div className="text-xs text-gray-500 mt-1">{p.start_date?.slice(0,10)} → {p.end_date?.slice(0,10)} • Retensi {p.retention_pct}%</div>
          </div>
        ))}
      </div>
      {detail && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b p-5 flex justify-between items-start">
          <div><div className="font-mono text-xs font-bold">{detail.project_code} <Badge status={detail.status}/></div><div className="font-black text-lg">{detail.name}</div><div className="text-sm text-gray-500">{detail.customer_name} • {detail.location}</div><div className="text-sm mt-1">Nilai {rupiah(detail.contract_value)} • {detail.start_date?.slice(0,10)} → {detail.end_date?.slice(0,10)} • PIC {detail.pic_name}</div></div>
          <button onClick={()=>setDetail(null)} className="px-3 py-1 border rounded-full">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="font-bold">Termin Pembayaran</div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">TERMIN</th><th className="p-2">DESKRIPSI</th><th className="p-2 text-right">%</th><th className="p-2 text-right">NILAI</th><th className="p-2">DUE</th><th className="p-2">STATUS</th></tr></thead><tbody>
              {detail.terms?.map(t=>(
                <tr key={t.id} className="border-t"><td className="p-2 text-center">{t.term_number}</td><td className="p-2">{t.description}</td><td className="p-2 text-right">{t.percentage}%</td><td className="p-2 text-right font-bold">{rupiah(t.amount)}</td><td className="p-2 text-center">{t.due_date?.slice(0,10)}</td><td className="p-2 text-center"><Badge status={t.status}/></td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="font-bold">RAB vs Realisasi</div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2 text-left">PRODUK</th><th className="p-2 text-right">RENCANA</th><th className="p-2 text-right">REALISASI</th><th className="p-2 text-right">SELISIH</th></tr></thead><tbody>
              {detail.rab?.map(r=>(
                <tr key={r.id} className="border-t"><td className="p-2">{r.product_name}</td><td className="p-2 text-right">{r.qty_planned} / {rupiah(r.amount_planned)}</td><td className="p-2 text-right">{r.qty_actual} / {rupiah(r.amount_actual)}</td><td className="p-2 text-right"><span className={(r.amount_actual>r.amount_planned? 'text-red-600':'text-emerald-600')}>{rupiah(r.amount_actual - r.amount_planned)}</span></td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="font-bold">Harga Khusus Proyek</div>
          <div className="text-xs text-gray-500">{detail.prices?.length? detail.prices.map(p=> p.product_name+': '+rupiah(p.price)).join(' • ') : 'Belum ada harga khusus'}</div>
          <div className="font-bold">Dokumen</div>
          <div className="flex gap-2 flex-wrap text-xs">{detail.documents?.map(d=> <span key={d.id} className="px-2 py-1 bg-gray-100 border rounded-full">{d.doc_type}: {d.doc_number}</span>)} {(!detail.documents||!detail.documents.length) && <span className="text-gray-400">Belum ada dokumen</span>}</div>
        </div>
      </div></div>}
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={create} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3">
        <h3 className="font-bold">Buat Proyek</h3>
        <input required placeholder="Nama proyek" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih customer (kontraktor)</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Nilai kontrak" value={form.contract_value} onChange={e=>setForm({...form,contract_value:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input type="number" placeholder="Retensi %" value={form.retention_pct} onChange={e=>setForm({...form,retention_pct:e.target.value})} className="h-10 border rounded-xl px-3"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className="h-10 border rounded-xl px-3"/>
        </div>
        <input placeholder="Lokasi" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <input placeholder="PIC proyek" value={form.pic_name} onChange={e=>setForm({...form,pic_name:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Consignments.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Consignments(){
  const [data,setData]=useState([]); const [stats,setStats]=useState(null); const [show,setShow]=useState(false);
  const [customers,setCustomers]=useState([]); const [products,setProducts]=useState([]);
  const [form,setForm]=useState({type:'OUT', partner_type:'CUSTOMER', partner_id:'', location_name:'', location_address:'', items:[]});
  const load=()=>{ api.get('/consignments').then(r=>{ setData(r.data.data); }); api.get('/consignments/stats/summary').then(r=>setStats(r.data)).catch(()=>{}); };
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); },[]);
  const add=(p)=> setForm({...form, items:[...form.items, {product_id:p.id, name:p.name, qty:20, selling_price:65000}]});
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/consignments',{...form, partner_id: parseInt(form.partner_id)||null, items: form.items.map(i=>({product_id:i.product_id, qty_sent:i.qty, selling_price:i.selling_price}))});
    setShow(false); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Konsinyasi In & Out</h1><p className="text-sm text-gray-500">Barang titipan di toko/proyek (OUT) & barang supplier di gudang kita (IN) — kepemilikan terpisah</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">+ Titipan</button></div>
      {stats && <div className="grid grid-cols-3 gap-3"><div className="bg-white rounded-2xl border p-4 text-center"><div className="text-2xl font-black">{stats.out_active}</div><div className="text-xs text-gray-500">OUT Aktif</div></div><div className="bg-white rounded-2xl border p-4 text-center"><div className="text-2xl font-black">{stats.in_active}</div><div className="text-xs text-gray-500">IN Aktif</div></div><div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center"><div className="text-2xl font-black">{stats.long_pending?.length||0}</div><div className="text-xs text-amber-800">&gt;90 hari tidak laku</div></div></div>}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3 text-left">NO</th><th className="p-3">TIPE</th><th className="p-3 text-left">LOKASI / PARTNER</th><th className="p-3">TGL TITIP</th><th className="p-3">ITEMS</th><th className="p-3">STATUS</th></tr></thead><tbody>{data.map(c=>(
          <tr key={c.id} className="border-t hover:bg-gray-50"><td className="p-3 font-mono text-xs font-bold">{c.consignment_number}</td><td className="p-3 text-center"><span className={"text-xs px-2 py-1 rounded-full border "+(c.type==='OUT'?"bg-teal-50 text-teal-700":"bg-sky-50 text-sky-700")}>{c.type}</span></td><td className="p-3"><div className="font-semibold text-xs">{c.location_name}</div><div className="text-xs text-gray-500">{c.partner_type} #{c.partner_id} • {c.location_address?.slice(0,40)}</div></td><td className="p-3 text-xs text-center">{c.start_date?.slice(0,10)}</td><td className="p-3 text-xs">{c.items?.map((it,i)=> <div key={i}>{it.product_name}: {it.qty_sent} (terjual {it.qty_sold})</div>)}</td><td className="p-3 text-center"><Badge status={c.status}/></td></tr>
        ))}</tbody></table></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Buat Titipan Konsinyasi</h3>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="h-10 border rounded-xl px-3"><option value="OUT">KELUAR (kita titip di orang)</option><option value="IN">MASUK (supplier titip di kita)</option></select>
          <select value={form.partner_type} onChange={e=>setForm({...form,partner_type:e.target.value})} className="h-10 border rounded-xl px-3"><option value="CUSTOMER">Customer</option><option value="SUPPLIER">Supplier</option></select>
        </div>
        <select value={form.partner_id} onChange={e=>setForm({...form,partner_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih partner</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input required placeholder="Lokasi titipan (nama toko / proyek)" value={form.location_name} onChange={e=>setForm({...form,location_name:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <input placeholder="Alamat lengkap" value={form.location_address} onChange={e=>setForm({...form,location_address:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <div className="border rounded-xl p-2 max-h-[160px] overflow-auto space-y-1">
          {products.slice(0,10).map(p=> <div key={p.id} className="flex justify-between items-center border rounded-lg p-2"><span className="text-sm">{p.name} <span className="text-xs text-gray-500">{p.sku}</span></span><button type="button" onClick={()=>add(p)} className="text-xs px-2 py-1 bg-[#1E40AF] text-white rounded-full">+</button></div>)}
        </div>
        {form.items.map((it,i)=>(
          <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i].qty=parseFloat(e.target.value); setForm({...form,items:c}); }} className="w-20 h-8 border rounded-lg text-center"/><input type="number" value={it.selling_price} onChange={e=>{ const c=[...form.items]; c[i].selling_price=parseFloat(e.target.value); setForm({...form,items:c}); }} className="w-28 h-8 border rounded-lg text-right"/><button type="button" onClick={()=> setForm({...form, items:form.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">hapus</button></div>
        ))}
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">Stok akan pindah dari Gudang Pusat ke lokasi konsinyasi (owned tapi tidak di gudang). Stock opname terpisah.</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan & Kirim</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Pricing.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
export default function Pricing(){
  const [lists,setLists]=useState([]); const [items,setItems]=useState([]); const [sel,setSel]=useState('');
  const [customerPrices,setCustomerPrices]=useState([]); const [promos,setPromos]=useState([]);
  const [products,setProducts]=useState([]); const [customers,setCustomers]=useState([]);
  const [check,setCheck]=useState({customer_id:'', project_id:'', product_id:'', qty:10, result:null});
  const [projects,setProjects]=useState([]);
  const loadLists=()=> api.get('/pricing/lists').then(r=>{ setLists(r.data); if(r.data.length&&!sel) setSel(r.data[0].id); });
  useEffect(()=>{ loadLists(); api.get('/pricing/customer-prices').then(r=>setCustomerPrices(r.data)); api.get('/pricing/promotions').then(r=>setPromos(r.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); api.get('/projects').then(r=>setProjects(r.data)).catch(()=>{}); },[]);
  useEffect(()=>{ if(sel) api.get('/pricing/lists/'+sel+'/items').then(r=>setItems(r.data)); },[sel]);
  const doCheck=async()=>{
    const r=await api.post('/pricing/check',{ customer_id: parseInt(check.customer_id)||null, project_id: parseInt(check.project_id)||null, product_id: parseInt(check.product_id), qty: parseFloat(check.qty)});
    setCheck({...check, result:r.data});
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Pricing Engine Bertingkat</h1>
      <p className="text-sm text-gray-500 -mt-2">Tier retail/grosir/kontraktor/proyek • Override per customer • Floor price • Diskon qty • Promo bundling</p>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold">Price Lists</h3>
          <div className="mt-3 space-y-1">{lists.map(l=> <button key={l.id} onClick={()=>setSel(l.id)} className={"w-full text-left px-3 py-2 rounded-xl border text-sm "+(sel===l.id?"bg-[#1E40AF] text-white":"bg-gray-50")}><span className="font-bold">{l.code}</span> • {l.name} <span className="text-xs opacity-70">({l.type})</span></button>)}</div>
          <div className="mt-3 text-xs text-gray-500">Matrix: baris produk, kolom tier. Harga kompetitor bisa input manual.</div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-2xl border p-4">
          <h3 className="font-bold">Items — {lists.find(l=>l.id===sel)?.name||''}</h3>
          <div className="overflow-auto max-h-[300px] mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2 text-left">PRODUK</th><th className="p-2 text-right">MIN QTY</th><th className="p-2 text-right">HARGA</th></tr></thead><tbody>{items.map(it=>(
            <tr key={it.id} className="border-t"><td className="p-2">{it.product_name} <span className="text-gray-400">{it.sku}</span></td><td className="p-2 text-right">{it.min_qty}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(it.price)}</td></tr>
          ))}{items.length===0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Pilih price list</td></tr>}</tbody></table></div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="font-bold">Cek Harga (priority: proyek &gt; customer &gt; pricelist &gt; base)</h3>
        <div className="grid md:grid-cols-5 gap-2 mt-3">
          <select value={check.customer_id} onChange={e=>setCheck({...check,customer_id:e.target.value})} className="h-10 border rounded-xl px-2 text-sm"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}</select>
          <select value={check.project_id} onChange={e=>setCheck({...check,project_id:e.target.value})} className="h-10 border rounded-xl px-2 text-sm"><option value="">Tanpa proyek</option>{projects.map(p=> <option key={p.id} value={p.id}>{p.project_code} {p.name}</option>)}</select>
          <select value={check.product_id} onChange={e=>setCheck({...check,product_id:e.target.value})} className="h-10 border rounded-xl px-2 text-sm"><option value="">Pilih produk</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input type="number" value={check.qty} onChange={e=>setCheck({...check,qty:e.target.value})} className="h-10 border rounded-xl px-3" placeholder="Qty"/>
          <button onClick={doCheck} className="h-10 bg-[#1E40AF] text-white rounded-xl font-bold">Cek Harga</button>
        </div>
        {check.result && <div className={"mt-3 p-3 rounded-xl border "+(check.result.below_floor?"bg-red-50 border-red-200":"bg-emerald-50 border-emerald-200")}>
          <div className="text-sm"><b>Harga: Rp {new Intl.NumberFormat('id-ID').format(check.result.price)}</b> • sumber {check.result.source} • floor {new Intl.NumberFormat('id-ID').format(check.result.floor_price)}</div>
          {check.result.below_floor && <div className="text-xs text-red-700 mt-1">⚠️ Di bawah floor price — butuh approval Sales Manager + Direktur</div>}
          {check.result.warning && <div className="text-xs text-amber-700">{check.result.warning}</div>}
        </div>}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold">Override per Customer</h3>
          <div className="max-h-[260px] overflow-auto mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2 text-left">CUSTOMER</th><th className="p-2">PRODUK</th><th className="p-2 text-right">HARGA KHUSUS</th></tr></thead><tbody>{customerPrices.map(cp=>(
            <tr key={cp.id} className="border-t"><td className="p-2">{cp.customer_name}</td><td className="p-2">{cp.product_name}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(cp.price)}</td></tr>
          ))}</tbody></table></div>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold">Promo & Bundling</h3>
          <div className="space-y-2 mt-3">{promos.map(pr=>(
            <div key={pr.id} className="p-3 border rounded-xl bg-gray-50"><div className="font-bold text-sm">{pr.code} • {pr.name}</div><div className="text-xs text-gray-500">{pr.type} • {pr.start_date?.slice(0,10)} → {pr.end_date?.slice(0,10)} • {pr.is_active?'Aktif':'Nonaktif'}</div></div>
          ))}{promos.length===0 && <div className="text-xs text-gray-400">Belum ada promo. Contoh: semen+pasir gratis ongkir.</div>}</div>
        </div>
      </div>
    </div>
  )
}
`);

w('src/pages/Returns.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Returns(){
  const [sales,setSales]=useState([]); const [claims,setClaims]=useState([]); const [tab,setTab]=useState('sales');
  const [show,setShow]=useState(false); const [invoices,setInvoices]=useState([]); const [customers,setCustomers]=useState([]); const [products,setProducts]=useState([]);
  const [form,setForm]=useState({invoice_id:'', customer_id:'', reason:'DAMAGED', settlement_type:'CREDIT_NOTE', items:[]});
  const load=()=>{ api.get('/returns/sales').then(r=>setSales(r.data)); api.get('/returns/claims').then(r=>setClaims(r.data)); };
  useEffect(()=>{ load(); api.get('/sales/invoices').then(r=>setInvoices(r.data.data)); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); },[]);
  const add=(p)=> setForm({...form, items:[...form.items, {product_id:p.id, name:p.name, qty:1, unit_price:65000, condition:'QUARANTINE'}]});
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/returns/sales',{invoice_id: parseInt(form.invoice_id)||null, customer_id: parseInt(form.customer_id)||null, reason:form.reason, settlement_type:form.settlement_type, items: form.items.map(i=>({product_id:i.product_id, qty:i.qty, unit_price:i.unit_price, condition:i.condition}))});
    setShow(false); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Retur & Klaim Berjenjang</h1><p className="text-sm text-gray-500">Retur penjualan/pembelian • Klaim supplier/ekspedisi • Settlement ganti barang / nota kredit</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">+ Retur Penjualan</button></div>
      <div className="flex gap-2"><button onClick={()=>setTab('sales')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='sales'?"bg-[#1E40AF] text-white":"bg-white")}>Penjualan</button><button onClick={()=>setTab('claims')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='claims'?"bg-[#1E40AF] text-white":"bg-white")}>Klaim</button></div>
      {tab==='sales' ? (
        <div className="bg-white rounded-2xl border overflow-hidden"><div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3 text-left">NO RETUR</th><th className="p-3">CUSTOMER</th><th className="p-3">ALASAN</th><th className="p-3">SETTLEMENT</th><th className="p-3 text-right">TOTAL</th><th className="p-3">STATUS</th></tr></thead><tbody>{sales.map(r=>(
          <tr key={r.id} className="border-t"><td className="p-3 font-mono text-xs font-bold">{r.return_number}</td><td className="p-3">{r.customer_name}</td><td className="p-3"><Badge status={r.reason}/></td><td className="p-3 text-xs">{r.settlement_type}</td><td className="p-3 text-right font-bold">{new Intl.NumberFormat('id-ID').format(r.total)}</td><td className="p-3 text-center"><Badge status={r.status}/></td></tr>
        ))} {sales.length===0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">Belum ada retur</td></tr>}</tbody></table></div></div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden"><div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3 text-left">KLAIM</th><th className="p-3">TIPE</th><th className="p-3">REF</th><th className="p-3 text-right">KLAIM</th><th className="p-3 text-right">SETTLED</th><th className="p-3">STATUS</th></tr></thead><tbody>{claims.map(c=>(
          <tr key={c.id} className="border-t"><td className="p-3 font-mono text-xs font-bold">{c.claim_number}</td><td className="p-3"><Badge status={c.claim_type}/></td><td className="p-3 text-xs">{c.reference_type} #{c.reference_id}</td><td className="p-3 text-right">{new Intl.NumberFormat('id-ID').format(c.amount_claimed)}</td><td className="p-3 text-right text-emerald-700">{new Intl.NumberFormat('id-ID').format(c.amount_settled||0)}</td><td className="p-3 text-center"><Badge status={c.status}/></td></tr>
        ))}</tbody></table></div></div>
      )}
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Retur Penjualan</h3>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.invoice_id} onChange={e=>setForm({...form,invoice_id:e.target.value})} className="h-10 border rounded-xl px-3"><option value="">Pilih invoice</option>{invoices.map(i=> <option key={i.id} value={i.id}>{i.invoice_number} • {i.customer_name}</option>)}</select>
          <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="h-10 border rounded-xl px-3"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} className="h-10 border rounded-xl px-3"><option value="DAMAGED">Rusak</option><option value="WRONG_ITEM">Salah kirim</option><option value="EXCESS">Kelebihan</option><option value="QUALITY">Kualitas</option><option value="OTHER">Lain</option></select>
          <select value={form.settlement_type} onChange={e=>setForm({...form,settlement_type:e.target.value})} className="h-10 border rounded-xl px-3"><option value="CREDIT_NOTE">Nota Kredit (potong piutang)</option><option value="REFUND">Refund</option><option value="EXCHANGE">Tukar barang</option></select>
        </div>
        <div className="border rounded-xl p-2 max-h-[160px] overflow-auto space-y-1">
          {products.slice(0,10).map(p=> <div key={p.id} className="flex justify-between items-center border rounded-lg p-2"><span className="text-sm">{p.name}</span><button type="button" onClick={()=>add(p)} className="text-xs px-2 py-1 bg-[#1E40AF] text-white rounded-full">+</button></div>)}
        </div>
        {form.items.map((it,i)=>(
          <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i].qty=parseFloat(e.target.value); setForm({...form,items:c}); }} className="w-20 h-8 border rounded-lg text-center"/><select value={it.condition} onChange={e=>{ const c=[...form.items]; c[i].condition=e.target.value; setForm({...form,items:c}); }} className="h-8 border rounded-lg px-2 text-xs"><option value="QUARANTINE">Karantina</option><option value="GOOD">Baik</option><option value="DAMAGED">Rusak</option></select><button type="button" onClick={()=> setForm({...form, items:form.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">hapus</button></div>
        ))}
        <div className="text-xs text-gray-500">Barang masuk gudang karantina. Jika DAMAGED bisa klaim supplier/ekspedisi di tab Klaim.</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan Retur</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/LandedCosts.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function LandedCosts(){
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [pos,setPos]=useState([]); const [grns,setGrns]=useState([]);
  const [form,setForm]=useState({po_id:'', grn_id:'', container_no:'', bl_number:'', pib_number:'', allocation_method:'VALUE', details:[{cost_type:'FREIGHT', amount:15000000, currency:'IDR'}]});
  const load=()=> api.get('/landed-costs').then(r=>setData(r.data));
  useEffect(()=>{ load(); api.get('/purchase/orders').then(r=>setPos(r.data.data)); api.get('/purchase/receipts').then(r=>setGrns(r.data)); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    const r=await api.post('/landed-costs',{po_id: parseInt(form.po_id), grn_id: parseInt(form.grn_id)||null, container_no:form.container_no, bl_number:form.bl_number, pib_number:form.pib_number, allocation_method:form.allocation_method, details: form.details.map(d=>({cost_type:d.cost_type, description:d.cost_type, amount: parseFloat(d.amount), currency:d.currency, exchange_rate:1, amount_idr: parseFloat(d.amount)}))});
    alert('Landed cost dibuat total '+new Intl.NumberFormat('id-ID').format(r.data.total_cost));
    setShow(false); load();
  };
  const calc=async(id)=>{
    const r=await api.post('/landed-costs/'+id+'/calculate');
    alert('Alokasi: '+r.data.allocations.length+' items • total '+new Intl.NumberFormat('id-ID').format(r.data.totalCost)+' • per unit update avg_cost');
    load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Landed Cost & Import</h1><p className="text-sm text-gray-500">Freight • Asuransi • Bea masuk • PPh22 • Clearance • Trucking — alokasi proporsional VALUE/WEIGHT/VOLUME</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">+ Landed Cost</button></div>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3 text-left">LC</th><th className="p-3">PO</th><th className="p-3">CONTAINER</th><th className="p-3 text-right">TOTAL</th><th className="p-3">METODE</th><th className="p-3">STATUS</th><th></th></tr></thead><tbody>{data.map(l=>(
          <tr key={l.id} className="border-t"><td className="p-3 font-mono text-xs font-bold"># {l.id}</td><td className="p-3">{l.po_number}</td><td className="p-3 text-xs">{l.container_no||'-'} • BL {l.bl_number||'-'}</td><td className="p-3 text-right font-bold">{new Intl.NumberFormat('id-ID').format(l.total_cost)}</td><td className="p-3 text-center text-xs">{l.allocation_method}</td><td className="p-3 text-center"><Badge status={l.status}/></td><td className="p-3">{l.status!=='CALCULATED' && <button onClick={()=>calc(l.id)} className="text-xs px-2 py-1 bg-amber-500 text-white rounded-full">Kalkulasi</button>}</td></tr>
        ))}{data.length===0 && <tr><td colSpan={7} className="p-6 text-center text-gray-400">Belum ada landed cost</td></tr>}</tbody></table></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Buat Landed Cost</h3>
        <select required value={form.po_id} onChange={e=>setForm({...form,po_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih PO import</option>{pos.map(p=> <option key={p.id} value={p.id}>{p.po_number} • {p.supplier_name}</option>)}</select>
        <select value={form.grn_id} onChange={e=>setForm({...form,grn_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih GRN (opsional)</option>{grns.map(g=> <option key={g.id} value={g.id}>{g.grn_number}</option>)}</select>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Container No" value={form.container_no} onChange={e=>setForm({...form,container_no:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input placeholder="BL No" value={form.bl_number} onChange={e=>setForm({...form,bl_number:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input placeholder="PIB No" value={form.pib_number} onChange={e=>setForm({...form,pib_number:e.target.value})} className="h-10 border rounded-xl px-3"/>
        </div>
        <select value={form.allocation_method} onChange={e=>setForm({...form,allocation_method:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="VALUE">Alokasi by Nilai</option><option value="WEIGHT">By Berat</option><option value="VOLUME">By Volume</option></select>
        {form.details.map((d,i)=>(
          <div key={i} className="flex gap-2 items-center"><select value={d.cost_type} onChange={e=>{ const c=[...form.details]; c[i].cost_type=e.target.value; setForm({...form,details:c}); }} className="h-8 border rounded-lg px-2 text-xs"><option>FREIGHT</option><option>INSURANCE</option><option>DUTY</option><option>TAX</option><option>CLEARANCE</option><option>TRUCKING</option><option>HANDLING</option><option>OTHER</option></select><input type="number" value={d.amount} onChange={e=>{ const c=[...form.details]; c[i].amount=e.target.value; setForm({...form,details:c}); }} className="flex-1 h-8 border rounded-lg px-2 text-right"/><button type="button" onClick={()=> setForm({...form, details:form.details.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">✕</button></div>
        ))}
        <button type="button" onClick={()=> setForm({...form, details:[...form.details, {cost_type:'OTHER', amount:0, currency:'IDR'}]})} className="text-xs px-3 py-1 border rounded-full">+ Biaya</button>
        <div className="text-xs text-gray-500">Dokumen: PIB, BL, packing list, COO • Kurs USD dicatat jika perlu.</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Fleet.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Fleet(){
  const [vehicles,setVehicles]=useState([]); const [trips,setTrips]=useState([]); const [stats,setStats]=useState(null); const [maint,setMaint]=useState([]);
  const [showTrip,setShowTrip]=useState(false); const [showMaint,setShowMaint]=useState(false);
  const [tripForm,setTripForm]=useState({vehicle_id:'', driver_id:1, do_id:'', route:'', distance_km:'', fuel_cost:'', toll_cost:''});
  const load=()=>{ api.get('/fleet/vehicles').then(r=>setVehicles(r.data)); api.get('/fleet/trips').then(r=>setTrips(r.data)); api.get('/fleet/stats').then(r=>setStats(r.data)); api.get('/fleet/maintenance').then(r=>setMaint(r.data)); };
  useEffect(()=>{load()},[]);
  const submitTrip=async(e)=>{
    e.preventDefault();
    await api.post('/fleet/trips',{vehicle_id: parseInt(tripForm.vehicle_id), driver_id: parseInt(tripForm.driver_id)||1, do_id: parseInt(tripForm.do_id)||null, route:tripForm.route, distance_km: parseFloat(tripForm.distance_km)||0, fuel_cost: parseFloat(tripForm.fuel_cost)||0, toll_cost: parseFloat(tripForm.toll_cost)||0});
    setShowTrip(false); load();
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Armada & Biaya Angkut</h1>
      {stats && <div className="grid grid-cols-6 gap-2"><div className="bg-white rounded-xl border p-3 text-center"><div className="text-lg font-black">{stats.total}</div><div className="text-xs text-gray-500">Armada</div></div><div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center"><div className="text-lg font-black">{stats.available}</div><div className="text-xs">Available</div></div><div className="bg-white rounded-xl border p-3 text-center"><div className="text-lg font-black">{stats.trips_30}</div><div className="text-xs text-gray-500">Trip 30h</div></div><div className="bg-white rounded-xl border p-3 text-center"><div className="text-lg font-black">{new Intl.NumberFormat('id-ID',{notation:'compact'}).format(stats.cost_30)}</div><div className="text-xs text-gray-500">Biaya 30h</div></div><div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center"><div className="text-lg font-black">{stats.kir_overdue}</div><div className="text-xs">KIR overdue</div></div><div className="bg-gray-900 text-white rounded-xl p-3 text-center"><div className="text-xs">Zona</div><div className="text-xs mt-1">150rb-600rb</div></div></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex justify-between items-center"><h3 className="font-bold">Armada</h3><span className="text-xs bg-gray-100 border px-2 py-1 rounded-full">Master plat, tonase, kubik, KIR, pajak</span></div>
          <div className="mt-3 space-y-2 max-h-[320px] overflow-auto">{vehicles.map(v=>(
            <div key={v.id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50"><div><div className="font-bold text-sm">{v.plat_no} • {v.type}</div><div className="text-xs text-gray-500">{v.brand||''} • {v.capacity_weight_kg? (v.capacity_weight_kg/1000)+' ton' : (v.capacity_ton||'-')+' ton'} • {v.driver_name||'—'}</div></div><Badge status={v.status}/></div>
          ))}</div>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex justify-between items-center"><h3 className="font-bold">Trip Aktif</h3><button onClick={()=>setShowTrip(true)} className="h-8 px-3 bg-[#1E40AF] text-white rounded-full text-xs font-bold">+ Trip</button></div>
          <div className="mt-3 space-y-2 max-h-[320px] overflow-auto">{trips.map(t=>(
            <div key={t.id} className="p-3 border rounded-xl"><div className="flex justify-between"><span className="font-mono text-xs font-bold">{t.trip_number}</span><Badge status={t.status}/></div><div className="text-xs mt-1">{t.plat_no} • {t.driver_name||'driver #'+t.driver_id} • {t.route||'—'} • {t.distance_km} km</div><div className="text-xs text-gray-500">BBM {new Intl.NumberFormat('id-ID').format(t.fuel_cost)} • Tol {new Intl.NumberFormat('id-ID').format(t.toll_cost)} • DO {t.do_number||'-'}</div></div>
          ))}{trips.length===0 && <div className="text-xs text-gray-400 text-center py-6">Belum ada trip</div>}</div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4">
        <div className="flex justify-between items-center"><h3 className="font-bold">Maintenance</h3><button onClick={()=>setShowMaint(true)} className="h-8 px-3 border rounded-full text-xs font-bold">+ Servis</button></div>
        <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">TGL</th><th className="p-2">PLAT</th><th className="p-2">JENIS</th><th className="p-2">BENGKEL</th><th className="p-2 text-right">BIAYA</th></tr></thead><tbody>{maint.map(m=>(
          <tr key={m.id} className="border-t"><td className="p-2">{m.service_date?.slice(0,10)}</td><td className="p-2 font-mono">{m.plat_no}</td><td className="p-2">{m.maintenance_type}</td><td className="p-2">{m.workshop||'-'}</td><td className="p-2 text-right">{new Intl.NumberFormat('id-ID').format(m.cost)}</td></tr>
        ))}</tbody></table></div>
      </div>
      {showTrip && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submitTrip} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Buat Trip</h3>
        <select required value={tripForm.vehicle_id} onChange={e=>setTripForm({...tripForm,vehicle_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih armada</option>{vehicles.map(v=> <option key={v.id} value={v.id}>{v.plat_no} • {v.type}</option>)}</select>
        <input placeholder="Rute (Bekasi-Jakarta)" value={tripForm.route} onChange={e=>setTripForm({...tripForm,route:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" placeholder="Jarak km" value={tripForm.distance_km} onChange={e=>setTripForm({...tripForm,distance_km:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input type="number" placeholder="BBM" value={tripForm.fuel_cost} onChange={e=>setTripForm({...tripForm,fuel_cost:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input type="number" placeholder="Tol" value={tripForm.toll_cost} onChange={e=>setTripForm({...tripForm,toll_cost:e.target.value})} className="h-10 border rounded-xl px-3"/>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowTrip(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan Trip</button></div>
      </form></div>}
      {showMaint && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={async e=>{ e.preventDefault(); const f=new FormData(e.target); await api.post('/fleet/maintenance',{vehicle_id: parseInt(f.get('vehicle_id')), service_date:f.get('service_date'), next_service_date:f.get('next_service_date'), cost: parseFloat(f.get('cost')), description:f.get('description'), workshop:f.get('workshop')}); setShowMaint(false); load(); }} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Catat Servis</h3>
        <select name="vehicle_id" className="w-full h-10 border rounded-xl px-3"><option value="">Pilih armada</option>{vehicles.map(v=> <option key={v.id} value={v.id}>{v.plat_no}</option>)}</select>
        <input type="date" name="service_date" className="w-full h-10 border rounded-xl px-3"/><input type="date" name="next_service_date" className="w-full h-10 border rounded-xl px-3"/>
        <input name="cost" type="number" placeholder="Biaya" className="w-full h-10 border rounded-xl px-3"/><input name="workshop" placeholder="Bengkel" className="w-full h-10 border rounded-xl px-3"/><input name="description" placeholder="Deskripsi" className="w-full h-10 border rounded-xl px-3"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowMaint(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Waste.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Waste(){
  const [data,setData]=useState([]); const [stats,setStats]=useState(null); const [show,setShow]=useState(false);
  const [products,setProducts]=useState([]); const [warehouses,setWarehouses]=useState([]);
  const [form,setForm]=useState({product_id:'', warehouse_id:1, qty:'', waste_type:'PECAH_GUDANG', reason:''});
  const load=()=>{ api.get('/waste').then(r=>setData(r.data)); api.get('/waste/stats/summary').then(r=>setStats(r.data)); };
  useEffect(()=>{ load(); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); api.get('/master/warehouses').then(r=>setWarehouses(r.data)); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    const r=await api.post('/waste',{product_id: parseInt(form.product_id), warehouse_id: parseInt(form.warehouse_id), qty: parseFloat(form.qty), waste_type:form.waste_type, reason:form.reason});
    alert('Write-off '+new Intl.NumberFormat('id-ID').format(r.data.cost)+' status '+r.data.status+' ( >500rb butuh Manager+Finance, >5jt Direktur )');
    setShow(false); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Susut, Pecah & Waste</h1><p className="text-sm text-gray-500">Pecah gudang/kirim/bongkar • Susut alami • Reklasifikasi grade B • Approval berjenjang</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">+ Catat Susut</button></div>
      {stats && <div className="grid grid-cols-4 gap-2"><div className="bg-white rounded-xl border p-3 text-center"><div className="text-lg font-black">{stats.pending||0}</div><div className="text-xs">Pending</div></div>{stats.by_type?.slice(0,3).map(t=> <div key={t.waste_type} className="bg-white rounded-xl border p-3 text-center"><div className="text-xs font-bold">{t.waste_type}</div><div className="text-sm font-black">{new Intl.NumberFormat('id-ID',{notation:'compact'}).format(t.cost)}</div><div className="text-xs text-gray-500">{t.cnt} kejadian</div></div>)}</div>}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3 text-left">TGL</th><th className="p-3">PRODUK</th><th className="p-3">GUDANG</th><th className="p-3">JENIS</th><th className="p-3 text-right">QTY</th><th className="p-3 text-right">BIAYA</th><th className="p-3">STATUS</th><th></th></tr></thead><tbody>{data.map(w=>(
          <tr key={w.id} className="border-t"><td className="p-3 text-xs">{w.created_at?.slice(0,10)}</td><td className="p-3">{w.product_name} <span className="text-xs text-gray-400">{w.sku}</span></td><td className="p-3 text-xs text-center">{w.warehouse_name}</td><td className="p-3 text-xs"><Badge status={w.waste_type}/></td><td className="p-3 text-right">{w.qty}</td><td className="p-3 text-right font-bold">{new Intl.NumberFormat('id-ID').format(w.cost)}</td><td className="p-3 text-center"><Badge status={w.status}/></td><td className="p-3">{w.status==='PENDING' && <button onClick={async()=>{ await api.post('/waste/'+w.id+'/approve',{status:'APPROVED'}); load(); }} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-full">Approve</button>}</td></tr>
        ))}</tbody></table></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Catat Susut / Pecah</h3>
        <select required value={form.product_id} onChange={e=>setForm({...form,product_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih produk</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={form.warehouse_id} onChange={e=>setForm({...form,warehouse_id:e.target.value})} className="w-full h-10 border rounded-xl px-3">{warehouses.map(w=> <option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" required placeholder="Qty" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <select value={form.waste_type} onChange={e=>setForm({...form,waste_type:e.target.value})} className="h-10 border rounded-xl px-3"><option value="PECAH_GUDANG">Pecah Gudang</option><option value="PECAH_KIRIM">Pecah Kirim</option><option value="PECAH_BONGKAR">Pecah Bongkar</option><option value="SUSUT_ALAMI">Susut Alami</option><option value="SALAH_HITUNG">Salah Hitung</option><option value="OTHER">Lain</option></select>
        </div>
        <textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Penyebab & tindak lanjut (klaim supplier/asuransi?)" className="w-full border rounded-xl p-3" rows={2}/>
        <div className="text-xs text-gray-500">&lt;500rb Supervisor • 500rb-5jt Manager+Gudang+Finance • &gt;5jt Direktur</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Budgets.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
export default function Budgets(){
  const [rows,setRows]=useState([]); const [compare,setCompare]=useState([]); const [cf,setCf]=useState(null); const [scenarios,setScenarios]=useState([]);
  const [branches,setBranches]=useState([]); const [accounts,setAccounts]=useState([]);
  const [form,setForm]=useState({fiscal_year:2024, branch_id:1, period_month:9, account_id:7, budget_amount:''});
  const load=()=>{ api.get('/budgets').then(r=>setRows(r.data)); api.get('/budgets/comparison').then(r=>setCompare(r.data)); api.get('/budgets/cashflow').then(r=>setCf(r.data)); api.get('/budgets/scenarios').then(r=>setScenarios(r.data)); };
  useEffect(()=>{ load(); api.get('/master/branches').then(r=>setBranches(r.data)); api.get('/finance/coa').then(r=>setAccounts(r.data)); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/budgets',{fiscal_year: parseInt(form.fiscal_year), branch_id: parseInt(form.branch_id), account_id: parseInt(form.account_id), period_month: parseInt(form.period_month), budget_amount: parseFloat(form.budget_amount)});
    load();
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Budgeting & Cashflow Projection</h1>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border p-4">
          <h3 className="font-bold">Realisasi vs Budget</h3>
          <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">BULAN</th><th className="p-2 text-right">BUDGET</th><th className="p-2 text-right">ACTUAL</th><th className="p-2 text-right">SELISIH</th><th className="p-2 text-right">%</th></tr></thead><tbody>{compare.map(c=>(
            <tr key={c.period_month} className="border-t"><td className="p-2 text-center">M{c.period_month}</td><td className="p-2 text-right">{new Intl.NumberFormat('id-ID').format(c.budget)}</td><td className="p-2 text-right">{new Intl.NumberFormat('id-ID').format(c.actual)}</td><td className={"p-2 text-right font-bold "+(c.variance>0?"text-emerald-600":"text-red-600")}>{new Intl.NumberFormat('id-ID').format(c.variance)}</td><td className="p-2 text-right">{c.pct}%</td></tr>
          ))}{compare.length===0 && <tr><td colSpan={5} className="p-4 text-center text-gray-400">Belum ada budget</td></tr>}</tbody></table></div>
        </div>
        <div className="bg-[#0F172A] text-white rounded-2xl p-5">
          <h3 className="font-bold">Cashflow 90 Hari</h3>
          {cf && <div className="mt-3 space-y-2 text-sm">{cf.breakdown.map(b=>(
            <div key={b.label} className="flex justify-between"><span className="text-white/70">{b.label}</span><span className="font-bold">{new Intl.NumberFormat('id-ID').format(b.amount)}</span></div>
          ))}<div className="flex justify-between font-black text-base border-t border-white/20 pt-2"><span>Proyeksi Net</span><span className={cf.net_projection>0?"text-emerald-300":"text-red-300"}>{new Intl.NumberFormat('id-ID').format(cf.net_projection)}</span></div></div>}
          <div className="mt-4 space-y-2 text-xs">{scenarios.map(s=>(
            <div key={s.scenario} className="flex justify-between bg-white/10 rounded-lg px-3 py-2"><span>{s.scenario}</span><span>{new Intl.NumberFormat('id-ID',{notation:'compact'}).format(s.profit)}</span></div>
          ))}</div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="font-bold">Input Budget</h3>
        <form onSubmit={submit} className="grid md:grid-cols-6 gap-2 mt-3">
          <input type="number" value={form.fiscal_year} onChange={e=>setForm({...form,fiscal_year:e.target.value})} className="h-10 border rounded-xl px-3" placeholder="Tahun"/>
          <select value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})} className="h-10 border rounded-xl px-2"><option value="">Cabang</option>{branches.map(b=> <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select value={form.account_id} onChange={e=>setForm({...form,account_id:e.target.value})} className="h-10 border rounded-xl px-2"><option value="">Akun</option>{accounts.map(a=> <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
          <input type="number" min={1} max={12} value={form.period_month} onChange={e=>setForm({...form,period_month:e.target.value})} className="h-10 border rounded-xl px-3" placeholder="Bulan 1-12"/>
          <input type="number" value={form.budget_amount} onChange={e=>setForm({...form,budget_amount:e.target.value})} className="h-10 border rounded-xl px-3" placeholder="Nilai"/>
          <button className="h-10 bg-[#1E40AF] text-white rounded-xl font-bold">Simpan</button>
        </form>
      </div>
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="font-bold">Budget List 2024</h3>
        <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">TAHUN</th><th className="p-2">CABANG</th><th className="p-2">AKUN</th><th className="p-2">BULAN</th><th className="p-2 text-right">NILAI</th></tr></thead><tbody>{rows.map(r=>(
          <tr key={r.id} className="border-t"><td className="p-2 text-center">{r.fiscal_year}</td><td className="p-2">{r.branch_name||r.branch_id}</td><td className="p-2">{r.account_code} {r.account_name}</td><td className="p-2 text-center">{r.period_month}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(r.budget_amount)}</td></tr>
        ))}</tbody></table></div>
      </div>
    </div>
  )
}
`);

w('src/pages/Loyalty.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
export default function Loyalty(){
  const [tiers,setTiers]=useState([]); const [points,setPoints]=useState([]); const [tx,setTx]=useState([]);
  const [show,setShow]=useState(false); const [form,setForm]=useState({customer_id:'', points:1000, reference_type:'MANUAL', description:''});
  const [customers,setCustomers]=useState([]);
  const load=()=>{ api.get('/loyalty/tiers').then(r=>setTiers(r.data)); api.get('/loyalty/points').then(r=>setPoints(Array.isArray(r.data)?r.data:[])); api.get('/loyalty/transactions').then(r=>setTx(r.data)); };
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); },[]);
  const earn=async(e)=>{
    e.preventDefault();
    await api.post('/loyalty/earn',{customer_id: parseInt(form.customer_id), points: parseInt(form.points), reference_type:form.reference_type, description:form.description});
    setShow(false); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Loyalty & Membership</h1><p className="text-sm text-gray-500">Poin per transaksi • Tier Silver/Gold/Platinum • Kupon • Referral</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">+ Poin Manual</button></div>
      <div className="grid md:grid-cols-3 gap-4">{tiers.map(t=>(
        <div key={t.id} className="bg-white rounded-2xl border p-5"><div className="font-black">{t.name}</div><div className="text-xs text-gray-500 mt-1">Min spend {new Intl.NumberFormat('id-ID').format(t.min_spend)} • Diskon {t.discount_pct}%</div><div className="text-xs mt-2 bg-gray-50 border rounded-lg p-2">{JSON.stringify(t.benefits).slice(0,80)}</div></div>
      ))}</div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Saldo Poin</h3><div className="mt-3 space-y-2 max-h-[300px] overflow-auto">{points.map(p=>(
          <div key={p.customer_id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50"><div><div className="font-bold text-sm">{p.name}</div><div className="text-xs text-gray-500">Lifetime {p.lifetime_points}</div></div><div className="text-right"><div className="font-black text-[#F59E0B]">{p.points_balance} poin</div></div></div>
        ))}</div></div>
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Transaksi Poin Terbaru</h3><div className="overflow-auto max-h-[300px] mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">TGL</th><th className="p-2">CUSTOMER</th><th className="p-2">TIPE</th><th className="p-2 text-right">POIN</th></tr></thead><tbody>{tx.map(t=>(
          <tr key={t.id} className="border-t"><td className="p-2">{t.transaction_date?.slice(0,10)}</td><td className="p-2">{t.name||t.customer_id}</td><td className="p-2"><span className={"px-2 py-1 rounded-full text-xs "+(t.transaction_type==='EARN'?"bg-emerald-50 text-emerald-700":t.transaction_type==='REDEEM'?"bg-red-50 text-red-700":"bg-gray-100")}>{t.transaction_type}</span></td><td className="p-2 text-right font-bold">{t.points}</td></tr>
        ))}</tbody></table></div></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={earn} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Tambah Poin</h3>
        <select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="number" value={form.points} onChange={e=>setForm({...form,points:e.target.value})} className="w-full h-10 border rounded-xl px-3" placeholder="Poin"/>
        <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Keterangan" className="w-full h-10 border rounded-xl px-3"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Assets.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
export default function Assets(){
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [dep,setDep]=useState(null);
  const [form,setForm]=useState({asset_code:'', name:'', category:'BANGUNAN', acquisition_date:'', acquisition_cost:'', useful_life_years:5});
  const load=()=> api.get('/assets').then(r=>setData(r.data));
  useEffect(()=>{load()},[]);
  const create=async(e)=>{
    e.preventDefault();
    await api.post('/assets',{...form, acquisition_cost: parseFloat(form.acquisition_cost), useful_life_years: parseInt(form.useful_life_years)});
    setShow(false); load();
  };
  const openDep=async(id)=>{
    const r=await api.get('/assets/'+id+'/depreciation');
    setDep(r.data);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><div><h1 className="text-xl font-black">Aset Tetap & Maintenance</h1><p className="text-sm text-gray-500">Depresiasi PSAK straight/declining • Pemeliharaan • Disposal gain/loss</p></div><button onClick={()=>setShow(true)} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">+ Aset</button></div>
      <div className="grid md:grid-cols-3 gap-4">{data.map(a=>(
        <div key={a.id} className="bg-white rounded-2xl border p-5">
          <div className="font-mono text-xs font-bold bg-gray-100 border px-2 py-1 rounded-full inline-block">{a.asset_code}</div>
          <div className="font-bold mt-2">{a.name}</div>
          <div className="text-xs text-gray-500">{a.category} • {a.location||'-'} • Perolehan {a.acquisition_date?.slice(0,10)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 border rounded-xl p-2"><div className="text-gray-500">Harga Perolehan</div><div className="font-black">{new Intl.NumberFormat('id-ID').format(a.acquisition_cost)}</div></div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2"><div className="text-blue-700">Nilai Buku</div><div className="font-black">{new Intl.NumberFormat('id-ID').format(a.book_value||a.acquisition_cost)}</div></div>
          </div>
          <div className="text-xs mt-2">Umur {a.useful_life_years} th • {a.depreciation_method} • {a.status}</div>
          <button onClick={()=>openDep(a.id)} className="mt-3 text-xs px-3 py-1 bg-[#1E40AF] text-white rounded-full">Depresiasi</button>
        </div>
      ))}</div>
      {dep && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between"><h3 className="font-bold">Jadwal Depresiasi — {dep.asset.name}</h3><button onClick={()=>setDep(null)} className="px-3 py-1 border rounded-full">✕</button></div>
        <div className="text-xs text-gray-500 mt-1">Monthly: {new Intl.NumberFormat('id-ID').format(dep.monthly)} • Metode {dep.asset.depreciation_method}</div>
        <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">TAHUN</th><th className="p-2 text-right">DEPRESIASI</th><th className="p-2 text-right">AKUMULASI</th><th className="p-2 text-right">NILAI BUKU</th></tr></thead><tbody>{dep.schedule.map(s=>(
          <tr key={s.year} className="border-t"><td className="p-2 text-center">{s.year}</td><td className="p-2 text-right">{new Intl.NumberFormat('id-ID').format(s.depreciation)}</td><td className="p-2 text-right">{new Intl.NumberFormat('id-ID').format(s.accumulated)}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(s.book_value)}</td></tr>
        ))}</tbody></table></div>
      </div></div>}
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={create} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Tambah Aset</h3>
        <input required placeholder="Kode aset" value={form.asset_code} onChange={e=>setForm({...form,asset_code:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <input required placeholder="Nama aset" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="w-full h-10 border rounded-xl px-3"><option>BANGUNAN</option><option>KENDARAAN</option><option>ALAT</option><option>KANTOR</option></select>
        <input type="date" value={form.acquisition_date} onChange={e=>setForm({...form,acquisition_date:e.target.value})} className="w-full h-10 border rounded-xl px-3"/>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Harga perolehan" value={form.acquisition_cost} onChange={e=>setForm({...form,acquisition_cost:e.target.value})} className="h-10 border rounded-xl px-3"/>
          <input type="number" placeholder="Umur (tahun)" value={form.useful_life_years} onChange={e=>setForm({...form,useful_life_years:e.target.value})} className="h-10 border rounded-xl px-3"/>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 border rounded-xl">Batal</button><button className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl">Simpan</button></div>
      </form></div>}
    </div>
  )
}
`);

w('src/pages/Marketplace.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Marketplace(){
  const [channels,setChannels]=useState([]); const [orders,setOrders]=useState([]);
  const load=()=>{ api.get('/marketplace/channels').then(r=>setChannels(r.data)); api.get('/marketplace/orders').then(r=>setOrders(r.data)); };
  useEffect(()=>{load()},[]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Marketplace B2C</h1>
      <p className="text-sm text-gray-500 -mt-2">Sync stok & order Tokopedia/Shopee/Lazada • Auto SO • Rekonsiliasi settlement</p>
      <div className="grid md:grid-cols-2 gap-4">{channels.map(ch=>(
        <div key={ch.id} className="bg-white rounded-2xl border p-5"><div className="flex justify-between items-start"><div><div className="font-black">{ch.name}</div><div className="text-xs text-gray-500">{ch.store_id} • {ch.is_active? 'Aktif':'Nonaktif'} • Sync {ch.last_sync?.slice(0,16)||'—'}</div></div><button onClick={async()=>{ await api.post('/marketplace/sync',{channel_id: ch.id}); load(); }} className="h-8 px-3 bg-[#1E40AF] text-white rounded-full text-xs font-bold">Sync</button></div></div>
      ))}</div>
      <div className="bg-white rounded-2xl border overflow-hidden"><div className="p-4 font-bold border-b">Pesanan Marketplace — Auto-convert ke SO</div><div className="overflow-auto"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2 text-left">EXT ORDER</th><th className="p-2">CHANNEL</th><th className="p-2">PEMBELI</th><th className="p-2 text-right">TOTAL</th><th className="p-2">STATUS</th><th></th></tr></thead><tbody>{orders.map(o=>(
        <tr key={o.id} className="border-t"><td className="p-2 font-mono">{o.external_order_id}</td><td className="p-2"><Badge status={o.channel_name}/></td><td className="p-2">{o.buyer_name} <span className="text-gray-400">{o.buyer_phone}</span></td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(o.total)}</td><td className="p-2 text-center"><Badge status={o.status}/></td><td className="p-2">{o.status==='PENDING' && <button onClick={async()=>{ await api.post('/marketplace/orders/'+o.id+'/convert'); load(); }} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-full">Convert SO</button>}{o.so_id && <span className="text-xs text-emerald-700">SO #{o.so_id}</span>}</td></tr>
      ))} {orders.length===0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">Belum ada order — klik Sync di channel</td></tr>}</tbody></table></div></div>
    </div>
  )
}
`);

w('src/pages/Credit.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Credit(){
  const [holds,setHolds]=useState([]); const [promises,setPromises]=useState([]); const [reminders,setReminders]=useState([]);
  const [check,setCheck]=useState({customer_id:'', result:null}); const [customers,setCustomers]=useState([]);
  const load=()=>{ api.get('/credit/holds').then(r=>setHolds(r.data)); api.get('/credit/promises').then(r=>setPromises(r.data)); api.get('/credit/reminders').then(r=>setReminders(r.data)).catch(()=>{}); };
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); },[]);
  const doCheck=async()=>{
    const r=await api.get('/credit/check/'+check.customer_id);
    setCheck({...check, result:r.data});
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Kontrol Piutang Ketat</h1>
      <p className="text-sm text-gray-500 -mt-2">Credit limit • Hold (hanya Direktur buka) • Promise to pay • Dunning letter • Reminder WA H-7/H-3/H-1/H+1/H+7</p>
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="font-bold">Cek Blokir Customer</h3>
        <div className="flex gap-2 mt-3">
          <select value={check.customer_id} onChange={e=>setCheck({...check, customer_id:e.target.value})} className="flex-1 h-10 border rounded-xl px-3"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name} • limit {new Intl.NumberFormat('id-ID').format(c.credit_limit)}</option>)}</select>
          <button onClick={doCheck} className="h-10 px-5 bg-[#1E40AF] text-white rounded-xl font-bold">Cek</button>
        </div>
        {check.result && <div className={"mt-3 p-3 rounded-xl border "+(check.result.blocked?"bg-red-50 border-red-200":"bg-emerald-50 border-emerald-200")}>
          <div className="text-sm">Limit {new Intl.NumberFormat('id-ID').format(check.result.credit_limit)} • Outstanding {new Intl.NumberFormat('id-ID').format(check.result.outstanding)} • Usage {check.result.usage_pct}% {check.result.is_hold && <Badge status="ON_HOLD"/>}</div>
          {check.result.warning && <div className="text-xs text-red-700 mt-1">{check.result.warning}</div>}
          {!check.result.blocked && <div className="text-xs text-emerald-700">✓ Aman untuk jual</div>}
        </div>}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Customer di-HOLD</h3><div className="mt-3 space-y-2 max-h-[260px] overflow-auto">{holds.map(h=>(
          <div key={h.id} className="p-3 border rounded-xl bg-red-50 border-red-200"><div className="font-bold text-sm">{h.name}</div><div className="text-xs text-red-700">{h.hold_reason}</div><button onClick={async()=>{ if(!confirm('Buka blokir? Hanya Direktur'))return; await api.post('/credit/unhold',{customer_id:h.id}).catch(e=>alert(e.response?.data?.error)); load(); }} className="mt-2 text-xs px-3 py-1 bg-white border rounded-full font-bold">Buka Blokir</button></div>
        ))}{holds.length===0 && <div className="text-xs text-gray-400">Tidak ada hold</div>}</div></div>
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Promise to Pay</h3><div className="max-h-[260px] overflow-auto mt-3"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">CUSTOMER</th><th className="p-2">JANJI</th><th className="p-2 text-right">NILAI</th><th className="p-2">STATUS</th></tr></thead><tbody>{promises.map(p=>(
          <tr key={p.id} className="border-t"><td className="p-2">{p.customer_name}</td><td className="p-2 text-center">{p.promise_date?.slice(0,10)}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(p.amount)}</td><td className="p-2 text-center"><Badge status={p.status}/></td></tr>
        ))}</tbody></table></div></div>
      </div>
      <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Reminder WA Otomatis — Preview</h3><div className="mt-3 space-y-1 text-xs">{reminders.map((r,i)=> <div key={i} className="flex justify-between p-2 bg-gray-50 border rounded-lg"><span>{r.customer_name} • {r.invoice_number} • {r.due_date?.slice(0,10)} ({r.diff} hari)</span><span className="px-2 py-1 bg-emerald-600 text-white rounded-full">{r.template}</span></div>)}{reminders.length===0 && <div className="text-gray-400">Tidak ada reminder hari ini</div>}</div></div>
    </div>
  )
}
`);

w('src/pages/Calculator.jsx', `
import { useState } from 'react';
import api from '../lib/api';
export default function Calculator(){
  const [type,setType]=useState('keramik'); const [form,setForm]=useState({length:6, width:8, waste_pct:10, tile_size:0.36}); const [result,setResult]=useState(null); const [loading,setLoading]=useState(false);
  const [withQuotation,setWithQuotation]=useState(false);
  const calc=async()=>{
    setLoading(true);
    const r=await api.post('/calculator/estimate',{type, ...form, waste_pct: parseFloat(form.waste_pct), length: parseFloat(form.length), width: parseFloat(form.width)});
    setResult(r.data);
    if(withQuotation){
      const q=await api.post('/calculator/quotation',{...form, type});
      setResult(prev=>({...prev, quotation:q.data}));
    }
    setLoading(false);
  };
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-black">Kalkulator Material — Bikin Customer Balik Lagi</h1>
      <p className="text-sm text-gray-500">Input luas • sistem hitung kebutuhan • auto jadi quotation • landing marketing</p>
      <div className="bg-white rounded-2xl border p-6 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select value={type} onChange={e=>setType(e.target.value)} className="h-10 border rounded-xl px-3"><option value="keramik">Keramik 60x60</option><option value="cat">Cat Tembok</option><option value="bata">Bata/Batako</option><option value="plester">Plester</option></select>
          <input type="number" value={form.length} onChange={e=>setForm({...form,length:e.target.value})} placeholder="Panjang (m)" className="h-10 border rounded-xl px-3"/>
          <input type="number" value={form.width} onChange={e=>setForm({...form,width:e.target.value})} placeholder="Lebar (m)" className="h-10 border rounded-xl px-3"/>
          <input type="number" value={form.waste_pct} onChange={e=>setForm({...form,waste_pct:e.target.value})} placeholder="Waste %" className="h-10 border rounded-xl px-3"/>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withQuotation} onChange={e=>setWithQuotation(e.target.checked)}/> Auto buat quotation (valid 14 hari)</label>
        <button onClick={calc} disabled={loading} className="w-full h-11 bg-[#1E40AF] text-white rounded-xl font-bold disabled:opacity-50">{loading?'Menghitung...':'Hitung Kebutuhan'}</button>
        {result && <div className="bg-[#F9FAFB] border rounded-2xl p-4 space-y-2">
          <div className="font-bold">Hasil Estimasi</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(result).filter(([k])=> k!=='quotation').map(([k,v])=> <div key={k} className="flex justify-between bg-white border rounded-lg px-3 py-2"><span className="text-gray-500">{k}</span><span className="font-bold">{String(v)}</span></div>)}
          </div>
          <div className="text-xs text-gray-500">{result.catatan||''}</div>
          {result.quotation && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm"><b>Quotation {result.quotation.quotation_number}</b> • Valid {result.quotation.valid_days} hari • {result.quotation.note}</div>}
          <div className="text-xs text-[#1E40AF]">Contoh: Lantai 6x8m keramik 60x60 butuh ~14 dus (waste 10% included). Klik "Buat SO" untuk lanjut.</div>
        </div>}
        <div className="text-xs text-gray-400">Bisa jadi landing page marketing — pickup SEO "kalkulator keramik".</div>
      </div>
    </div>
  )
}
`);

w('src/pages/Approvals.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Approvals(){
  const [data,setData]=useState([]); const [tab,setTab]=useState('PENDING');
  const load=()=> api.get('/approvals',{params:{status:tab}}).then(r=>setData(r.data));
  useEffect(()=>{load()},[tab]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Approval Mobile — Push & Delegasi • e-Signature</h1>
      <p className="text-sm text-gray-500 -mt-2">Semua dokumen pending di sini • Approve/Reject/Delegasi • Audit trail siapa approve kapan</p>
      <div className="flex gap-2"><button onClick={()=>setTab('PENDING')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='PENDING'?"bg-[#1E40AF] text-white":"bg-white")}>Pending</button><button onClick={()=>setTab('APPROVED')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='APPROVED'?"bg-emerald-600 text-white":"bg-white")}>Approved</button><button onClick={()=>setTab('REJECTED')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='REJECTED'?"bg-red-600 text-white":"bg-white")}>Rejected</button></div>
      <div className="space-y-2">{data.map(a=>(
        <div key={a.id} className="bg-white rounded-2xl border p-4 flex justify-between items-center">
          <div><div className="font-bold text-sm">{a.entity_type} #{a.entity_id}</div><div className="text-xs text-gray-500">Requester {a.requester_name} → Approver {a.approver_name} {a.delegated_name? '→ delegate '+a.delegated_name:''} • Level {a.level}</div><div className="text-xs text-gray-400">{a.requested_at?.slice(0,16)} {a.responded_at? '→ '+a.responded_at.slice(0,16):''} {a.notes? '• '+a.notes:''}</div></div>
          <div className="flex gap-1 items-center"><Badge status={a.status}/>{a.status==='PENDING' && <>
            <button onClick={async()=>{ await api.post('/approvals/'+a.id+'/approve'); load(); }} className="px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-bold">Approve</button>
            <button onClick={async()=>{ const n=prompt('Alasan reject'); await api.post('/approvals/'+a.id+'/reject',{notes:n}); load(); }} className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold">Reject</button>
            <button onClick={async()=>{ const to=prompt('Delegate ke user id'); if(!to) return; await api.post('/approvals/'+a.id+'/delegate',{delegated_to: parseInt(to)}); load(); }} className="px-3 py-1 bg-white border rounded-full text-xs">Delegate</button>
          </>}</div>
        </div>
      ))}{data.length===0 && <div className="text-center py-12 text-gray-400">Tidak ada approval {tab.toLowerCase()}</div>}</div>
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="font-bold text-sm">Buat Request Test</h3>
        <form onSubmit={async e=>{ e.preventDefault(); const fd=new FormData(e.target); await api.post('/approvals/request',{entity_type:fd.get('entity_type'), entity_id: parseInt(fd.get('entity_id')), approver_id: parseInt(fd.get('approver_id'))}); load(); }} className="flex gap-2 mt-2">
          <select name="entity_type" className="h-9 border rounded-lg px-2 text-xs"><option value="SALES_ORDER">SALES_ORDER</option><option value="PURCHASE_ORDER">PURCHASE_ORDER</option><option value="WASTE">WASTE</option></select>
          <input name="entity_id" placeholder="ID" className="w-20 h-9 border rounded-lg px-2 text-xs"/>
          <input name="approver_id" placeholder="Approver user id" className="w-32 h-9 border rounded-lg px-2 text-xs"/>
          <button className="h-9 px-4 bg-[#1E40AF] text-white rounded-lg text-xs font-bold">Request</button>
        </form>
      </div>
    </div>
  )
}
`);

w('src/pages/Audit.jsx', `
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Audit(){
  const [logs,setLogs]=useState([]); const [changes,setChanges]=useState([]); const [fraud,setFraud]=useState(null); const [seg,setSeg]=useState([]);
  const load=()=>{ api.get('/audit/logs').then(r=>setLogs(r.data)); api.get('/audit/data-changes').then(r=>setChanges(r.data)); api.get('/audit/fraud').then(r=>setFraud(r.data)); api.get('/audit/segregation').then(r=>setSeg(r.data)); };
  useEffect(()=>{load()},[]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Audit Trail & GRC</h1>
      <p className="text-sm text-gray-500 -mt-2">Siapa ubah apa kapan dari IP mana • Segregation of duties • Fraud detection</p>
      {fraud && <div className="grid grid-cols-3 gap-3"><div className="bg-white rounded-xl border p-4 text-center"><div className="text-lg font-black text-red-600">{fraud.big_discount?.length||0}</div><div className="text-xs">Diskon besar &gt;20%</div></div><div className="bg-white rounded-xl border p-4 text-center"><div className="text-lg font-black text-amber-600">{fraud.night_transactions?.length||0}</div><div className="text-xs">Transaksi 00-05</div></div><div className="bg-white rounded-xl border p-4 text-center"><div className="text-lg font-black">{fraud.alerts||0}</div><div className="text-xs">Total alerts</div></div></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Audit Logs (transaksi)</h3><div className="max-h-[300px] overflow-auto mt-3 space-y-1">{logs.slice(0,15).map(l=>(
          <div key={l.id} className="p-2 border rounded-lg bg-gray-50 text-xs"><div className="font-bold">{l.action} {l.entity_type} #{l.entity_id} by {l.username||l.user_id} • {l.created_at?.slice(0,16)}</div><div className="text-gray-500 truncate">{JSON.stringify(l.new_value||l.old_value||'').slice(0,120)}</div></div>
        ))}</div></div>
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Data Change Logs (master)</h3><div className="max-h-[300px] overflow-auto mt-3 space-y-1">{changes.slice(0,15).map(c=>(
          <div key={c.id} className="p-2 border rounded-lg bg-amber-50 text-xs"><div className="font-bold">{c.table_name} #{c.record_id} • {c.field_name} • by {c.changed_by_name||c.changed_by}</div><div><span className="line-through text-red-600">{String(c.old_value||'').slice(0,40)}</span> → <span className="text-emerald-700">{String(c.new_value||'').slice(0,40)}</span></div><div className="text-gray-500">{c.reason||''} • {c.changed_at?.slice(0,16)}</div></div>
        ))}{changes.length===0 && <div className="text-xs text-gray-400">Belum ada perubahan master tercatat</div>}</div></div>
      </div>
      <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Segregation of Duties — Pelanggaran (buat & approve sendiri)</h3><div className="mt-3 text-xs">{seg.length? seg.map(s=> <div key={s.doc} className="p-2 border rounded-lg bg-red-50 border-red-200">{s.type} {s.doc} — creator {s.created_by} = approver {s.approved_by}</div>) : <span className="text-emerald-700">✓ Tidak ada pelanggaran</span>}</div></div>
    </div>
  )
}
`);

console.log('pages done');
