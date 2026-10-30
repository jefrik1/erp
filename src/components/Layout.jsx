import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, Wallet, Users, Kanban, BarChart3, LogOut, Menu, X, Search, Bell, Building2, Handshake, Calculator, BadgeDollarSign, Wrench, Gift, PiggyBank, ShieldAlert, Workflow, FileWarning, Flame, Plus, ArrowRight, PackagePlus, ArrowRightLeft, Settings as SettingsIcon, CalendarDays, Megaphone, UserCircle, Clock, PanelLeftClose, PanelLeftOpen, CalendarClock, MapPin, ChevronRight, AlertTriangle, Receipt, CheckCircle2, PackageOpen, FileText, CalendarCheck, ClipboardList, CreditCard, BookOpen, Send, BookOpenCheck, Landmark, Boxes, SlidersHorizontal, Bug } from 'lucide-react';
import { useAuth } from '../store/auth';
import { PAGE_ACCESS, canAccess } from '../config/access';
import { LOCATION, LOCATION_COORDINATES } from '../config/location';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../lib/api';
import SearchModal from './SearchModal';

// Notifikasi: ikon & warna semantik per jenis (mengikuti Stitch "Sistem Notifikasi").
const NOTIF_META = {
  stock:      { icon: AlertTriangle, cls:'bg-warning-soft text-warning border-warning-line/50', pill:'bg-warning-soft text-warning' },
  invoice:    { icon: Receipt,       cls:'bg-danger-soft text-danger border-danger-line/50', pill:'bg-danger-soft text-danger' },
  po:         { icon: Truck,         cls:'bg-info-soft text-info border-info-line/50', pill:'bg-info-soft text-info' },
  delivery:   { icon: PackageOpen,   cls:'bg-[#f3efff] text-[#5b3fd6] border-[#e8ddff]', pill:'bg-[#f3efff] text-[#5b3fd6]' },
  do_invoice: { icon: FileText,      cls:'bg-surface-3 text-brand border-[#cfe0ff]', pill:'bg-surface-3 text-brand' },
  so_ready:   { icon: ShoppingCart,  cls:'bg-info-soft text-info border-info-line/50', pill:'bg-info-soft text-info' },
  leave:      { icon: CalendarCheck, cls:'bg-success-soft text-success border-success-line/50', pill:'bg-success-soft text-success' },
  attendance_late: { icon: Clock, cls:'bg-warning-soft text-warning border-warning-line/50', pill:'bg-warning-soft text-warning' },
  approval:   { icon: CheckCircle2,  cls:'bg-[#f3efff] text-[#5b3fd6] border-[#e8ddff]', pill:'bg-[#f3efff] text-[#5b3fd6]' },
  info:       { icon: Bell,          cls:'bg-surface-2 text-ink-2 border-line', pill:'bg-surface-2 text-ink-2' },
};

