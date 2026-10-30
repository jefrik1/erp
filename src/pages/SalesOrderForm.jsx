import { useEffect, useState, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { FileText, Search, MapPin, LayoutGrid, List, Plus, Trash2, ChevronDown, ArrowLeft, User, Phone, StickyNote, Calendar, Percent, Ticket, CreditCard } from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useDialog } from '../components/DialogProvider';
import AddressMapPicker from '../components/AddressMapPicker';
import { PosPageHeader, PosQtyInput } from '../components/PosUI';

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
  const add = (p, idx=0)=>{
    const stok = stokDari(p);
    if(stok <= 0) return;
    if(qtyDiKeranjang(p.id) >= stok) return;
    setSel(prev=>{
      const ex=prev.find(x=>x.product_id===p.id);
      if(ex) return prev.map(x=> x.product_id===p.id? {...x, qty: Math.min(stok, x.qty+1)}:x);
      return [...prev, {product_id:p.id, name:p.name, sku:p.sku, qty:1, unit_price: getPrice(p,idx), unit_id:1, stock: stok, image_url: p.image_url||null }];
    });
  };
  // Stok nyata per produk — baris keranjang tidak boleh melebihinya.
  const stokDari = (p)=> Math.max(0, Number(p?.stock_available ?? p?.stock ?? p?.qty ?? 0) || 0);
  const fmtQty = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
  const qtyDiKeranjang = (id)=> sel.find(x=>x.product_id===id)?.qty || 0;
  // Batas qty per baris = stok nyata; peringatan tampil sebelum qty di-clamp.
  const maxQtyDari = (stock)=> Number(stock) > 0 ? Number(stock) : 9999;
  const clampQty = (stock, qty)=>{
    const max = maxQtyDari(stock);
    const n = Math.round(Number(qty));
    const want = Number.isFinite(n) ? n : 1;
    return { max, want, v: Math.max(1, Math.min(want, max)) };
  };
  // id tetap: ketikan beruntun di atas stok tidak menumpuk toast.
  const warnQtyOverStock = (item, want)=>{
    if(!item) return;
    const max = maxQtyDari(item.stock);
    if(!(Number(want) > max)) return;
    toast.error(`Stok ${item.name} hanya ${max} — qty ${want} disesuaikan ke ${max}`, { id: 'so-qty-max-' + (item.product_id ?? item.name) });
  };
  const setQtyAt=(i,qty)=>{
    const item = sel[i];
    if(!item) return;
    const { want, v } = clampQty(item.stock, qty);
    warnQtyOverStock(item, want);           // peringatan dulu, baru state di-clamp
    setSel(prev=> prev.map((x,idx)=> idx===i ? {...x, qty:v} : x));
  };
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
      <Toaster position="bottom-right" toastOptions={{
        duration: 4000,
        style:{ background:'#1f2937', color:'#fff', borderRadius:'10px', fontSize:'14px', fontWeight:'600' },
        error:{ style:{ background:'linear-gradient(135deg, #ba1a1a 0%, #ba1a1a 100%)', boxShadow:'0 12px 40px rgba(239, 68, 68, 0.25)' }, iconTheme:{ primary:'#fff', secondary:'#ba1a1a' } },
      }} />
      <PosPageHeader icon={FileText} title="Buat Sales Order" subtitle={<>Cek stok real-time • Approval diskon &gt;10% • Reservasi stok otomatis • <span className="font-bold text-[#0051d5]">Tampilan samakan POS</span></>} onBack={()=>nav(-1)}/>

      <form onSubmit={submit} className="grid lg:grid-cols-[1.62fr_0.92fr] gap-4 items-start">
        {/* LEFT */}
        <div className="space-y-3 min-w-0">
          {/* Pelanggan card - mirip POS */}
          <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-4 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d]">Pelanggan *</span>
                <div className="relative">
                  <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#76777d]"/>
                  <select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="w-full h-9 pl-8 pr-7 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm font-medium text-[#0b1c30] outline-none focus:bg-white focus:border-[#0051d5] appearance-none">
                    <option value="">Pilih pelanggan</option>
                    {customers.map(c=> <option key={c.id} value={c.id}>{c.name} • {c.type} • Limit {new Intl.NumberFormat('id-ID').format(c.credit_limit||0)}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#76777d] pointer-events-none"/>
                </div>
              </label>
              <label className="sm:col-span-3 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d] flex items-center gap-1"><Calendar size={12}/> Tanggal Kirim</span>
                <input type="date" value={form.delivery_date} onChange={e=>setForm({...form, delivery_date:e.target.value})} className="w-full h-9 px-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5]"/>
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d] flex items-center gap-1"><Percent size={12}/> Diskon %</span>
                <select value={String(form.discount_percent)} onChange={e=>setForm({...form, discount_percent: parseInt(e.target.value)||0})} className="w-full h-9 pl-2 pr-6 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm font-medium appearance-none outline-none focus:bg-white focus:border-[#0051d5]">
                  <option value="0">0%</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option>
                </select>
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d] flex items-center gap-1"><Ticket size={12}/> Voucher</span>
                <input value={form.voucher_code} onChange={e=>setForm({...form, voucher_code: e.target.value.toUpperCase()})} placeholder="VOUCHER10" list="voucher-so" className="w-full h-9 px-2 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5] uppercase"/>
                <datalist id="voucher-so"><option value="VOUCHER10"/><option value="VOUCHER50"/><option value="HEMAT20"/><option value="DISKON10K"/><option value="DISKON50K"/></datalist>
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d] flex items-center gap-1"><CreditCard size={12}/> DP %</span>
                <select value={String(form.dp_percent)} onChange={e=>setForm({...form, dp_percent: parseInt(e.target.value)||0})} className="w-full h-9 pl-2 pr-6 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm font-medium appearance-none outline-none focus:bg-white focus:border-[#0051d5]">
                  <option value="0">Lunas</option><option value="10">10%</option><option value="20">20%</option><option value="30">30%</option><option value="50">50%</option>
                </select>
              </label>
              <div className="sm:col-span-1 flex items-end">
                <button type="button" onClick={()=>setDetailOpen(v=>!v)} className="w-full h-9 inline-flex items-center justify-center gap-1 bg-white border border-[#e7ecf7] rounded-xl text-xs font-bold text-[#0051d5] hover:bg-[#eff4ff]"><ChevronDown size={12} className={detailOpen?'rotate-180 transition':'transition'}/></button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-6 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d] flex items-center gap-1"><MapPin size={12}/> Alamat Pengiriman <span className="font-normal text-[#76777d]">(opsional)</span></span>
                <input value={form.delivery_address} onChange={e=>setForm({...form, delivery_address:e.target.value})} placeholder="Kosongkan untuk pickup. Jika diisi, minimal Rp 250.000" className="w-full h-9 px-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5] placeholder:text-[#76777d]"/>
                {form.delivery_address && <div className="text-[11px] text-amber-600">ℹ Minimal Rp 250.000 untuk pengiriman</div>}
              </label>
              <label className="sm:col-span-6 space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide text-[#45464d] flex items-center gap-1"><StickyNote size={12}/> Catatan</span>
                <input value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Catatan pengiriman / termin" className="w-full h-9 px-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5] placeholder:text-[#76777d]"/>
              </label>
            </div>
            {detailOpen && (
              <div className="rounded-xl bg-[#eff4ff] border border-[#e7ecf7] p-3 text-xs text-[#45464d] space-y-1">
                <div>Pelanggan: <b className="text-[#0b1c30]">{custSelected? custSelected.name+' • '+custSelected.code : '-'}</b> {custSelected?.phone? '• '+custSelected.phone:''} • Limit {custSelected? new Intl.NumberFormat('id-ID').format(custSelected.credit_limit||0):'-'}</div>
                <div>Alamat: {form.delivery_address||'- (pickup)'} • Catatan: {form.notes||'-'} {form.delivery_lat && <span>• Pin {form.delivery_lat},{form.delivery_lng}</span>}</div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={()=>setShowMap(v=>!v)} className={"h-9 px-4 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 "+(showMap?'bg-[#0051d5] text-white border-[#0051d5]':'bg-white hover:bg-[#eff4ff]') }><MapPin size={14}/>{showMap?'Tutup Peta':'Pilih alamat di Peta (OSM - auto jarak)'} {(form.delivery_lat&&form.delivery_lng)&&<span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">{String(form.delivery_lat).slice(0,7)},{String(form.delivery_lng).slice(0,7)}</span>}</button>
              {!form.delivery_address && custSelected && <span className="text-[11px] text-[#76777d]">Alamat default pelanggan akan dipakai jika kosong</span>}
            </div>
            {showMap && <div className="rounded-xl overflow-hidden border border-[#e7ecf7]"><AddressMapPicker valueLat={form.delivery_lat||undefined} valueLng={form.delivery_lng||undefined} valueAddress={form.delivery_address} onPick={({lat,lng,address})=>{ setForm(f=>({...f, delivery_lat:String(lat), delivery_lng:String(lng), delivery_address:address})); setShowMap(false); }} /></div>}
            {(form.delivery_lat&&form.delivery_lng) && <div className="text-[11px] text-[#45464d]">Pin: {form.delivery_lat}, {form.delivery_lng} • jarak dari pusat auto Haversine saat buat DO</div>}
          </div>

          {/* Search + kategori - mirip POS */}
          <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card p-2.5 flex flex-col lg:flex-row gap-2.5 items-stretch">
            <div className="flex-1 relative min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0051d5]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari produk / SKU / scan barcode" className="w-full h-10 pl-9 pr-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5] placeholder:text-[#76777d]"/>
            </div>
            <div className="flex items-center gap-1.5 overflow-auto scrollbar-thin shrink-0">
              {cats.map(c=>(
                <button key={c} type="button" onClick={()=>setActiveCat(c)} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap transition "+(activeCat===c?"bg-[#0051d5] text-white border-[#0051d5] shadow-card":"bg-white text-[#2b3445] border-[#e7ecf7] hover:bg-[#eff4ff]")}>{c}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2"><h2 className="text-sm font-bold text-[#0b1c30]">Daftar Produk</h2><span className="text-xs text-[#76777d]">{filtered.length} produk</span></div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 bg-white border border-[#e7ecf7] rounded-lg p-1">
                <button type="button" onClick={()=>setViewMode('grid')} className={"w-7 h-7 grid place-items-center rounded-md "+(viewMode==='grid'?"bg-[#0051d5] text-white":"text-[#45464d] hover:bg-[#eff4ff]")}><LayoutGrid size={14}/></button>
                <button type="button" onClick={()=>setViewMode('list')} className={"w-7 h-7 grid place-items-center rounded-md "+(viewMode==='list'?"bg-[#0051d5] text-white":"text-[#45464d] hover:bg-[#eff4ff]")}><List size={14}/></button>
              </div>
              <div className="relative">
                <select value={sortAZ} onChange={e=>setSortAZ(e.target.value)} className="h-7 pl-2 pr-6 bg-white border border-[#e7ecf7] rounded-lg text-xs font-semibold text-[#2b3445] appearance-none"><option value="A-Z">A-Z</option><option value="Z-A">Z-A</option></select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#76777d] pointer-events-none"/>
              </div>
            </div>
          </div>

          <div className={viewMode==='grid' ? "grid grid-cols-2 md:grid-cols-3 gap-3" : "grid grid-cols-1 gap-2"}>
            {filtered.slice(0,12).map((p,idx)=>{
              const price=getPrice(p,idx); const stock=stokDari(p); const low=stock <= 0; const penuh=qtyDiKeranjang(p.id) >= stock;
              return (
                <div key={p.id} className={"bg-white rounded-xl border border-[#e7ecf7] overflow-hidden hover:border-[#93C5FD] hover:shadow-card transition group flex flex-col "+(viewMode==='list'?"flex-row !p-3 items-center gap-3":"p-3")}>
                  {viewMode==='grid' ? (
                    <>
                      <div className="flex items-center justify-between"><span className="text-[11px] font-bold tracking-wide px-2 py-1 rounded-full bg-[#e5eeff] border border-[#e7ecf7] text-[#45464d]">{p.sku}</span>{low && <span className="text-[11px] font-bold text-red-600">STOK KRITIS</span>}</div>
                      <div className="aspect-[1.35] bg-[#eff4ff] rounded-xl mt-2 grid place-items-center overflow-hidden border border-[#e5eeff]">{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover"/> : <div className="w-16 h-16 rounded-xl bg-white border border-[#e7ecf7] grid place-items-center text-[11px] font-bold text-[#45464d] text-center leading-tight p-1">{p.name.slice(0,22)}</div>}</div>
                      <div className="font-bold text-[13px] leading-tight mt-2 line-clamp-2 min-h-[34px] text-[#0b1c30]">{p.name}</div>
                      <div className="text-[11px] text-[#45464d] mt-1">Stok <b className="num">{fmtQty(stock)}</b>{qtyDiKeranjang(p.id)>0?` • ${qtyDiKeranjang(p.id)} di keranjang`:''} • {p.category_name||'-'}</div>
                      <div className="flex items-center justify-between mt-2"><span className="text-sm font-bold text-[#0051d5]">{rupiah(price)}</span><button type="button" onClick={()=>add(p,idx)} disabled={low||penuh} title={low?'Stok habis':penuh?`Stok hanya ${stock}`:'Tambah'} className={"w-7 h-7 rounded-full grid place-items-center text-white shadow-card active:scale-95 transition shrink-0 "+((low||penuh)?"bg-gray-300 cursor-not-allowed":"bg-[#0051d5] hover:bg-[#0051d5]")}><Plus size={14} strokeWidth={2.5}/></button></div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-xl bg-[#eff4ff] border border-[#e7ecf7] grid place-items-center overflow-hidden text-[11px] font-bold text-[#45464d] text-center p-1 shrink-0">{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover"/> : p.sku}</div>
                      <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate text-[#0b1c30]">{p.name}</div><div className="text-xs text-[#45464d]">Stok {stock} • {p.sku} {low && <span className="text-red-600 font-bold">• STOK KRITIS</span>}</div></div>
                      <div className="text-sm font-bold text-[#0051d5]">{rupiah(price)}</div>
                      <button type="button" onClick={()=>add(p,idx)} disabled={low||penuh} className={"w-8 h-8 rounded-full grid place-items-center text-white shrink-0 "+((low||penuh)?"bg-gray-300 cursor-not-allowed":"bg-[#0051d5] hover:bg-[#0051d5]")}><Plus size={14}/></button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {filtered.length===0 && <div className="bg-white rounded-xl border border-dashed border-[#e7ecf7] p-10 text-center text-sm text-[#76777d]">Tidak ada produk untuk "{q || activeCat}"</div>}
        </div>

        {/* RIGHT - Keranjang mirip POS */}
        <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card p-4 sticky top-[72px]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#0b1c30] flex items-center gap-2">Keranjang <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e5eeff] text-[#0051d5] border border-[#dbe1ff]">{sel.length} item</span></h3>
            <button type="button" onClick={()=>setSel([])} className="text-xs font-semibold text-[#45464d] hover:text-red-600 inline-flex items-center gap-1"><Trash2 size={12}/> Kosongkan</button>
          </div>

          <div className="divide-y divide-[#e5eeff] mt-3 max-h-[42vh] overflow-auto -mx-1 px-1">
            {sel.map((s,i)=>(
              <div key={i} className="flex gap-3 py-3">
                <div className="w-12 h-12 rounded-xl bg-[#eff4ff] border border-[#e7ecf7] shrink-0 grid place-items-center text-[9px] font-bold text-[#45464d] text-center p-1">{s.sku||s.name.slice(0,10)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight text-[#0b1c30] truncate">{s.name}</div>
                  <div className="text-[11px] text-[#76777d]">{s.sku||'SKU'}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <PosQtyInput value={s.qty} onChange={v=>setQtyAt(i,v)} onExceed={v=>warnQtyOverStock(s, v)} max={maxQtyDari(s.stock)} />
                    <span className="ml-auto text-sm font-bold text-[#0b1c30]">{rupiah(s.unit_price)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-sm font-bold text-[#0b1c30]">{rupiah(s.qty*s.unit_price)}</div>
                  <button type="button" onClick={()=>setSel(sel.filter((_,idx)=>idx!==i))} className="w-6 h-6 grid place-items-center rounded-full hover:bg-[#e5eeff] text-[#76777d] hover:text-red-600"><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
            {sel.length===0 && <div className="py-10 text-center text-sm text-[#76777d]">Belum ada item - pilih dari kiri</div>}
          </div>

          <div className="bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-3 mt-3 text-sm space-y-1.5">
            <div className="flex justify-between text-[#45464d]"><span className="text-xs font-semibold">Subtotal</span><span className="font-bold text-[#0b1c30]">{rupiah(subtotal)}</span></div>
            {disc>0 && <div className="flex justify-between text-emerald-700"><span className="text-xs font-semibold">Diskon {discPct>0?discPct+'%':''} {vAmt>0?'+ Voucher':''}</span><span className="font-bold">-{rupiah(disc)}</span></div>}
            <div className="flex justify-between text-[#45464d]"><span className="text-xs font-semibold">PPN 11%</span><span className="font-bold">{rupiah(tax)}</span></div>
            <div className="flex justify-between items-center border-t border-[#e7ecf7] pt-2"><span className="font-bold text-[#0b1c30]">Total</span><span className="font-bold text-[#0b1c30] text-[16px]">{rupiah(grand)}</span></div>
            {dpPct>0 && <><div className="flex justify-between text-xs"><span>DP ({dpPct}%)</span><span className="text-emerald-700 font-bold">{rupiah(dpAmt)}</span></div><div className="flex justify-between text-xs font-bold text-amber-600"><span>Sisa</span><span>{rupiah(sisa)}</span></div></>}
          </div>
          <div className="text-[11px] text-center text-[#76777d] mt-2">Diskon % + Voucher (VOUCHER10=10rb, VOUCHER50=50rb) seperti POS • DP % → invoice PARTIAL • &gt;10% butuh approval</div>

          <div className="flex gap-2 mt-3">
            <button type="button" onClick={()=>nav('/sales/orders')} className="flex-1 h-11 rounded-xl bg-white border border-[#e7ecf7] text-sm font-bold text-[#2b3445] hover:bg-[#eff4ff]">Batal</button>
            <button disabled={sel.length===0} title={sel.length===0?"Tambahkan minimal 1 produk":undefined} className="flex-[1.6] h-11 rounded-lg bg-brand text-white text-label-lg inline-flex items-center justify-center gap-2 hover:bg-brand-strong shadow-sm active:scale-[.99] transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100">Simpan &amp; Submit</button>
          </div>
          {form.delivery_address && grand < 250000 && <div className="text-xs text-center text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 mt-2 font-semibold">Minimal Rp 250.000 untuk pengiriman</div>}
        </div>
      </form>
    </div>
  )
}
