import { useCallback, useEffect, useState } from 'react';
import { Flame, Search, RefreshCw, Plus, X, AlertTriangle, CheckCircle2, Clock, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager,
  PosBadge, PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const fmtDate = (d)=> d ? String(d).slice(0,10) : '-';

const TYPES = [
  ['PECAH_GUDANG', 'Pecah Gudang'],
  ['PECAH_KIRIM', 'Pecah Kirim'],
  ['PECAH_BONGKAR', 'Pecah Bongkar'],
  ['SUSUT_ALAMI', 'Susut Alami'],
  ['SALAH_HITUNG', 'Salah Hitung'],
  ['OTHER', 'Lain-lain'],
];
const TYPE_LABEL = Object.fromEntries(TYPES);
const TYPE_TONE = { PECAH_GUDANG:'red', PECAH_KIRIM:'amber', PECAH_BONGKAR:'amber', SUSUT_ALAMI:'sky', SALAH_HITUNG:'slate', OTHER:'slate' };
const STATUS_TONE = { PENDING:'amber', APPROVED:'emerald', REJECTED:'red' };

export default function Waste(){
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q:'', waste_type:'', status:'', start:'', end:'' });
  const [applied, setApplied] = useState({ q:'', waste_type:'', status:'', start:'', end:'' });
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [form, setForm] = useState({ product_id:'', warehouse_id:'', qty:'', waste_type:'PECAH_GUDANG', reason:'' });

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit: 300, offset: 0 };
      if (applied.q) params.q = applied.q;
      if (applied.waste_type) params.waste_type = applied.waste_type;
      if (applied.status) params.status = applied.status;
      if (applied.start) params.start = applied.start;
      if (applied.end) params.end = applied.end;
      const r = await api.get('/waste', { params });
      const data = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setRows(data);
      setTotal(Number(r.data?.total) || data.length);
    }catch(e){ setErr(e.response?.data?.error || e.message); setRows([]); setTotal(0); }
    finally{ setLoading(false); }
  },[applied]);

  const loadStats = ()=> api.get('/waste/stats/summary').then(r=>setStats(r.data)).catch(()=>{});

  useEffect(()=>{
    api.get('/master/products',{ params:{ limit: 200 } }).then(r=>setProducts(r.data?.data||r.data||[])).catch(()=>{});
    api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:(r.data?.data||[]))).catch(()=>{});
  },[]);
  useEffect(()=>{ load(); loadStats(); },[load]);
  useEffect(()=>{ setPage(1); },[applied]);

  const pageRows = rows.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalCost = rows.reduce((a,w)=> a + (Number(w.cost)||0), 0);
  const pending = rows.filter(w=> w.status === 'PENDING').length;
  const approved = rows.filter(w=> w.status === 'APPROVED').length;
  const byType = Array.isArray(stats?.by_type) ? stats.by_type : [];

  const submit = async (e)=>{
    e.preventDefault();
    if (!form.product_id) return setFormErr('Produk wajib dipilih.');
    if (!(Number(form.qty) > 0)) return setFormErr('Qty harus lebih dari 0.');
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/waste', {
        product_id: parseInt(form.product_id),
        warehouse_id: form.warehouse_id ? parseInt(form.warehouse_id) : 1,
        qty: Number(form.qty),
        waste_type: form.waste_type,
        reason: form.reason,
      });
      setShow(false);
      setForm({ product_id:'', warehouse_id:'', qty:'', waste_type:'PECAH_GUDANG', reason:'' });
      await dialog.alert(
        `Write-off ${rupiah(r.data?.cost)} tercatat dengan status ${r.data?.status}.\n` +
        'Aturan approval: >500rb butuh Manager + Finance, >5jt butuh Direktur.',
        { title: 'Susut Dicatat' });
      load(); loadStats();
    }catch(err2){ setFormErr(err2.response?.data?.error || err2.message || 'Gagal menyimpan.'); }
    finally{ setSaving(false); }
  };

  const approve = async (w)=>{
    const ok = await dialog.confirm(
      `Setujui write-off ${w.product_name} sebanyak ${angka(w.qty)} (${rupiah(w.cost)})?\nStok dan jurnal penyesuaian akan ikut tercatat.`,
      { title: 'Setujui Susut' });
    if (!ok) return;
    try{
      await api.post(`/waste/${w.id}/approve`, { status:'APPROVED' });
      await dialog.alert('Write-off disetujui.', { title: 'Tersimpan' });
      load(); loadStats();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title: 'Gagal' }); }
  };

  const [expBusy, setExpBusy] = useState('');
  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { format };
      if (applied.q) params.q = applied.q;
      if (applied.waste_type) params.waste_type = applied.waste_type;
      if (applied.status) params.status = applied.status;
      if (applied.start) params.start = applied.start;
      if (applied.end) params.end = applied.end;
      const r = await api.get('/waste/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'susut-pecah.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal mengunduh laporan'); }
    finally{ setExpBusy(''); }
  };

  const preset = (k)=>{
    const today = new Date();
    const iso = (d)=> d.toISOString().slice(0,10);
    if (k === 'month'){ const a = new Date(today.getFullYear(), today.getMonth(), 1); setF(s=>({ ...s, start: iso(a), end: iso(today) })); }
    else if (k === 'year'){ setF(s=>({ ...s, start: `${today.getFullYear()}-01-01`, end: iso(today) })); }
    else setF(s=>({ ...s, start:'', end:'' }));
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Flame} title="Susut, Pecah & Waste"
        subtitle="Pecah gudang/kirim/bongkar • Susut alami • Reklasifikasi grade B • Approval berjenjang"
        badge={`${angka(total)} catatan`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Wallet} tone="bg-red-50 text-red-700" label="NILAI SUSUT" value={rupiah(totalCost)} sub="pada filter ini" />
        <PosStat icon={Clock} tone="bg-amber-50 text-amber-700" label="MENUNGGU APPROVAL" value={angka(pending)} sub="status PENDING" />
        <PosStat icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" label="DISETUJUI" value={angka(approved)} sub="sudah dibukukan" />
        <PosStat icon={AlertTriangle} tone="bg-[#e5eeff] text-[#0051d5]" label="JENIS TERBANYAK"
          value={byType.length ? TYPE_LABEL[byType[0].waste_type] || byType[0].waste_type : '-'}
          sub={byType.length ? `${rupiah(byType[0].cost)} • ${angka(byType[0].cnt)} kejadian` : 'belum ada data'} />
      </div>

      {byType.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byType.map(t=>(
            <div key={t.waste_type} className="flex items-center gap-2 bg-white border border-[#e7ecf7] rounded-xl px-3 py-2">
              <PosBadge tone={TYPE_TONE[t.waste_type]||'slate'}>{TYPE_LABEL[t.waste_type]||t.waste_type}</PosBadge>
              <span className="text-xs font-bold text-[#0b1c30] tabular-nums">{rupiah(t.cost)}</span>
              <span className="text-[11px] text-[#45464d]">{angka(t.cnt)} kejadian</span>
            </div>
          ))}
        </div>
      )}

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>setApplied({...f})} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Terapkan
            </button>
            <button onClick={()=>{ const r={q:'',waste_type:'',status:'',start:'',end:''}; setF(r); setApplied(r); }}
              className={posBtnSecondary+' h-9 px-4 text-xs'}>Reset</button>
            <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Susut"/>
            <button onClick={()=>{ setFormErr(''); setShow(true); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Catat Susut</button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
              <input value={f.q} onChange={e=>setF({...f, q:e.target.value})} onKeyDown={e=>e.key==='Enter'&&setApplied({...f})}
                placeholder="Cari produk / SKU lalu Enter..." className={posInput+' pl-9'} />
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={f.waste_type} onChange={v=>setF({...f, waste_type:v})}>
                <option value="">Semua Jenis</option>
                {TYPES.map(([k,v])=> <option key={k} value={k}>{v}</option>)}
              </PosSelect>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={f.status} onChange={v=>setF({...f, status:v})}>
                <option value="">Semua Status</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </PosSelect>
            </div>
          </PosToolbar>

          <PosChipRow label="PERIODE">
            <PosChip active={!f.start && !f.end} onClick={()=>preset('all')}>Semua</PosChip>
            <PosChip onClick={()=>preset('month')}>Bulan ini</PosChip>
            <PosChip onClick={()=>preset('year')}>Tahun ini</PosChip>
            <span className="ml-auto flex items-center gap-1.5">
              <input type="date" value={f.start} onChange={e=>setF({...f, start:e.target.value})} className={posInput+' w-[150px]'}/>
              <span className="text-[11px] text-[#76777d]">s/d</span>
              <input type="date" value={f.end} onChange={e=>setF({...f, end:e.target.value})} className={posInput+' w-[150px]'}/>
            </span>
          </PosChipRow>

          {loading ? <PosSkeleton rows={6} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : rows.length===0 ? (
            <PosEmpty text="Belum ada catatan susut/pecah"/>
          ) : (
            <div className="overflow-auto rounded-xl border border-[#e7ecf7]">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#e5eeff] border-b border-[#e7ecf7]">
                  <PosTh>TANGGAL</PosTh><PosTh>PRODUK</PosTh><PosTh align="center">GUDANG</PosTh>
                  <PosTh align="center">JENIS</PosTh><PosTh align="right">QTY</PosTh><PosTh align="right">BIAYA</PosTh>
                  <PosTh align="center">STATUS</PosTh><PosTh>ALASAN</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(w=>(
                    <tr key={w.id} className="border-b border-[#e5eeff] hover:bg-[#eff4ff] transition bg-white">
                      <td className="px-4 py-3.5 text-xs tabular-nums text-[#2b3445] whitespace-nowrap">{fmtDate(w.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-[#0b1c30]">{w.product_name}</div>
                        <div className="text-[11px] text-[#45464d]">{w.sku}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs text-[#2b3445]">{w.warehouse_name || '-'}</td>
                      <td className="px-4 py-3.5 text-center">
                        <PosBadge tone={TYPE_TONE[w.waste_type]||'slate'}>{TYPE_LABEL[w.waste_type]||w.waste_type}</PosBadge>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold tabular-nums">{angka(w.qty)}</td>
                      <td className="px-4 py-3.5 text-right font-bold tabular-nums text-red-700">{rupiah(w.cost)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <PosBadge tone={STATUS_TONE[w.status]||'slate'} title={w.approver ? 'Disetujui '+w.approver : undefined}>{w.status}</PosBadge>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#45464d] max-w-[220px] truncate" title={w.reason||''}>{w.reason || '-'}</td>
                      <td className="px-4 py-3.5 text-right">
                        {w.status === 'PENDING' ? (
                          <button onClick={()=>approve(w)} className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition">Setujui</button>
                        ) : <span className="text-[11px] text-[#76777d]">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !err && rows.length > 0 && (
            <PosPager page={page} setPage={setPage} total={rows.length} size={PAGE_SIZE} unit="catatan" />
          )}
        </PosCardBody>
      </PosCard>

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-[#e5eeff]">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Catat Susut / Pecah</h3>
                <p className="text-xs text-[#45464d] mt-1">Stok dikurangi dan dibebankan sesuai nilai rata-rata (avg cost) gudang terkait.</p>
              </div>
              <button type="button" onClick={()=>setShow(false)} className="h-9 w-9 grid place-items-center rounded-xl border border-[#e7ecf7] text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-[#45464d] mb-1">PRODUK *</label>
                <PosSelect size="md" value={form.product_id} onChange={v=>setForm({...form, product_id:v})}>
                  <option value="">Pilih produk</option>
                  {products.map(p=> <option key={p.id} value={String(p.id)}>{p.name} {p.sku ? '• '+p.sku : ''}</option>)}
                </PosSelect>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#45464d] mb-1">GUDANG</label>
                  <PosSelect size="md" value={form.warehouse_id} onChange={v=>setForm({...form, warehouse_id:v})}>
                    <option value="">Gudang Pusat (default)</option>
                    {warehouses.map(w=> <option key={w.id} value={String(w.id)}>{w.code} • {w.name}</option>)}
                  </PosSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#45464d] mb-1">QTY *</label>
                  <input type="number" min="0" step="any" value={form.qty} onChange={e=>setForm({...form, qty:e.target.value})}
                    placeholder="0" className={posInput+' h-[42px] text-right tabular-nums'}/>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-[#45464d] mb-1">JENIS SUSUT</label>
                <PosSelect size="md" value={form.waste_type} onChange={v=>setForm({...form, waste_type:v})}>
                  {TYPES.map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                </PosSelect>
              </div>
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-[#45464d] mb-1">PENYEBAB & TINDAK LANJUT</label>
                <textarea value={form.reason} onChange={e=>setForm({...form, reason:e.target.value})} rows={3}
                  placeholder="Mis. pecah saat bongkar, klaim supplier / asuransi?"
                  className="w-full px-3 py-2 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5] placeholder:text-[#76777d]"/>
              </div>

              <div className="text-xs text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-2.5">
                Approval berjenjang: <b>&lt;500rb</b> Supervisor • <b>500rb-5jt</b> Manager + Gudang + Finance • <b>&gt;5jt</b> Direktur.
              </div>
              {formErr && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formErr}</div>}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-[#e5eeff]">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' disabled:opacity-60'}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
