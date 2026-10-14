import { useEffect, useState, useMemo } from 'react';
import { FileText, Search, MapPin, LayoutGrid, List, Plus, Minus, Trash2, ChevronDown, ArrowLeft, User, Phone, StickyNote, Calendar, Percent, Ticket, CreditCard } from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useDialog } from '../components/DialogProvider';
import AddressMapPicker from '../components/AddressMapPicker';

const FALLBACK_PRICES=[65000,65000,65000,45000,35000,95000,32000,85000];
function getPrice(p, idx){ const v=p.selling_price ?? p.price ?? p.unit_price; if(v && Number(v)>0) return Number(v); return FALLBACK_PRICES[idx % FALLBACK_PRICES.length]; }
function rupiah(n){ return 'Rp '+new Intl.NumberFormat('id-ID').format(Math.round(n||0)); }

export default function SalesOrderForm(){
  const [customers,setCustomers]=useState([]); const [products,setProducts]=useState([]); const [sel,setSel]=useState([]);
  const [form,setForm]=useState({customer_id:'', branch_id:1, delivery_date:'', delivery_address:'', delivery_lat:'', delivery_lng:'', notes:'', discount:0, discount_percent:0, voucher_code:'', dp_percent:0 });
  const [showMap,setShowMap]=useState(false);
  const [q,setQ]=useState(''); const [activeCat,setActiveCat]=useState('Semua'); const [viewMode,setViewMode]=useState('grid'); const [sortAZ,setSortAZ]=useState('A-Z'); const [detailOpen,setDetailOpen]=useState(false);
  const nav=useNavigate(); const dialog=useDialog();
  useEffect(()=>{ api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data||r.data||[])); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data||r.data||[])); },[]);
  const custSelected = customers.find(c=> String(c.id)===String(form.customer_id))||null;
  const add = (p, idx=0)=> setSel(prev=>{
    const ex=prev.find(x=>x.product_id===p.id);
    if(ex) return prev.map(x=> x.product_id===p.id? {...x, qty:x.qty+1}:x);
    return [...prev, {product_id:p.id, name:p.name, sku:p.sku, qty:1, unit_price: getPrice(p,idx), unit_id:1 }];
  });
  const inc=(i,delta)=> setSel(prev=> prev.map((x,idx)=> idx===i ? {...x, qty: Math.max(1, x.qty+delta)}:x));
  const subtotal = sel.reduce((a,b)=> a + b.qty*b.unit_price,0);
  const discPct = Math.min(100,Math.max(0,parseInt(form.discount_percent)||0));
  const VOUCHER_MAP={VOUCHER10:10000,VOUCHER50:50000,DISKON10K:10000,HEMAT20:20000,PROMO20K:20000,DISKON50K:50000};
  const rawVoucher=String(form.voucher_code||'').trim().toUpperCase();
  const vAmt = VOUCHER_MAP[rawVoucher] ?? (()=>{const n=parseInt(rawVoucher.replace(/[^0-9]/g,''),10); return (!isNaN(n) && rawVoucher && String(n)===rawVoucher)?n:(rawVoucher.startsWith('RP')? (parseInt(rawVoucher.slice(2),10)||0):0)})();
  const flatDisc = parseFloat(form.discount)||0;
  const discPctAmt = Math.round(subtotal*discPct/100);
  const voucherOrPctDisc = discPct>0 || rawVoucher ? Math.min(subtotal, discPctAmt+vAmt) : flatDisc;
  const disc = Math.min(subtotal, voucherOrPctDisc);
  const taxable = subtotal - disc;
  const tax = taxable*0.11; const grand = taxable + tax;
  const dpPct = parseInt(form.dp_percent)||0;
  const dpAmt = dpPct>0 ? Math.round(grand*dpPct/100) : 0;
  const sisa = grand - (dpPct>0?dpAmt:grand);
  const cats=['Semua','Closet','B. Ringan','Keramik'];
  const filtered = useMemo(()=>{
    let arr=products.filter(p=>{
      const matchQ=!q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku||'').toLowerCase().includes(q.toLowerCase());
      if(!matchQ) return false;
      if(activeCat==='Semua') return true;
      const hay=(p.name+' '+(p.category_name||'')+' '+(p.sku||'')).toLowerCase();
      if(activeCat==='Closet') return hay.includes('closet')||hay.includes('toilet');
      if(activeCat==='B. Ringan') return hay.includes('baja')||hay.includes('ringan')||hay.includes('c75');
      if(activeCat==='Keramik') return hay.includes('keramik')||hay.includes('krm')||hay.includes('hotpress');
      return true;
    });
    if(sortAZ==='A-Z') arr=[...arr].sort((a,b)=>a.name.localeCompare(b.name)); else arr=[...arr].sort((a,b)=>b.name.localeCompare(a.name));
    return arr;
  },[products,q,activeCat,sortAZ]);
  const submit=async(e)=>{
    e.preventDefault();
    if(form.delivery_address && grand < 250000){ await dialog.alert('Minimal pembelian untuk pengiriman: Rp 250.000 (total sekarang: Rp '+new Intl.NumberFormat('id-ID').format(grand)+')', {title:'Minimal Belanja'}); return; }
    if(!form.customer_id){ await dialog.alert('Pilih pelanggan dahulu',{title:'Validasi'}); return; }
    if(sel.length===0){ await dialog.alert('Tambah minimal 1 produk',{title:'Validasi'}); return; }
    const payload={...form, customer_id: parseInt(form.customer_id), delivery_lat: form.delivery_lat? parseFloat(form.delivery_lat): null, delivery_lng: form.delivery_lng? parseFloat(form.delivery_lng): null, discount: disc, discount_percent: discPct, voucher_code: rawVoucher||null, dp_percent: dpPct, notes: form.notes, items: sel.map(s=>({product_id:s.product_id, qty:s.qty, unit_price:s.unit_price, unit_id:1}))};
    const r=await api.post('/sales/orders', payload);
    await dialog.alert('SO '+r.data.so_number+' • status '+r.data.status+'\nDiskon >10% butuh approval Direktur.', {title:'SO Dibuat'});
    nav('/sales/orders');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={()=>nav(-1)} className="w-8 h-8 rounded-full border border-[#E2E8F0] bg-white grid place-items-center hover:bg-[#F8FAFC] text-[#334155] shrink-0"><ArrowLeft size={16}/></button>
        <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div>
        <div className="min-w-0">
          <h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Buat Sales Order</h1>
          <p className="text-xs text-[#64748B] mt-1">Cek stok real-time • Approval diskon &gt;10% • Reservasi stok otomatis • <span className="font-bold text-[#2563EB]">Tampilan samakan POS</span></p>
        </div>
      </div>

      <form onSubmit={submit} className="grid lg:grid-cols-[1.62fr_0.92fr] gap-4 items-start">
        {/* LEFT */}
        <div className="space-y-3 min-w-0">
          {/* Pelanggan card — mirip POS */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-4 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B]">Pelanggan *</span>
                <div className="relative">
                  <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
                  <select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="w-full h-9 pl-8 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] outline-none focus:bg-white focus:border-[#2563EB] appearance-none">
                    <option value="">Pilih pelanggan</option>
                    {customers.map(c=> <option key={c.id} value={c.id}>{c.name} • {c.type} • Limit {new Intl.NumberFormat('id-ID').format(c.credit_limit||0)}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"/>
                </div>
              </label>
              <label className="sm:col-span-3 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><Calendar size={12}/> Tanggal Kirim</span>
                <input type="date" value={form.delivery_date} onChange={e=>setForm({...form, delivery_date:e.target.value})} className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#2563EB]"/>
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><Percent size={12}/> Diskon %</span>
                <select value={String(form.discount_percent)} onChange={e=>setForm({...form, discount_percent: parseInt(e.target.value)||0})} className="w-full h-9 pl-2 pr-6 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium appearance-none outline-none focus:bg-white focus:border-[#2563EB]">
                  <option value="0">0%</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option>
                </select>
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><Ticket size={12}/> Voucher</span>
                <input value={form.voucher_code} onChange={e=>setForm({...form, voucher_code: e.target.value.toUpperCase()})} placeholder="VOUCHER10" list="voucher-so" className="w-full h-9 px-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#2563EB] uppercase"/>
                <datalist id="voucher-so"><option value="VOUCHER10"/><option value="VOUCHER50"/><option value="HEMAT20"/><option value="DISKON10K"/><option value="DISKON50K"/></datalist>
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><CreditCard size={12}/> DP %</span>
                <select value={String(form.dp_percent)} onChange={e=>setForm({...form, dp_percent: parseInt(e.target.value)||0})} className="w-full h-9 pl-2 pr-6 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium appearance-none outline-none focus:bg-white focus:border-[#2563EB]">
                  <option value="0">Lunas</option><option value="10">10%</option><option value="20">20%</option><option value="30">30%</option><option value="50">50%</option>
                </select>
              </label>
              <div className="sm:col-span-1 flex items-end">
                <button type="button" onClick={()=>setDetailOpen(v=>!v)} className="w-full h-9 inline-flex items-center justify-center gap-1 bg-white border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#2563EB] hover:bg-[#F8FAFC]"><ChevronDown size={12} className={detailOpen?'rotate-180 transition':'transition'}/></button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-6 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><MapPin size={12}/> Alamat Pengiriman <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
                <input value={form.delivery_address} onChange={e=>setForm({...form, delivery_address:e.target.value})} placeholder="Kosongkan untuk pickup. Jika diisi, minimal Rp 250.000" className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#2563EB] placeholder:text-[#94A3B8]"/>
                {form.delivery_address && <div className="text-[11px] text-amber-600">ℹ Minimal Rp 250.000 untuk pengiriman</div>}
              </label>
              <label className="sm:col-span-6 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#64748B] flex items-center gap-1"><StickyNote size={12}/> Catatan</span>
                <input value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Catatan pengiriman / termin" className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#2563EB] placeholder:text-[#94A3B8]"/>
              </label>
            </div>
            {detailOpen && (
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs text-[#475569] space-y-1">
                <div>Pelanggan: <b className="text-[#0F172A]">{custSelected? custSelected.name+' • '+custSelected.code : '—'}</b> {custSelected?.phone? '• '+custSelected.phone:''} • Limit {custSelected? new Intl.NumberFormat('id-ID').format(custSelected.credit_limit||0):'-'}</div>
                <div>Alamat: {form.delivery_address||'— (pickup)'} • Catatan: {form.notes||'—'} {form.delivery_lat && <span>• Pin {form.delivery_lat},{form.delivery_lng}</span>}</div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={()=>setShowMap(v=>!v)} className={"h-9 px-4 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 "+(showMap?'bg-[#1E40AF] text-white border-[#1E40AF]':'bg-white hover:bg-[#F8FAFC]') }><MapPin size={14}/>{showMap?'Tutup Peta':'Pilih alamat di Peta (OSM — auto jarak)'} {(form.delivery_lat&&form.delivery_lng)&&<span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">{String(form.delivery_lat).slice(0,7)},{String(form.delivery_lng).slice(0,7)}</span>}</button>
              {!form.delivery_address && custSelected && <span className="text-[11px] text-[#94A3B8]">Alamat default pelanggan akan dipakai jika kosong</span>}
            </div>
            {showMap && <div className="rounded-2xl overflow-hidden border border-[#E2E8F0]"><AddressMapPicker valueLat={form.delivery_lat||undefined} valueLng={form.delivery_lng||undefined} valueAddress={form.delivery_address} onPick={({lat,lng,address})=>{ setForm(f=>({...f, delivery_lat:String(lat), delivery_lng:String(lng), delivery_address:address})); setShowMap(false); }} /></div>}
            {(form.delivery_lat&&form.delivery_lng) && <div className="text-[11px] text-[#64748B]">Pin: {form.delivery_lat}, {form.delivery_lng} • jarak dari pusat auto Haversine saat buat DO</div>}
          </div>

          {/* Search + kategori — mirip POS */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-2.5 flex flex-col lg:flex-row gap-2.5 items-stretch">
            <div className="flex-1 relative min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2563EB]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari produk / SKU / scan barcode" className="w-full h-10 pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#2563EB] placeholder:text-[#94A3B8]"/>
            </div>
            <div className="flex items-center gap-1.5 overflow-auto scrollbar-thin shrink-0">
              {cats.map(c=>(
                <button key={c} type="button" onClick={()=>setActiveCat(c)} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap transition "+(activeCat===c?"bg-[#1E40AF] text-white border-[#1E40AF] shadow-sm":"bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]")}>{c}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2"><h2 className="text-sm font-black text-[#0F172A]">Daftar Produk</h2><span className="text-xs text-[#94A3B8]">{filtered.length} produk</span></div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg p-1">
                <button type="button" onClick={()=>setViewMode('grid')} className={"w-7 h-7 grid place-items-center rounded-md "+(viewMode==='grid'?"bg-[#1E40AF] text-white":"text-[#64748B] hover:bg-[#F8FAFC]")}><LayoutGrid size={14}/></button>
                <button type="button" onClick={()=>setViewMode('list')} className={"w-7 h-7 grid place-items-center rounded-md "+(viewMode==='list'?"bg-[#1E40AF] text-white":"text-[#64748B] hover:bg-[#F8FAFC]")}><List size={14}/></button>
              </div>
              <div className="relative">
                <select value={sortAZ} onChange={e=>setSortAZ(e.target.value)} className="h-7 pl-2 pr-6 bg-white border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#334155] appearance-none"><option value="A-Z">A-Z</option><option value="Z-A">Z-A</option></select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"/>
              </div>
            </div>
          </div>

          <div className={viewMode==='grid' ? "grid grid-cols-2 md:grid-cols-3 gap-3" : "grid grid-cols-1 gap-2"}>
            {filtered.slice(0,12).map((p,idx)=>{
              const price=getPrice(p,idx); const stock=p.stock_available ?? p.stock ?? 5; const low=Number(stock) <= (p.reorder_point ?? 0);
              return (
                <div key={p.id} className={"bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden hover:border-[#93C5FD] hover:shadow-sm transition group flex flex-col "+(viewMode==='list'?"flex-row !p-3 items-center gap-3":"p-3")}>
                  {viewMode==='grid' ? (
                    <>
                      <div className="flex items-center justify-between"><span className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569]">{p.sku}</span>{low && <span className="text-[10px] font-bold text-red-600">STOK KRITIS</span>}</div>
                      <div className="aspect-[1.35] bg-[#F8FAFC] rounded-xl mt-2 grid place-items-center overflow-hidden border border-[#F1F5F9]"><div className="w-16 h-16 rounded-xl bg-white border border-[#E2E8F0] grid place-items-center text-[10px] font-bold text-[#64748B] text-center leading-tight p-1">{p.name.slice(0,22)}</div></div>
                      <div className="font-bold text-[13px] leading-tight mt-2 line-clamp-2 min-h-[34px] text-[#0F172A]">{p.name}</div>
                      <div className="text-[11px] text-[#64748B] mt-1">Stok {stock} • {p.category_name||'—'}</div>
                      <div className="flex items-center justify-between mt-2"><span className="text-sm font-black text-[#2563EB]">{rupiah(price)}</span><button type="button" onClick={()=>add(p,idx)} className="w-7 h-7 rounded-full grid place-items-center text-white bg-[#2563EB] hover:bg-[#1E40AF] shadow-sm active:scale-95 transition shrink-0"><Plus size={14} strokeWidth={2.5}/></button></div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] grid place-items-center text-[10px] font-bold text-[#64748B] text-center p-1 shrink-0">{p.sku}</div>
                      <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate text-[#0F172A]">{p.name}</div><div className="text-xs text-[#64748B]">Stok {stock} • {p.sku} {low && <span className="text-red-600 font-bold">• STOK KRITIS</span>}</div></div>
                      <div className="text-sm font-black text-[#2563EB]">{rupiah(price)}</div>
                      <button type="button" onClick={()=>add(p,idx)} className="w-8 h-8 rounded-full grid place-items-center text-white shrink-0 bg-[#2563EB] hover:bg-[#1E40AF]"><Plus size={14}/></button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {filtered.length===0 && <div className="bg-white rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center text-sm text-[#94A3B8]">Tidak ada produk untuk "{q || activeCat}"</div>}
        </div>

        {/* RIGHT - Keranjang mirip POS */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 sticky top-[72px]">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-[#0F172A] flex items-center gap-2">Keranjang <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">{sel.length} item</span></h3>
            <button type="button" onClick={()=>setSel([])} className="text-xs font-semibold text-[#64748B] hover:text-red-600 inline-flex items-center gap-1"><Trash2 size={12}/> Kosongkan</button>
          </div>

          <div className="divide-y divide-[#F1F5F9] mt-3 max-h-[42vh] overflow-auto -mx-1 px-1">
            {sel.map((s,i)=>(
              <div key={i} className="flex gap-3 py-3">
                <div className="w-12 h-12 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] shrink-0 grid place-items-center text-[9px] font-bold text-[#64748B] text-center p-1">{s.sku||s.name.slice(0,10)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight text-[#0F172A] truncate">{s.name}</div>
                  <div className="text-[11px] text-[#94A3B8]">{s.sku||'SKU'}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="inline-flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-full p-1">
                      <button type="button" onClick={()=>inc(i,-1)} className="w-6 h-6 rounded-full bg-[#F1F5F9] grid place-items-center hover:bg-[#E2E8F0]"><Minus size={12}/></button>
                      <input type="number" value={s.qty} min={1} onChange={e=>{ const copy=[...sel]; copy[i].qty=parseFloat(e.target.value)||0; setSel(copy); }} className="w-10 text-center text-xs font-bold bg-transparent outline-none"/>
                      <button type="button" onClick={()=>inc(i,1)} className="w-6 h-6 rounded-full bg-white border border-[#E2E8F0] grid place-items-center hover:bg-[#F8FAFC]"><Plus size={12}/></button>
                    </div>
                    <input type="number" value={s.unit_price} onChange={e=>{ const copy=[...sel]; copy[i].unit_price=parseFloat(e.target.value)||0; setSel(copy);}} className="ml-auto w-24 h-7 border border-[#E2E8F0] rounded-lg text-right px-2 text-xs font-bold"/>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-sm font-black text-[#0F172A]">{rupiah(s.qty*s.unit_price)}</div>
                  <button type="button" onClick={()=>setSel(sel.filter((_,idx)=>idx!==i))} className="w-6 h-6 grid place-items-center rounded-full hover:bg-[#F1F5F9] text-[#94A3B8] hover:text-red-600"><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
            {sel.length===0 && <div className="py-10 text-center text-sm text-[#94A3B8]">Belum ada item — pilih dari kiri</div>}
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mt-3 text-sm space-y-1.5">
            <div className="flex justify-between text-[#475569]"><span className="text-xs font-semibold">Subtotal</span><span className="font-bold text-[#0F172A]">{rupiah(subtotal)}</span></div>
            {disc>0 && <div className="flex justify-between text-emerald-700"><span className="text-xs font-semibold">Diskon {discPct>0?discPct+'%':''} {vAmt>0?'+ Voucher':''}</span><span className="font-bold">-{rupiah(disc)}</span></div>}
            <div className="flex justify-between text-[#475569]"><span className="text-xs font-semibold">PPN 11%</span><span className="font-bold">{rupiah(tax)}</span></div>
            <div className="flex justify-between items-center border-t border-[#E2E8F0] pt-2"><span className="font-black text-[#0F172A]">Total</span><span className="font-black text-[#0F172A] text-[16px]">{rupiah(grand)}</span></div>
            {dpPct>0 && <><div className="flex justify-between text-xs"><span>DP ({dpPct}%)</span><span className="text-emerald-700 font-bold">{rupiah(dpAmt)}</span></div><div className="flex justify-between text-xs font-bold text-amber-600"><span>Sisa</span><span>{rupiah(sisa)}</span></div></>}
          </div>
          <div className="text-[11px] text-center text-[#94A3B8] mt-2">Diskon % + Voucher (VOUCHER10=10rb, VOUCHER50=50rb) seperti POS • DP % → invoice PARTIAL • &gt;10% butuh approval</div>

          <div className="flex gap-2 mt-3">
            <button type="button" onClick={()=>nav('/sales/orders')} className="flex-1 h-11 rounded-xl bg-white border border-[#E2E8F0] text-sm font-bold text-[#334155] hover:bg-[#F8FAFC]">Batal</button>
            <button className="flex-[1.6] h-11 rounded-xl bg-[#2563EB] text-white font-black inline-flex items-center justify-center gap-2 hover:bg-[#1E40AF] shadow-md active:scale-[0.99]">Simpan & Submit</button>
          </div>
          {form.delivery_address && grand < 250000 && <div className="text-xs text-center text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 mt-2 font-semibold">Minimal Rp 250.000 untuk pengiriman</div>}
        </div>
      </form>
    </div>
  )
}
