import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Search, RefreshCw, Plus, X, Pencil, Eye, Phone, Mail, MapPin, Ban, ShieldCheck,
  Wallet, TrendingUp, AlertTriangle, Crown, FileText,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 12;
const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;
const iso = (d)=> d ? String(d).slice(0,10) : '-';

const TYPES = ['RETAIL','WHOLESALE','CONTRACTOR','PROJECT'];
const TYPE_TONE = { RETAIL:'slate', WHOLESALE:'sky', CONTRACTOR:'amber', PROJECT:'teal' };
const emptyForm = ()=>({ code:'', name:'', type:'RETAIL', npwp:'', address:'', phone:'', email:'', credit_limit:'', payment_term_days:'30', is_active:true, is_hold:false, hold_reason:'' });

export default function MasterCustomers(){
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [type, setType] = useState('Semua');
  const [statusFilter, setStatusFilter] = useState('Semua');   // Semua | AKTIF | HOLD | NONAKTIF
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [modal, setModal] = useState('');                     // create | edit | detail
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
      if (type!=='Semua') params.type = type;
      if (statusFilter==='AKTIF') params.is_active = 'true';
      if (statusFilter==='NONAKTIF') params.is_active = 'false';
      if (statusFilter==='HOLD') params.hold = 'true';
      const r = await api.get('/master/customers', { params });
      setRows(Array.isArray(r.data?.data)? r.data.data : []);
      setTotal(Number(r.data?.total)||0);
    }catch(e){ setRows([]); setTotal(0); setErr(e.response?.data?.error || e.message || 'Gagal memuat pelanggan'); }
    finally{ setLoading(false); }
  },[appliedQ,type,statusFilter,page]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,type,statusFilter]);

  const stats = useMemo(()=>{
    const piutang = rows.reduce((a,c)=> a + num(c.outstanding), 0);
    const penjualan = rows.reduce((a,c)=> a + num(c.total_sales), 0);
    return {
      piutang, penjualan,
      hold: rows.filter(c=> c.is_hold).length,
      overLimit: rows.filter(c=> num(c.credit_limit)>0 && num(c.outstanding) > num(c.credit_limit)).length,
    };
  },[rows]);

  /* --------------------------------------------------------------- actions */
  const openCreate = ()=>{ setEditing(null); setFormErr(''); setForm(emptyForm()); setModal('create'); };
  const openEdit = (c)=>{
    setEditing(c); setFormErr('');
    setForm({ code:c.code||'', name:c.name||'', type:(c.type||'RETAIL').toUpperCase(), npwp:c.npwp||'',
      address:c.address||'', phone:c.phone||'', email:c.email||'',
      credit_limit:String(num(c.credit_limit)||''), payment_term_days:String(c.payment_term_days ?? ''),
      is_active: c.is_active!==false, is_hold: !!c.is_hold, hold_reason:c.hold_reason||'' });
    setModal('edit');
  };

  const submit = async (e)=>{
    e.preventDefault();
    if (!form.name.trim()){ setFormErr('Nama pelanggan wajib diisi.'); return; }
    if (!editing && !form.code.trim()){ setFormErr('Kode pelanggan wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    const payload = { name:form.name.trim(), type:form.type, npwp:form.npwp||null, address:form.address||null,
      phone:form.phone||null, email:form.email||null, credit_limit:num(form.credit_limit),
      payment_term_days: parseInt(form.payment_term_days)||0, is_active:form.is_active,
      is_hold:form.is_hold, hold_reason: form.is_hold? (form.hold_reason||'Ditahan') : null };
    try{
      if (editing) await api.put('/master/customers/'+editing.id, payload);
      else await api.post('/master/customers', { ...payload, code:form.code.trim().toUpperCase() });
      setModal('');
      await dialog.alert(editing? 'Pelanggan '+payload.name+' diperbarui.' : 'Pelanggan '+payload.name+' ditambahkan.', { title:'Tersimpan' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan'); }
    finally{ setSaving(false); }
  };

  const toggleHold = async (c)=>{
    const next = !c.is_hold;
    const ok = await dialog.confirm(next
      ? 'Tahan (HOLD) pelanggan '+c.name+'?\nPelanggan yang di-HOLD tidak boleh bertransaksi kredit sampai dilepas.'
      : 'Lepas HOLD untuk '+c.name+'?\nPelanggan bisa bertransaksi kredit lagi.', { title: next? 'Tahan Pelanggan':'Lepas HOLD' });
    if (!ok) return;
    try{
      await api.put('/master/customers/'+c.id, { is_hold:next, hold_reason: next? 'Ditahan manual':'', is_active: next? c.is_active : true });
      await dialog.alert(c.name+' '+(next?'ditahan':'dilepas')+'.', { title:'Tersimpan' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal' }); }
  };

  const openDetail = async (c)=>{
    setDetailBusy(true); setDetail({ id:c.id });
    try{ const r = await api.get('/master/customers/'+c.id); setDetail(r.data); }
    catch(e){ setDetail(null); await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal memuat detail' }); }
    finally{ setDetailBusy(false); }
  };

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const r = await api.get('/master/export', { params:{ dataset:'customers', format }, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'daftar-pelanggan.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  /* ---------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader icon={Users} title="Pelanggan"
        subtitle="Data pelanggan, limit kredit, termin pembayaran, dan piutang berjalan - dipakai saat penjualan & penagihan"
        badge={total + ' pelanggan'}
        actions={<>
          <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Pelanggan"/>
          <button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Pelanggan Baru</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Users} tone="bg-brand/10 text-brand" label="TOTAL PELANGGAN" value={nf(total)} sub="sesuai filter aktif"/>
        <PosStat icon={TrendingUp} tone="bg-emerald-50 text-emerald-700" label="PENJUALAN (HALAMAN INI)" value={rupiah(stats.penjualan)} sub="total invoice pelanggan di halaman ini"/>
        <PosStat icon={Wallet} tone="bg-amber-50 text-amber-700" label="PIUTANG TERBUKA" value={rupiah(stats.piutang)} sub={stats.overLimit+' pelanggan melebihi limit kredit'}/>
        <PosStat icon={Ban} tone="bg-red-50 text-red-700" label="DI-HOLD" value={nf(stats.hold)} sub="tidak boleh transaksi kredit"/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari nama / kode / telepon lalu Enter..." className={posInput+' pl-9'}/>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={type} onChange={setType}>
                <option value="Semua">Semua Tipe</option>
                {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
              </PosSelect>
            </div>
          </PosToolbar>

          <PosChipRow label="STATUS">
            {['Semua','AKTIF','HOLD','NONAKTIF'].map(s=> <PosChip key={s} active={statusFilter===s} onClick={()=>setStatusFilter(s)}>{s}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? (
          <PosEmpty text="Belum ada pelanggan pada filter ini"/>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <PosTh>PELANGGAN</PosTh><PosTh align="center">TIPE</PosTh><PosTh>KONTAK</PosTh>
                  <PosTh align="right">LIMIT KREDIT</PosTh><PosTh align="center">TERMIN</PosTh>
                  <PosTh align="right">PIUTANG</PosTh><PosTh align="center">INVOICE TERAKHIR</PosTh>
                  <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {rows.map(c=>{
                    const over = num(c.credit_limit)>0 && num(c.outstanding) > num(c.credit_limit);
                    return (
                      <tr key={c.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-ink">{c.name}</div>
                          <div className="text-[11px] text-ink-2 font-mono">{c.code}{c.npwp? ' • NPWP '+c.npwp : ''}</div>
                        </td>
                        <td className={posTd+' text-center'}><PosBadge tone={TYPE_TONE[(c.type||'').toUpperCase()]||'slate'}>{(c.type||'-').toUpperCase()}</PosBadge></td>
                        <td className={posTd+' text-xs text-ink-2'}>
                          <div className="flex items-center gap-1"><Phone size={11}/> {c.phone||'-'}</div>
                          {c.email && <div className="flex items-center gap-1"><Mail size={11}/> {c.email}</div>}
                        </td>
                        <td className={posTd+' text-right tabular-nums'}>{num(c.credit_limit)>0? rupiah(c.credit_limit) : <span className="text-ink-3">tanpa limit</span>}</td>
                        <td className={posTd+' text-center text-xs'}>{c.payment_term_days? c.payment_term_days+' hari' : 'COD'}</td>
                        <td className={posTd+' text-right'}>
                          <div className={'font-bold tabular-nums '+(num(c.outstanding)>0?'text-amber-700':'text-ink-2')}>{rupiah(c.outstanding)}</div>
                          {over && <div className="text-[11px] text-red-600 font-bold">melebihi limit</div>}
                        </td>
                        <td className={posTd+' text-center text-xs'}>{iso(c.last_invoice)}<div className="text-[11px] text-ink-3">{c.invoice_count||0} invoice</div></td>
                        <td className={posTd+' text-center'}>
                          {!c.is_active ? <PosBadge tone="slate">NONAKTIF</PosBadge>
                            : c.is_hold ? <PosBadge tone="red"><Ban size={11}/> HOLD</PosBadge>
                            : <PosBadge tone="emerald"><ShieldCheck size={11}/> AKTIF</PosBadge>}
                        </td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            <button onClick={()=>openDetail(c)} className={posBtnSm}><Eye size={13}/> Detail</button>
                            <button onClick={()=>openEdit(c)} className={posBtnSm}><Pencil size={13}/> Edit</button>
                            <button onClick={()=>toggleHold(c)} title={c.is_hold?'Lepas HOLD':'Tahan pelanggan'}
                              className={posBtnSm+' '+(c.is_hold?'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100':'bg-white border-red-200 text-red-600 hover:bg-red-50')}>
                              <Ban size={13}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total>0 && <PosCardBody><PosPager page={page} setPage={setPage} total={total} size={PAGE_SIZE} unit="pelanggan"/></PosCardBody>}
          </>
        )}
      </PosCard>

      {/* ------------------------------------------------------ form modal */}
      {(modal==='create' || modal==='edit') && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[92vh] overflow-auto space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">{editing? 'Edit Pelanggan':'Pelanggan Baru'}</h3>
                <div className="text-xs text-ink-2 mt-0.5">Limit kredit & termin dipakai untuk mengecek piutang saat penjualan</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-line grid place-items-center text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">KODE *</span>
                <input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} disabled={!!editing}
                  placeholder="CUST-014" className={posInput+' disabled:opacity-60 font-mono'}/></label>
              <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-bold tracking-wider text-ink-2">NAMA *</span>
                <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="mis. Toko Bangunan Sinar Jaya" className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">TIPE</span>
                <PosSelect size="md" value={form.type} onChange={v=>setForm({...form, type:v})}>
                  {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">LIMIT KREDIT Rp</span>
                <input type="number" value={form.credit_limit} onChange={e=>setForm({...form, credit_limit:e.target.value})} placeholder="0 = tanpa limit" className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">TERMIN (HARI)</span>
                <input type="number" value={form.payment_term_days} onChange={e=>setForm({...form, payment_term_days:e.target.value})} placeholder="0 = COD" className={posInput+' text-right tabular-nums'}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">TELEPON</span>
                <input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">EMAIL</span>
                <input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">NPWP</span>
                <input value={form.npwp} onChange={e=>setForm({...form, npwp:e.target.value})} className={posInput}/></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">ALAMAT</span>
              <input value={form.address} onChange={e=>setForm({...form, address:e.target.value})} placeholder="Jalan, kota" className={posInput}/></label>
            <div className="rounded-xl border border-line bg-surface-2 p-3 space-y-2">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form, is_active:e.target.checked})}/>
                  Pelanggan aktif
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={form.is_hold} onChange={e=>setForm({...form, is_hold:e.target.checked})}/>
                  Tahan transaksi kredit (HOLD)
                </label>
              </div>
              {form.is_hold && (
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">ALASAN HOLD</span>
                  <input value={form.hold_reason} onChange={e=>setForm({...form, hold_reason:e.target.value})} placeholder="mis. piutang lewat jatuh tempo" className={posInput}/></label>
              )}
            </div>
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
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-raised overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">{detail.name||'Pelanggan'}</h3>
                <div className="text-xs text-ink-2 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{detail.code}</span><span>•</span>
                  <PosBadge tone={TYPE_TONE[(detail.type||'').toUpperCase()]||'slate'}>{(detail.type||'-').toUpperCase()}</PosBadge>
                  {detail.is_hold && <PosBadge tone="red"><Ban size={11}/> HOLD</PosBadge>}
                  <PosBadge tone={detail.is_active?'emerald':'slate'}>{detail.is_active?'AKTIF':'NONAKTIF'}</PosBadge>
                  {detail.loyalty && <PosBadge tone="amber"><Crown size={11}/> {nf(detail.loyalty.points_balance)} poin</PosBadge>}
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-line grid place-items-center text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={5} cols={4}/> : (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-line bg-surface-2 p-2.5"><div className="text-ink-2">Total Penjualan</div><div className="font-bold text-ink">{rupiah(detail.total_sales)}</div></div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5"><div className="text-amber-700">Piutang Terbuka</div><div className="font-bold text-ink">{rupiah(detail.outstanding)}</div></div>
                  <div className="rounded-xl border border-line bg-surface-2 p-2.5"><div className="text-ink-2">Limit / Termin</div><div className="font-bold">{num(detail.credit_limit)>0? rupiah(detail.credit_limit):'tanpa limit'} • {detail.payment_term_days||0} hari</div></div>
                  <div className="rounded-xl border border-line bg-surface-2 p-2.5"><div className="text-ink-2">Invoice</div><div className="font-bold">{detail.invoice_count||0} dokumen</div></div>
                </div>
                <div className="text-xs text-ink-2 flex flex-wrap gap-3">
                  {detail.phone && <span className="inline-flex items-center gap-1"><Phone size={12}/> {detail.phone}</span>}
                  {detail.email && <span className="inline-flex items-center gap-1"><Mail size={12}/> {detail.email}</span>}
                  {detail.address && <span className="inline-flex items-center gap-1"><MapPin size={12}/> {detail.address}</span>}
                  {detail.npwp && <span className="font-mono">NPWP {detail.npwp}</span>}
                </div>
                {detail.is_hold && detail.hold_reason && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle size={14}/> Ditahan: {detail.hold_reason}
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-2">INVOICE TERAKHIR ({(detail.invoices||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-surface-3 border-b border-line text-[11px] font-bold tracking-wider text-ink-2">
                        <PosTh>NO INVOICE</PosTh><PosTh align="center">TANGGAL</PosTh><PosTh align="right">NILAI</PosTh><PosTh align="center">STATUS</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.invoices||[]).map(i=>(
                          <tr key={i.id} className={posTr}>
                            <td className={posTd+' font-mono text-xs'}>{i.invoice_number}</td>
                            <td className={posTd+' text-center text-xs'}>{iso(i.invoice_date)}</td>
                            <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(i.total)}</td>
                            <td className={posTd+' text-center'}><PosBadge tone={String(i.status).toUpperCase()==='PAID'?'emerald':'amber'}>{i.status}</PosBadge></td>
                          </tr>
                        ))}
                        {!(detail.invoices||[]).length && <PosEmpty colSpan={4} text="Belum ada invoice"/>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-2">SALES ORDER TERAKHIR ({(detail.orders||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-surface-3 border-b border-line text-[11px] font-bold tracking-wider text-ink-2">
                        <PosTh>NO SO</PosTh><PosTh align="center">TANGGAL</PosTh><PosTh align="right">NILAI</PosTh><PosTh align="center">STATUS</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.orders||[]).map(o=>(
                          <tr key={o.id} className={posTr}>
                            <td className={posTd+' font-mono text-xs'}>{o.so_number}</td>
                            <td className={posTd+' text-center text-xs'}>{iso(o.order_date)}</td>
                            <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(o.total)}</td>
                            <td className={posTd+' text-center'}><PosBadge tone="slate">{o.status}</PosBadge></td>
                          </tr>
                        ))}
                        {!(detail.orders||[]).length && <PosEmpty colSpan={4} text="Belum ada sales order"/>}
                      </tbody>
                    </table>
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
