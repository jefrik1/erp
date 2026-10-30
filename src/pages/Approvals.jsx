import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, Clock, Search, RefreshCw, Eye, AlertTriangle, ShieldCheck,
  FileCheck, ShoppingCart, UserCheck, ArrowRight, CalendarClock, CalendarDays,
} from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const rupiah=(n)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const LEAVE_TYPE = { IZIN:'Izin', SAKIT:'Sakit', CUTI:'Cuti', DINAS:'Dinas luar', TANPA_BAYAR:'Tanpa upah' };
const fmtTgl = (d)=>{ const s=String(d||'').slice(0,10); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };
const jamStr = (t)=> t ? String(t).slice(0,5) : null;
const STATUSES = ['PENDING','APPROVED','REJECTED','DELEGATED'];

export default function Approvals(){
  const nav=useNavigate(); const dialog=useDialog();
  const [data,setData]=useState([]);
  const [poPending,setPoPending]=useState([]);
  const [leavePending,setLeavePending]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [status,setStatus]=useState('PENDING');
  const [q,setQ]=useState('');
  const [page,setPage]=useState(1);
  const [expBusy,setExpBusy]=useState('');
  const [actingId,setActingId]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const [rAppr, rPo, rLv]=await Promise.all([
        api.get('/approvals',{params:{status}}),
        api.get('/purchase/orders',{params:{status:'PENDING'}}).catch(()=>({data:[]})),
        api.get('/hr/leaves',{params:{status:'PENDING',limit:50}}).catch(()=>({data:null})),
      ]);
      setData(Array.isArray(rAppr.data)? rAppr.data: []);
      const p=rPo.data?.data ?? rPo.data ?? [];
      setPoPending(Array.isArray(p)? p: []);
      const lv=rLv.data?.data ?? rLv.data ?? [];
      setLeavePending(Array.isArray(lv)? lv: []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat approval'); }
    finally{ setLoading(false); }
  },[status]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[status,q]);

  const filtered=useMemo(()=>{
    let d=[...data];
    if(q.trim()){
      const s=q.trim().toLowerCase();
      d=d.filter(a=> (a.entity_type||'').toLowerCase().includes(s) || (a.requester_name||'').toLowerCase().includes(s) || (a.approver_name||'').toLowerCase().includes(s));
    }
    return d;
  },[data,q]);
  const total=filtered.length;
  const pageRows=filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const stats=useMemo(()=>({
    pending: data.filter(d=>d.status==='PENDING').length + (status==='PENDING'? poPending.length + leavePending.length : 0),
    poOver50jt: poPending.filter(p=> Number(p.total||0)>50000000).length,
    poTotalVal: poPending.reduce((a,p)=>a+Number(p.total||0),0),
    historyCount: data.length,
  }),[data,poPending,leavePending,status]);

  const approvePO=async(po)=>{
    const ok=await dialog.confirm(`Setujui PO ${po.po_number} (Total ${rupiah(po.total)})?`,{title:'Approve PO'});
    if(!ok) return;
    setActingId(po.id);
    try{
      await api.post('/purchase/orders/'+po.id+'/approve');
      await dialog.alert(`${po.po_number} disetujui → lanjut buat GRN di Penerimaan`,{title:'Approved'});
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
    finally{ setActingId(null); }
  };
  const rejectPO=async(po)=>{
    const reason=await dialog.prompt('Alasan penolakan PO '+po.po_number+':',{title:'Reject PO'});
    if(!reason) return;
    setActingId(po.id);
    try{
      await api.post('/purchase/orders/'+po.id+'/reject',{reason});
      await dialog.alert('PO ditolak',{title:'Rejected'}); load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
    finally{ setActingId(null); }
  };

  const decideLeave=async(row, next)=>{
    let note='';
    if(next==='REJECTED'){
      note = await dialog.prompt('Alasan menolak '+(LEAVE_TYPE[row.type]||row.type)+' '+row.name+'?', { title:'Tolak Pengajuan', placeholder:'Contoh: bentrok jadwal operasional' });
      if(note===null) return;
    } else {
      const ok = await dialog.confirm('Setujui '+(LEAVE_TYPE[row.type]||row.type)+' '+row.name+' ('+fmtTgl(row.start_date)+' → '+fmtTgl(row.end_date)+')?', { title:'Setujui Pengajuan' });
      if(!ok) return;
    }
    setActingId(row.id);
    try{
      await api.post('/hr/leaves/'+row.id+'/decision',{ status: next, note });
      await dialog.alert('Pengajuan '+(LEAVE_TYPE[row.type]||row.type)+' '+row.name+' diproses', { title:'Berhasil' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{ title:'Gagal' }); }
    finally{ setActingId(null); }
  };

  const decideRequest=async(reqId, action)=>{
    const title = action==='approve' ? 'Setujui Permohonan' : 'Tolak Permohonan';
    let notes = '';
    if(action==='reject'){
      notes=await dialog.prompt('Alasan penolakan:',{title:'Reject'});
      if(!notes) return;
    } else {
      const ok=await dialog.confirm('Setujui request #'+reqId+'?',{title:'Approve'});
      if(!ok) return;
    }
    setActingId(reqId);
    try{
      await api.post('/approvals/'+reqId+'/'+action,{notes});
      await dialog.alert('Approval berhasil diproses',{title:'Berhasil'}); load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
    finally{ setActingId(null); }
  };

  const download=async(format)=>{
    setExpBusy(format);
    try{
      const r=await api.get('/approvals/export',{params:{format, status}, responseType:'blob'});
      const url=URL.createObjectURL(new Blob([r.data])); const a=document.createElement('a'); a.href=url; a.download='approval-'+status.toLowerCase()+'.'+format; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message||'Gagal export',{title:'Gagal'}); }
    finally{ setExpBusy(''); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={ShieldCheck} title="Pusat Approval & Otorisasi" subtitle="PO > 50jt • SO diskon khusus • penyesuaian stok • audit trail permohonan" badge={stats.pending+' pending'} actions={<PosExportButtons onExport={download} busyKey={expBusy} prefix="Approval"/>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Clock} tone="bg-amber-50 text-amber-700" label="TOTAL PENDING" value={stats.pending} sub="butuh tindakan" />
        <PosStat icon={ShoppingCart} tone="bg-brand/10 text-brand" label="PO PENDING" value={poPending.length} sub={rupiah(stats.poTotalVal)} />
        <PosStat icon={AlertTriangle} tone="bg-red-50 text-red-700" label="PO > 50JT (DIREKTUR)" value={stats.poOver50jt} sub="wajib otorisasi level tinggi" />
        <PosStat icon={FileCheck} tone="bg-emerald-50 text-emerald-700" label="LOG APPROVAL" value={stats.historyCount} sub={'status: '+status} />
      </div>

      <nav className="flex flex-wrap items-center gap-1 p-1 bg-surface-3 border rounded-full w-fit shadow-card text-xs">
        {[
          {label:'PR Request',to:'/purchase/requests'},
          {label:'RFQ Penawaran',to:'/purchase/rfqs'},
          {label:'PO Pesanan',to:'/purchase/orders'},
          {label:'Approval Otorisasi',active:true,to:'/approvals'},
          {label:'GRN Penerimaan',to:'/purchase/receipts'},
        ].map(s=>(
          <button key={s.label} onClick={()=>nav(s.to)} className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition '+(s.active?'bg-brand text-white border-brand':'bg-white text-ink-2 border-line hover:border-brand/30')}>{s.label}</button>
        ))}
      </nav>

      {/* PO Pending High Priority Banner */}
      {poPending.length > 0 && status==='PENDING' && (
        <PosCard>
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-700" size={18}/>
              <div><span className="font-bold text-sm text-amber-900">PO Menunggu Persetujuan ({poPending.length})</span><span className="text-xs text-amber-700 ml-2">Total {rupiah(stats.poTotalVal)}</span></div>
            </div>
            <span className="text-xs text-amber-700 font-bold">Wajib sebelum GRN</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-2 border-b text-[11px] font-bold tracking-wider text-ink-2"><PosTh>NO. PO</PosTh><PosTh>SUPPLIER</PosTh><PosTh>TANGGAL</PosTh><PosTh align="right">TOTAL</PosTh><PosTh align="center">LEVEL</PosTh><PosTh align="right">AKSI</PosTh></tr></thead>
              <tbody>
                {poPending.map(po=>{
                  const val=Number(po.total||0);
                  const tier = val>50000000 ? 'Direktur' : val>10000000 ? 'Manager' : 'Supervisor';
                  const tierTone = val>50000000 ? 'red' : val>10000000 ? 'amber' : 'sky';
                  return (
                    <tr key={po.id} className={posTr}>
                      <td className={posTd+' font-mono font-bold'}>{po.po_number}</td>
                      <td className={posTd+' font-medium'}>{po.supplier_name||'-'}</td>
                      <td className={posTd+' text-xs text-ink-2'}>{String(po.po_date||'').slice(0,10)}</td>
                      <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(po.total)}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={tierTone}>{tier}</PosBadge></td>
                      <td className={posTd}>
                        <div className="flex justify-end gap-1.5">
                          <button disabled={actingId===po.id} onClick={()=>approvePO(po)} className={posBtnPrimary+' h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700'}><CheckCircle2 size={13}/> Setujui</button>
                          <button disabled={actingId===po.id} onClick={()=>rejectPO(po)} className={posBtnSecondary+' h-8 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50'}><XCircle size={13}/> Tolak</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PosCard>
      )}

      {/* Antrean izin & cuti karyawan */}
      {status==='PENDING' && leavePending.length>0 && (
        <PosCard>
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-brand"/>
              <h2 className="font-display text-headline-sm font-bold text-ink">Izin &amp; cuti menunggu persetujuan</h2>
              <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">{leavePending.length}</span>
            </div>
            <button onClick={()=>nav('/hr')} className={posBtnSm}>Buka modul SDM <ArrowRight size={13}/></button>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-surface-2 text-ink-2 text-label-sm uppercase tracking-wider">
                <PosTh>KARYAWAN</PosTh><PosTh align="center">JENIS</PosTh><PosTh align="center">TANGGAL</PosTh>
                <PosTh align="center">JAM / HARI</PosTh><PosTh>ALASAN</PosTh><PosTh align="right">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {leavePending.map(l=>(
                  <tr key={l.id} className={posTr}>
                    <td className={posTd}>
                      <div className="font-semibold text-ink">{l.name}</div>
                      <div className="text-label-sm text-ink-3 mono">{l.employee_code} · {l.position||'-'}</div>
                    </td>
                    <td className={posTd+' text-center'}>
                      <PosBadge tone={l.type==='SAKIT'?'red':l.type==='CUTI'?'emerald':'sky'}>{LEAVE_TYPE[l.type]||l.type}</PosBadge>
                    </td>
                    <td className={posTd+' text-center text-body-sm text-ink-2 num whitespace-nowrap'}>{fmtTgl(l.start_date)} → {fmtTgl(l.end_date)}</td>
                    <td className={posTd+' text-center text-body-sm text-ink-2 num'}>{jamStr(l.start_time) ? jamStr(l.start_time)+'–'+jamStr(l.end_time) : (l.jumlah_hari+' hari')}</td>
                    <td className={posTd+' text-body-sm text-ink-2'}><span className="line-clamp-2">{l.reason||'-'}</span></td>
                    <td className={posTd}>
                      <div className="flex justify-end gap-1.5">
                        <button disabled={actingId===l.id} onClick={()=>decideLeave(l,'APPROVED')} className={posBtnSm+' text-success hover:bg-success-soft'}><CheckCircle2 size={13}/> Setujui</button>
                        <button disabled={actingId===l.id} onClick={()=>decideLeave(l,'REJECTED')} className={posBtnSm+' text-danger hover:bg-danger-soft'}><XCircle size={13}/> Tolak</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PosCard>
      )}

      {/* Main Request History */}
      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari entitas / pemohon / approver..." className={posInput+' pl-9'} />
            </div>
            <div className={posSelectWrap}><PosSelect value={status} onChange={setStatus}>{STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}</PosSelect></div>
          </PosToolbar>
          <PosChipRow label="STATUS">
            {STATUSES.map(s=> <PosChip key={s} active={status===s} onClick={()=>setStatus(s)}>{s}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={5} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !pageRows.length ? <PosEmpty text="Tidak ada antrean approval pada status ini"/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <PosTh>ID</PosTh><PosTh>TIPE ENTITAS</PosTh><PosTh>PEMOHON</PosTh><PosTh>APPROVER</PosTh><PosTh align="center">STATUS</PosTh><PosTh>TANGGAL</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(a=>(
                    <tr key={a.id} className={posTr}>
                      <td className={posTd+' font-mono font-bold'}>#{a.id}</td>
                      <td className={posTd+' font-bold text-ink'}>{a.entity_type} <span className="font-mono text-xs text-ink-2">#{a.entity_id}</span></td>
                      <td className={posTd+' text-xs'}>{a.requester_name||'-'}</td>
                      <td className={posTd+' text-xs'}>{a.approver_name||'-'}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={a.status==='APPROVED'?'emerald':a.status==='REJECTED'?'red':a.status==='DELEGATED'?'sky':'amber'}>{a.status}</PosBadge></td>
                      <td className={posTd+' text-xs text-ink-2'}>{String(a.created_at||'').slice(0,19).replace('T',' ')}</td>
                      <td className={posTd}>
                        {a.status==='PENDING' ? (
                          <div className="flex justify-end gap-1.5">
                            <button disabled={actingId===a.id} onClick={()=>decideRequest(a.id,'approve')} className={posBtnSm+' text-emerald-700 border-emerald-200 hover:bg-emerald-50'}><CheckCircle2 size={13}/> Setuju</button>
                            <button disabled={actingId===a.id} onClick={()=>decideRequest(a.id,'reject')} className={posBtnSm+' text-red-600 border-red-200 hover:bg-red-50'}><XCircle size={13}/> Tolak</button>
                          </div>
                        ) : (
                          <div className="text-right text-xs text-ink-3">Selesai</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PosCardBody><PosPager page={page} setPage={setPage} total={total} size={PAGE_SIZE} unit="approval"/></PosCardBody>
          </>
        )}
      </PosCard>
    </div>
  );
}