// Gating menu: hak akses per item diambil dari src/config/access.js
// (satu sumber yang sama dipakai route guard di App.jsx dan rbac backend).
const nav = [
  { label:'Dashboard', to:'/', icon:LayoutDashboard, access:'dashboard' },
  { label:'PENJUALAN', heading:true },
  { label:'Sales Order', to:'/sales/orders', icon:ShoppingCart, access:'salesOrders' },
  { label:'Riwayat Order', to:'/sales/order-history', icon:FileText, access:'orderHistory' },
  { label:'Invoice (AR)', to:'/sales/invoices', icon:Wallet, access:'invoices' },
  { label:'POS Kasir', to:'/sales/pos', icon:Kanban, access:'pos' },
  { label:'Kalkulator Material', to:'/calculator', icon:Calculator, access:'calculator' },
  { label:'CRM & Leads', to:'/crm', icon:Users, access:'crm' },
  { label:'PROYEK', heading:true },
  { label:'Proyek & Tender', to:'/projects', icon:Building2, access:'projects' },
  { label:'PEMBELIAN', heading:true },
  { label:'Purchase Request', to:'/purchase/requests', icon:ClipboardList, access:'purchase' },
  { label:'RFQ Supplier', to:'/purchase/rfqs', icon:FileText, access:'purchase' },
  { label:'Purchase Order', to:'/purchase/orders', icon:Truck, access:'purchase' },
  { label:'Goods Receipt', to:'/purchase/receipts', icon:Warehouse, access:'purchase' },
  { label:'Landed Cost', to:'/landed-costs', icon:BadgeDollarSign, access:'landedCosts' },
  { label:'BARANG & PERSEDIAAN', heading:true },
  { label:'Katalog Produk', to:'/master/products', icon:Package, access:'masterProducts' },
  { label:'Stok per Gudang', to:'/inventory/stocks', icon:Warehouse, access:'inventory' },
  { label:'Penambahan Stok', to:'/inventory/stock-in', icon:PackagePlus, access:'inventory' },
  { label:'Kartu Stok', to:'/inventory/movements', icon:BarChart3, access:'inventory' },
  { label:'Stock Opname', to:'/inventory/opname', icon:ClipboardList, access:'opname' },
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
  { label:'Kolektibilitas', to:'/credit', icon:CreditCard, access:'credit' },
  { label:'Pajak & e-Faktur', to:'/finance/tax', icon:Receipt, access:'tax' },
  { label:'Tutup Buku', to:'/finance/periods', icon:BookOpenCheck, access:'periods' },
  { label:'Rekonsiliasi Bank', to:'/finance/recon', icon:Landmark, access:'recon' },
  { label:'Laporan BI', to:'/reports', icon:BarChart3, access:'reports' },
  { label:'Laporan Persediaan', to:'/reports/inventory', icon:Boxes, access:'inventoryReports' },
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
  { label:'Approval Matrix', to:'/approval-rules', icon:SlidersHorizontal, access:'approvalRules' },
  { label:'Log Error', to:'/errors', icon:Bug, access:'errors' },
  { label:'Pusat Notifikasi', to:'/notify', icon:Send, access:'notify' },
  { label:'Pengaturan Sistem', to:'/settings', icon:SettingsIcon, access:'settings' },
  { label:'SAYA', heading:true },
  { label:'Pengumuman', to:'/pengumuman', icon:Megaphone, access:'announcements' },
  { label:'Absensi Saya', to:'/absen', icon:Clock, access:'myAttendance' },
  { label:'Cuti Tahunan', to:'/cuti', icon:CalendarDays, access:'myLeave' },
  { label:'Izin & Sakit', to:'/izin', icon:CalendarClock, access:'myPermits' },
  { label:'Trip Saya', to:'/driver', icon:Truck, access:'driverTrips' },
  { label:'Surat Jalan', to:'/surat-jalan', icon:FileText, access:'suratJalan' },
  { label:'Profil Saya', to:'/profil', icon:UserCircle, access:'myProfile' },
  { label:'Panduan & Bantuan', to:'/panduan', icon:BookOpen, access:'dashboard' },
];

// Peta status → tone, satu sumber untuk seluruh aplikasi.
const STATUS_TONE = {
  DRAFT:'neutral', PENDING:'warning', APPROVED:'info', PICKING:'info', PROCESSING:'info',
  IN_TRANSIT:'info', SHIPPED:'info', PARTIAL:'warning', COMPLETED:'success', PAID:'success',
  OVERDUE:'danger', CANCELLED:'neutral', ON_HOLD:'warning', CONSIGNED:'neutral',
  ACTIVE:'success', CLOSED:'neutral', SUBMITTED:'info', IN_REVIEW:'warning',
};
const TONE_CLASS = {
  neutral: 'bg-surface-2 text-ink-2',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger:  'bg-danger-soft text-danger',
  info:    'bg-info-soft text-info',
};
export function Badge({status}){
  return <span className={"badge inline-flex items-center gap-1.5 "+(TONE_CLASS[STATUS_TONE[status]]||TONE_CLASS.neutral)}>
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>{status}
  </span>
}

