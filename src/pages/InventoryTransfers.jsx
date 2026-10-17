import { useCallback, useEffect, useState } from 'react';
import { Truck, Search, RefreshCw, Plus, X, ArrowRight, PackageCheck, Clock } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager,
  PosBadge, PosEmpty, PosSkeleton, PosError, PosStat, PosQtyInput, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posSearchWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const fmtDate = (d)=> d ? String(d).slice(0,10) : '-';
const STATUS_TONE = { IN_TRANSIT: 'amber', RECEIVED: 'emerald', CANCELLED: 'red', DRAFT: 'slate' };
const STATUS_LABEL = { IN_TRANSIT: 'Dalam Perjalanan', RECEIVED: 'Diterima', CANCELLED: 'Dibatalkan', DRAFT: 'Draft' };

export default function InventoryTransfers(){
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);

  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ from_warehouse_id:'', to_warehouse_id:'', notes:'', items:[] });
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit: 300, offset: 0 };
      if (statusFilter !== 'Semua') params.status = statusFilter;
      if (appliedQ) params.q = appliedQ;
      const r = await api.get('/inventory/transfers', { params });
      const data = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setRows(data);
      setTotal(Number(r.data?.total) || data.length);
    }catch(e){ setErr(e.response?.data?.error || e.message); setRows([]); setTotal(0); }
    finally{ setLoading(false); }
  },[statusFilter, appliedQ]);

  useEffect(()=>{
    api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:(r.data?.data||[]))).catch(()=>{});
    api.get('/master/products',{ params:{ limit: 200 } }).then(r=>setProducts(r.data?.data||r.data||[])).catch(()=>{});
  },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[statusFilter, appliedQ]);

  const pageRows = rows.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const inTransit = rows.filter(t=> t.status === 'IN_TRANSIT').length;
  const received = rows.filter(t=> t.status === 'RECEIVED').length;
  const totalQty = rows.reduce((a,t)=> a + (Number(t.total_qty)||0), 0);

  const [expBusy, setExpBusy] = useState('');
  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { dataset:'transfers', format };
      if (statusFilter !== 'Semua') params.status = statusFilter;
      if (appliedQ) params.q = appliedQ;
      const r = await api.get('/inventory/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'transfer-stok.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal mengunduh laporan'); }
    finally{ setExpBusy(''); }
  };

  const openForm = ()=>{
    setForm({ from_warehouse_id: warehouses[0] ? String(warehouses[0].id) : '', to_warehouse_id: warehouses[1] ? String(warehouses[1].id) : '', notes:'', items:[] });
    setFormErr(''); setShow(true);
  };
  const addItem = (p)=> setForm(s=>({ ...s, items: [...s.items, { product_id: p.id, name: p.name, sku: p.sku, qty: 1 }] }));
  const setQty = (i, qty)=> setForm(s=>({ ...s, items: s.items.map((x,idx)=> idx===i ? { ...x, qty } : x) }));
  const removeItem = (i)=> setForm(s=>({ ...s, items: s.items.filter((_,idx)=> idx!==i) }));

  const submit = async (e)=>{
    e.preventDefault();
    if (!form.from_warehouse_id || !form.to_warehouse_id) return setFormErr('Gudang asal dan tujuan wajib dipilih.');
    if (form.from_warehouse_id === form.to_warehouse_id) return setFormErr('Gudang asal dan tujuan tidak boleh sama.');
    if (!form.items.length) return setFormErr('Tambahkan minimal 1 produk.');
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/inventory/transfers', {
        from_warehouse_id: parseInt(form.from_warehouse_id),
        to_warehouse_id: parseInt(form.to_warehouse_id),
        notes: form.notes,
        items: form.items.map(i=>({ product_id: i.product_id, qty: Number(i.qty)||0 })),
      });
      setShow(false);
      await dialog.alert(`Transfer ${r.data?.transfer_number || ''} dibuat dengan status IN_TRANSIT.`, { title: 'Transfer Dibuat' });
      load();
    }catch(err2){
      setFormErr(err2.response?.data?.error || err2.message || 'Gagal membuat transfer.');
    }finally{ setSaving(false); }
  };

  const receive = async (t)=>{
    const ok = await dialog.confirm(`Tandai transfer ${t.transfer_number} sebagai DITERIMA?\nStok tujuan akan dianggap sudah masuk.`, { title: 'Konfirmasi Terima' });
    if (!ok) return;
    try{ await api.post(`/inventory/transfers/${t.id}/receive`, {}); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title: 'Gagal' }); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Truck} title="Transfer Stok Antar Gudang"
        subtitle="Transit • In-transit • Received - stok keluar dari gudang asal dan masuk ke gudang tujuan"
        badge={`${angka(total)} transfer`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Clock} tone="bg-amber-50 text-amber-700" label="DALAM PERJALANAN" value={angka(inTransit)} sub="menunggu penerimaan" />
        <PosStat icon={PackageCheck} tone="bg-emerald-50 text-emerald-700" label="DITERIMA" value={angka(received)} sub="selesai" />
        <PosStat icon={Truck} tone="bg-[#EFF6FF] text-[#1E40AF]" label="TOTAL TRANSFER" value={angka(total)} sub="semua status" />
        <PosStat icon={ArrowRight} tone="bg-sky-50 text-sky-700" label="TOTAL QTY PINDAH" value={angka(totalQty)} sub="pada filter ini" />
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); load(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
            <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Transfer"/>
            <button onClick={openForm} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Transfer Baru</button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari no transfer / gudang lalu Enter..." className={posInput+' pl-9'} />
            </div>
          </PosToolbar>

          <PosChipRow label="STATUS">
            {['Semua', ...Object.keys(STATUS_LABEL)].map(s=>(
              <PosChip key={s} active={statusFilter===s} onClick={()=>setStatusFilter(s)}>
                {s === 'Semua' ? 'Semua' : STATUS_LABEL[s]}
              </PosChip>
            ))}
          </PosChipRow>

          {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : rows.length===0 ? (
            <PosEmpty text="Belum ada transfer stok"/>
          ) : (
            <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0]">
                  <PosTh>NO TRANSFER</PosTh><PosTh>DARI</PosTh><PosTh align="center">→</PosTh><PosTh>KE</PosTh>
                  <PosTh align="center">TANGGAL</PosTh><PosTh align="right">ITEM</PosTh><PosTh align="right">QTY</PosTh>
                  <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(t=>(
                    <tr key={t.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white">
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-[#0F172A]">{t.transfer_number}</td>
                      <td className="px-4 py-3.5 text-xs text-[#334155]">
                        <div className="font-semibold">{t.from_code || '-'}</div>
                        <div className="text-[11px] text-[#64748B]">{t.from_name || '-'}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-[#94A3B8]"><ArrowRight size={14}/></td>
                      <td className="px-4 py-3.5 text-xs text-[#334155]">
                        <div className="font-semibold">{t.to_code || '-'}</div>
                        <div className="text-[11px] text-[#64748B]">{t.to_name || '-'}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs tabular-nums text-[#334155]">{fmtDate(t.transfer_date)}</td>
                      <td className="px-4 py-3.5 text-right text-xs tabular-nums">{angka(t.item_count)}</td>
                      <td className="px-4 py-3.5 text-right font-bold tabular-nums">{angka(t.total_qty)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <PosBadge tone={STATUS_TONE[t.status]||'slate'} title={STATUS_LABEL[t.status]||t.status}>{t.status}</PosBadge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {t.status === 'IN_TRANSIT' ? (
                          <button onClick={()=>receive(t)} className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition">Terima</button>
                        ) : <span className="text-[11px] text-[#94A3B8]">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !err && rows.length > 0 && (
            <PosPager page={page} setPage={setPage} total={rows.length} size={PAGE_SIZE} unit="transfer" />
          )}
        </PosCardBody>
      </PosCard>

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-[20px] w-full max-w-2xl max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-[#F1F5F9]">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Transfer Stok Antar Gudang</h3>
                <p className="text-xs text-[#64748B] mt-1">Stok dikurangi dari gudang asal dan ditambahkan ke gudang tujuan saat transfer dibuat.</p>
              </div>
              <button type="button" onClick={()=>setShow(false)} className="h-9 w-9 grid place-items-center rounded-xl border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold tracking-widest text-[#64748B] mb-1">DARI GUDANG *</label>
                  <PosSelect size="md" value={form.from_warehouse_id} onChange={v=>setForm({...form, from_warehouse_id:v})}>
                    <option value="">Pilih gudang asal</option>
                    {warehouses.map(w=> <option key={w.id} value={String(w.id)}>{w.code} • {w.name}</option>)}
                  </PosSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-widest text-[#64748B] mb-1">KE GUDANG *</label>
                  <PosSelect size="md" value={form.to_warehouse_id} onChange={v=>setForm({...form, to_warehouse_id:v})}>
                    <option value="">Pilih gudang tujuan</option>
                    {warehouses.map(w=> <option key={w.id} value={String(w.id)}>{w.code} • {w.name}</option>)}
                  </PosSelect>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black tracking-widest text-[#64748B] mb-1">PILIH PRODUK</div>
                <div className="rounded-xl border border-[#E2E8F0] max-h-[170px] overflow-auto divide-y divide-[#F1F5F9]">
                  {products.map(p=>(
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-xs text-[#0F172A]">{p.name} <span className="text-[#94A3B8]">{p.sku}</span></span>
                      <button type="button" onClick={()=>addItem(p)} className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1E40AF] text-white font-bold hover:bg-[#1E3A8A]">+ Tambah</button>
                    </div>
                  ))}
                  {products.length === 0 && <div className="px-3 py-4 text-xs text-[#94A3B8]">Memuat produk...</div>}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black tracking-widest text-[#64748B] mb-1">ITEM TRANSFER ({form.items.length})</div>
                {form.items.length === 0 ? (
                  <div className="text-xs text-[#94A3B8] border border-dashed border-[#E2E8F0] rounded-xl px-3 py-4 text-center">Belum ada item - tambahkan dari daftar produk di atas.</div>
                ) : (
                  <div className="space-y-1.5">
                    {form.items.map((it, i)=>(
                      <div key={i} className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">
                        <span className="flex-1 text-xs text-[#0F172A] truncate">{it.name} <span className="text-[#94A3B8]">{it.sku}</span></span>
                        <PosQtyInput value={it.qty} onChange={v=>setQty(i, v)} min={1}/>
                        <button type="button" onClick={()=>removeItem(i)} className="h-7 w-7 grid place-items-center rounded-lg text-red-600 hover:bg-red-50"><X size={14}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold tracking-widest text-[#64748B] mb-1">CATATAN</label>
                <input value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Mis. pengiriman via truk B 1234 XY" className={posInput+' h-[42px]'}/>
              </div>

              {formErr && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formErr}</div>}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-[#F1F5F9]">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' disabled:opacity-60'}>{saving ? 'Mengirim...' : 'Kirim Transfer'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
