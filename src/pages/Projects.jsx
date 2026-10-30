import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Search, RefreshCw, Plus, X, Eye, MapPin, Calendar, Wallet, FileText, Handshake } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 9;
const rupiah=(n)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const nf=(n)=>new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));

export default function Projects(){
  const dialog=useDialog();
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [q,setQ]=useState('');
  const [appliedQ,setAppliedQ]=useState('');
  const [status,setStatus]=useState('Semua');
  const [page,setPage]=useState(1);
  const [expBusy,setExpBusy]=useState('');
  const [show,setShow]=useState(false);
  const [customers,setCustomers]=useState([]);
  const [form,setForm]=useState({name:'',customer_id:'',contract_value:'',start_date:'',end_date:'',location:'',pic_name:'',retention_pct:5});
  const [detail,setDetail]=useState(null);
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r=await api.get('/projects');
      setData(Array.isArray(r.data)? r.data: []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat proyek'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:200}}).then(r=>setCustomers(Array.isArray(r.data?.data)?r.data.data:[])).catch(()=>{}); },[]);
  useEffect(()=>{ setPage(1); },[appliedQ,status]);

  const filtered=useMemo(()=>{
    let d=[...data];
    if(appliedQ){
      const s=appliedQ.toLowerCase();
      d=d.filter(p=> (p.name||'').toLowerCase().includes(s) || (p.project_code||'').toLowerCase().includes(s) || (p.customer_name||'').toLowerCase().includes(s));
    }
    if(status!=='Semua') d=d.filter(p=> String(p.status||'').toUpperCase()===status);
    return d;
  },[data,appliedQ,status]);
  const total=filtered.length;
  const pageRows=filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const stats=useMemo(()=>{
    const kontrak=filtered.reduce((a,p)=>a+Number(p.contract_value||0),0);
    const terbayar=filtered.reduce((a,p)=>a+Number(p.paid_amount||0),0);
    return { kontrak, terbayar, count:filtered.length };
  },[filtered]);

  const create=async(e)=>{
    e.preventDefault();
    if(!form.name.trim()){ await dialog.alert('Nama proyek wajib diisi',{title:'Lengkapi'}); return; }
    setSaving(true);
    try{
      const r=await api.post('/projects',{...form, customer_id: form.customer_id? parseInt(form.customer_id): null, contract_value: parseFloat(form.contract_value)||0, retention_pct: parseFloat(form.retention_pct)||5});
      setShow(false); setForm({name:'',customer_id:'',contract_value:'',start_date:'',end_date:'',location:'',pic_name:'',retention_pct:5});
      await dialog.alert('Proyek '+r.data.project_code+' dibuat',{title:'Berhasil'}); load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
    finally{ setSaving(false); }
  };
  const open=async(id)=>{
    try{ const r=await api.get('/projects/'+id); setDetail(r.data); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal memuat detail'}); }
  };
  // ── Termin proyek → invoice otomatis ──────────────────────────────────────
  const generateTerms=async()=>{
    if(!detail) return;
    const ok=await dialog.confirm('Buat termin standar 30% / 40% / 30% dari nilai kontrak? Termin PENDING yang belum ditagih akan diganti.',{title:'Generate termin', confirmText:'Ya, buat'});
    if(!ok) return;
    try{
      const r=await api.post('/project-terms/generate',{project_id:detail.id, terms:[
        {description:'DP 30%', percentage:30},
        {description:'Termin 1 - 40%', percentage:40},
        {description:'Termin 2 - 30%', percentage:30},
      ]});
      await dialog.alert(`${r.data.created} termin dibuat.`,{title:'Termin dibuat', tone:'success'});
      open(detail.id);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal membuat termin'}); }
  };
  const invoiceTerm=async(t)=>{
    const ok=await dialog.confirm(`Terbitkan invoice untuk ${t.description} sebesar ${rupiah(t.amount)} + PPN 11%?`,{title:'Tagih termin', confirmText:'Ya, terbitkan'});
    if(!ok) return;
    try{
      const r=await api.post('/project-terms/'+t.id+'/invoice',{});
      await dialog.alert(r.data.message||'Invoice dibuat.',{title:'Invoice terbit', tone:'success'});
      open(detail.id);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal menagih'}); }
  };
  const download=async(format)=>{
    setExpBusy(format);
    try{
      const r=await api.get('/projects/export',{params:{format}, responseType:'blob'});
      const url=URL.createObjectURL(new Blob([r.data])); const a=document.createElement('a'); a.href=url; a.download='daftar-proyek.'+format; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message||'Gagal export',{title:'Gagal'}); }
    finally{ setExpBusy(''); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Building2} title="Proyek & Tender" subtitle="Master proyek • termin pembayaran • RAB vs realisasi • dokumen • harga khusus proyek" badge={stats.count+' proyek'} actions={<><PosExportButtons onExport={download} busyKey={expBusy} prefix="Proyek"/><button onClick={()=>setShow(true)} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Proyek Baru</button></>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Building2} tone="bg-[#0051d5]/10 text-[#0051d5]" label="TOTAL PROYEK" value={stats.count} sub="halaman terfilter" />
        <PosStat icon={Wallet} tone="bg-sky-50 text-sky-700" label="NILAI KONTRAK" value={rupiah(stats.kontrak)} sub="total proyek terfilter" />
        <PosStat icon={Handshake} tone="bg-emerald-50 text-emerald-700" label="TERBAYAR" value={rupiah(stats.terbayar)} sub={stats.kontrak? Math.round(stats.terbayar/stats.kontrak*100)+'% dari kontrak' : ''} />
        <PosStat icon={FileText} tone="bg-amber-50 text-amber-700" label="SISA TAGIH" value={rupiah(stats.kontrak-stats.terbayar)} sub="kontrak - terbayar" />
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)} placeholder="Cari nama / kode proyek / customer lalu Enter..." className={posInput+' pl-9'} />
            </div>
            <div className={posSelectWrap}><PosSelect value={status} onChange={setStatus}><option value="Semua">Semua Status</option><option value="DRAFT">DRAFT</option><option value="ACTIVE">ACTIVE</option><option value="COMPLETED">COMPLETED</option><option value="CANCELLED">CANCELLED</option></PosSelect></div>
          </PosToolbar>
          <PosChipRow label="STATUS">
            {['Semua','DRAFT','ACTIVE','COMPLETED'].map(s=> <PosChip key={s} active={status===s} onClick={()=>setStatus(s)}>{s}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={3} cols={3}/> : err ? <PosError message={err} onRetry={load}/> : !pageRows.length ? <PosEmpty text="Belum ada proyek pada filter ini"/> : (
          <>
            <div className="grid md:grid-cols-3 gap-4 p-3">
              {pageRows.map(p=>(
                <div key={p.id} onClick={()=>open(p.id)} className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-5 cursor-pointer hover:shadow-lg hover:border-[#0051d5]/20 transition">
                  <div className="flex justify-between gap-2 items-start"><span className="font-mono text-xs font-bold bg-[#e5eeff] border px-2 py-1 rounded-full">{p.project_code}</span><Badge status={p.status||'DRAFT'}/></div>
                  <div className="font-bold mt-3 leading-tight line-clamp-2">{p.name}</div>
                  <div className="text-xs text-[#45464d] flex items-center gap-1 mt-1"><Handshake size={11}/> {p.customer_name||'-'} • <MapPin size={11}/>{(p.location||'-').slice(0,22)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#e5eeff] border rounded-xl p-2"><div className="text-[#45464d]">Nilai Kontrak</div><div className="font-bold tabular-nums">{rupiah(p.contract_value)}</div></div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2"><div className="text-emerald-700">Terbayar</div><div className="font-bold tabular-nums">{rupiah(p.paid_amount||0)}</div></div>
                  </div>
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#0051d5]" style={{width: Math.min(100, (Number(p.paid_amount||0)/Number(p.contract_value||1)*100))+'%'}}/></div>
                  <div className="text-xs text-[#45464d] mt-1.5 flex items-center gap-1"><Calendar size={11}/>{String(p.start_date||'').slice(0,10)} → {String(p.end_date||'').slice(0,10)} • Retensi {p.retention_pct||5}%</div>
                  <div className="mt-2 flex justify-end"><span className={posBtnSm+' text-[11px]'}><Eye size={12}/> Detail</span></div>
                </div>
              ))}
            </div>
            <PosCardBody><PosPager page={page} setPage={setPage} total={total} size={PAGE_SIZE} unit="proyek"/></PosCardBody>
          </>
        )}
      </PosCard>

      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto border shadow-raised animate-pop">
            <div className="sticky top-0 bg-white border-b p-5 flex justify-between items-start">
              <div><div className="font-mono text-xs font-bold">{detail.project_code} <Badge status={detail.status}/></div><div className="font-bold text-lg">{detail.name}</div><div className="text-xs text-[#45464d]">{detail.customer_name} • {detail.location}</div><div className="text-sm mt-1">Nilai {rupiah(detail.contract_value)} • {String(detail.start_date||'').slice(0,10)} → {String(detail.end_date||'').slice(0,10)} • PIC {detail.pic_name||'-'}</div></div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border grid place-items-center"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm">Termin Pembayaran</div>
                <div className="flex gap-2">
                  <button onClick={generateTerms} className={posBtnSecondary+' h-8 px-3 text-[11px]'}>Generate 30/40/30</button>
                </div>
              </div>
              <div className="border rounded-xl overflow-hidden overflow-auto">
                <table className="w-full text-xs"><thead><tr className="bg-[#e5eeff] text-[11px] font-bold tracking-wider text-[#45464d]"><th className="px-3 py-2">TERMIN</th><th className="px-3 py-2 text-left">DESKRIPSI</th><th className="px-3 py-2 text-right">%</th><th className="px-3 py-2 text-right">NILAI</th><th className="px-3 py-2">DUE</th><th className="px-3 py-2">STATUS</th><th className="px-3 py-2">AKSI</th></tr></thead>
                  <tbody>{(detail.terms||[]).map(t=> <tr key={t.id} className="border-t border-[#e5eeff]"><td className="px-3 py-2 text-center">{t.term_number}</td><td className="px-3 py-2">{t.description}</td><td className="px-3 py-2 text-right">{t.percentage}%</td><td className="px-3 py-2 text-right font-bold">{rupiah(t.amount)}</td><td className="px-3 py-2 text-center">{String(t.due_date||'').slice(0,10)}</td><td className="px-3 py-2 text-center"><Badge status={t.status||'PENDING'}/></td><td className="px-3 py-2 text-center">{t.invoice_id? <span className="font-mono text-[10px] text-[#45464d]">{t.invoice_number||('#'+t.invoice_id)}</span> : (String(t.status||'').toUpperCase()==='PENDING'? <button onClick={()=>invoiceTerm(t)} className="text-[11px] font-bold text-[#0051d5] hover:underline">Tagih</button> : <span className="text-[10px] text-[#76777d]">-</span>)}</td></tr>)}{(!detail.terms||!detail.terms.length) && <tr><td colSpan={7} className="px-3 py-6 text-center text-[#76777d]">Belum ada termin — klik "Generate 30/40/30"</td></tr>}</tbody>
                </table>
              </div>
              <div className="font-bold text-sm">RAB vs Realisasi</div>
              <div className="border rounded-xl overflow-hidden overflow-auto">
                <table className="w-full text-xs"><thead><tr className="bg-[#e5eeff] text-[11px] font-bold tracking-wider text-[#45464d]"><th className="px-3 py-2 text-left">PRODUK</th><th className="px-3 py-2 text-right">RENCANA</th><th className="px-3 py-2 text-right">REALISASI</th><th className="px-3 py-2 text-right">SELISIH</th></tr></thead>
                  <tbody>{(detail.rab||[]).map(r=> <tr key={r.id} className="border-t border-[#e5eeff]"><td className="px-3 py-2">{r.product_name}</td><td className="px-3 py-2 text-right">{r.qty_planned} / {rupiah(r.amount_planned)}</td><td className="px-3 py-2 text-right">{r.qty_actual} / {rupiah(r.amount_actual)}</td><td className="px-3 py-2 text-right"><span className={Number(r.amount_actual)>Number(r.amount_planned)?'text-red-600':'text-emerald-600'}>{rupiah(Number(r.amount_actual||0)-Number(r.amount_planned||0))}</span></td></tr>)}{(!detail.rab||!detail.rab.length) && <tr><td colSpan={4} className="px-3 py-6 text-center text-[#76777d]">Belum ada RAB</td></tr>}</tbody>
                </table>
              </div>
              <div className="font-bold text-sm">Harga Khusus Proyek</div>
              <div className="text-xs text-[#45464d]">{(detail.prices||[]).length? detail.prices.map(pp=> pp.product_name+': '+rupiah(pp.price)).join(' • ') : 'Belum ada harga khusus'}</div>
              <div className="font-bold text-sm">Dokumen</div>
              <div className="flex gap-2 flex-wrap text-xs">{(detail.documents||[]).map(d=> <span key={d.id} className="px-2 py-1 bg-[#e5eeff] border rounded-full">{d.doc_type}: {d.doc_number}</span>)} {(!detail.documents||!detail.documents.length) && <span className="text-[#76777d]">Belum ada dokumen</span>}</div>
            </div>
          </div>
        </div>
      )}

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={create} className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 max-h-[92vh] overflow-auto border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[16px] text-[#0b1c30]">Proyek Baru</h3><div className="text-xs text-[#45464d] mt-0.5">Kode otomatis PRJ- • retensi default 5%</div></div><button type="button" onClick={()=>setShow(false)} className="w-9 h-9 rounded-xl border grid place-items-center"><X size={16}/></button></div>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA PROYEK *</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Gedung A - Tahap 1" className={posInput} /></label>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CUSTOMER (kontraktor)</span>
              <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className={posInput}><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NILAI KONTRAK</span><input type="number" value={form.contract_value} onChange={e=>setForm({...form,contract_value:e.target.value})} placeholder="500000000" className={posInput} /></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">RETENSI %</span><input type="number" value={form.retention_pct} onChange={e=>setForm({...form,retention_pct:e.target.value})} className={posInput} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">TGL MULAI</span><input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className={posInput} /></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">TGL SELESAI</span><input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className={posInput} /></label>
            </div>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">LOKASI</span><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Bekasi - Jl. ..." className={posInput} /></label>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">PIC PROYEK</span><input value={form.pic_name} onChange={e=>setForm({...form,pic_name:e.target.value})} placeholder="Budi" className={posInput} /></label>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setShow(false)} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button><button disabled={saving} className={posBtnPrimary+' h-9 px-6 text-xs'}>{saving?'Menyimpan...':'Simpan Proyek'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
