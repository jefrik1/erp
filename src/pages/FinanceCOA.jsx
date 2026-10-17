import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Search, RefreshCw, Plus, X, Pencil, Trash2, Building2, Wallet, TrendingUp, Scale, Landmark } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 12;
const TYPES = ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'];
const TYPE_TONE = { ASSET:'sky', LIABILITY:'amber', EQUITY:'teal', REVENUE:'emerald', EXPENSE:'red' };
const TYPE_LABEL = { ASSET:'Aset', LIABILITY:'Kewajiban', EQUITY:'Modal', REVENUE:'Pendapatan', EXPENSE:'Beban' };

export default function FinanceCOA(){
  const dialog = useDialog();
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [q,setQ]=useState('');
  const [type,setType]=useState('Semua');
  const [page,setPage]=useState(1);
  const [expBusy,setExpBusy]=useState('');
  const [modal,setModal]=useState('');
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({code:'',name:'',type:'ASSET',parent_id:''});
  const [formErr,setFormErr]=useState('');
  const [saving,setSaving]=useState(false);

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r=await api.get('/finance/coa');
      setRows(Array.isArray(r.data)? r.data : []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat COA'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>{
    let d=[...rows];
    if(q.trim()){
      const s=q.trim().toLowerCase();
      d=d.filter(a=> (a.code||'').toLowerCase().includes(s) || (a.name||'').toLowerCase().includes(s));
    }
    if(type!=='Semua') d=d.filter(a=> a.type===type);
    return d;
  },[rows,q,type]);
  const total=filtered.length;
  const pages=Math.max(1, Math.ceil(total/PAGE_SIZE));
  const safePage=Math.min(Math.max(1,page),pages);
  const pageRows=filtered.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);

  const stats=useMemo(()=>{
    const byType={}; for(const t of TYPES) byType[t]=rows.filter(r=>r.type===t).length;
    return { total:rows.length, byType };
  },[rows]);

  const openCreate=()=>{ setEditing(null); setFormErr(''); setForm({code:'',name:'',type:'ASSET',parent_id:''}); setModal('form'); };
  const openEdit=(a)=>{ setEditing(a); setFormErr(''); setForm({code:a.code||'',name:a.name||'',type:a.type||'ASSET',parent_id:a.parent_id?String(a.parent_id):''}); setModal('form'); };
  const submit=async(e)=>{
    e.preventDefault();
    if(!form.code.trim()||!form.name.trim()){ setFormErr('Kode dan nama akun wajib diisi'); return; }
    setSaving(true); setFormErr('');
    try{
      const payload={ code:form.code.trim(), name:form.name.trim(), type:form.type, parent_id: form.parent_id? parseInt(form.parent_id): null };
      if(editing) await api.put('/finance/coa/'+editing.id, payload);
      else await api.post('/finance/coa', payload);
      setModal(''); await dialog.alert(editing? 'Akun diperbarui' : 'Akun ditambahkan', {title:'Tersimpan'});
      load();
    }catch(e){ setFormErr(e.response?.data?.error||e.message||'Gagal menyimpan'); }
    finally{ setSaving(false); }
  };
  const remove=async(a)=>{
    const ok=await dialog.confirm('Hapus akun '+a.code+' - '+a.name+' ?',{title:'Hapus Akun'});
    if(!ok) return;
    try{ await api.delete('/finance/coa/'+a.id); await dialog.alert('Akun dihapus',{title:'Terhapus'}); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal hapus'}); }
  };
  const download=async(format)=>{
    setExpBusy(format);
    try{
      const r=await api.get('/finance/export',{params:{dataset:'coa',format}, responseType:'blob'});
      const url=URL.createObjectURL(new Blob([r.data])); const a=document.createElement('a'); a.href=url; a.download='coa.'+format; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message||'Gagal export',{title:'Gagal'}); }
    finally{ setExpBusy(''); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Chart of Accounts (COA)" subtitle="Struktur akun akuntansi • 5 tipe utama • dipakai di jurnal otomatis & manual" badge={stats.total+' akun'} actions={<><PosExportButtons onExport={download} busyKey={expBusy} prefix="COA"/><button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Akun Baru</button></>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <PosStat icon={Landmark} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="TOTAL AKUN" value={stats.total} sub="semua tipe" />
        {TYPES.map(t=> <PosStat key={t} icon={t==='ASSET'? Wallet : t==='REVENUE'? TrendingUp : Building2} tone={TYPE_TONE[t]==='sky'?'bg-sky-50 text-sky-700':TYPE_TONE[t]==='emerald'?'bg-emerald-50 text-emerald-700':TYPE_TONE[t]==='red'?'bg-red-50 text-red-700':TYPE_TONE[t]==='amber'?'bg-amber-50 text-amber-700':'bg-teal-50 text-teal-700'} label={TYPE_LABEL[t]} value={stats.byType[t]} sub={t} />)}
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={q} onChange={e=>{ setQ(e.target.value); setPage(1); }} placeholder="Cari kode / nama akun..." className={posInput+' pl-9'} />
            </div>
            <div className={posSelectWrap}><PosSelect value={type} onChange={v=>{ setType(v); setPage(1); }}><option value="Semua">Semua Tipe</option>{TYPES.map(t=> <option key={t} value={t}>{t} - {TYPE_LABEL[t]}</option>)}</PosSelect></div>
          </PosToolbar>
          <PosChipRow label="TIPE">
            <PosChip active={type==='Semua'} onClick={()=>setType('Semua')}>Semua</PosChip>
            {TYPES.map(t=> <PosChip key={t} active={type===t} onClick={()=>setType(t)}>{t}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={4}/> : err ? <PosError message={err} onRetry={load}/> : !filtered.length ? <PosEmpty text="Tidak ada akun pada filter ini"/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                  <PosTh>KODE</PosTh><PosTh>NAMA AKUN</PosTh><PosTh align="center">TIPE</PosTh><PosTh align="center">INDUK</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(a=>(
                    <tr key={a.id} className={posTr}>
                      <td className={posTd+' font-mono font-bold text-[#0F172A]'}>{a.code}</td>
                      <td className={posTd+' font-medium'}>{a.name}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={TYPE_TONE[a.type]||'slate'}>{a.type}</PosBadge></td>
                      <td className={posTd+' text-center text-xs text-[#64748B]'}>{a.parent_id||'-'}</td>
                      <td className={posTd}><div className="flex justify-end gap-1.5"><button onClick={()=>openEdit(a)} className={posBtnSm}><Pencil size={13}/> Edit</button><button onClick={()=>remove(a)} className={posBtnSm+' text-red-600 border-red-200 hover:bg-red-50'}><Trash2 size={13}/></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit="akun"/></PosCardBody>
          </>
        )}
      </PosCard>

      {modal==='form' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-[20px] p-5 w-full max-w-lg space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-black text-[16px] text-[#0F172A]">{editing? 'Edit Akun':'Akun Baru'}</h3><div className="text-xs text-[#64748B] mt-0.5">Kode unik • tipe menentukan posisi di laporan keuangan</div></div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border grid place-items-center"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">KODE *</span><input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="1101" className={posInput+' font-mono'} /></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TIPE</span>
                <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className={posInput}><option value="ASSET">ASSET</option><option value="LIABILITY">LIABILITY</option><option value="EQUITY">EQUITY</option><option value="REVENUE">REVENUE</option><option value="EXPENSE">EXPENSE</option></select>
              </label>
            </div>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NAMA AKUN *</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Kas & Bank - BCA" className={posInput} /></label>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">INDUK (opsional)</span>
              <select value={form.parent_id} onChange={e=>setForm({...form,parent_id:e.target.value})} className={posInput}><option value="">Tanpa induk</option>{rows.filter(r=> !editing || r.id!==editing.id).map(r=> <option key={r.id} value={r.id}>{r.code} - {r.name}</option>)}</select>
            </label>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button><button disabled={saving} className={posBtnPrimary+' h-9 px-6 text-xs'}>{saving?'Menyimpan...':'Simpan'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
