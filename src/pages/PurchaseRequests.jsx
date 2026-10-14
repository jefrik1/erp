import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';

function emptyRow(){ return { product_id:'', q:'', qty:0, needed_date:'', notes:'' }; }

export default function PurchaseRequests(){
  const nav=useNavigate(); const dialog=useDialog();
  const [data,setData]=useState([]); const [products,setProducts]=useState([]);
  const [show,setShow]=useState(false);
  const [rows,setRows]=useState([emptyRow()]);
  const [saving,setSaving]=useState(false);
  const [openIdx,setOpenIdx]=useState(null);

  const load=()=> api.get('/purchase/requests').then(r=>setData(r.data?.data ?? r.data ?? [])).catch(()=>setData([]));
  useEffect(()=>{ load(); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data||[])); },[]);

  const resetForm=()=>{ setRows([emptyRow()]); setOpenIdx(null); };
  const updateRow=(i, patch)=> setRows(prev=> prev.map((r,idx)=> idx===i? {...r, ...patch}: r));
  const addRow=()=> setRows(prev=> [...prev, emptyRow()]);
  const removeRow=(i)=> setRows(prev=> prev.length===1? prev : prev.filter((_,idx)=> idx!==i));

  const submit=async(e)=>{
    e.preventDefault();
    if(saving) return;
    for(let i=0;i<rows.length;i++){
      const r=rows[i];
      if(!r.product_id) { await dialog.alert(`Baris ${i+1}: pilih produk dari dropdown (ketik nama/SKU lalu klik pilihan)`,{title:'Lengkapi Produk'}); return; }
      const qty=parseFloat(r.qty);
      if(isNaN(qty) || qty<=0){ await dialog.alert(`Baris ${i+1}: jumlah harus > 0 (isi angka, tidak bisa minus)`,{title:'Jumlah Salah'}); return; }
    }
    setSaving(true);
    try{
      if(rows.length===1){
        const r=rows[0];
        const res=await api.post('/purchase/requests',{product_id:parseInt(r.product_id),qty:parseFloat(r.qty),needed_date:r.needed_date||null,notes:r.notes||null});
        await dialog.alert('PR '+res.data.pr_number+' dibuat',{title:'PR Dibuat'});
      } else {
        const payload={ items: rows.map(r=>({ product_id:parseInt(r.product_id), qty:parseFloat(r.qty), needed_date:r.needed_date||null, notes:r.notes||null })) };
        const res=await api.post('/purchase/requests', payload);
        const list=(res.data.created||[]).map(c=>c.pr_number).join(', ');
        await dialog.alert(`${res.data.count} PR dibuat: ${list}`,{title:'Bulk PR Dibuat'});
      }
      setShow(false); resetForm(); load();
    }catch(err){
      await dialog.alert(err.response?.data?.error||err.message,{title:'Gagal Simpan'});
    }finally{ setSaving(false); }
  };

  const approve=async(id)=>{ await api.post('/purchase/requests/'+id+'/approve'); await dialog.alert('PR approved',{title:'Sukses'}); load(); };
  const toRfq=async(id)=>{
    try{ const r=await api.post('/purchase/requests/'+id+'/rfq'); await dialog.alert('RFQ '+r.data.rfq_number+' dibuat',{title:'RFQ'}); nav('/purchase/rfqs'); }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Purchase Request</h1><p className="text-xs text-[#64748B] mt-1">Ketik produk • qty default 0 (tidak bisa minus) • + untuk bulk PR</p></div></div>
          <nav className="mt-2 flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border rounded-full w-fit shadow-sm">
            {[
              {label:'PR',sub:'Purchase Request',to:'/purchase/requests',active:true},
              {label:'RFQ',sub:'Quotation',to:'/purchase/rfqs'},
              {label:'PO',sub:'Order',to:'/purchase/orders'},
              {label:'Approval',sub:'Berjenjang',to:'/approvals'},
              {label:'GRN',sub:'Receipt',to:'/purchase/receipts'},
              {label:'3-way',sub:'Matching',to:'/purchase/receipts'},
            ].map((s,i,arr)=>(
              <span key={s.label} className="flex items-center gap-1">
                <button onClick={()=>nav(s.to)} className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border "+(s.active?"bg-[#1E40AF] text-white border-[#1E40AF]":"bg-white text-gray-700 border-gray-200 hover:border-[#1E40AF]/30")}>
                  <span className={"w-5 h-5 grid place-items-center rounded-full text-[10px] font-black "+(s.active?"bg-white/20 text-white":"bg-gray-900 text-white")}>{i+1}</span>
                  {s.label} <span className="hidden lg:inline text-[10px] opacity-60 font-semibold">{s.sub}</span>
                </button>
                {i<arr.length-1 && <span className="text-[#94A3B8]">›</span>}
              </span>
            ))}
          </nav>
        </div>
        <button onClick={()=>{ resetForm(); setShow(true); }} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl text-sm font-bold hover:bg-[#1E3A8A]">+ Buat PR</button>
      </div>

      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm">
          <thead><tr className="bg-[#F1F5F9] border-y text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3">PR</th><th className="text-left px-4 py-3">PRODUK</th><th className="text-right px-4 py-3">QTY</th><th className="text-left px-4 py-3">TGL BUTUH</th><th className="text-left px-4 py-3">STATUS</th><th className="text-right px-4 py-3">AKSI</th></tr></thead>
          <tbody>{data.map(r=>(
            <tr key={r.id} className="border-b hover:bg-[#F8FAFC]"><td className="px-4 py-3 font-mono text-xs font-bold">{r.pr_number}</td><td className="px-4 py-3">{r.product_name} <span className="text-xs text-[#64748B]">{r.sku}</span></td><td className="px-4 py-3 text-right">{r.qty}</td><td className="px-4 py-3 text-xs">{r.needed_date?.slice(0,10)||'-'}</td><td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-full border bg-white font-bold">{r.status}</span></td><td className="px-4 py-3 text-right space-x-1">
              {r.status==='DRAFT' && <button onClick={()=>approve(r.id)} className="text-xs px-3 py-1 rounded-full bg-amber-500 text-white font-bold hover:bg-amber-600">Approve</button>}
              {r.status==='APPROVED' && <button onClick={()=>toRfq(r.id)} className="text-xs px-3 py-1 rounded-full bg-[#1E40AF] text-white font-bold hover:bg-blue-800">Buat RFQ</button>}
            </td></tr>
          ))}{data.length===0 && <tr><td colSpan={6} className="p-8 text-center text-sm text-[#94A3B8]">Belum ada PR — buat PR lalu approve → RFQ</td></tr>}</tbody>
        </table></div>
      </div>

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-3 z-50 overflow-auto">
          <form onSubmit={submit} className="bg-white rounded-[20px] w-full max-w-3xl shadow-xl border border-[#E2E8F0] flex flex-col max-h-[92vh]">
            <div className="p-5 border-b flex justify-between items-start gap-3">
              <div>
                <h3 className="font-black text-[15px] text-[#0F172A]">Buat Purchase Request — bisa bulk</h3>
                <p className="text-xs text-[#64748B] mt-1">Tiap baris = 1 PR tersendiri. Ketik produk untuk cari, qty default 0 tidak bisa minus.</p>
              </div>
              <button type="button" onClick={()=>{ setShow(false); resetForm(); }} className="w-8 h-8 grid place-items-center rounded-full border bg-white shrink-0">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              <div className="hidden sm:grid grid-cols-[1.7fr_0.7fr_1fr_1.4fr_36px] gap-2 text-[10px] font-bold tracking-widest text-[#64748B]">
                <span>PRODUK * <span className="font-normal normal-case tracking-normal">— ketik nama/SKU, pilih dari dropdown</span></span>
                <span>JUMLAH * <span className="font-normal normal-case">— &gt;0, min 0</span></span>
                <span>TGL BUTUH <span className="font-normal normal-case">— kapan dibutuhkan</span></span>
                <span>CATATAN <span className="font-normal normal-case">— alasan/kebutuhan</span></span>
                <span></span>
              </div>

              {rows.map((row, idx)=>{
                const filtered = (row.q||'').trim()===''? products.slice(0,20) : products.filter(p=> p.name.toLowerCase().includes(row.q.toLowerCase()) || p.sku.toLowerCase().includes(row.q.toLowerCase())).slice(0,20);
                const selectedProd = products.find(p=> String(p.id)===String(row.product_id));
                return (
                  <div key={idx} className="border border-[#E2E8F0] rounded-[16px] p-3 bg-[#F8FAFC]/60 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-[#334155]">Baris {idx+1} {selectedProd && <span className="ml-2 text-[11px] font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{selectedProd.sku}</span>}</span>
                      <button type="button" onClick={()=>removeRow(idx)} disabled={rows.length===1} className="w-7 h-7 grid place-items-center rounded-full border bg-white text-[#94A3B8] hover:text-red-600 disabled:opacity-30" title="Hapus baris"><Trash2 size={14}/></button>
                    </div>

                    <div className="grid sm:grid-cols-[1.7fr_0.7fr_1fr_1.4fr] gap-2">
                      <label className="space-y-1 relative">
                        <span className="text-[11px] font-bold tracking-widest text-[#64748B] sm:hidden">PRODUK * — ketik & pilih</span>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"/>
                          <input
                            value={row.q}
                            onChange={e=>{ const v=e.target.value; updateRow(idx,{q:v, product_id:''}); setOpenIdx(idx); }}
                            onFocus={()=>setOpenIdx(idx)}
                            onBlur={()=>setTimeout(()=>setOpenIdx(o=>o===idx?null:o),180)}
                            placeholder="Ketik nama / SKU — pilih dari daftar"
                            className={"w-full h-[42px] pl-9 pr-3 bg-white border rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 "+(row.product_id?'border-emerald-200 bg-emerald-50/30':'border-[#E2E8F0]')}
                          />
                        </div>
                        {row.product_id && selectedProd ? (
                          <div className="text-[11px] text-emerald-700 font-semibold truncate">✓ {selectedProd.name}</div>
                        ) : (
                          <div className="text-[11px] text-amber-700">Wajib pilih dari daftar — jangan isi bebas</div>
                        )}
                        {openIdx===idx && (
                          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-xl max-h-[200px] overflow-auto">
                            {filtered.length===0 ? <div className="p-3 text-xs text-[#94A3B8]">Tidak ada produk untuk "{row.q}"</div> : filtered.map(p=>(
                              <button key={p.id} type="button" onMouseDown={()=>{ updateRow(idx,{product_id:String(p.id), q:p.name}); setOpenIdx(null); }} className="w-full text-left px-3 py-2.5 hover:bg-[#F1F5F9] border-b last:border-0 flex justify-between gap-2">
                                <span className="text-sm font-medium truncate">{p.name} <span className="text-xs text-[#64748B]">{p.sku}</span></span>
                                <span className="text-xs text-[#94A3B8] shrink-0">{p.category_name||''}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-bold tracking-widest text-[#64748B] sm:hidden">JUMLAH * — satuan produk</span>
                        <input
                          type="number" min={0} step={1}
                          value={row.qty}
                          onChange={e=>{
                            let v=e.target.value;
                            if(v===''){ updateRow(idx,{qty:''}); return; }
                            let n=parseFloat(v);
                            if(isNaN(n)) n=0;
                            if(n<0) n=0;
                            updateRow(idx,{qty:n});
                          }}
                          onBlur={e=>{
                            let n=parseFloat(e.target.value);
                            if(isNaN(n)||n<0) updateRow(idx,{qty:0});
                          }}
                          placeholder="0"
                          className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm text-center outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10"
                        />
                        <div className="text-[11px] text-[#64748B] text-center">Default 0 • tidak bisa minus</div>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-bold tracking-widest text-[#64748B] sm:hidden">TGL BUTUH — estimasi datang</span>
                        <input type="date" value={row.needed_date} onChange={e=>updateRow(idx,{needed_date:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]"/>
                        <div className="text-[11px] text-[#64748B]">Kapan stok harus tersedia</div>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-bold tracking-widest text-[#64748B] sm:hidden">CATATAN — alasan</span>
                        <input value={row.notes} onChange={e=>updateRow(idx,{notes:e.target.value})} placeholder="ex: stok menipis / proyek X" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]"/>
                        <div className="text-[11px] text-[#64748B]">Opsional — penjelasan kebutuhan</div>
                      </label>
                    </div>
                  </div>
                );
              })}

              <button type="button" onClick={addRow} className="w-full h-10 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-white text-sm font-bold text-[#334155] hover:bg-[#F8FAFC] hover:border-[#1E40AF]/30 flex items-center justify-center gap-1.5">
                <Plus size={16}/> + Tambah Produk (baris baru — jadi PR terpisah)
              </button>
              <div className="text-[11px] text-[#64748B] bg-[#EFF6FF] border border-[#DBEAFE] rounded-xl p-3 leading-relaxed">
                <b>Bulk PR:</b> {rows.length} baris = {rows.length} PR tersendiri (masing-masing <b>PR-xxxx</b>). Tiap baris wajib isi <b>Produk</b> + <b>Jumlah &gt;0</b>. Tanggal & catatan boleh beda per produk. Simpan sekali langsung buat semua.
              </div>
            </div>

            <div className="p-4 border-t bg-white flex justify-end gap-2 sticky bottom-0">
              <button type="button" onClick={()=>{ setShow(false); resetForm(); }} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button>
              <button type="submit" disabled={saving} className="h-10 px-6 rounded-xl bg-[#1E40AF] text-white text-sm font-bold disabled:opacity-50 hover:bg-blue-800">
                {saving?'Menyimpan...': rows.length>1 ? `Simpan ${rows.length} PR` : 'Simpan PR'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
