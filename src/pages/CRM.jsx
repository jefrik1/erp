import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Search, X } from 'lucide-react';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
function rupiahNum(n){ return new Intl.NumberFormat('id-ID').format(n||0); }

const LIMIT=50;

export default function CRM(){
  const nav=useNavigate();
  const dialog=useDialog();
  const [leads,setLeads]=useState([]);
  const [pipeline,setPipeline]=useState([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  const [page,setPage]=useState(1); const [total,setTotal]=useState(0);
  const [q,setQ]=useState(''); const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('');

  const [show,setShow]=useState(false);
  const [form,setForm]=useState({name:'',company:'',phone:'',expected_value:''});

  const [showConv,setShowConv]=useState(false);
  const [convLead,setConvLead]=useState(null);
  const [customers,setCustomers]=useState([]);
  const [products,setProducts]=useState([]);
  const [qProd,setQProd]=useState('');
  const [convForm,setConvForm]=useState({customer_id:'', discount:'', delivery_date:'', notes:'', items:[]});
  const [convLoading,setConvLoading]=useState(false);
  const [openLoading,setOpenLoading]=useState(false);
  const [custQ,setCustQ]=useState('');
  const [prodLoading,setProdLoading]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const [a,b]=await Promise.all([
        api.get('/crm/leads',{params:{limit:LIMIT, page, search: search||undefined, status: statusFilter||undefined}}),
        api.get('/crm/pipeline')
      ]);
      setLeads(a.data.data||[]); setTotal(a.data.total||0); setPipeline(b.data||[]);
      setErr('');
    }catch(e){
      const m=e.response?.data?.error||e.message;
      setErr('Gagal load CRM: '+m);
      console.error('[crm load]',e);
    }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[page, search, statusFilter]);
  useEffect(()=>{ setPage(1); },[search, statusFilter]);
  const nonWonTotal = pipeline.filter(p=>p.status!=='WON').reduce((s,x)=>s+parseInt(x.count||0),0);

  const totalPages=Math.max(1, Math.ceil(total/LIMIT));
  const pipelineTotal=pipeline.reduce((s,x)=> s+ (parseInt(x.count)||0),0);

  const create=async(e)=>{
    e.preventDefault();
    try{
      await api.post('/crm/leads', {...form, expected_value: parseFloat(form.expected_value)||0, assigned_to:3 });
      setShow(false); setForm({name:'',company:'',phone:'',expected_value:''});
      setMsg('Lead dibuat');
      setTimeout(()=>setMsg(''),2500);
      load();
    }catch(e){
      setErr(e.response?.data?.error||e.message);
    }
  };

  const updateStatus=async(id,status)=>{
    try{
      await api.put('/crm/leads/'+id,{status});
      load();
    }catch(e){ setErr(e.response?.data?.error||e.message); }
  };

  const openConvert=async(lead)=>{
    setConvLead(lead);
    setConvForm({customer_id:'', discount:'', delivery_date:'', notes:'', items:[]});
    setQProd(''); setCustQ('');
    setErr(''); setMsg('');
    setShowConv(true);
    setOpenLoading(true);
    try{
      const [c,p]=await Promise.all([
        api.get('/master/customers',{params:{limit:50}}),
        api.get('/master/products',{params:{limit:50}}),
      ]);
      const custs=c.data?.data ?? c.data ?? []; const prods=p.data?.data ?? p.data ?? [];
      setCustomers(Array.isArray(custs)?custs:[]); setProducts(Array.isArray(prods)?prods:[]);
      if(lead.phone){
        const norm=String(lead.phone).replace(/\D/g,'');
        if(norm){
          const found=custs.find(x=> String(x.phone||'').replace(/\D/g,'')===norm);
          if(found) setConvForm(f=>({...f, customer_id: String(found.id)}));
        }
      }
    }catch(e){
      setErr('Gagal load master produk/pelanggan: '+(e.response?.data?.error||e.message));
      console.error('[crm openConvert]',e, e.response?.data);
      setCustomers([]); setProducts([]);
    }finally{ setOpenLoading(false); }
  };
  const quickConvert=async(lead)=>{
    if(lead.converted_so_id) { nav('/sales/orders/detail/'+lead.converted_so_id); return; }
    const ok=await dialog.confirm('Jadikan SO dari lead "'+lead.name+'" ?\nCustomer auto by HP • 1 baris dummy dari nilai ekspektasi jika tanpa RAB.', {title:'Konversi Lead → SO', confirmText:'Jadikan SO', cancelText:'Batal'});
    if(!ok) return;
    setErr(''); setMsg('Memproses Jadikan SO...');
    try{
      const r=await api.post('/crm/leads/'+lead.id+'/convert', { items: [] });
      const soId=r.data.so_id||r.data.id||r.data.soId;
      const soNumber=r.data.so_number||r.data.soNumber||('SO #'+soId);
      await load();
      if(soId) nav('/sales/orders/detail/'+soId);
      else setErr('Convert ok tapi so_id kosong: '+JSON.stringify(r.data)+' - buka '+soNumber+' di /sales/orders');
    }catch(e){
      setErr('Convert gagal: '+(e.response?.data?.error||e.message));
      console.error('[crm quickConvert]',e, e.response?.data);
    }
  };

  const searchProducts=async()=>{
    setProdLoading(true);
    try{
      const r=await api.get('/master/products',{params:{limit:50, search:qProd||undefined}});
      setProducts(r.data?.data ?? r.data ?? []);
    }catch(e){ setErr('Cari produk gagal: '+(e.response?.data?.error||e.message)); }
    finally{ setProdLoading(false); }
  };
  const searchCustomers=async()=>{
    try{
      const r=await api.get('/master/customers',{params:{limit:50, search:custQ||undefined}});
      setCustomers(r.data?.data ?? r.data ?? []);
    }catch(e){ setErr('Cari pelanggan gagal: '+(e.response?.data?.error||e.message)); }
  };

  const addProduct=async(p)=>{
    let price=65000;
    try{
      const d=await api.get('/master/products/'+p.id);
      if(d.data.units && d.data.units.length) price=parseFloat(d.data.units[0].selling_price)||price;
      else if(d.data.selling_price) price=parseFloat(d.data.selling_price)||price;
    }catch{}
    setConvForm(f=>({...f, items:[...f.items, {product_id:p.id, name:p.name, sku:p.sku, qty:1, unit_price:price, unit_id:1}]}));
  };

  const convSubtotal = convForm.items.reduce((a,b)=> a + (parseFloat(b.qty)||0)*(parseFloat(b.unit_price)||0),0);
  const discVal = parseFloat(convForm.discount)||0;
  const convTax = (convSubtotal - discVal)*0.11;
  const convGrand = convSubtotal - discVal + convTax;

  const submitConvert=async(e)=>{
    e.preventDefault();
    if(convForm.items.length===0){
      const ok=await dialog.confirm('Belum pilih produk. Buat SO 1 baris dari nilai ekspektasi '+rupiah(convLead.expected_value||0)+' ?', {title:'Tanpa RAB?', confirmText:'Buat Dummy', cancelText:'Batal'});
      if(!ok) return;
    }
    for(const it of convForm.items){
      if(!it.product_id || (parseFloat(it.qty)||0)<=0) return setErr('Qty produk '+it.name+' tidak valid');
      if((parseFloat(it.unit_price)||0)<=0) return setErr('Harga produk '+it.name+' tidak valid');
    }
    setConvLoading(true); setErr('');
    try{
      const payload={
        customer_id: convForm.customer_id? parseInt(convForm.customer_id): null,
        discount: discVal,
        delivery_date: convForm.delivery_date||null,
        notes: convForm.notes||null,
        items: convForm.items.map(s=>({product_id:s.product_id, qty:parseFloat(s.qty), unit_price:parseFloat(s.unit_price), unit_id: s.unit_id||1})),
      };
      const r=await api.post('/crm/leads/'+convLead.id+'/convert', payload);
      const soId=r.data.so_id||r.data.id||r.data.soId;
      const soNumber=r.data.so_number||r.data.soNumber||('SO #'+soId);
      const already = r.data.already ? ' (sudah pernah - buka SO lama)' : '';
      setShowConv(false);
      setMsg('Lead dikonversi → '+soNumber+' ('+r.data.status+')'+already+' - membuka detail...');
      await load();
      if(soId){
        const target='/sales/orders/detail/'+soId;
        try{ nav(target); }catch(e){ console.error('[crm nav]',e); }
        if(window.location.pathname!==target) nav(target);
      } else {
        setErr('Convert sukses tapi so_id kosong - cek console/network. Response: '+JSON.stringify(r.data));
      }
    }catch(e){
      const m=e.response?.data?.error||e.response?.data?.message||e.message;
      const status=e.response?.status;
      if(status===401) setErr('Sesi habis - silakan login ulang lalu coba lagi');
      else setErr('Convert gagal: '+m);
      console.error('[crm convert]',e, e.response?.data);
    }finally{ setConvLoading(false); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="CRM • Pipeline" subtitle={`Lead → Opportunity → Quotation → Won/Lost • ${total} lead (${nonWonTotal} aktif + ${pipeline.find(p=>p.status==='WON')?.count||0} Won) • Hal ${page}/${totalPages}`} actions={<button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-brand text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-card hover:bg-brand-strong active:scale-[0.98] transition">+ Lead</button>}/>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm">{msg}</div>}
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex justify-between gap-2"><span className="break-all">{err}</span><button onClick={()=>setErr('')} aria-label="Tutup" className="shrink-0 hover:bg-red-100 rounded-full p-1"><X size={14}/></button></div>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {pipeline.map(p=>(
          <button key={p.status} onClick={()=>setStatusFilter(statusFilter===p.status?'':p.status)} className={"bg-white rounded-xl border shadow-card overflow-hidden p-3 text-center transition hover:border-brand/30 "+(statusFilter===p.status?"ring-2 ring-[#0051d5] border-brand":p.status==='WON'?"ring-1 ring-emerald-200 bg-emerald-50/50 border-line":"border-line")}>
            <div className="text-xs font-bold tracking-wider text-ink-2">{p.status}</div><div className="text-lg font-bold mt-1">{p.count}</div><div className="text-xs text-ink-2">{rupiah(p.value)}</div>
            {statusFilter===p.status && <div className="text-[11px] font-bold text-brand mt-1">filter aktif</div>}
          </button>
        ))}
        {pipeline.length===0 && !loading && <div className="col-span-6 text-xs text-ink-3 text-center py-2">Belum ada pipeline</div>}
      </div>

      <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden">
        <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center border-b border-line bg-surface-2/50">
          <div className="flex-1 relative min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(setSearch(q),setPage(1))} placeholder="Cari lead / perusahaan / HP..." className="w-full h-[42px] pl-9 pr-3 bg-white border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"/>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={()=>{setSearch(q); setPage(1);}} className="h-[42px] px-5 bg-white border border-line rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2">Cari</button>
            {search && <button onClick={()=>{setQ(''); setSearch('');}} aria-label="Bersihkan" className="h-[42px] w-[42px] grid place-items-center bg-white border border-line rounded-xl text-ink-2 hover:bg-surface-2 shrink-0"><X size={16}/></button>}
            {statusFilter && <button onClick={()=>setStatusFilter('')} className="h-[42px] px-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-bold">Reset filter: {statusFilter} <X size={12} className="inline"/></button>}
            <span className="text-xs text-ink-2 hidden lg:inline">{total} hasil</span>
          </div>
        </div>
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2"><th className="text-left px-4 py-3 whitespace-nowrap">LEAD</th><th className="text-left px-4 py-3 whitespace-nowrap">PERUSAHAAN</th><th className="text-right px-4 py-3 whitespace-nowrap">NILAI</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th><th className="text-left px-4 py-3 whitespace-nowrap">SO</th><th className="text-right px-4 py-3 whitespace-nowrap">AKSI</th></tr></thead><tbody>
          {loading && <tr><td colSpan={6} className="p-8 text-center text-ink-3">Memuat...</td></tr>}
          {!loading && leads.map(l=>(
            <tr key={l.id} className="border-t hover:bg-surface-3">
              <td className="px-4 py-3.5"><div className="font-semibold">{l.name} <span className="text-xs font-mono text-ink-3">#{l.id}</span></div><div className="text-xs text-ink-2">{l.phone||'-'} • {l.assigned_name||'unassigned'}</div></td>
              <td className="px-4 py-3.5 text-center"><div className="font-medium">{l.company||'-'}</div><div className="text-xs text-ink-3">{l.source||''}</div></td>
              <td className="px-4 py-3.5 text-right font-bold">{rupiahNum(l.expected_value)}</td>
              <td className="px-4 py-3.5 text-center"><span className={"text-xs px-2 py-1 rounded-full border font-bold "+(l.status==='WON'?'bg-emerald-50 text-emerald-700 border-emerald-200':l.status==='LOST'?'bg-zinc-100 text-zinc-600':l.status==='PROPOSAL'?'bg-amber-50 text-amber-700 border-amber-200':'bg-sky-50 text-sky-700')}>{l.status}</span></td>
              <td className="px-4 py-3.5 text-center">
                {l.converted_so_id ? <Link to={"/sales/orders/detail/"+l.converted_so_id} className="text-xs font-mono font-bold text-brand hover:underline">{l.converted_so_number||'SO #'+l.converted_so_id}</Link> : <span className="text-xs text-ink-3">-</span>}
              </td>
              <td className="px-4 py-3.5"><div className="flex items-center justify-end gap-1.5 flex-wrap">
                <select value={l.status} onChange={e=>updateStatus(l.id, e.target.value)} className="text-xs border rounded-full px-2 py-1 bg-white">
                  <option>NEW</option><option>CONTACTED</option><option>QUALIFIED</option><option>PROPOSAL</option><option>WON</option><option>LOST</option>
                </select>
                {l.converted_so_id ? (
                  <Link to={"/sales/orders/detail/"+l.converted_so_id} className="h-7 px-3 bg-emerald-600 text-white rounded-full text-xs font-bold grid place-items-center">Lihat SO</Link>
                ) : (
                  <button type="button" disabled={l.status==='LOST'} onClick={()=>quickConvert(l)} className={"h-7 px-3 rounded-full text-xs font-bold border "+(l.status==='LOST'?"bg-gray-100 text-ink-3 cursor-not-allowed":"bg-brand text-white hover:bg-blue-800")}>Jadikan SO</button>
                )}
              </div></td>
            </tr>
          ))}
          {!loading && leads.length===0 && <tr><td colSpan={6} className="p-8 text-center text-ink-3">Belum ada lead - klik + Lead {search?`untuk "${search}"`:statusFilter?`status ${statusFilter}`:''}</td></tr>}
        </tbody></table></div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-surface-2 border-t border-line text-xs">
          <div className="text-ink-2">{leads.length?`Menampilkan ${(page-1)*LIMIT+1}-${(page-1)*LIMIT+leads.length} dari ${total}`:`0 dari ${total}`} {search?`• cari "${search}"`:''} {statusFilter?`• status ${statusFilter}`:''} • pipeline {pipelineTotal} • termasuk yang terdahulu</div>
          <div className="flex items-center gap-1">
            <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="h-8 px-3 bg-white border border-line rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-surface-2">‹ Prev</button>
            <span className="h-8 px-3 grid place-items-center text-xs font-bold text-ink-2">{page} / {totalPages}</span>
            <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="h-8 px-3 bg-white border border-line rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-surface-2">Next ›</button>
          </div>
        </div>
      </div>

      <div className="text-xs text-ink-3">Flow toko bangunan: catat WA/tlp sebagai Lead → follow-up → <b>Jadikan SO</b> → customer auto dibuat by HP (anti duplikat) → SO APPROVED/PENDING (diskon &gt;10% ke Approval) → Reservasi stok → DO → Invoice.</div>

      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={create} className="bg-white rounded-xl p-6 w-full max-w-md space-y-3 animate-pop">
        <h3 className="font-bold">Tambah Lead</h3>
        <p className="text-xs text-ink-2">Prospek toko/proyek baru - nanti 1 klik jadi SO + customer otomatis by No HP.</p>
        <input required placeholder="Nama penanya *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"/>
        <input placeholder="Perusahaan / Toko (opsional)" value={form.company} onChange={e=>setForm({...form,company:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"/>
        <input placeholder="No HP / WA" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"/>
        <input type="number" placeholder="Nilai ekspektasi (Rp)" value={form.expected_value} onChange={e=>setForm({...form,expected_value:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-line rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2 active:scale-[0.98] transition">Batal</button><button type="submit" className="h-[42px] px-5 bg-brand text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-card hover:bg-brand-strong active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}

      {showConv && convLead && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50 overflow-auto"><form onSubmit={submitConvert} className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-pop">
        <div className="p-5 border-b flex justify-between gap-3">
          <div><h3 className="font-bold">Konversi Lead → Sales Order</h3><p className="text-xs text-ink-2">{convLead.name} {convLead.company? '• '+convLead.company:''} • {convLead.phone||'-'} • Estimasi {rupiah(convLead.expected_value)}</p></div>
          <button type="button" onClick={()=>setShowConv(false)} aria-label="Tutup" className="h-8 w-8 grid place-items-center border rounded-full hover:bg-surface-2"><X size={14}/></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-xl text-xs break-all">{err}</div>}
          {openLoading && <div className="text-xs text-ink-2">Memuat produk & pelanggan...</div>}

          <div className="grid md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-bold tracking-wider text-gray-600">PELANGGAN</span>
              <select value={convForm.customer_id} onChange={e=>setConvForm({...convForm, customer_id:e.target.value})} className="w-full h-10 border rounded-xl px-3 bg-white text-sm">
                <option value="">Auto - cari by HP lead / buat baru (C{code})</option>
                {customers.map(c=> <option key={c.id} value={c.id}>{c.name} • {c.phone||'-'} • {c.code}</option>)}
              </select>
              <div className="flex gap-1 mt-1">
                <input value={custQ} onChange={e=>setCustQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(), searchCustomers())} placeholder="Cari pelanggan by nama/kode..." className="flex-1 h-8 border rounded-lg px-2 text-xs"/>
                <button type="button" onClick={searchCustomers} className="h-8 px-3 border rounded-lg text-xs font-bold">Cari</button>
              </div>
              <div className="text-xs text-ink-2">Jika HP lead cocok → pakai customer lama (anti duplikat). Kosongkan untuk auto-buat pelanggan baru.</div>
            </label>
            <div className="space-y-3">
              <label className="block space-y-1"><span className="text-xs font-bold tracking-wider text-gray-600">DISKON (Rp)</span><input type="number" value={convForm.discount} onChange={e=>setConvForm({...convForm, discount:e.target.value})} className="w-full h-10 border rounded-xl px-3 text-sm"/></label>
              <label className="block space-y-1"><span className="text-xs font-bold tracking-wider text-gray-600">TGL KIRIM</span><input type="date" value={convForm.delivery_date} onChange={e=>setConvForm({...convForm, delivery_date:e.target.value})} className="w-full h-10 border rounded-xl px-3 text-sm"/></label>
            </div>
          </div>

          <label className="block space-y-1"><span className="text-xs font-bold tracking-wider text-gray-600">CATATAN SO</span><textarea value={convForm.notes} onChange={e=>setConvForm({...convForm, notes:e.target.value})} rows={2} placeholder={"Akan otomatis ditambah: [Lead "+convLead.name+(convLead.company?' - '+convLead.company:'')+"]"} className="w-full border rounded-xl p-2.5 text-sm"/></label>

          <div className="border rounded-xl overflow-hidden">
            <div className="p-3 bg-surface-3 flex gap-2 items-center">
              <input value={qProd} onChange={e=>setQProd(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(), searchProducts())} placeholder="Cari produk / SKU (semen, besi, pasir...)" className="flex-1 h-9 px-3 border rounded-xl bg-white text-sm"/>
              <button type="button" onClick={searchProducts} className="h-9 px-4 bg-white border rounded-xl text-xs font-bold">Cari</button>
              <span className="text-xs text-ink-2">{prodLoading?'...':products.length+' produk'}</span>
            </div>
            <div className="max-h-[180px] overflow-auto divide-y">
              {products.slice(0,8).map(p=>(
                <div key={p.id} className="flex items-center gap-3 p-3 hover:bg-surface-3">
                  <div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{p.name}</div><div className="text-xs text-ink-2">{p.sku} • stok {p.stock_available ?? p.stock_onhand ?? '-'} • {p.category_name||''}</div></div>
                  <button type="button" onClick={()=>addProduct(p)} className="h-8 px-3 bg-brand text-white rounded-full text-xs font-bold shrink-0">+ Tambah</button>
                </div>
              ))}
              {products.length===0 && !prodLoading && <div className="p-4 text-center text-xs text-ink-3">Tidak ada produk - coba kata lain atau kosongkan untuk semua</div>}
              {prodLoading && <div className="p-4 text-center text-xs text-ink-3">Mencari...</div>}
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2"><th className="p-2 text-left">PRODUK</th><th className="px-4 py-3.5">QTY</th><th className="px-4 py-3.5 text-right">HARGA</th><th className="px-4 py-3.5 text-right">TOTAL</th><th></th></tr></thead><tbody>
              {convForm.items.map((s,i)=>(
                <tr key={i} className="border-t"><td className="px-4 py-3.5"><div className="font-semibold text-sm">{s.name}</div><div className="text-xs text-ink-2">{s.sku}</div></td>
                  <td className="px-4 py-3.5"><input type="number" min={1} step="1" value={s.qty} onChange={e=>{ const c=[...convForm.items]; c[i].qty=e.target.value; setConvForm({...convForm, items:c}); }} className="w-20 h-8 border rounded-lg text-center text-sm"/></td>
                  <td className="px-4 py-3.5 text-right"><input type="number" value={s.unit_price} onChange={e=>{ const c=[...convForm.items]; c[i].unit_price=e.target.value; setConvForm({...convForm, items:c}); }} className="w-28 h-8 border rounded-lg text-right px-2 text-sm"/></td>
                  <td className="p-2 text-right font-bold text-sm">{rupiahNum((parseFloat(s.qty)||0)*(parseFloat(s.unit_price)||0))}</td>
                  <td className="px-4 py-3.5"><button type="button" onClick={()=>setConvForm({...convForm, items: convForm.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">Hapus</button></td></tr>
              ))}
              {convForm.items.length===0 && <tr><td colSpan={5} className="p-4 text-center text-xs text-ink-2">Belum ada item - pilih produk di atas. Jika kosong, sistem buat 1 baris dummy dari nilai ekspektasi.</td></tr>}
            </tbody></table>
          </div>

          <div className="bg-surface-3 rounded-xl p-4 max-w-sm ml-auto space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{rupiahNum(convSubtotal)}</span></div>
            <div className="flex justify-between"><span>Diskon</span><span>-{rupiahNum(discVal)}</span></div>
            <div className="flex justify-between"><span>PPN 11%</span><span>{rupiahNum(convTax)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>{rupiahNum(convGrand)}</span></div>
            <div className="text-xs text-ink-2">Status otomatis: diskon &gt;10% → PENDING (butuh Approval Direktur), selain itu APPROVED + reservasi stok.</div>
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-between items-center gap-2 sticky bottom-0">
          <div className="text-xs text-ink-2">Idempotent - klik 2× tidak duplikat SO. Sudah terkonversi langsung ke detail.</div>
          <div className="flex gap-2">
            <button type="button" onClick={()=>setShowConv(false)} className="h-10 px-5 border rounded-xl text-sm">Batal</button>
            <button type="submit" disabled={convLoading} className="h-[42px] px-5 bg-brand text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-card hover:bg-brand-strong active:scale-[0.98] transition">{convLoading?'Memproses...':'Konversi → Buat SO'}</button>
          </div>
        </div>
      </form></div>}
    </div>
  )
}
