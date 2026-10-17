import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck, Search, RefreshCw, Plus, X, Pencil, Eye, Phone, Mail, MapPin, Star,
  ShoppingCart, Wallet, Package, Clock,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap,
} from '../components/PosUI';

const PAGE_SIZE = 12;
const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;
const iso = (d)=> d ? String(d).slice(0,10) : '-';
const PO_TONE = { DRAFT:'slate', SUBMITTED:'sky', APPROVED:'sky', PARTIAL:'amber', RECEIVED:'emerald', CANCELLED:'slate' };

const emptyForm = ()=>({ code:'', name:'', npwp:'', address:'', phone:'', email:'', payment_term_days:'30', rating:'', is_active:true });

export default function MasterSuppliers(){
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [modal, setModal] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
      if (appliedQ) params.search = appliedQ;
      if (statusFilter==='AKTIF') params.is_active = 'true';
      if (statusFilter==='NONAKTIF') params.is_active = 'false';
      const r = await api.get('/master/suppliers', { params });
      setRows(Array.isArray(r.data?.data)? r.data.data : []);
      setTotal(Number(r.data?.total)||0);
    }catch(e){ setRows([]); setTotal(0); setErr(e.response?.data?.error || e.message || 'Gagal memuat supplier'); }
    finally{ setLoading(false); }
  },[appliedQ,statusFilter,page]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,statusFilter]);

  const stats = useMemo(()=>{
    const nilai = rows.reduce((a,s)=> a + num(s.po_value), 0);
    const outstanding = rows.reduce((a,s)=> a + num(s.outstanding), 0);
    return { nilai, outstanding, tanpaPo: rows.filter(s=> !s.po_count).length,
      rated: rows.filter(s=> num(s.rating)>0).length };
  },[rows]);

  /* --------------------------------------------------------------- actions */
  const openCreate = ()=>{ setEditing(null); setFormErr(''); setForm(emptyForm()); setModal('create'); };
  const openEdit = (s)=>{
    setEditing(s); setFormErr('');
    setForm({ code:s.code||'', name:s.name||'', npwp:s.npwp||'', address:s.address||'', phone:s.phone||'',
      email:s.email||'', payment_term_days:String(s.payment_term_days ?? ''), rating:String(num(s.rating)||''), is_active:s.is_active!==false });
    setModal('edit');
  };

  const submit = async (e)=>{
    e.preventDefault();
    if (!form.name.trim()){ setFormErr('Nama supplier wajib diisi.'); return; }
    if (!editing && !form.code.trim()){ setFormErr('Kode supplier wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    const payload = { name:form.name.trim(), npwp:form.npwp||null, address:form.address||null, phone:form.phone||null,
      email:form.email||null, payment_term_days: parseInt(form.payment_term_days)||0,
      rating: form.rating===''? null : num(form.rating), is_active:form.is_active };
    try{
      if (editing) await api.put('/master/suppliers/'+editing.id, payload);
      else await api.post('/master/suppliers', { ...payload, code:form.code.trim().toUpperCase() });
      setModal('');
      await dialog.alert(editing? 'Supplier '+payload.name+' diperbarui.' : 'Supplier '+payload.name+' ditambahkan.', { title:'Tersimpan' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan'); }
    finally{ setSaving(false); }
  };

  const openDetail = async (s)=>{
    setDetailBusy(true); setDetail({ id:s.id });
    try{ const r = await api.get('/master/suppliers/'+s.id); setDetail(r.data); }
    catch(e){ setDetail(null); await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal memuat detail' }); }
    finally{ setDetailBusy(false); }
  };

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const r = await api.get('/master/export', { params:{ dataset:'suppliers', format }, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'daftar-supplier.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  /* ---------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader icon={Truck} title="Supplier"
        subtitle="Data supplier, termin pembayaran, rating, dan riwayat pembelian - dipakai saat membuat Purchase Order"
        badge={total + ' supplier'}
        actions={<>
          <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Supplier"/>
          <button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Supplier Baru</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Truck} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="TOTAL SUPPLIER" value={nf(total)} sub={stats.rated+' punya rating'}/>
        <PosStat icon={ShoppingCart} tone="bg-sky-50 text-sky-700" label="NILAI PO (HALAMAN INI)" value={rupiah(stats.nilai)} sub="total purchase order"/>
        <PosStat icon={Wallet} tone="bg-amber-50 text-amber-700" label="PO BELUM SELESAI" value={rupiah(stats.outstanding)} sub="status belum RECEIVED"/>
        <PosStat icon={Package} tone="bg-emerald-50 text-emerald-700" label="BELUM PERNAH PO" value={nf(stats.tanpaPo)} sub="supplier baru / belum dipakai"/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari nama / kode / telepon lalu Enter..." className={posInput+' pl-9'}/>
            </div>
          </PosToolbar>

          <PosChipRow label="STATUS">
            {['Semua','AKTIF','NONAKTIF'].map(s=> <PosChip key={s} active={statusFilter===s} onClick={()=>setStatusFilter(s)}>{s}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? (
          <PosEmpty text="Belum ada supplier pada filter ini"/>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                  <PosTh>SUPPLIER</PosTh><PosTh>KONTAK</PosTh><PosTh align="center">TERMIN</PosTh>
                  <PosTh align="center">RATING</PosTh><PosTh align="right">JUMLAH PO</PosTh>
                  <PosTh align="right">NILAI PO</PosTh><PosTh align="center">PO TERAKHIR</PosTh>
                  <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {rows.map(s=>(
                    <tr key={s.id} className={posTr}>
                      <td className={posTd}>
                        <div className="font-bold text-[#0F172A]">{s.name}</div>
                        <div className="text-[11px] text-[#64748B] font-mono">{s.code}{s.npwp? ' • NPWP '+s.npwp : ''}</div>
                      </td>
                      <td className={posTd+' text-xs text-[#64748B]'}>
                        <div className="flex items-center gap-1"><Phone size={11}/> {s.phone||'-'}</div>
                        {s.email && <div className="flex items-center gap-1"><Mail size={11}/> {s.email}</div>}
                      </td>
                      <td className={posTd+' text-center text-xs'}>{s.payment_term_days? s.payment_term_days+' hari' : 'COD'}</td>
                      <td className={posTd+' text-center'}>
                        {num(s.rating)>0
                          ? <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs"><Star size={12}/> {num(s.rating).toFixed(1)}</span>
                          : <span className="text-xs text-[#94A3B8]">-</span>}
                      </td>
                      <td className={posTd+' text-right tabular-nums'}>{nf(s.po_count)}</td>
                      <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(s.po_value)}</td>
                      <td className={posTd+' text-center text-xs'}>{iso(s.last_po)}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={s.is_active?'emerald':'slate'}>{s.is_active?'AKTIF':'NONAKTIF'}</PosBadge></td>
                      <td className={posTd}>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={()=>openDetail(s)} className={posBtnSm}><Eye size={13}/> Detail</button>
                          <button onClick={()=>openEdit(s)} className={posBtnSm}><Pencil size={13}/> Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total>0 && <PosCardBody><PosPager page={page} setPage={setPage} total={total} size={PAGE_SIZE} unit="supplier"/></PosCardBody>}
          </>
        )}
      </PosCard>

      {/* ------------------------------------------------------ form modal */}
      {(modal==='create' || modal==='edit') && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-[20px] p-5 w-full max-w-2xl max-h-[92vh] overflow-auto space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">{editing? 'Edit Supplier':'Supplier Baru'}</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Termin pembayaran dipakai untuk menghitung jatuh tempo hutang</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">KODE *</span>
                <input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} disabled={!!editing}
                  placeholder="SUP-007" className={posInput+' disabled:opacity-60 font-mono'}/></label>
              <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NAMA *</span>
                <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="mis. PT Semen Indonesia" className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TELEPON</span>
                <input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">EMAIL</span>
                <input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NPWP</span>
                <input value={form.npwp} onChange={e=>setForm({...form, npwp:e.target.value})} className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TERMIN (HARI)</span>
                <input type="number" value={form.payment_term_days} onChange={e=>setForm({...form, payment_term_days:e.target.value})} placeholder="0 = COD" className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">RATING (0-5)</span>
                <input type="number" step="0.1" value={form.rating} onChange={e=>setForm({...form, rating:e.target.value})} placeholder="mis. 4.5" className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">STATUS</span>
                <PosSelect size="md" value={form.is_active?'AKTIF':'NONAKTIF'} onChange={v=>setForm({...form, is_active: v==='AKTIF'})}>
                  <option value="AKTIF">Aktif</option><option value="NONAKTIF">Nonaktif</option>
                </PosSelect></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ALAMAT</span>
              <input value={form.address} onChange={e=>setForm({...form, address:e.target.value})} placeholder="Jalan, kota" className={posInput}/></label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------------------------------------------- detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-[20px] w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">{detail.name||'Supplier'}</h3>
                <div className="text-xs text-[#64748B] mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{detail.code}</span><span>•</span>
                  <span>{detail.payment_term_days? detail.payment_term_days+' hari termin' : 'COD'}</span>
                  {num(detail.rating)>0 && <PosBadge tone="amber"><Star size={11}/> {num(detail.rating).toFixed(1)}</PosBadge>}
                  <PosBadge tone={detail.is_active?'emerald':'slate'}>{detail.is_active?'AKTIF':'NONAKTIF'}</PosBadge>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={5} cols={4}/> : (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Jumlah PO</div><div className="font-black text-[#0F172A]">{detail.po_count||0} dokumen</div></div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Nilai PO</div><div className="font-black text-[#0F172A]">{rupiah(detail.po_value)}</div></div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5"><div className="text-amber-700">Belum Selesai</div><div className="font-black text-[#0F172A]">{rupiah(detail.outstanding)}</div></div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">NPWP</div><div className="font-bold font-mono">{detail.npwp||'-'}</div></div>
                </div>
                <div className="text-xs text-[#475569] flex flex-wrap gap-3">
                  {detail.phone && <span className="inline-flex items-center gap-1"><Phone size={12}/> {detail.phone}</span>}
                  {detail.email && <span className="inline-flex items-center gap-1"><Mail size={12}/> {detail.email}</span>}
                  {detail.address && <span className="inline-flex items-center gap-1"><MapPin size={12}/> {detail.address}</span>}
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">PURCHASE ORDER TERAKHIR ({(detail.orders||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                        <PosTh>NO PO</PosTh><PosTh align="center">TANGGAL</PosTh><PosTh align="right">NILAI</PosTh><PosTh align="center">STATUS</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.orders||[]).map(o=>(
                          <tr key={o.id} className={posTr}>
                            <td className={posTd+' font-mono text-xs'}>{o.po_number}</td>
                            <td className={posTd+' text-center text-xs'}>{iso(o.po_date)}</td>
                            <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(o.total)}</td>
                            <td className={posTd+' text-center'}><PosBadge tone={PO_TONE[o.status]||'slate'}>{o.status}</PosBadge></td>
                          </tr>
                        ))}
                        {!(detail.orders||[]).length && <PosEmpty colSpan={4} text="Belum ada purchase order"/>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">PRODUK YANG PERNAH DIPASOK ({(detail.products||[]).length})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(detail.products||[]).map(p=> <PosBadge key={p.id} tone="slate">{p.name}</PosBadge>)}
                    {!(detail.products||[]).length && <span className="text-xs text-[#94A3B8]">Belum ada data pembelian</span>}
                  </div>
                </div>
              </>)}
            </div>
            <div className="p-3 border-t flex justify-end gap-2">
              <button onClick={()=>{ setDetail(null); openEdit(detail); }} className={posBtnSecondary+' h-9 px-4 text-xs'}><Pencil size={13}/> Edit</button>
              <button onClick={()=>setDetail(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
