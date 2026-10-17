import { NavLink, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, Wallet, Users, Kanban, BarChart3, LogOut, Menu, X, Search, Bell, Building2, Handshake, Calculator, BadgeDollarSign, Wrench, Gift, PiggyBank, ShieldAlert, Workflow, FileWarning, Flame, Plus, ArrowRight, PackagePlus, ArrowRightLeft, Settings as SettingsIcon, CalendarDays, Megaphone, UserCircle, Clock } from 'lucide-react';
import { useAuth } from '../store/auth';
import { PAGE_ACCESS, canAccess } from '../config/access';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../lib/api';
import SearchModal from './SearchModal';

// Gating menu: hak akses per item diambil dari src/config/access.js
// (satu sumber yang sama dipakai route guard di App.jsx dan rbac backend).
const nav = [
  { label:'Dashboard', to:'/', icon:LayoutDashboard, access:'dashboard' },
  { label:'PENJUALAN', heading:true },
  { label:'Sales Order', to:'/sales/orders', icon:ShoppingCart, access:'salesOrders' },
  { label:'Invoice (AR)', to:'/sales/invoices', icon:Wallet, access:'invoices' },
  { label:'POS Kasir', to:'/sales/pos', icon:Kanban, access:'pos' },
  { label:'Kalkulator Material', to:'/calculator', icon:Calculator, access:'calculator' },
  { label:'CRM & Leads', to:'/crm', icon:Users, access:'crm' },
  { label:'PROYEK', heading:true },
  { label:'Proyek & Tender', to:'/projects', icon:Building2, access:'projects' },
  { label:'PEMBELIAN', heading:true },
  { label:'Purchase Order', to:'/purchase/orders', icon:Truck, access:'purchase' },
  { label:'Goods Receipt', to:'/purchase/receipts', icon:Warehouse, access:'purchase' },
  { label:'Landed Cost', to:'/landed-costs', icon:BadgeDollarSign, access:'landedCosts' },
  { label:'BARANG & PERSEDIAAN', heading:true },
  { label:'Katalog Produk', to:'/master/products', icon:Package, access:'masterProducts' },
  { label:'Stok per Gudang', to:'/inventory/stocks', icon:Warehouse, access:'inventory' },
  { label:'Penambahan Stok', to:'/inventory/stock-in', icon:PackagePlus, access:'inventory' },
  { label:'Kartu Stok', to:'/inventory/movements', icon:BarChart3, access:'inventory' },
  { label:'Transfer Gudang', to:'/inventory/transfers', icon:ArrowRightLeft, access:'inventory' },
  { label:'Konsinyasi', to:'/consignments', icon:Handshake, access:'consignments' },
  { label:'Susut & Pecah', to:'/waste', icon:Flame, access:'waste' },
  { label:'OPERASIONAL', heading:true },
  { label:'Logistik (DO)', to:'/logistics', icon:Truck, access:'logistics' },
  { label:'Armada & Trip', to:'/fleet', icon:Wrench, access:'fleet' },
  { label:'KEUANGAN', heading:true },
  { label:'COA & Jurnal', to:'/finance/coa', icon:Wallet, access:'finance' },
  { label:'Jurnal Umum', to:'/finance/journals', icon:Wallet, access:'finance' },
  { label:'AR / AP', to:'/finance/arap', icon:Wallet, access:'finance' },
  { label:'Laporan BI', to:'/reports', icon:BarChart3, access:'reports' },
  { label:'Budget & Cashflow', to:'/budgets', icon:PiggyBank, access:'budgets' },
  { label:'Aset Tetap', to:'/assets', icon:Building2, access:'assets' },
  { label:'LOYALTY', heading:true },
  { label:'Loyalty & Tier', to:'/loyalty', icon:Gift, access:'loyalty' },
  { label:'Pricing Engine', to:'/pricing', icon:BadgeDollarSign, access:'pricing' },
  { label:'Retur & Klaim', to:'/returns', icon:FileWarning, access:'returns' },
  { label:'SDM', heading:true },
  { label:'Karyawan & HR', to:'/hr', icon:Users, access:'hr' },
  { label:'MASTER', heading:true },
  { label:'Pelanggan', to:'/master/customers', icon:Users, access:'masterCustomers' },
  { label:'Supplier', to:'/master/suppliers', icon:Truck, access:'masterSuppliers' },
  { label:'Audit & GRC', to:'/audit', icon:ShieldAlert, access:'audit' },
  { label:'Approval', to:'/approvals', icon:Workflow, access:'approvals' },
  { label:'Pengaturan Sistem', to:'/settings', icon:SettingsIcon, access:'settings' },
  { label:'SAYA', heading:true },
  { label:'Pengumuman', to:'/pengumuman', icon:Megaphone, access:'announcements' },
  { label:'Absensi Saya', to:'/absen', icon:Clock, access:'myAttendance' },
  { label:'Cuti Saya', to:'/cuti', icon:CalendarDays, access:'myLeave' },
  { label:'Trip Saya', to:'/driver', icon:Truck, access:'driverTrips' },
  { label:'Profil Saya', to:'/profil', icon:UserCircle, access:'myProfile' },
];
export function Badge({status}){
  const m={ DRAFT:'bg-gray-100 text-gray-700 border-gray-200', PENDING:'bg-amber-100 text-amber-800 border-amber-200', APPROVED:'bg-blue-100 text-blue-800 border-blue-200', PICKING:'bg-purple-100 text-purple-800 border-purple-200', PROCESSING:'bg-purple-100 text-purple-800 border-purple-200', IN_TRANSIT:'bg-cyan-100 text-cyan-800 border-cyan-200', SHIPPED:'bg-sky-100 text-sky-800 border-sky-200', PARTIAL:'bg-orange-100 text-orange-800 border-orange-200', COMPLETED:'bg-emerald-100 text-emerald-800 border-emerald-200', PAID:'bg-green-100 text-green-800 border-green-200', OVERDUE:'bg-red-100 text-red-700 border-red-200', CANCELLED:'bg-zinc-200 text-zinc-700', ON_HOLD:'bg-amber-900/10 text-amber-900 border-amber-200', CONSIGNED:'bg-teal-100 text-teal-800 border-teal-200', ACTIVE:'bg-emerald-100 text-emerald-800', CLOSED:'bg-zinc-100 text-zinc-600', SUBMITTED:'bg-blue-100 text-blue-800', IN_REVIEW:'bg-amber-100 text-amber-800' };
  return <span className={"badge border "+(m[status]||'bg-gray-100')}>{status}</span>
}
export default function Layout({children}){
  const {user, logout} = useAuth();
  const [open,setOpen]=useState(false);
  const [time,setTime]=useState(new Date());
  const [searchOpen, setSearchOpen]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);
  const [health,setHealth]=useState('checking');   // checking | ok | down
  const [notifItems,setNotifItems]=useState([]);
  const [notifOpen,setNotifOpen]=useState(false);
  const notifRef=useRef(null);

  const myRoles = useMemo(()=> (user?.roles||[]).map(r=>String(r).toLowerCase()), [user]);

  // Menu yang tampil sesuai role; heading ikut disembunyikan kalau semua item di bawahnya tersembunyi.
  const visibleNav = useMemo(()=>{
    const ok = (n)=> !n.access || canAccess(myRoles, PAGE_ACCESS[n.access]);
    const out=[];
    for(let i=0;i<nav.length;i++){
      const n=nav[i];
      if(n.heading){
        let has=false;
        for(let j=i+1;j<nav.length && !nav[j].heading;j++){ if(ok(nav[j])){ has=true; break; } }
        if(has) out.push(n);
      } else if(ok(n)) out.push(n);
    }
    return out;
  },[myRoles]);

  useEffect(()=>{ const interval=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(interval); },[]);
  useEffect(()=>{
    const handleKeyDown=(e)=>{
      if((e.ctrlKey || e.metaKey) && e.key==='k') { e.preventDefault(); setSearchOpen(true); }
      if(e.key==='/') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return ()=>window.removeEventListener('keydown', handleKeyDown);
  },[]);
  // Status backend nyata (bukan strip dekoratif): ping /api/health tiap 60 detik.
  useEffect(()=>{
    let alive=true;
    const ping=()=>api.get('/health').then(()=>alive&&setHealth('ok')).catch(()=>alive&&setHealth('down'));
    ping();
    const iv=setInterval(ping,60000);
    return ()=>{ alive=false; clearInterval(iv); };
  },[]);
  // Notifikasi nyata per role (stok kritis, invoice/PO telat, cuti & approval menunggu).
  const loadNotif = useCallback(()=>{
    api.get('/dashboard/my-notifications').then(r=>setNotifItems(Array.isArray(r.data)?r.data:[])).catch(()=>{});
  },[]);
  useEffect(()=>{ loadNotif(); const iv=setInterval(loadNotif,120000); return ()=>clearInterval(iv); },[loadNotif]);
  useEffect(()=>{
    if(!notifOpen) return;
    const h=(e)=>{ if(notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    window.addEventListener('mousedown',h); return ()=>window.removeEventListener('mousedown',h);
  },[notifOpen]);
  const notifCount = notifItems.reduce((a,x)=>a+(x.count||0),0);

  const role = user?.roles?.[0] || 'staff';
  return (
    <div className="min-h-screen flex">
      <aside className={"w-[268px] bg-[#0F172A] text-white hidden lg:flex flex-col sticky top-0 h-screen overflow-hidden"}>
        <div className="h-[64px] flex items-center gap-3 px-6 border-b border-white/10 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#1E40AF] flex items-center justify-center font-black text-white">M</div>
          <div><div className="font-extrabold leading-none text-[15px]">MATERIAL ERP</div><div className="text-[11px] text-white/60 tracking-widest">SUMBER MATERIAL JAYA</div></div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleNav.map((n,i)=> n.heading ? <div key={i} className="pt-4 pb-1 px-3 text-[10px] tracking-[.14em] font-bold text-white/40">{n.label}</div> :
            <NavLink key={n.to} to={n.to} className={({isActive})=> "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition "+(isActive?"bg-white text-[#0F172A] shadow":"text-white/80 hover:bg-white/10 hover:text-white") }>
              <n.icon size={18} strokeWidth={n.label==='Dashboard'?2:1.8}/>{n.label}
            </NavLink>
          )}
        </div>
        <div className="p-3 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F59E0B] flex items-center justify-center font-bold text-[#0F172A]">{(user?.username||'A')[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{user?.username}</div><div className="text-xs text-white/60 capitalize truncate">{role}</div></div>
            <button onClick={logout} className="p-1.5 hover:bg-white/10 rounded-lg" title="Keluar"><LogOut size={16}/></button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={()=>setOpen(false)}/><div className="absolute inset-y-0 left-0 w-[280px] bg-[#0F172A] text-white p-4 overflow-auto"><div className="flex justify-between items-center mb-4"><span className="font-black">MATERIAL ERP</span><button onClick={()=>setOpen(false)}><X/></button></div>{visibleNav.map((n,i)=> n.heading ? <div key={i} className="pt-3 pb-1 text-[10px] tracking-widest text-white/40">{n.label}</div> : <NavLink key={n.to} to={n.to} onClick={()=>setOpen(false)} className={({isActive})=>"flex gap-2 px-3 py-2 rounded-lg "+(isActive?"bg-white text-[#0F172A]":"text-white/80")}><n.icon size={16}/>{n.label}</NavLink>)}</div></div>}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[64px] bg-white border-b border-gray-200 sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-6">
          <button className="lg:hidden p-2" onClick={()=>setOpen(true)}><Menu size={20}/></button>
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
            <span className={"w-2 h-2 rounded-full "+(health==='ok'?'bg-emerald-500':health==='down'?'bg-red-500':'bg-gray-300')}/>
            <span>{health==='ok'?'Sistem normal':health==='down'?'Koneksi backend terganggu':'Memeriksa sistem...'}</span>
          </div>
          <div className="flex-1 flex justify-center"><div onClick={()=>setSearchOpen(true)} className="hidden lg:flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 w-[420px] cursor-pointer hover:bg-gray-200 transition"><Search size={16} className="text-gray-400"/><span className="text-sm text-gray-500 flex-1">Cari SO, PO, proyek...</span><span className="text-xs text-gray-400">Ctrl+K</span></div></div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-xs text-gray-600 font-mono whitespace-nowrap px-3 py-1 bg-gray-50 rounded">{time.toLocaleDateString('id-ID')} {time.toLocaleTimeString('id-ID')}</div>
            <div className="relative" ref={notifRef}>
              <button onClick={()=>{ setNotifOpen(o=>!o); if(!notifOpen) loadNotif(); }} title="Notifikasi" className="relative p-2 hover:bg-gray-100 rounded-xl">
                <Bell size={18}/>
                {notifCount>0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">{notifCount>99?'99+':notifCount}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-[300px] bg-white border border-[#E2E8F0] rounded-[16px] shadow-xl overflow-hidden z-30 animate-pop">
                  <div className="px-4 py-2.5 border-b border-[#F1F5F9] text-[11px] font-bold tracking-widest text-[#64748B]">PERLU PERHATIAN</div>
                  {notifItems.length===0 ? <div className="px-4 py-6 text-center text-sm text-[#94A3B8]">Tidak ada notifikasi</div> : (
                    <div className="max-h-[320px] overflow-auto">
                      {notifItems.map((n,i)=>(
                        <Link key={i} to={n.to} onClick={()=>setNotifOpen(false)} className="flex items-start gap-2.5 px-4 py-3 hover:bg-[#F8FAFC] border-b border-[#F1F5F9] last:border-0">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1E40AF] shrink-0"/>
                          <span className="flex-1 text-[13px] text-[#334155] leading-snug">{n.label}</span>
                          <span className="text-[11px] font-bold text-[#1E40AF] tabular-nums">{n.count}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l ml-1">
              <div className="text-right leading-tight"><div className="text-sm font-semibold">{user?.username}</div>{user?.branch_name && <div className="text-xs text-gray-500">{user.branch_name}</div>}</div>
              <div className="w-8 h-8 rounded-full bg-[#1E40AF] text-white grid place-items-center font-bold text-xs">{(user?.username||'U')[0].toUpperCase()}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 bg-[#F9FAFB]">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-3">© 2026 PT Sumber Material Jaya - Sistem ERP Internal</footer>
      </div>
      <SearchModal open={searchOpen} onClose={()=>setSearchOpen(false)} />
      <button onClick={()=>setQuickOpen(true)} aria-label="Aksi cepat" className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#1E40AF] text-white shadow-xl grid place-items-center hover:bg-blue-800 transition active:scale-95 z-30">
        <Plus size={26} strokeWidth={2.5} />
      </button>
      <QuickModal open={quickOpen} onClose={()=>setQuickOpen(false)} />
    </div>
  )
}

const QUICK_ACTIONS = [
  { id:'so', label:'Sales Order Baru', desc:'Buat SO penjualan', hint:'so', to:'/sales/orders/new', icon:ShoppingCart },
  { id:'po', label:'Purchase Order', desc:'Kelola PO pembelian', hint:'po', to:'/purchase/orders', icon:Truck },
  { id:'proyek', label:'Proyek & Tender', desc:'Daftar proyek', hint:'proyek', to:'/projects', icon:Building2 },
  { id:'kalkulator', label:'Kalkulator Material', desc:'Hitung kebutuhan', hint:'kalkulator', to:'/calculator', icon:Calculator },
  { id:'stok', label:'Stok Inventory', desc:'Lihat stok gudang', hint:'stok', to:'/inventory/stocks', icon:Package },
];

function QuickModal({ open, onClose }){
  const navigate = useNavigate();
  const [q,setQ]=useState('');
  const inputRef=useRef(null);
  useEffect(()=>{ if(open){ setQ(''); setTimeout(()=>inputRef.current?.focus(),10); } },[open]);
  useEffect(()=>{ if(!open) return; const h=(e)=>{ if(e.key==='Escape') onClose(); }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[open,onClose]);
  if(!open) return null;
  const filtered = QUICK_ACTIONS.filter(a => !q.trim() || a.hint.includes(q.toLowerCase()) || a.label.toLowerCase().includes(q.toLowerCase()));
  const go=(to)=>{ onClose(); navigate(to); };
  const handleSubmit=(e)=>{
    e.preventDefault();
    const val=q.trim().toLowerCase();
    const match=QUICK_ACTIONS.find(a=>a.hint===val);
    if(match) go(match.to);
    else if(filtered[0]) go(filtered[0].to);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-[20px] shadow-2xl w-full max-w-[480px] overflow-hidden animate-pop">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] tracking-[.14em] font-bold text-[#64748B]">AKSI CEPAT</div>
              <h2 className="text-[18px] font-bold text-[#0F172A] mt-1">Mau ke mana?</h2>
              <p className="text-sm text-[#64748B] mt-1">Ketik <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">so</span> <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">po</span> <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">proyek</span> <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">kalkulator</span> <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">stok</span> atau pilih di bawah</p>
            </div>
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-gray-500"><X size={16}/></button>
          </div>
          <form onSubmit={handleSubmit} className="mt-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Ketik: so, po, proyek, kalkulator, stok..." className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition" />
          </form>
        </div>
        <div className="px-3 pb-3 grid grid-cols-1 gap-1.5 max-h-[320px] overflow-auto">
          {filtered.length===0 && <div className="py-10 text-center text-sm text-gray-400">Tidak ada aksi untuk &quot;{q}&quot;</div>}
          {filtered.map(a=>(
            <button key={a.id} onClick={()=>go(a.to)} className="flex items-center gap-3 w-full text-left px-3 py-3.5 rounded-xl hover:bg-[#F1F5F9] border border-transparent hover:border-[#E2E8F0] transition group">
              <span className="w-10 h-10 rounded-xl bg-[#1E40AF] text-white grid place-items-center shrink-0 group-hover:bg-[#1E3A8A] transition"><a.icon size={18}/></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[#0F172A] leading-none">{a.label}</span>
                <span className="block text-xs text-[#64748B] mt-1">{a.desc} - <span className="font-mono font-bold text-[#1E40AF]">{a.hint}</span></span>
              </span>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-[#1E40AF] transition" />
            </button>
          ))}
        </div>
        <div className="px-6 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between">
          <span className="text-xs text-gray-500"><kbd className="px-1.5 py-1 bg-white border rounded text-[11px]">ESC</kbd> tutup - <kbd className="px-1.5 py-1 bg-white border rounded text-[11px]">Enter</kbd> buka</span>
          <button onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-[#0F172A] px-3 py-1.5">Batal</button>
        </div>
      </div>
    </div>
  );
}
