import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, Wallet, Users, Kanban, BarChart3,
  LogOut, Menu, X, Search, Bell, Building2, Handshake, Calculator, BadgeDollarSign, Wrench,
  Gift, PiggyBank, ShieldAlert, Workflow, FileWarning, Flame, Plus, ArrowRight, PackagePlus,
  ArrowRightLeft, Settings as SettingsIcon, CalendarDays, Megaphone, UserCircle, Clock,
  PanelLeftClose, PanelLeftOpen, CalendarClock, MapPin, ChevronRight, ChevronDown, AlertTriangle,
  Receipt, CheckCircle2, PackageOpen, FileText, CalendarCheck, ClipboardList, CreditCard,
  BookOpen, Send, BookOpenCheck, Landmark, Boxes, SlidersHorizontal, Bug, Sun, Moon, Sparkles, Activity
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { PAGE_ACCESS, canAccess } from '../config/access';
import { LOCATION, LOCATION_COORDINATES } from '../config/location';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../lib/api';
import SearchModal from './SearchModal';

// Notifikasi: ikon & warna semantik per jenis
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
  return (
    <span className={"badge inline-flex items-center gap-1.5 "+(TONE_CLASS[STATUS_TONE[status]]||TONE_CLASS.neutral)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>{status}
    </span>
  );
}

