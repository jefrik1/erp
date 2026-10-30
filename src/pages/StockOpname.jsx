import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, RefreshCw, Plus, X, CheckCircle2, Send, PackageCheck, Ban, Search, Warehouse,
} from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, PosChipRow, PosChip,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
import { useAuth } from '../store/auth';
import { canAccess } from '../config/access';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const qty = (n)=> new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(n)||0);
const tgl = (v)=> v ? String(v).slice(0,10).split('-').reverse().join('/') : '-';
const TONE = { DRAFT:'slate', COUNTING:'amber', SUBMITTED:'sky', APPROVED:'purple', POSTED:'emerald', CANCELLED:'red' };

export default function StockOpname(){
  const dialog = useDialog();
  const roles = useAuth(s=>s.user)?.roles || [];
  const canApprove = canAccess(roles, ['direktur','super_admin','finance']);

  const [rows,setRows]=useState([]);
  const [warehouses,setWarehouses]=useState([]);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [tab,setTab]=useState('Semua');
  const [open,setOpen]=useState(null);           // detail sesi
  const [items,setItems]=useState([]);
  const [q,setQ]=useState('');
  const [busy,setBusy]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [newWh,setNewWh]=useState(''); const [newNotes,setNewNotes]=useState('');

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = tab==='Semua'? {} : { status:tab };
      const r = await api.get('/inventory/opname/sessions', { params });
      setRows(Array.isArray(r.data)? r.data : []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat sesi opname'); }
    finally{ setLoading(false); }
  },[tab]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:[])).catch(()=>{}); },[]);

  const openSession = async (row)=>{
    setOpen(row); setItems([]); setQ('');
    try{
      const r = await api.get('/inventory/opname/sessions/'+row.id);
      setOpen(r.data); setItems(r.data.items||[]);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal memuat sesi' }); }
  };

  const createSession = async ()=>{
    if(!newWh) return dialog.alert('Pilih gudang dulu.', { title:'Buat sesi opname' });
    setBusy(true);
    try{
      const r = await api.post('/inventory/opname/sessions', { warehouse_id: parseInt(newWh), notes: newNotes||null });
      setCreateOpen(false); setNewNotes('');
      await dialog.alert(r.data.message||'Sesi dibuat.', { title:'Sesi opname dibuat', tone:'success' });
      await load();
      const created = { id:r.data.id, session_number:r.data.session_number };
      await openSession(created);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal membuat sesi' }); }
    finally{ setBusy(false); }
  };

  const setCounted = (id, val)=> setItems(prev=> prev.map(i=> i.id===id ? { ...i, qty_counted: val, variance: (Number(val)||0) - Number(i.qty_system||0) } : i));
  const setCost = (id, val)=> setItems(prev=> prev.map(i=> i.id===id ? { ...i, unit_cost: val } : i));

  const saveCount = async ()=>{
    if(!open) return;
    setBusy(true);
    try{
      const payload = items.filter(i=> i.qty_counted!=='' && i.qty_counted!=null).map(i=>({ id:i.id, product_id:i.product_id, qty_counted:Number(i.qty_counted), unit_cost: i.unit_cost===''||i.unit_cost==null ? undefined : Number(i.unit_cost), notes:i.notes||null }));
      const r = await api.patch(`/inventory/opname/sessions/${open.id}/items`, { items: payload });
      await dialog.alert(`${r.data.updated} baris disimpan.`, { title:'Hasil hitung tersimpan', tone:'success' });
      await openSession(open);
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menyimpan' }); }
    finally{ setBusy(false); }
  };

  const act = async (action, label, confirmText)=>{
    if(!open) return;
    if(confirmText){
      const ok = await dialog.confirm(confirmText, { title:label, confirmText:'Ya, lanjutkan' });
      if(!ok) return;
    }
    setBusy(true);
    try{
      const r = await api.post(`/inventory/opname/sessions/${open.id}/${action}`);
      await dialog.alert(r.data.message || `${label} berhasil.`, { title:label, tone:'success' });
      await openSession(open);
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal '+label.toLowerCase() }); }
    finally{ setBusy(false); }
  };

  const filtered = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if(!s) return items;
    return items.filter(i=> [i.sku,i.name].filter(Boolean).join(' ').toLowerCase().includes(s));
  }, [items,q]);

  const diffCount = useMemo(()=> items.filter(i=> Math.abs(Number(i.variance)||0) > 0.0001).length, [items]);
  const diffValue = useMemo(()=> items.reduce((s,i)=> s + (Number(i.variance)||0)*Number(i.unit_cost||0), 0), [items]);
  const editable = open && ['DRAFT','COUNTING'].includes(open.status);

  const running = rows.filter(r=> !['POSTED','CANCELLED'].includes(r.status));
  const posted = rows.filter(r=> r.status==='POSTED');

  return (
    <div className="space-y-3">
      <PosPageHeader icon={ClipboardCheck} title="Stock Opname"
        subtitle="Hitung fisik per gudang → ajukan → approve → posting stok & jurnal selisih"
        badge={running.length? running.length+' berjalan' : null}
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>
          <button onClick={()=>{ setCreateOpen(true); setNewWh(warehouses[0]?.id? String(warehouses[0].id):''); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={13}/> Buat Sesi</button>
        </>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Warehouse} tone="bg-[#0051d5]/10 text-[#0051d5]" label="SESI BERJALAN" value={nf(running.length)} sub="belum diposting"/>
        <PosStat icon={PackageCheck} tone="bg-emerald-50 text-emerald-700" label="SESI SELESAI" value={nf(posted.length)} sub="sudah posting"/>
        <PosStat icon={ClipboardCheck} tone="bg-amber-50 text-amber-700" label="ITEM BERSELISIH" value={nf(rows.reduce((s,r)=>s+(Number(r.items_diff)||0),0))} sub="akumulasi semua sesi"/>
        <PosStat icon={CheckCircle2} tone="bg-violet-50 text-violet-700" label="NILAI SELISIH" value={rupiah(rows.reduce((s,r)=>s+Number(r.total_variance_value||0),0))} sub="nilai HPP"/>
      </div>

      <PosCard>
        <PosCardBody>
          <PosChipRow>
            {['Semua','DRAFT','COUNTING','SUBMITTED','APPROVED','POSTED'].map(s=>(
              <PosChip key={s} active={tab===s} onClick={()=>setTab(s)}>{s}</PosChip>
            ))}
          </PosChipRow>
        </PosCardBody>
        {loading ? <PosSkeleton rows={5} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? (
          <PosEmpty text="Belum ada sesi opname" hint='Klik "Buat Sesi" untuk mulai menghitung fisik gudang.'/>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                <PosTh>SESI</PosTh><PosTh>GUDANG</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="center">ITEM</PosTh>
                <PosTh align="center">SELISIH</PosTh><PosTh align="right">NILAI</PosTh><PosTh align="center">DIBUAT</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id} className={posTr+' cursor-pointer'} onClick={()=>openSession(r)}>
                    <td className={posTd}><div className="font-mono text-xs font-bold">{r.session_number}</div><div className="text-[10px] text-[#76777d]">{r.created_by_name||'-'}</div></td>
                    <td className={posTd+' text-xs'}>{r.warehouse_name||'-'}</td>
                    <td className={posTd+' text-center'}><PosBadge tone={TONE[r.status]||'slate'}>{r.status}</PosBadge></td>
                    <td className={posTd+' text-center tabular-nums'}>{nf(r.items)}</td>
                    <td className={posTd+' text-center tabular-nums'}>{Number(r.items_diff)>0? <span className="font-bold text-amber-700">{nf(r.items_diff)}</span> : <span className="text-[#76777d]">0</span>}</td>
                    <td className={posTd+' text-right tabular-nums'}>{rupiah(r.total_variance_value)}</td>
                    <td className={posTd+' text-center text-xs'}>{tgl(r.created_at)}</td>
                    <td className={posTd+' text-center'}><button onClick={(e)=>{e.stopPropagation(); openSession(r);}} className="text-[11px] font-bold text-[#0051d5] hover:underline">Buka</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>

      {/* Modal buat sesi */}
      {createOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0b1c30]/60 backdrop-blur-sm" onClick={()=>!busy&&setCreateOpen(false)}/>
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-[#e7ecf7] p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5"><ClipboardCheck size={15} className="text-[#0051d5]"/> Buat Sesi Opname</h3>
              <button onClick={()=>!busy&&setCreateOpen(false)} className="h-7 w-7 grid place-items-center rounded-full border"><X size={13}/></button>
            </div>
            <p className="text-xs text-[#45464d]">Sistem akan mengambil snapshot stok sistem saat ini. Anda lalu mengisi jumlah fisik hasil hitung.</p>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-[#45464d]">Gudang</span>
              <select value={newWh} onChange={e=>setNewWh(e.target.value)} className={posInput}>
                {warehouses.map(w=> <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-[#45464d]">Catatan</span>
              <input value={newNotes} onChange={e=>setNewNotes(e.target.value)} placeholder="mis. opname akhir bulan" className={posInput}/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setCreateOpen(false)} disabled={busy} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={createSession} disabled={busy} className={posBtnPrimary+' h-9 px-4 text-xs'}>{busy?'Membuat...':'Buat Sesi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detail / hitung */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4">
          <div className="absolute inset-0 bg-[#0b1c30]/60 backdrop-blur-sm" onClick={()=>!busy&&setOpen(null)}/>
          <div className="relative z-10 w-full max-w-[900px] max-h-[94vh] flex flex-col bg-white rounded-2xl border border-[#e7ecf7] overflow-hidden">
            <div className="shrink-0 p-4 border-b bg-[#eff4ff] flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-sm font-mono">{open.session_number}</div>
                <div className="text-xs text-[#45464d] mt-0.5">{open.warehouse_name} • {open.status} • dibuat {tgl(open.created_at)}</div>
                <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-white border font-bold">{items.length} item</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 font-bold text-amber-800">{diffCount} berselisih</span>
                  <span className="px-2 py-0.5 rounded-full bg-white border font-bold">Nilai {rupiah(diffValue)}</span>
                </div>
              </div>
              <button onClick={()=>!busy&&setOpen(null)} className="h-8 w-8 grid place-items-center rounded-full border bg-white shrink-0"><X size={14}/></button>
            </div>

            <div className="shrink-0 p-3 border-b flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari SKU / nama barang..." className={posInput+' pl-9 h-9'}/>
              </div>
              {editable && <button onClick={saveCount} disabled={busy} className={posBtnPrimary+' h-9 px-4 text-xs'}>{busy?'Menyimpan...':'Simpan Hitung'}</button>}
              {editable && <button onClick={()=>act('submit','Ajukan opname','Ajukan hasil hitung ke atasan? Setelah diajukan, angka tidak bisa diubah.')} disabled={busy} className={posBtnSecondary+' h-9 px-3 text-xs'}><Send size={12}/> Ajukan</button>}
              {open.status==='SUBMITTED' && canApprove && <button onClick={()=>act('approve','Approve opname','Setujui hasil opname ini?')} disabled={busy} className={posBtnPrimary+' h-9 px-3 text-xs'}><CheckCircle2 size={12}/> Approve</button>}
              {open.status==='APPROVED' && canApprove && <button onClick={()=>act('post','Posting opname','Posting akan MENYETEL stok ke jumlah fisik dan membuat jurnal selisih. Lanjutkan?')} disabled={busy} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5"><PackageCheck size={12}/> Posting Stok</button>}
              {['DRAFT','COUNTING','SUBMITTED','APPROVED'].includes(open.status) && <button onClick={()=>act('cancel','Batalkan sesi','Batalkan sesi opname ini?')} disabled={busy} className={posBtnSecondary+' h-9 px-3 text-xs text-red-600'}><Ban size={12}/> Batal</button>}
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0"><tr className="bg-[#e5eeff] border-b text-[10px] font-bold uppercase text-[#45464d]">
                  <th className="p-2 text-left">Barang</th><th className="p-2 text-right">Stok Sistem</th>
                  <th className="p-2 text-center">Hitung Fisik</th><th className="p-2 text-right">HPP / Satuan</th>
                  <th className="p-2 text-right">Selisih</th><th className="p-2 text-right">Nilai</th>
                </tr></thead>
                <tbody>
                  {filtered.map(i=>{
                    const variance = Number(i.variance)||0;
                    return (
                      <tr key={i.id} className={'border-b '+(Math.abs(variance)>0.0001?'bg-amber-50/40':'bg-white')}>
                        <td className="p-2"><div className="font-semibold">{i.name}</div><div className="text-[10px] font-mono text-[#76777d]">{i.sku}</div></td>
                        <td className="p-2 text-right tabular-nums">{qty(i.qty_system)} {i.unit_code||''}</td>
                        <td className="p-2 text-center">
                          {editable
                            ? <input type="number" step="0.001" value={i.qty_counted ?? ''} onChange={e=>setCounted(i.id, e.target.value)} className="w-24 h-8 px-2 border rounded-lg text-right tabular-nums"/>
                            : <span className="tabular-nums font-semibold">{qty(i.qty_counted)}</span>}
                        </td>
                        <td className="p-2 text-right">
                          {editable
                            ? <input type="number" step="1" value={i.unit_cost ?? ''} onChange={e=>setCost(i.id, e.target.value)} className="w-24 h-8 px-2 border rounded-lg text-right tabular-nums" title="Dasar penilaian selisih. Isi 0 bila HPP lama tidak relevan."/>
                            : <span className="tabular-nums">{rupiah(i.unit_cost)}</span>}
                        </td>
                        <td className={'p-2 text-right tabular-nums font-bold '+(variance>0?'text-emerald-700':variance<0?'text-red-600':'text-[#76777d]')}>
                          {variance>0?'+':''}{qty(variance)}
                        </td>
                        <td className="p-2 text-right tabular-nums">{rupiah(variance*Number(i.unit_cost||0))}</td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td colSpan={6} className="p-8 text-center text-[#76777d]">Tidak ada item{items.length? ' yang cocok dengan pencarian':''}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 p-3 border-t bg-[#f7f9fd] text-[11px] text-[#45464d]">
              {editable
                ? 'Isi kolom Hitung Fisik sesuai jumlah nyata di gudang. Selisih dihitung otomatis (fisik − sistem).'
                : open.status==='POSTED'
                  ? `Sudah diposting ${tgl(open.posted_at)} — stok & jurnal sudah diperbarui.`
                  : 'Sesi terkunci. Menunggu proses berikutnya.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
