import { useEffect, useState, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Search, ScanLine, LayoutGrid, List, Trash2, Plus, ChevronDown, ArrowLeft, CreditCard, User, Phone, MapPin, StickyNote, Ticket, Percent } from 'lucide-react';
import api from '../lib/api';
import AddressMapPicker from '../components/AddressMapPicker';
import { PosQtyInput } from '../components/PosUI';

const FALLBACK_PRICES = [65000,65000,65000,45000,35000,95000,32000,85000];
function getPrice(p, idx){
  const v = p.selling_price ?? p.price ?? p.unit_price ?? p.sellingPrice;
  if(v && Number(v)>0) return Number(v);
  return FALLBACK_PRICES[idx % FALLBACK_PRICES.length];
}
function rupiah(n){ return 'Rp '+new Intl.NumberFormat('id-ID').format(Math.round(n||0)); }

export default function POS(){
  const [products,setProducts]=useState([]);
  const [cart,setCart]=useState([]);
  const [q,setQ]=useState('');
  const [pay,setPay]=useState('CASH');
  const [customers,setCustomers]=useState([]);
  const [selectedCustomer, setSelectedCustomer]=useState(null);
  const [custForm, setCustForm]=useState({name:'', phone:'', address:'', notes:'', dp_percent: 0, discount_percent: 0, voucher_code: '', delivery_lat:'', delivery_lng:''});
  const [activeCat,setActiveCat]=useState('Semua');
  const [viewMode,setViewMode]=useState('grid');
  const [sortAZ,setSortAZ]=useState('A-Z');
  const [detailOpen,setDetailOpen]=useState(false);
  const [showMap,setShowMap]=useState(false);
  // Shift kasir: satu shift terbuka per kasir, kas awal + penjualan cash berjalan.
  const [shift,setShift]=useState(null);
  const [shiftSales,setShiftSales]=useState(null);
  const [shiftModal,setShiftModal]=useState(null);   // 'open' | 'close' | null
  const [openingCash,setOpeningCash]=useState('');
  const [closingCash,setClosingCash]=useState('');
  const [shiftNotes,setShiftNotes]=useState('');
  const [shiftBusy,setShiftBusy]=useState(false);
  const loadShift = async()=>{ try{ const r=await api.get('/pos/shift/current'); setShift(r.data?.shift||null); setShiftSales(r.data?.sales||null); }catch(e){} };
  useEffect(()=>{ loadShift(); },[]);

  useEffect(()=>{
    api.get('/master/products',{params:{limit:50}}).then(r=>setProducts(r.data.data||[]));
    api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data||[]));
    try{
      const raw = sessionStorage.getItem('pos_prefill') || localStorage.getItem('pos_prefill') || '';
      if(raw){
        const pre=JSON.parse(raw);
        const arr=(pre.items||[]).map(x=>({
          product_id: x.product_id,
          name: x.name || x.sku || 'Item kalkulator',
          sku: x.sku || '',
          qty: Number(x.qty)||1,
          unit_price: Number(x.unit_price)||65000,
        }));
        if(arr.length){
          setCart(arr);
          if(pre.note) setCustForm(s=>({...s, notes: pre.note}));
          setTimeout(()=>toast.success('Dibawa dari Kalkulator - '+arr.length+' bahan • qty bisa dikurangi →'),140);
        }
        sessionStorage.removeItem('pos_prefill');
        localStorage.removeItem('pos_prefill');
      }
    }catch(e){ console.error('pos prefill err',e); }
  },[]);

  const add=(p, idx=0)=> setCart(prev=>{
    const ex=prev.find(x=>x.product_id===p.id);
    if(ex) return prev.map(x=> x.product_id===p.id? {...x, qty:x.qty+1}:x);
    return [...prev, {product_id:p.id, name:p.name, sku:p.sku, qty:1, unit_price: getPrice(p, idx) }];
  });

  const subtotal = cart.reduce((a,b)=> a+b.qty*b.unit_price,0);
  const discPct=Math.min(100,Math.max(0,parseInt(custForm.discount_percent)||0));
  const voucherMap={VOUCHER10:10000,VOUCHER50:50000,DISKON10K:10000,HEMAT20:20000,PROMO20K:20000,DISKON50K:50000};
  const vAmt=voucherMap[String(custForm.voucher_code||'').trim().toUpperCase()] ?? (()=>{const n=parseInt(String(custForm.voucher_code||'').replace(/[^0-9]/g,''),10); return (!isNaN(n) && String(n)===String(custForm.voucher_code||'').trim())?n:0})() ;
  const discPctAmt=Math.round(subtotal*discPct/100);
  const discTotal=Math.min(subtotal, discPctAmt+vAmt);
  const taxable=subtotal-discTotal;
  const ppn=Math.round(taxable*0.11);
  const grand=taxable+ppn;
  const dpPct = parseInt(custForm.dp_percent)||0;
  const dp_amount = dpPct>0 ? Math.round(grand * dpPct / 100) : 0;
  const paid_amount = dpPct>0 ? dp_amount : grand;
  const remaining_amount = grand - paid_amount;
  const canCheckout = cart.length > 0 && (selectedCustomer || custForm.name) && (!custForm.address || grand >= 250000);
  const checkoutError = !cart.length ? 'Keranjang kosong' : (!selectedCustomer && !custForm.name) ? 'Pilih/isi data pelanggan' : (custForm.address && grand < 250000) ? `Minimal pembelian Rp 250.000 untuk pengiriman (sekarang: ${rupiah(grand)})` : null;

  const checkout=async()=>{
    if(!canCheckout) { toast.error(checkoutError); return; }
    try {
      const cust_id = selectedCustomer?.id || 4;
      const payload={ customer_id:cust_id, items: cart, payment_method: pay, delivery_address: custForm.address, delivery_lat: custForm.delivery_lat?parseFloat(custForm.delivery_lat):null, delivery_lng: custForm.delivery_lng?parseFloat(custForm.delivery_lng):null, notes: custForm.notes, dp_percent: dpPct, discount_percent: discPct, voucher_code: custForm.voucher_code||null };
      const r=await api.post('/sales/pos', payload);
      const d=r.data;
      if(d.total!=null){
        toast.success(`Sukses: ${d.invoice_number} • Total ${new Intl.NumberFormat('id-ID').format(d.total)}${d.discTotal?` Disc ${new Intl.NumberFormat('id-ID').format(d.discTotal)}`:''} • DP ${new Intl.NumberFormat('id-ID').format(d.dp_amount)} • Sisa ${new Intl.NumberFormat('id-ID').format(d.remaining_amount)} • SO ${d.so_status}`);
      } else {
        toast.success(`Transaksi sukses: ${d.invoice_number}`);
      }
      setCart([]);
      setSelectedCustomer(null);
      setCustForm({name:'', phone:'', address:'', notes:'', dp_percent: 0, discount_percent:0, voucher_code:'', delivery_lat:'', delivery_lng:''}); setShowMap(false);
    } catch(e) {
      toast.error('Checkout gagal: ' + (e.response?.data?.error || e.message));
    }
  };

  const cats = ['Semua','Closet','B. Ringan','Keramik'];

  const filtered = useMemo(()=>{
    let arr = products.filter(p=>{
      const matchQ = !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku||'').toLowerCase().includes(q.toLowerCase());
      if(!matchQ) return false;
      if(activeCat==='Semua') return true;
      const hay = (p.name+' '+(p.category_name||'')+' '+(p.sku||'')).toLowerCase();
      if(activeCat==='Closet') return hay.includes('closet')||hay.includes('toilet');
      if(activeCat==='B. Ringan') return hay.includes('baja')||hay.includes('ringan')||hay.includes('c75');
      if(activeCat==='Keramik') return hay.includes('keramik')||hay.includes('krm')||hay.includes('hotpress');
      return true;
    });
    if(sortAZ==='A-Z') arr = [...arr].sort((a,b)=>a.name.localeCompare(b.name));
    else arr = [...arr].sort((a,b)=>b.name.localeCompare(a.name));
    return arr;
  },[products,q,activeCat,sortAZ]);

  const setQtyAt=(i,qty)=> setCart(prev=> prev.map((x,idx)=> idx===i ? {...x, qty}:x));

  const openShift = async()=>{
    setShiftBusy(true);
    try{
      await api.post('/pos/shift/open', { opening_cash: parseFloat(openingCash)||0 });
      setShiftModal(null); setOpeningCash(''); await loadShift();
      toast.success('Shift dibuka. Selamat bekerja.');
    }catch(e){ toast.error(e.response?.data?.error||'Gagal membuka shift'); }
    finally{ setShiftBusy(false); }
  };
  const closeShift = async()=>{
    setShiftBusy(true);
    try{
      const r = await api.post('/pos/shift/close', { closing_cash: parseFloat(closingCash)||0, notes: shiftNotes||null });
      const s = r.data?.summary;
      setShiftModal(null); setClosingCash(''); setShiftNotes(''); await loadShift();
      toast.success('Shift ditutup. Selisih kas: ' + rupiah(s?.variance||0));
    }catch(e){ toast.error(e.response?.data?.error||'Gagal menutup shift'); }
    finally{ setShiftBusy(false); }
  };

  return (
    <>
      <Toaster position="bottom-right" toastOptions={{
        duration: 4000,
        style:{ background:'#1f2937', color:'#fff', borderRadius:'10px', fontSize:'14px', fontWeight:'600' },
        success:{ style:{ background:'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow:'0 12px 40px rgba(16, 185, 129, 0.25)' }, iconTheme:{ primary:'#fff', secondary:'#10b981' } },
        error:{ style:{ background:'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow:'0 12px 40px rgba(239, 68, 68, 0.25)' }, iconTheme:{ primary:'#fff', secondary:'#ef4444' } },
      }} />

      {/* Header - POS Counter */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={()=>history.back()} className="w-8 h-8 rounded-full border border-[#E2E8F0] bg-white grid place-items-center hover:bg-[#F8FAFC] text-[#334155] shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[18px] font-black tracking-tight text-[#0F172A] leading-none">POS Counter</h1>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">&lt; 30 detik per transaksi</span>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">Transaksi cepat • Mudah • Akurat</p>
        </div>
      </div>

      {/* Shift kasir: buka/tutup + kas berjalan */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 mb-3">
        <span className={"w-2 h-2 rounded-full "+(shift? 'bg-emerald-500':'bg-amber-400')}/>
        <span className="text-xs font-bold text-[#334155]">{shift? ('Shift #'+shift.id+' terbuka - kas awal '+rupiah(shift.opening_cash)) : 'Shift belum dibuka'}</span>
        {shift && <span className="text-xs text-[#64748B]">Penjualan cash: <b className="text-[#0F172A]">{rupiah(shiftSales?.cash||0)}</b> ({shiftSales?.n||0} transaksi)</span>}
        <button onClick={()=>setShiftModal(shift? 'close':'open')} className={"ml-auto h-8 px-3 rounded-lg text-xs font-bold border transition "+(shift? 'bg-white border-red-200 text-red-600 hover:bg-red-50':'bg-[#1E40AF] border-[#1E40AF] text-white hover:bg-[#1E3A8A]')}>
          {shift? 'Tutup Shift':'Buka Shift'}
        </button>
      </div>

      {shiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-sm" onClick={()=>!shiftBusy&&setShiftModal(null)}/>
          <div className="relative bg-white rounded-[20px] shadow-2xl w-full max-w-[420px] overflow-hidden animate-pop">
            <div className="px-5 pt-5 pb-3">
              <div className="text-[11px] tracking-[.14em] font-bold text-[#64748B]">{shiftModal==='open'? 'BUKA SHIFT':'TUTUP SHIFT'}</div>
              <h3 className="text-[17px] font-bold text-[#0F172A] mt-1">{shiftModal==='open'? 'Kas awal di laci' : 'Hitung kas akhir'}</h3>
              {shiftModal==='close' && <p className="text-xs text-[#64748B] mt-1">Kas seharusnya: kas awal {rupiah(shift?.opening_cash||0)} + penjualan cash {rupiah(shiftSales?.cash||0)} = <b className="text-[#0F172A]">{rupiah((parseFloat(shift?.opening_cash)||0)+(shiftSales?.cash||0))}</b></p>}
            </div>
            <div className="px-5 pb-4 space-y-3">
              <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#64748B]">{shiftModal==='open'? 'KAS AWAL (RP)':'KAS AKHIR DI LACI (RP)'}</span>
                <input type="number" min="0" value={shiftModal==='open'? openingCash:closingCash} onChange={e=> shiftModal==='open'? setOpeningCash(e.target.value):setClosingCash(e.target.value)} className="w-full h-10 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-right tabular-nums outline-none focus:bg-white focus:border-[#1E40AF]" placeholder="0"/></label>
              {shiftModal==='close' && <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#64748B]">CATATAN (OPSIONAL)</span>
                <input value={shiftNotes} onChange={e=>setShiftNotes(e.target.value)} className="w-full h-10 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]" placeholder="Contoh: selisih karena kembalian"/></label>}
            </div>
            <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end gap-2">
              <button onClick={()=>setShiftModal(null)} disabled={shiftBusy} className="h-9 px-4 rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50">Batal</button>
              <button onClick={shiftModal==='open'? openShift:closeShift} disabled={shiftBusy} className="h-9 px-4 rounded-xl bg-[#1E40AF] text-white text-sm font-bold hover:bg-[#1E3A8A] disabled:opacity-50">{shiftBusy? 'Menyimpan...' : (shiftModal==='open'? 'Buka Shift':'Tutup Shift')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.62fr_0.92fr] gap-4 items-start">
        {/* LEFT */}
        <div className="space-y-3 min-w-0">
          {/* Pelanggan card */}
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-3 sm:p-4 space-y-3">
            {/* row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-3 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B]">Pelanggan</span>
                <div className="relative">
                  <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <select value={selectedCustomer?.id||''} onChange={e=>{
                    const c=customers.find(x=>x.id===parseInt(e.target.value));
                    setSelectedCustomer(c||null);
                    setCustForm(prev=>({...prev, name:c?.name||'', phone:c?.phone||''}));
                  }} className="w-full h-9 pl-8 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] outline-none focus:bg-white focus:border-[#1E40AF] appearance-none">
                    <option value="">+ Pelanggan Baru</option>
                    {customers.map(c=><option key={c.id} value={c.id}>{c.name} • {c.code}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
                </div>
              </label>
              <label className="sm:col-span-4 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B]">Nama</span>
                <div className="relative">
                  <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input value={custForm.name} onChange={e=>setCustForm({...custForm, name:e.target.value})} placeholder="Nama pelanggan" className="w-full h-9 pl-8 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] placeholder:text-[#94A3B8]"/>
                </div>
              </label>
              <label className="sm:col-span-3 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B]">Telepon</span>
                <div className="relative">
                  <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input value={custForm.phone} onChange={e=>setCustForm({...custForm, phone:e.target.value})} placeholder="08xx..." className="w-full h-9 pl-8 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] placeholder:text-[#94A3B8]"/>
                </div>
              </label>
              <div className="sm:col-span-2 flex items-end">
                <button onClick={()=>setDetailOpen(v=>!v)} className="w-full h-9 inline-flex items-center justify-center gap-1.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#1E40AF] hover:bg-[#F8FAFC]">
                  <Plus size={12}/> Detail <ChevronDown size={12} className={detailOpen?'rotate-180 transition':'transition'} />
                </button>
              </div>
            </div>
            {/* row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-4 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><MapPin size={12}/> Alamat <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
                <input value={custForm.address} onChange={e=>setCustForm({...custForm, address:e.target.value})} placeholder="Kosongkan untuk pickup" className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] placeholder:text-[#94A3B8]"/>
                {custForm.address && <div className="text-[11px] text-amber-600">ℹ Minimal Rp 250.000 untuk pengiriman</div>}
              </label>
              <label className="sm:col-span-4 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><StickyNote size={12}/> Catatan <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
                <input value={custForm.notes} onChange={e=>setCustForm({...custForm, notes:e.target.value})} placeholder="" className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
              </label>
              <label className="sm:col-span-4 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B]">DP / % dari Total</span>
                <div className="relative">
                  <select value={String(custForm.dp_percent)} onChange={e=>setCustForm({...custForm, dp_percent: parseInt(e.target.value)||0})} className="w-full h-9 pl-3 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#1E40AF] appearance-none">
                    <option value="0">Tanpa DP - Lunas</option><option value="10">10%</option><option value="20">20%</option><option value="30">30%</option><option value="50">50%</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
                </div>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-3 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><Percent size={12}/> Diskon %</span>
                <div className="relative">
                  <select value={String(custForm.discount_percent)} onChange={e=>setCustForm({...custForm, discount_percent: parseInt(e.target.value)||0})} className="w-full h-9 pl-3 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#1E40AF] appearance-none">
                    <option value="0">0% - Tanpa diskon</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"/>
                </div>
              </label>
              <label className="sm:col-span-5 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><Ticket size={12}/> Voucher</span>
                <input value={custForm.voucher_code} onChange={e=>setCustForm({...custForm, voucher_code: e.target.value.toUpperCase()})} placeholder="VOUCHER10 / VOUCHER50 / DISKON10K" list="voucher-list" className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] placeholder:text-[#94A3B8] uppercase"/>
                <datalist id="voucher-list"><option value="VOUCHER10"/><option value="VOUCHER50"/><option value="HEMAT20"/><option value="DISKON10K"/><option value="DISKON50K"/></datalist>
              </label>
              <div className="sm:col-span-4 flex items-end">
                <button type="button" onClick={()=>setShowMap(v=>!v)} className={"w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border text-xs font-bold "+(showMap?"bg-[#1E40AF] text-white border-[#1E40AF]":"bg-white text-[#1E40AF] border-[#E2E8F0] hover:bg-[#F8FAFC]")}><MapPin size={14}/>{showMap?'Tutup Peta':'Peta (OSM)'}</button>
              </div>
            </div>
            {showMap && <div className="rounded-[20px] overflow-hidden border border-[#E2E8F0]"><AddressMapPicker valueLat={custForm.delivery_lat||undefined} valueLng={custForm.delivery_lng||undefined} valueAddress={custForm.address} onPick={({lat,lng,address})=>{ setCustForm(c=>({...c, delivery_lat:String(lat), delivery_lng:String(lng), address})); setShowMap(false); }} compact /></div>}
            {(custForm.delivery_lat||vAmt>0||discPct>0) && <div className="text-[11px] text-[#64748B] flex flex-wrap gap-2"><span>Diskon: {discPct}% ({rupiah(discPctAmt)}) {vAmt>0 && <>+ Voucher {rupiah(vAmt)}</>} = <b>{rupiah(discTotal)}</b></span>{custForm.delivery_lat && <span>• Pin {custForm.delivery_lat.slice(0,7)},{custForm.delivery_lng.slice(0,7)}</span>}</div>}
            {detailOpen && (
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs text-[#475569] space-y-1">
                <div>Pelanggan terpilih: <b className="text-[#0F172A]">{selectedCustomer? selectedCustomer.name+' • '+selectedCustomer.code : (custForm.name||'-')}</b> {selectedCustomer?.phone||custForm.phone? '• '+(selectedCustomer?.phone||custForm.phone):''}</div>
                <div>Alamat: {custForm.address||'- (pickup)'} • Catatan: {custForm.notes||'-'} • Diskon {discPct}% • Voucher {custForm.voucher_code||'-'}</div>
              </div>
            )}
          </div>

          {/* Search + kategori */}
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-2.5 flex flex-col lg:flex-row gap-2.5 items-stretch">
            <div className="flex-1 relative min-w-0">
              <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1E40AF]" />
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Scan barcode / cari produk..." className="w-full h-10 pl-9 pr-20 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] placeholder:text-[#94A3B8]" />
              <span className="absolute right-10 top-1/2 -translate-y-1/2 text-[11px] font-bold px-1.5 py-1 rounded bg-white border border-[#E2E8F0] text-[#64748B] hidden sm:inline">F2</span>
              <button onClick={()=>{}} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]">
                <Search size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-auto scrollbar-thin shrink-0">
              {cats.map(c=>(
                <button key={c} onClick={()=>setActiveCat(c)} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap transition "+(activeCat===c?"bg-[#1E40AF] text-white border-[#1E40AF] shadow-sm":"bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]")}>{c}</button>
              ))}
              <div className="relative">
                <select value={sortAZ} onChange={e=>setSortAZ(e.target.value)} className="h-8 pl-3 pr-6 bg-white border border-[#E2E8F0] rounded-full text-xs font-bold text-[#334155] appearance-none">
                  <option>Kategori</option><option>A-Z</option><option>Z-A</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Daftar Produk header */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-black text-[#0F172A]">Daftar Produk</h2>
              <span className="text-xs text-[#94A3B8]">{filtered.length} produk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg p-1">
                <button onClick={()=>setViewMode('grid')} className={"w-7 h-7 grid place-items-center rounded-md "+(viewMode==='grid'?"bg-[#1E40AF] text-white":"text-[#64748B] hover:bg-[#F8FAFC]")}><LayoutGrid size={14}/></button>
                <button onClick={()=>setViewMode('list')} className={"w-7 h-7 grid place-items-center rounded-md "+(viewMode==='list'?"bg-[#1E40AF] text-white":"text-[#64748B] hover:bg-[#F8FAFC]")}><List size={14}/></button>
              </div>
              <div className="relative">
                <select value={sortAZ} onChange={e=>setSortAZ(e.target.value)} className="h-7 pl-2 pr-6 bg-white border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#334155] appearance-none">
                  <option value="A-Z">Urutkan: A-Z</option><option value="Z-A">Z-A</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Product grid */}
          <div className={viewMode==='grid' ? "grid grid-cols-2 md:grid-cols-4 gap-3" : "grid grid-cols-1 gap-2"}>
            {filtered.slice(0,12).map((p,idx)=>{
              const price = getPrice(p, idx);
              const stock = p.stock_available ?? p.stock ?? p.qty ?? 5;
              const low = Number(stock) <= 0;
              return (
                <div key={p.id} className={"bg-white rounded-[20px] border border-[#E2E8F0] overflow-hidden hover:border-[#93C5FD] hover:shadow-sm transition group flex flex-col "+(viewMode==='list'?"flex-row !p-3 items-center gap-3":"p-3")}>
                  {viewMode==='grid' ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569]">{p.sku}</span>
                        {low && <span className="text-[10px] font-bold text-red-600">Stok habis</span>}
                      </div>
                      <div className="aspect-[1.35] bg-[#F8FAFC] rounded-xl mt-2 grid place-items-center overflow-hidden border border-[#F1F5F9]">
                        {/* placeholder image */}
                        <div className="w-full h-full grid place-items-center text-[#94A3B8]">
                          <div className="w-16 h-16 rounded-xl bg-white border border-[#E2E8F0] grid place-items-center text-[10px] font-bold text-[#64748B] text-center leading-tight p-1">
                            {p.name.slice(0,22)}
                          </div>
                        </div>
                      </div>
                      <div className="font-bold text-[13px] leading-tight mt-2 line-clamp-2 min-h-[34px] text-[#0F172A]">{p.name}</div>
                      <div className="text-[11px] text-[#64748B] mt-1 flex items-center gap-1">Stok {stock} {low ? <span className="text-red-600 font-bold">• Stok habis</span> : null}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-black text-[#1E40AF]">{rupiah(price)}</span>
                        <button onClick={()=>add(p, idx)} disabled={low} className={"w-7 h-7 rounded-full grid place-items-center text-white shadow-sm active:scale-95 transition shrink-0 "+(low?"bg-gray-300 cursor-not-allowed":"bg-[#1E40AF] hover:bg-[#1E40AF]")}>
                          <Plus size={14} strokeWidth={2.5}/>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] grid place-items-center text-[10px] font-bold text-[#64748B] text-center p-1 shrink-0">{p.sku}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate text-[#0F172A]">{p.name}</div>
                        <div className="text-xs text-[#64748B]">Stok {stock} • {p.sku}</div>
                      </div>
                      <div className="text-sm font-black text-[#1E40AF]">{rupiah(price)}</div>
                      <button onClick={()=>add(p, idx)} disabled={low} className={"w-8 h-8 rounded-full grid place-items-center text-white shrink-0 "+(low?"bg-gray-300":"bg-[#1E40AF] hover:bg-[#1E40AF]")}><Plus size={14}/></button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {filtered.length===0 && <div className="bg-white rounded-[20px] border border-dashed border-[#E2E8F0] p-10 text-center text-sm text-[#94A3B8]">Tidak ada produk untuk "{q || activeCat}"</div>}
        </div>

        {/* RIGHT - Keranjang */}
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4 sticky top-[72px]">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-[#0F172A] flex items-center gap-2">Keranjang <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1E40AF] border border-[#DBEAFE]">{cart.length} item</span></h3>
            <button onClick={()=>setCart([])} className="text-xs font-semibold text-[#64748B] hover:text-red-600 inline-flex items-center gap-1"><Trash2 size={12}/> Hapus semua</button>
          </div>

          <div className="divide-y divide-[#F1F5F9] mt-3 max-h-[42vh] overflow-auto -mx-1 px-1">
            {cart.map((c,i)=>(
              <div key={i} className="flex gap-3 py-3">
                <div className="w-12 h-12 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] shrink-0 grid place-items-center text-[9px] font-bold text-[#64748B] text-center p-1">
                  {c.sku||c.name.slice(0,10)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight text-[#0F172A] truncate">{c.name}</div>
                  <div className="text-[11px] text-[#94A3B8]">{c.sku||'SKU'} • Stok 5</div>
                  <div className="flex items-center gap-2 mt-2">
                    <PosQtyInput value={c.qty} onChange={v=>setQtyAt(i,v)} />
                    <span className="ml-auto text-sm font-bold text-[#0F172A]">{rupiah(c.unit_price)}</span>
                  </div>
                </div>
                <button onClick={()=>setCart(cart.filter((_,idx)=>idx!==i))} className="self-start w-6 h-6 grid place-items-center rounded-full hover:bg-[#F1F5F9] text-[#94A3B8] hover:text-red-600"><Trash2 size={12}/></button>
              </div>
            ))}
            {cart.length===0 && <div className="py-10 text-center text-sm text-[#94A3B8]">Belum ada item</div>}
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mt-3 text-sm space-y-1.5">
            <div className="flex justify-between text-[#475569]"><span className="text-xs font-semibold">Subtotal</span><span className="font-bold text-[#0F172A] text-sm">{rupiah(subtotal)}</span></div>
            {(discTotal>0) && <div className="flex justify-between text-emerald-700"><span className="text-xs font-semibold">Diskon {discPct>0?discPct+'%':''} {vAmt>0?'+ Voucher':''}</span><span className="font-bold text-sm">-{rupiah(discTotal)}</span></div>}
            <div className="flex justify-between text-[#475569]"><span className="text-xs font-semibold">PPN 11%</span><span className="font-bold text-[#0F172A] text-sm">{rupiah(ppn)}</span></div>
            <div className="flex justify-between items-center border-t border-[#E2E8F0] pt-2">
              <span className="font-black text-[#0F172A]">Total</span><span className="font-black text-[#0F172A] text-[16px]">{rupiah(grand)}</span>
            </div>
            {dpPct>0
              ? <><div className="flex justify-between text-xs"><span>DP ({dpPct}%)</span><span className="text-emerald-700 font-bold">{rupiah(dp_amount)}</span></div><div className="flex justify-between text-xs font-bold text-amber-600"><span>Sisa</span><span>{rupiah(remaining_amount)}</span></div></>
              : <div className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 w-fit">Lunas - tidak ada sisa</div>}
          </div>

          <div className="mt-3">
            <div className="text-xs font-bold text-[#334155] mb-1.5">Metode Pembayaran</div>
            <div className="grid grid-cols-4 gap-1.5">
              {['CASH','TRANSFER','CARD','QRIS'].map(m=>(
                <button key={m} onClick={()=>setPay(m)} className={"h-9 rounded-xl border text-[11px] font-black tracking-wide "+(pay===m?"bg-[#1E40AF] text-white border-[#1E40AF] shadow-sm":"bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]")}>{m}</button>
              ))}
            </div>
          </div>

          <button onClick={checkout} disabled={!canCheckout} className={"w-full h-11 rounded-xl font-black mt-3 inline-flex items-center justify-center gap-2 transition "+(canCheckout?"bg-[#1E40AF] text-white hover:bg-[#1E40AF] shadow-md active:scale-[0.99]":"bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed")}>
            <CreditCard size={16}/> BAYAR • {rupiah(grand)}
          </button>
          {checkoutError && <div className="text-xs text-center text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 mt-2 font-semibold">{checkoutError}</div>}
          <div className="text-[11px] text-center text-[#94A3B8] mt-2">Offline-ready • Cetak struk thermal • Shift kasir</div>
        </div>
      </div>
    </>
  )
}