export default function Layout({children}){
  const pathname = useLocation().pathname;
  useEffect(()=>{ window.scrollTo({ top:0, left:0, behavior:'instant' }); },[pathname]);
  const {user, logout} = useAuth();
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(()=> localStorage.getItem('ui.sidebar')==='collapsed');
  const [navQ,setNavQ]=useState('');
  const [time,setTime]=useState(new Date());
  const [searchOpen, setSearchOpen]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);
  const [health,setHealth]=useState({ status:'checking', ms:0 });
  const [notifItems,setNotifItems]=useState([]);
  const [notifOpen,setNotifOpen]=useState(false);
  const notifRef=useRef(null);

  // Theme Engine (Dark / Light)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('erp_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('erp_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Accordion Sections State for Sidebar
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ui.nav_collapsed_sections') || '{}');
    } catch {
      return {};
    }
  });

  const toggleSection = (heading) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [heading]: !prev[heading] };
      localStorage.setItem('ui.nav_collapsed_sections', JSON.stringify(next));
      return next;
    });
  };

  const myRoles = useMemo(()=> (user?.roles||[]).map(r=>String(r).toLowerCase()), [user]);

  // Menu yang tampil sesuai role
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

  const shownNav = useMemo(()=>{
    const q = navQ.trim().toLowerCase();
    if(!q) return visibleNav;
    const out=[];
    for(let i=0;i<visibleNav.length;i++){
      const n=visibleNav[i];
      if(n.heading){ out.push(n); continue; }
      if(n.label.toLowerCase().includes(q)) out.push(n);
    }
    return out.filter((n,i)=> !n.heading || (out[i+1] && !out[i+1].heading));
  },[visibleNav,navQ]);

  // Grouping into sections for accordion rendering
  const navSections = useMemo(() => {
    const sections = [];
    let current = { heading: null, items: [] };

    for (const item of shownNav) {
      if (item.heading) {
        if (current.items.length > 0 || current.heading) {
          sections.push(current);
        }
        current = { heading: item.label, items: [] };
      } else {
        current.items.push(item);
      }
    }
    if (current.items.length > 0 || current.heading) {
      sections.push(current);
    }
    return sections;
  }, [shownNav]);

  useEffect(()=>{ const interval=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(interval); },[]);
  useEffect(()=>{
    const handleKeyDown=(e)=>{
      if((e.ctrlKey || e.metaKey) && e.key==='k') { e.preventDefault(); setSearchOpen(true); }
      if(e.key==='/' && !/input|textarea|select/i.test(document.activeElement?.tagName||'')) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return ()=>window.removeEventListener('keydown', handleKeyDown);
  },[]);

  // Health ping
  useEffect(()=>{
    let alive=true;
    const ping=()=>{
      const t0 = performance.now();
      api.get('/health')
        .then((res)=>{
          const ms = res.data?.db_ms ?? Math.round(performance.now() - t0);
          if (alive) setHealth({ status: 'ok', ms });
        })
        .catch(()=> alive && setHealth({ status: 'down', ms: 0 }));
    };
    ping();
    const iv=setInterval(ping, 60000);
    return ()=>{ alive=false; clearInterval(iv); };
  },[]);

  // Notifikasi
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
      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand to-brand-tint grid place-items-center font-display font-bold text-white text-[15px] shrink-0 shadow-md shadow-brand/20">
        SM
      </div>
      {!collapsed && (
        <div className="flex flex-col min-w-0">
          <span className="font-display text-headline-sm font-bold leading-tight tracking-tight text-white truncate">Sumber Material</span>
          <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">Enterprise ERP</span>
        </div>
      )}
    </div>
  );

  const renderNavSection = (sec, onNavigate) => {
    const isCollapsedSec = !!collapsedSections[sec.heading] && !navQ;
    return (
      <div key={sec.heading || 'top'} className="space-y-0.5">
        {sec.heading && (
          collapsed ? (
            <div className="h-px bg-white/10 my-2 mx-2" title={sec.heading} />
          ) : (
            <button
              type="button"
              onClick={() => toggleSection(sec.heading)}
              className="w-full flex items-center justify-between px-2 pt-3 pb-1 text-label-sm uppercase tracking-wider text-white/50 hover:text-white/80 font-bold group transition-colors"
            >
              <span>{sec.heading}</span>
              <ChevronDown
                size={14}
                className={"transition-transform duration-200 text-white/40 group-hover:text-white/80 "+(isCollapsedSec ? '-rotate-90' : 'rotate-0')}
              />
            </button>
          )
        )}
        <AnimatePresence initial={false}>
          {(!isCollapsedSec || collapsed) && (
            <motion.div
              initial={sec.heading && !collapsed ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="space-y-0.5 overflow-hidden"
            >
              {sec.items.map(n => {
                const isActive = pathname === n.to || (n.to !== '/' && pathname.startsWith(n.to));
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={onNavigate}
                    title={collapsed ? n.label : undefined}
                    className={"relative flex items-center rounded-xl transition-all duration-150 "+
                      (collapsed ? 'justify-center h-10 mx-1' : 'gap-2.5 px-3 py-2 text-body-sm font-medium')+" "+
                      (isActive
                        ? "text-white font-semibold bg-white/10 dark:bg-white/10"
                        : "text-white/65 hover:bg-white/5 hover:text-white")}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-indicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-tint shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <n.icon size={19} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0 transition-transform group-hover:scale-105"/>
                    {!collapsed && <span className="truncate">{n.label}</span>}
                  </NavLink>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const sidebarWidth = collapsed ? 68 : 264;

  return (
    <div className="min-h-screen bg-bg text-ink transition-colors duration-200">
      {/* ---------------------------------------------------------- desktop sidebar */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="fixed inset-y-0 left-0 z-50 hidden lg:flex flex-col bg-navy text-white border-r border-white/5 shadow-xl select-none"
      >
        <div className={"h-14 flex items-center shrink-0 border-b border-white/5 "+(collapsed?'justify-center px-2':'px-4 justify-between')}>
          {brand}
          {!collapsed && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggleCollapsed} title="Ciutkan menu" aria-label="Ciutkan menu"
              className="p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-colors"
            >
              <PanelLeftClose size={18}/>
            </motion.button>
          )}
        </div>

        {!collapsed && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 focus-within:border-brand-tint/60 focus-within:bg-white/10 transition-all">
              <Search size={15} className="text-white/40 shrink-0"/>
              <input
                value={navQ} onChange={e=>setNavQ(e.target.value)}
                placeholder="Cari menu / modul..."
                className="w-full bg-transparent text-body-sm text-white placeholder:text-white/35 outline-none font-medium"
              />
              {navQ && (
                <button onClick={()=>setNavQ('')} className="text-white/40 hover:text-white text-xs">
                  <X size={13}/>
                </button>
              )}
            </div>
          </div>
        )}
        {collapsed && (
          <button
            onClick={toggleCollapsed} title="Bentangkan menu" aria-label="Bentangkan menu"
            className="mx-2 my-2 p-2 rounded-xl text-white/45 hover:text-white hover:bg-white/10 grid place-items-center transition-colors"
          >
            <PanelLeftOpen size={18}/>
          </button>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 space-y-1 scrollbar-none">
          {navSections.map(sec => renderNavSection(sec))}
        </nav>

        {/* User Card footer */}
        <div className={"m-2 rounded-2xl bg-white/5 border border-white/5 flex items-center "+(collapsed?'justify-center p-2':'justify-between p-2.5')}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand to-brand-tint grid place-items-center shrink-0 text-label-md font-bold text-white shadow-sm">
              {(user?.username||'A')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-label-md font-semibold text-white truncate">{user?.username}</span>
                <span className="text-[11px] text-white/45 capitalize truncate">{role}</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={logout}
              className="p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-colors"
              title="Keluar" aria-label="Keluar"
            >
              <LogOut size={16}/>
            </motion.button>
          )}
        </div>
      </motion.aside>

      {/* ------------------------------------------------- drawer mobile */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
              onClick={()=>setOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="absolute inset-y-0 left-0 w-72 bg-navy text-white flex flex-col shadow-2xl"
            >
              <div className="h-14 px-4 flex items-center justify-between shrink-0 border-b border-white/10">
                {brand}
                <button onClick={()=>setOpen(false)} aria-label="Tutup menu" className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
                  <X size={20}/>
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {navSections.map(sec => renderNavSection(sec, ()=>setOpen(false)))}
              </nav>
              <div className="m-3 p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-brand grid place-items-center text-label-md font-bold text-white">{(user?.username||'A')[0].toUpperCase()}</div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-label-md font-semibold truncate text-white">{user?.username}</span>
                    <span className="text-label-sm text-white/45 capitalize truncate">{role}</span>
                  </div>
                </div>
                <button onClick={logout} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white" aria-label="Keluar"><LogOut size={18}/></button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --------------------------------------------------------- konten area */}
      <motion.div
        animate={{ paddingLeft: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <motion.header
          animate={{ left: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed top-0 right-0 h-[52px] backdrop-blur-xl bg-surface/85 border-b border-line z-40 flex items-center gap-2.5 px-4 lg:px-6 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
        >
          <motion.button
            whileTap={{ scale: 0.92 }}
            className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-surface-2 text-ink-2"
            onClick={()=>setOpen(true)} aria-label="Buka menu"
          >
            <Menu size={20}/>
          </motion.button>

          {/* Connection & Latency Status Pill */}
          <div
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-line/60 text-label-sm text-ink-2 font-medium"
            title={`Status sistem & basis data (${health.ms}ms)`}
          >
            <span className={"relative flex h-2 w-2"}>
              {health.status === 'ok' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              )}
              <span className={"relative inline-flex rounded-full h-2 w-2 "+(health.status==='ok'?'bg-success':health.status==='down'?'bg-danger':'bg-amber-500')}></span>
            </span>
            <span className="text-ink font-semibold">{health.status==='ok'?'Sistem Normal':'Koneksi Terganggu'}</span>
            {health.status==='ok' && health.ms > 0 && (
              <span className="text-ink-3 num font-normal text-[11px]">({health.ms}ms)</span>
            )}
          </div>

          <div
            className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-2 border border-line/60 text-label-md text-ink"
            title={`Lokasi operasional: ${LOCATION.name} (${LOCATION_COORDINATES})`}
          >
            <MapPin size={15} className="text-brand"/>
            <span className="font-semibold truncate max-w-[200px]">{LOCATION.name}</span>
          </div>

          <div className="hidden xl:flex items-center gap-2 text-body-sm text-ink-2 pl-1 font-medium">
            <CalendarClock size={15} className="text-ink-3"/>
            <span>{time.toLocaleDateString('id-ID',{weekday:'short', day:'numeric', month:'short'})}</span>
            <span className="text-line-strong">•</span>
            <span className="num font-semibold text-ink">{time.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB</span>
          </div>

          <div className="flex-1"/>

          {/* Command Palette Trigger */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={()=>setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-line/80 rounded-xl px-3 py-2 w-60 xl:w-72 text-left transition-all group shadow-sm"
          >
            <Search size={15} className="text-ink-3 group-hover:text-brand transition-colors shrink-0"/>
            <span className="text-body-sm text-ink-3 flex-1 truncate font-medium">Pencarian pintar...</span>
            <kbd className="bg-surface border border-line px-1.5 py-0.5 rounded text-[10px] text-ink-2 mono font-semibold shadow-xs">Ctrl K</kbd>
          </motion.button>

          <div className="flex items-center gap-1.5">
            {/* Dark / Light Toggle */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
              aria-label="Toggle dark mode"
              className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors relative"
            >
              {theme === 'dark' ? (
                <Sun size={18} className="text-amber-400 hover:rotate-45 transition-transform"/>
              ) : (
                <Moon size={18} className="text-ink-2 hover:-rotate-12 transition-transform"/>
              )}
            </motion.button>

            <button
              onClick={()=>setSearchOpen(true)} aria-label="Pencarian"
              className="md:hidden p-2 rounded-xl text-ink-2 hover:bg-surface-2"
            >
              <Search size={19}/>
            </button>

            {/* Notification Dropdown */}
            <div className="relative" ref={notifRef}>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={()=>{ setNotifOpen(o=>!o); if(!notifOpen) loadNotif(); }}
                title="Notifikasi" aria-label="Notifikasi"
                className="relative p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
              >
                <Bell size={19}/>
                {notifCount>0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-surface animate-pulse"/>
                )}
              </motion.button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 6 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="absolute right-0 top-full mt-2 w-[360px] bg-surface rounded-2xl shadow-pop border border-line overflow-hidden z-50"
                  >
                    <div className="relative px-4 py-3 border-b border-line bg-gradient-to-br from-surface-2 to-surface overflow-hidden">
                      <div className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-surface-3 blur-2xl opacity-70"/>
                      <div className="relative flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand to-sky-400 p-[1.5px] shadow-sm shrink-0">
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
                    <div className="px-4 py-2 bg-surface-2 border-t border-line text-[11px] text-ink-3 flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"/> Diperbarui otomatis tiap 2 menit
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-px bg-line mx-1"/>

            <div className="flex items-center gap-2 pl-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand to-brand-tint grid place-items-center text-label-sm font-bold text-white shadow-sm">
                {(user?.username||'U')[0].toUpperCase()}
              </div>
              <div className="hidden md:block text-label-md font-semibold text-ink max-w-[140px] truncate">{user?.username}</div>
            </div>
          </div>
        </motion.header>

        <main key={pathname} className="page-enter pt-[52px] min-h-screen px-4 lg:px-6 py-6 max-w-workspace mx-auto">
          {children}
        </main>
      </motion.div>

      <SearchModal open={searchOpen} onClose={()=>setSearchOpen(false)} />

      {/* FAB Quick Action Menu */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={()=>setQuickOpen(true)}
        aria-label="Aksi cepat"
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-brand text-white shadow-raised grid place-items-center hover:bg-brand-strong transition active:scale-95 z-30"
      >
        <Plus size={26} strokeWidth={2.5}/>
      </motion.button>
      <QuickModal open={quickOpen} onClose={()=>setQuickOpen(false)} />
    </div>
  );
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
  useEffect(()=>{ if(open){ setQ(''); setTimeout(()=>inputRef.current?.focus(),15); } },[open]);
  useEffect(()=>{ if(!open) return; const h=(e)=>{ if(e.key==='Escape') onClose(); }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[open,onClose]);

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
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative bg-surface rounded-2xl shadow-modal w-full max-w-[480px] overflow-hidden border border-line"
          >
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
                  className="w-full h-11 pl-9 pr-3 rounded-xl bg-surface-2 text-body-md text-ink outline-none focus:bg-surface focus:ring-2 focus:ring-brand/20 border border-line transition"/>
              </form>
            </div>
            <div className="px-3 pb-3 grid grid-cols-1 gap-1 max-h-[320px] overflow-auto">
              {filtered.length===0 && <div className="py-10 text-center text-body-sm text-ink-3">Tidak ada aksi untuk &quot;{q}&quot;</div>}
              {filtered.map(a=>(
                <button key={a.id} onClick={()=>go(a.to)}
                  className="flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl hover:bg-surface-2 transition-colors group">
                  <span className="w-10 h-10 rounded-xl bg-surface-2 text-brand grid place-items-center shrink-0 group-hover:bg-brand group-hover:text-white transition-colors shadow-sm"><a.icon size={18}/></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-label-lg font-bold text-ink leading-none">{a.label}</span>
                    <span className="block text-label-sm text-ink-3 mt-1 font-normal">{a.desc} · <span className="mono font-semibold text-brand">{a.hint}</span></span>
                  </span>
                  <ArrowRight size={16} className="text-line-strong group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
            <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-between">
              <span className="text-label-sm text-ink-3 font-normal"><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-[10px] mono shadow-xs">ESC</kbd> tutup · <kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-[10px] mono shadow-xs">Enter</kbd> buka</span>
              <button onClick={onClose} className="text-label-md text-ink-2 hover:text-ink px-3 py-1.5 font-semibold">Batal</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