export default function Layout({children}){
  // Transisi halaman: <main> di-remount per pathname → animasi page-enter main lagi.
  // Scroll selalu kembali ke atas supaya pindah halaman tidak mendarat di tengah.
  const pathname = useLocation().pathname;
  useEffect(()=>{ window.scrollTo({ top:0, left:0, behavior:'instant' }); },[pathname]);
  const {user, logout} = useAuth();
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(()=> localStorage.getItem('ui.sidebar')==='collapsed');
  const [navQ,setNavQ]=useState('');
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

  // Pencarian menu di dalam sidebar (bukan pencarian data).
  const shownNav = useMemo(()=>{
    const q = navQ.trim().toLowerCase();
    if(!q) return visibleNav;
    const out=[];
    for(let i=0;i<visibleNav.length;i++){
      const n=visibleNav[i];
      if(n.heading){ out.push(n); continue; }
      if(n.label.toLowerCase().includes(q)) out.push(n);
    }
    // buang heading yang tidak punya anak setelah filter
    return out.filter((n,i)=> !n.heading || (out[i+1] && !out[i+1].heading));
  },[visibleNav,navQ]);

  useEffect(()=>{ const interval=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(interval); },[]);
  useEffect(()=>{
    const handleKeyDown=(e)=>{
      if((e.ctrlKey || e.metaKey) && e.key==='k') { e.preventDefault(); setSearchOpen(true); }
      if(e.key==='/' && !/input|textarea|select/i.test(document.activeElement?.tagName||'')) { e.preventDefault(); setSearchOpen(true); }
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

  const toggleCollapsed = ()=>{
    setCollapsed(c=>{ localStorage.setItem('ui.sidebar', c?'expanded':'collapsed'); return !c; });
  };

  const role = user?.roles?.[0] || 'staff';
  const brand = (
    <div className={"flex items-center gap-2.5 "+(collapsed?'justify-center':'')}>
      <div className="w-9 h-9 rounded-lg bg-brand grid place-items-center font-display font-bold text-white text-[15px] shrink-0">SM</div>
      {!collapsed && (
        <div className="flex flex-col min-w-0">
          <span className="font-display text-headline-sm font-bold leading-tight tracking-tight text-white truncate">Sumber Material</span>
          <span className="text-label-sm uppercase tracking-wider text-white/65">Enterprise ERP</span>
        </div>
      )}
    </div>
  );

  const navList = (onNavigate)=> shownNav.map((n,i)=> n.heading ? (
    collapsed
      ? <div key={i} className="h-px bg-white/10 my-2 mx-2"/>
      : <div key={i} className="px-2 pt-3 pb-1 text-label-sm uppercase tracking-wider text-white/60 font-semibold">{n.label}</div>
  ) : (
    <NavLink key={n.to} to={n.to} onClick={onNavigate} title={collapsed?n.label:undefined}
      className={({isActive})=> "flex items-center rounded-lg transition-colors "+
        (collapsed?'justify-center h-10 mx-1':'gap-2.5 px-2 py-2 text-body-sm')+" "+
        (isActive
          ? "bg-brand-tint text-white font-semibold shadow-sm"
          : "text-white/70 hover:bg-white/5 hover:text-white") }>
      <n.icon size={20} strokeWidth={1.9} className="shrink-0"/>{!collapsed && <span className="truncate">{n.label}</span>}
    </NavLink>
  ));

  return (
    <div className="min-h-screen bg-bg">
      {/* ---------------------------------------------------------- sidebar */}
      <aside className={"fixed inset-y-0 left-0 z-50 hidden lg:flex flex-col bg-navy text-white transition-[width] duration-200 "+(collapsed?'w-16':'w-60')}>
        <div className={"h-14 flex items-center shrink-0 "+(collapsed?'justify-center px-2':'px-4 justify-between')}>
          {brand}
          {!collapsed && (
            <button onClick={toggleCollapsed} title="Ciutkan menu" aria-label="Ciutkan menu"
              className="p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-colors">
              <PanelLeftClose size={20}/>
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="px-3 pb-1">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2">
              <Search size={16} className="text-white/40 shrink-0"/>
              <input value={navQ} onChange={e=>setNavQ(e.target.value)} placeholder="Cari menu / modul..."
                className="w-full bg-transparent text-body-sm text-white placeholder:text-white/35 outline-none"/>
            </div>
          </div>
        )}
        {collapsed && (
          <button onClick={toggleCollapsed} title="Bentangkan menu" aria-label="Bentangkan menu"
            className="mx-2 mb-2 p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/10 grid place-items-center transition-colors">
            <PanelLeftOpen size={20}/>
          </button>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-1">{navList()}</nav>

        <div className={"m-2 rounded-xl bg-white/5 flex items-center "+(collapsed?'justify-center p-2':'justify-between p-3')}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-brand grid place-items-center shrink-0 text-label-lg text-white">
              {(user?.username||'A')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-label-md font-semibold text-white truncate">{user?.username}</span>
                <span className="text-label-sm text-white/45 capitalize truncate">{role}</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={logout} className="p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-colors" title="Keluar" aria-label="Keluar">
              <LogOut size={18}/>
            </button>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------- drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>setOpen(false)}/>
          <div className="absolute inset-y-0 left-0 w-60 bg-navy text-white flex flex-col animate-pop">
            <div className="h-14 px-4 flex items-center justify-between shrink-0">
              {brand}
              <button onClick={()=>setOpen(false)} aria-label="Tutup menu" className="p-1.5 rounded-lg hover:bg-white/10"><X size={20}/></button>
            </div>
            <nav className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">{navList(()=>setOpen(false))}</nav>
            <div className="m-2 p-3 rounded-xl bg-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-brand grid place-items-center text-label-lg text-white">{(user?.username||'A')[0].toUpperCase()}</div>
                <div className="flex flex-col min-w-0">
                  <span className="text-label-md font-semibold truncate">{user?.username}</span>
                  <span className="text-label-sm text-white/45 capitalize truncate">{role}</span>
                </div>
              </div>
              <button onClick={logout} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Keluar"><LogOut size={18}/></button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- konten */}
      <div className={"transition-[padding] duration-200 "+(collapsed?'lg:pl-16':'lg:pl-60')}>
        <header className={"fixed top-0 left-0 right-0 h-[52px] bg-surface border-b border-line z-40 flex items-center gap-3 px-4 lg:px-6 transition-[left] duration-200 "+(collapsed?'lg:left-16':'lg:left-60')}>
          <button className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-surface-2" onClick={()=>setOpen(true)} aria-label="Buka menu"><Menu size={20}/></button>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-surface-2 text-label-sm text-ink-2">
            <span className={"w-2 h-2 rounded-full "+(health==='ok'?'bg-success animate-pulse':health==='down'?'bg-danger':'bg-ink-3')}/>
            <span className="font-medium text-ink">{health==='ok'?'Sistem normal':health==='down'?'Koneksi terganggu':'Memeriksa...'}</span>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 text-label-md text-ink"
            title={`Lokasi operasional: ${LOCATION.name} (${LOCATION_COORDINATES})`}>
            <MapPin size={16} className="text-brand"/>
            <span className="font-semibold truncate max-w-[200px]">{LOCATION.name}</span>
            <span className="hidden 2xl:inline text-body-sm text-ink-3 num pl-1">{LOCATION_COORDINATES}</span>
          </div>

          <div className="hidden xl:flex items-center gap-2 text-body-sm text-ink-2 pl-1">
            <CalendarClock size={16}/>
            <span>{time.toLocaleDateString('id-ID',{weekday:'long', day:'numeric', month:'short', year:'numeric'})}</span>
            <span className="text-line-strong">•</span>
            <span className="num">{time.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB</span>
          </div>

          <div className="flex-1"/>
          <button onClick={()=>setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 bg-surface-2 hover:bg-surface-3 rounded-lg px-3 py-2 w-64 xl:w-72 text-left transition-colors">
            <Search size={16} className="text-ink-3 shrink-0"/>
            <span className="text-body-sm text-ink-3 flex-1 truncate">Pencarian pintar...</span>
            <kbd className="bg-surface px-1.5 py-0.5 rounded text-[10px] text-ink-2 mono shadow-sm">Ctrl K</kbd>
          </button>

          <div className="flex items-center gap-1">
            <button onClick={()=>setSearchOpen(true)} aria-label="Pencarian" className="md:hidden p-2 rounded-lg text-ink-2 hover:bg-surface-2"><Search size={20}/></button>
            <div className="relative" ref={notifRef}>
              <button onClick={()=>{ setNotifOpen(o=>!o); if(!notifOpen) loadNotif(); }} title="Notifikasi" aria-label="Notifikasi"
                className="relative p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors">
                <Bell size={20}/>
                {notifCount>0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-surface"/>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-[360px] bg-surface rounded-2xl shadow-pop border border-line overflow-hidden z-50 animate-pop">
                  <div className="relative px-4 py-3 border-b border-line bg-gradient-to-br from-surface-2 to-surface overflow-hidden">
                    <div className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-surface-3 blur-2xl opacity-70"/>
                    <div className="relative flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#316bf3] to-sky-400 p-[1.5px] shadow-sm shrink-0">
                        <div className="w-full h-full rounded-[10px] bg-surface grid place-items-center text-brand"><Bell size={16}/></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-label-md font-bold text-ink leading-tight">Notifikasi</div>
                        <div className="text-[11px] text-ink-3 truncate">{notifCount>0 ? notifCount+' hal perlu perhatian' : 'Tidak ada yang perlu ditindak'}</div>
                      </div>
                      {notifCount>0 && <span className="px-2 py-0.5 rounded-full bg-brand text-white text-[11px] font-bold num shrink-0">{notifCount}</span>}
                    </div>
                  </div>
                  {notifItems.length===0 ? (
                    <div className="px-4 py-8 text-center">
                      <div className="w-11 h-11 rounded-2xl bg-success-soft text-success grid place-items-center mx-auto"><CheckCircle2 size={20}/></div>
                      <div className="mt-2 text-label-md font-semibold text-ink">Semua beres</div>
                      <div className="text-[11px] text-ink-3 mt-0.5">Belum ada hal yang perlu Anda tindak saat ini.</div>
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-auto divide-y divide-line">
                      {notifItems.map((n,i)=>{
                        const meta = NOTIF_META[n.kind] || NOTIF_META.info;
                        const Icon = meta.icon;
                        return (
                          <Link key={i} to={n.to} onClick={()=>setNotifOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors group">
                            <span className={"w-9 h-9 rounded-xl grid place-items-center shrink-0 border "+meta.cls}><Icon size={16}/></span>
                            <span className="flex-1 min-w-0">
                              <span className="flex items-start gap-2">
                                <span className="text-body-sm font-semibold text-ink leading-snug flex-1">{n.title || n.label}</span>
                                <span className={"text-[11px] font-bold num px-1.5 py-0.5 rounded-full shrink-0 "+meta.pill}>{n.count}</span>
                              </span>
                              <span className="block text-[11px] text-ink-3 mt-0.5 leading-snug">{n.desc || ''}</span>
                            </span>
                            <ChevronRight size={14} className="text-ink-3 mt-1.5 shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-brand transition"/>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <div className="px-4 py-2.5 bg-surface-2 border-t border-line text-[11px] text-ink-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"/> Diperbarui otomatis tiap 2 menit
                  </div>
                </div>
              )}
            </div>
            <div className="h-6 w-px bg-line mx-1"/>
            <div className="flex items-center gap-2 pl-1">
              <div className="w-8 h-8 rounded-full bg-navy grid place-items-center text-label-sm text-white">{(user?.username||'U')[0].toUpperCase()}</div>
              <div className="hidden md:block text-label-md font-semibold text-ink max-w-[160px] truncate">{user?.username}</div>
            </div>
          </div>
        </header>

        <main key={pathname} className="page-enter pt-[52px] min-h-screen px-4 lg:px-5 py-5 max-w-workspace mx-auto">{children}</main>
      </div>

      <SearchModal open={searchOpen} onClose={()=>setSearchOpen(false)} />
      <button onClick={()=>setQuickOpen(true)} aria-label="Aksi cepat"
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-brand text-white shadow-raised grid place-items-center hover:bg-brand-strong transition active:scale-95 z-30">
        <Plus size={26} strokeWidth={2.5}/>
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
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-modal w-full max-w-[480px] overflow-hidden animate-pop">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-label-sm uppercase tracking-wider text-ink-2 font-semibold">Aksi cepat</div>
              <h2 className="font-display text-headline-lg font-bold text-ink mt-1">Mau ke mana?</h2>
              <p className="text-body-sm text-ink-2 mt-1">Ketik <span className="mono bg-surface-2 px-1.5 py-0.5 rounded text-label-sm">so</span> <span className="mono bg-surface-2 px-1.5 py-0.5 rounded text-label-sm">po</span> <span className="mono bg-surface-2 px-1.5 py-0.5 rounded text-label-sm">stok</span> atau pilih di bawah</p>
            </div>
            <button onClick={onClose} aria-label="Tutup" className="shrink-0 w-8 h-8 rounded-full bg-surface-2 hover:bg-surface-3 grid place-items-center text-ink-2 transition-colors"><X size={16}/></button>
          </div>
          <form onSubmit={handleSubmit} className="mt-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Ketik: so, po, proyek, kalkulator, stok..."
              className="w-full h-11 pl-9 pr-3 rounded-lg bg-surface-2 text-body-md text-ink outline-none focus:bg-surface focus:ring-2 focus:ring-brand-tint/20 transition"/>
          </form>
        </div>
        <div className="px-3 pb-3 grid grid-cols-1 gap-1 max-h-[320px] overflow-auto">
          {filtered.length===0 && <div className="py-10 text-center text-body-sm text-ink-3">Tidak ada aksi untuk &quot;{q}&quot;</div>}
          {filtered.map(a=>(
            <button key={a.id} onClick={()=>go(a.to)}
              className="flex items-center gap-3 w-full text-left px-3 py-3 rounded-lg hover:bg-surface-2 transition-colors group">
              <span className="w-10 h-10 rounded-lg bg-surface-2 text-brand grid place-items-center shrink-0 group-hover:bg-brand group-hover:text-white transition-colors"><a.icon size={18}/></span>
              <span className="flex-1 min-w-0">
                <span className="block text-label-lg text-ink leading-none">{a.label}</span>
                <span className="block text-label-sm text-ink-3 mt-1 font-normal">{a.desc} · <span className="mono font-semibold text-brand">{a.hint}</span></span>
              </span>
              <ArrowRight size={16} className="text-line-strong group-hover:text-brand transition-colors" />
            </button>
          ))}
        </div>
        <div className="px-6 py-3 bg-surface-2 flex items-center justify-between">
          <span className="text-label-sm text-ink-3 font-normal"><kbd className="px-1.5 py-1 bg-surface rounded text-[10px] mono shadow-sm">ESC</kbd> tutup · <kbd className="px-1.5 py-1 bg-surface rounded text-[10px] mono shadow-sm">Enter</kbd> buka</span>
          <button onClick={onClose} className="text-label-md text-ink-2 hover:text-ink px-3 py-1.5">Batal</button>
        </div>
      </div>
    </div>
  );
}
