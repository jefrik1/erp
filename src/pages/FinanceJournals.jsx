import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Search, RefreshCw, Plus, X, Trash2, Calendar, Scale } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const nf=(n)=>new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah=(n)=>'Rp '+nf(n);

export default function FinanceJournals(){
  const dialog=useDialog();
  const [data,setData]=useState([]);
  const [total,setTotal]=useState(0);
  const [coa,setCoa]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [q,setQ]=useState('');
  const [appliedQ,setAppliedQ]=useState('');
  const [page,setPage]=useState(1);
  const [chip,setChip]=useState('Semua'); // Semua | DRAFT | POSTED
  const [expBusy,setExpBusy]=useState('');
  const [show,setShow]=useState(false);
  const [form,setForm]=useState({description:'', entry_date:'', details:[{account_id:'', debit:'', credit:'', description:''}]});
  const [saving,setSaving]=useState(false);
  const [formErr,setFormErr]=useState('');

  const load=useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r=await api.get('/finance/journals',{params:{limit:PAGE_SIZE, page, search: appliedQ||undefined}});
      const d=Array.isArray(r.data?.data)? r.data.data : (Array.isArray(r.data)? r.data : []);
      setData(d); setTotal(Number(r.data?.total)||d.length);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat jurnal'); }
    finally{ setLoading(false); }
  },[appliedQ,page]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ api.get('/finance/coa').then(r=>setCoa(Array.isArray(r.data)?r.data:[])).catch(()=>{}); },[]);
  useEffect(()=>{ setPage(1); },[appliedQ]);

  const filtered=useMemo(()=>{
    let d=[...data];
    if(chip==='POSTED') d=d.filter(j=> j.posted);
    if(chip==='DRAFT') d=d.filter(j=> !j.posted);
    if(appliedQ){
      const s=appliedQ.toLowerCase();
      d=d.filter(j=> (j.entry_number||'').toLowerCase().includes(s) || (j.description||'').toLowerCase().includes(s) );
    }
    return d;
  },[data,chip,appliedQ]);

  const stats=useMemo(()=>{
    const debit=data.reduce((a,j)=>a+Number(j.total_debit||0),0);
    const credit=data.reduce((a,j)=>a+Number(j.total_credit||0),0);
    return { debit, credit, count:data.length };
  },[data]);

  const addRow=()=> setForm({...form, details:[...form.details,{account_id:'',debit:'',credit:'',description:''}]});
  const rmRow=(i)=> setForm({...form, details: form.details.filter((_,idx)=>idx!==i)});
  const submit=async(e)=>{
    e.preventDefault();
    if(!form.description.trim()){ setFormErr('Deskripsi wajib diisi'); return; }
    const details=form.details.filter(d=> d.account_id).map(d=>({account_id:parseInt(d.account_id), debit:parseFloat(d.debit)||0, credit:parseFloat(d.credit)||0, description:d.description||''}));
    if(details.length<2){ setFormErr('Minimal 2 baris akun'); return; }
    const sd=details.reduce((a,d)=>a+d.debit,0), sc=details.reduce((a,d)=>a+d.credit,0);
    if(Math.abs(sd-sc)>0.5){ setFormErr('Debit ('+nf(sd)+') harus = Kredit ('+nf(sc)+')'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/finance/journals',{description:form.description, entry_date: form.entry_date||null, details});
      setShow(false); setForm({description:'', entry_date:'', details:[{account_id:'',debit:'',credit:'',description:''}]}); await dialog.alert('Jurnal diposting',{title:'Berhasil'}); load();
    }catch(e){ setFormErr(e.response?.data?.error||e.message||'Gagal posting'); }
    finally{ setSaving(false); }
  };
  const download=async(format)=>{
    setExpBusy(format);
    try{
      const r=await api.get('/finance/export',{params:{dataset:'journals',format}, responseType:'blob'});
      const url=URL.createObjectURL(new Blob([r.data])); const a=document.createElement('a'); a.href=url; a.download='jurnal-umum.'+format; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message||'Gagal export',{title:'Gagal'}); }
    finally{ setExpBusy(''); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Jurnal Umum" subtitle="Auto dari SO/PO/Invoice • Closing lock • Audit trail - manual harus seimbang debit=kredit" badge={total+' jurnal'} actions={<><PosExportButtons onExport={download} busyKey={expBusy} prefix="Jurnal"/><button onClick={()=>{ setFormErr(''); setShow(true); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Jurnal Manual</button></>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={FileText} tone="bg-brand/10 text-brand" label="TOTAL JURNAL" value={stats.count} sub="halaman ini" />
        <PosStat icon={Scale} tone="bg-emerald-50 text-emerald-700" label="TOTAL DEBIT" value={rupiah(stats.debit)} sub="seimbang dengan kredit" />
        <PosStat icon={Scale} tone="bg-sky-50 text-sky-700" label="TOTAL KREDIT" value={rupiah(stats.credit)} sub={Math.abs(stats.debit-stats.credit)<0.5? 'seimbang' : 'selisih '+(nf(Math.abs(stats.debit-stats.credit)))} />
        <PosStat icon={Calendar} tone="bg-amber-50 text-amber-700" label="POSTED" value={data.filter(j=>j.posted).length} sub={data.filter(j=>!j.posted).length+' draft'} />
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)} placeholder="Cari no. jurnal / deskripsi lalu Enter..." className={posInput+' pl-9'} />
            </div>
          </PosToolbar>
          <PosChipRow label="STATUS">
            {['Semua','POSTED','DRAFT'].map(s=> <PosChip key={s} active={chip===s} onClick={()=>setChip(s)}>{s}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={5} cols={4}/> : err ? <PosError message={err} onRetry={load}/> : !filtered.length ? <PosEmpty text="Belum ada jurnal pada filter ini"/> : (
          <div className="space-y-3 p-3">
            {filtered.map(j=>(
              <div key={j.id} className="bg-white rounded-xl border border-line overflow-hidden">
                <div className="flex flex-wrap justify-between gap-3 items-start p-3 bg-surface-2 border-b">
                  <div><div className="font-mono text-xs font-bold text-ink">{j.entry_number} • {String(j.entry_date||'').slice(0,10)}</div><div className="text-sm mt-0.5">{j.description}</div><div className="text-[11px] text-ink-2 mt-0.5">oleh {j.username||'-'}</div></div>
                  <PosBadge tone={j.posted?'emerald':'amber'}>{j.posted?'POSTED':'DRAFT'}</PosBadge>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-xs"><thead><tr className="bg-surface-3 text-[11px] font-bold tracking-wider text-ink-2"><th className="p-2 text-left">AKUN</th><th className="px-4 py-2 text-right">DEBIT</th><th className="px-4 py-2 text-right">KREDIT</th></tr></thead>
                    <tbody>{(j.details||[]).map((d,i)=> <tr key={i} className="border-t border-line"><td className="px-3 py-2">{d.code} • {d.name}</td><td className="px-4 py-2 text-right tabular-nums">{d.debit>0? nf(d.debit):''}</td><td className="px-4 py-2 text-right tabular-nums">{d.credit>0? nf(d.credit):''}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-4 text-xs font-bold px-3 py-2 bg-[#ffffff] border-t"><span>Debit {nf(j.total_debit||0)}</span><span>Kredit {nf(j.total_credit||0)}</span></div>
              </div>
            ))}
            <PosPager page={page} setPage={setPage} total={total} size={PAGE_SIZE} unit="jurnal"/>
          </div>
        )}
      </PosCard>

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[92vh] overflow-auto space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-bold text-[16px] text-ink">Jurnal Manual</h3><div className="text-xs text-ink-2 mt-0.5">Debit harus = Kredit - minimal 2 baris</div></div>
              <button type="button" onClick={()=>setShow(false)} className="w-9 h-9 rounded-xl border grid place-items-center"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">DESKRIPSI *</span><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Contoh: Koreksi persediaan" className={posInput} /></label>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">TANGGAL (opsional)</span><input type="date" value={form.entry_date} onChange={e=>setForm({...form,entry_date:e.target.value})} className={posInput} /></label>
            <div className="space-y-2">
              <div className="text-[11px] font-bold tracking-wider text-ink-2">RINCIAN AKUN</div>
              {form.details.map((d,i)=>(
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                  <select value={d.account_id} onChange={e=>{ const c=[...form.details]; c[i].account_id=e.target.value; setForm({...form,details:c}); }} className="col-span-5 h-9 border rounded-xl px-2 text-xs bg-surface-2">
                    <option value="">Pilih akun</option>{coa.map(a=> <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </select>
                  <input type="number" placeholder="Debit" value={d.debit} onChange={e=>{ const c=[...form.details]; c[i].debit=e.target.value; setForm({...form,details:c}); }} className="col-span-3 h-9 border rounded-xl px-2 text-right text-xs" />
                  <input type="number" placeholder="Kredit" value={d.credit} onChange={e=>{ const c=[...form.details]; c[i].credit=e.target.value; setForm({...form,details:c}); }} className="col-span-3 h-9 border rounded-xl px-2 text-right text-xs" />
                  <button type="button" onClick={()=>rmRow(i)} className="col-span-1 w-8 h-8 rounded-full border grid place-items-center text-red-600 hover:bg-red-50"><Trash2 size={13}/></button>
                </div>
              ))}
              <button type="button" onClick={addRow} className="text-xs px-3 py-1 border rounded-full bg-white hover:bg-surface-2 font-bold">+ Baris</button>
              <div className="text-xs text-ink-2 tabular-nums">Total debit {nf(form.details.reduce((a,d)=>a+(parseFloat(d.debit)||0),0))} • kredit {nf(form.details.reduce((a,d)=>a+(parseFloat(d.credit)||0),0))}</div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setShow(false)} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button><button disabled={saving} className={posBtnPrimary+' h-9 px-6 text-xs'}>{saving?'Memposting...':'Posting Jurnal'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
