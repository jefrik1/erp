import { useCallback, useEffect, useState } from 'react';
import { Handshake, Search, RefreshCw, Plus, X, ArrowUpRight, ArrowDownLeft, Clock, PackageCheck, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager,
  PosBadge, PosEmpty, PosSkeleton, PosError, PosStat, PosQtyInput, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posSearchWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const fmtDate = (d)=> d ? String(d).slice(0,10) : '-';

export default function Consignments(){
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [type, setType] = useState('Semua');
  const [status, setStatus] = useState('Semua');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);

  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);

  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [form, setForm] = useState({ type:'OUT', partner_type:'CUSTOMER', partner_id:'', location_name:'', location_address:'', start_date:'', notes:'', items:[] });

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [moveForm, setMoveForm] = useState({ item_id:'', type:'SOLD', qty:1, notes:'' });

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = {};
      if (type !== 'Semua') params.type = type;
      if (status !== 'Semua') params.status = status;
      if (appliedQ) params.q = appliedQ;
      const r = await api.get('/consignments', { params });
      const data = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setRows(data);
    }catch(e){ setErr(e.response?.data?.error || e.message); setRows([]); }
    finally{ setLoading(false); }
  },[type, status, appliedQ]);

  const loadStats = ()=> api.get('/consignments/stats/summary').then(r=>setStats(r.data)).catch(()=>{});

  useEffect(()=>{
    api.get('/master/customers',{ params:{ limit: 200 } }).then(r=>setCustomers(r.data?.data||r.data||[])).catch(()=>{});
    api.get('/master/suppliers',{ params:{ limit: 200 } }).then(r=>setSuppliers(r.data?.data||r.data||[])).catch(()=>{});
    api.get('/master/products',{ params:{ limit: 200 } }).then(r=>setProducts(r.data?.data||r.data||[])).catch(()=>{});
  },[]);
  useEffect(()=>{ load(); loadStats(); },[load]);
  useEffect(()=>{ setPage(1); },[type, status, appliedQ]);

  const [expBusy, setExpBusy] = useState('');
  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { format };
      if (type !== 'Semua') params.type = type;
      if (status !== 'Semua') params.status = status;
      if (appliedQ) params.q = appliedQ;
      const r = await api.get('/consignments/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'konsinyasi.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal mengunduh laporan'); }
    finally{ setExpBusy(''); }
  };

  const pageRows = rows.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const partners = form.partner_type === 'SUPPLIER' ? suppliers : customers;

  const openForm = ()=>{
    setForm({ type:'OUT', partner_type:'CUSTOMER', partner_id:'', location_name:'', location_address:'', start_date: new Date().toISOString().slice(0,10), notes:'', items:[] });
    setFormErr(''); setShow(true);
  };
  const addItem = (p)=> setForm(s=>({ ...s, items: [...s.items, { product_id:p.id, name:p.name, sku:p.sku, qty:1, selling_price: 0 }] }));
  const updItem = (i, patch)=> setForm(s=>({ ...s, items: s.items.map((x,idx)=> idx===i ? { ...x, ...patch } : x) }));
  const delItem = (i)=> setForm(s=>({ ...s, items: s.items.filter((_,idx)=> idx!==i) }));

  const submit = async (e)=>{
    e.preventDefault();
    if (!form.location_name.trim()) return setFormErr('Nama lokasi titipan wajib diisi.');
    if (!form.items.length) return setFormErr('Tambahkan minimal 1 produk.');
    if (form.items.some(i=> !(Number(i.qty) > 0))) return setFormErr('Qty tiap item harus lebih dari 0.');
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/consignments', {
        type: form.type, partner_type: form.partner_type,
        partner_id: form.partner_id ? parseInt(form.partner_id) : null,
        location_name: form.location_name, location_address: form.location_address,
        start_date: form.start_date || undefined, notes: form.notes,
        items: form.items.map(i=>({ product_id: i.product_id, qty_sent: Number(i.qty)||0, selling_price: Number(i.selling_price)||0 })),
      });
      setShow(false);
      await dialog.alert(`Titipan ${r.data?.consignment_number || ''} dibuat. Stok dipindah dari Gudang Pusat ke lokasi konsinyasi.`, { title: 'Konsinyasi Dibuat' });
      load(); loadStats();
    }catch(err2){ setFormErr(err2.response?.data?.error || err2.message || 'Gagal menyimpan konsinyasi.'); }
    finally{ setSaving(false); }
  };

  const openDetail = async (c)=>{
    setDetailLoading(true); setDetail({ id: c.id, loading: true, header: c });
    try{
      const r = await api.get('/consignments/' + c.id);
      setDetail({ ...r.data, loading: false, header: c });
      setMoveForm({ item_id: r.data.items?.[0]?.id ? String(r.data.items[0].id) : '', type:'SOLD', qty:1, notes:'' });
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title: 'Gagal memuat detail' }); setDetail(null); }
    finally{ setDetailLoading(false); }
  };

  const postMovement = async ()=>{
    if (!detail || !moveForm.item_id) return dialog.alert('Pilih item dulu.', { title: 'Validasi' });
    if (!(Number(moveForm.qty) > 0)) return dialog.alert('Qty harus lebih dari 0.', { title: 'Validasi' });
    try{
      await api.post(`/consignments/${detail.id}/movement`, { item_id: parseInt(moveForm.item_id), type: moveForm.type, qty: Number(moveForm.qty), notes: moveForm.notes });
      await dialog.alert('Mutasi konsinyasi tercatat.', { title: 'Tersimpan' });
      openDetail({ id: detail.id });
      load(); loadStats();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title: 'Gagal' }); }
  };

  const closeConsignment = async ()=>{
    if (!detail) return;
    const ok = await dialog.confirm(`Tutup konsinyasi ${detail.consignment_number}? Status menjadi CLOSED dan tidak bisa diubah lagi.`, { title: 'Tutup Konsinyasi' });
    if (!ok) return;
    try{ await api.post(`/consignments/${detail.id}/close`, {}); setDetail(null); load(); loadStats(); }
    catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title: 'Gagal' }); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Handshake} title="Konsinyasi In & Out"
        subtitle="Barang titipan di toko/proyek (OUT) & barang supplier di gudang kita (IN) - kepemilikan terpisah"
        badge={`${rows.length} dokumen`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={ArrowUpRight} tone="bg-teal-50 text-teal-700" label="OUT AKTIF" value={angka(stats?.out_active)} sub="barang kita di pihak lain" />
        <PosStat icon={ArrowDownLeft} tone="bg-sky-50 text-sky-700" label="IN AKTIF" value={angka(stats?.in_active)} sub="barang supplier di gudang kita" />
        <PosStat icon={PackageCheck} tone="bg-emerald-50 text-emerald-700" label="SELESAI" value={angka(stats?.closed)} sub="status CLOSED" />
        <PosStat icon={Clock} tone="bg-amber-50 text-amber-700" label=">90 HARI" value={angka(stats?.long_pending?.length)} sub="titipan OUT tidak laku" />
      </div>

      {stats?.long_pending?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
          <AlertTriangle size={14}/>
          <b>Titipan menua:</b>
          {stats.long_pending.slice(0,4).map(l=> <span key={l.consignment_number} className="px-2 py-0.5 rounded-full bg-white/70 border border-amber-200">{l.location_name} • {l.umur_hari} hari</span>)}
          {stats.long_pending.length > 4 && <span>+{stats.long_pending.length - 4} lainnya</span>}
        </div>
      )}

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); load(); loadStats(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
            <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Konsinyasi"/>
            <button onClick={openForm} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Titipan Baru</button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari no konsinyasi / lokasi lalu Enter..." className={posInput+' pl-9'} />
            </div>
          </PosToolbar>

          <PosChipRow label="TIPE">
            {['Semua','OUT','IN'].map(t=> <PosChip key={t} active={type===t} onClick={()=>setType(t)}>{t}</PosChip>)}
            <span className="text-[11px] font-bold tracking-wider text-ink-2 ml-3">STATUS</span>
            {['Semua','ACTIVE','CLOSED'].map(s=> <PosChip key={s} active={status===s} onClick={()=>setStatus(s)}>{s}</PosChip>)}
          </PosChipRow>

          {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : rows.length===0 ? (
            <PosEmpty text="Belum ada dokumen konsinyasi"/>
          ) : (
            <div className="overflow-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-b border-line">
                  <PosTh>NO</PosTh><PosTh align="center">TIPE</PosTh><PosTh>LOKASI / PARTNER</PosTh>
                  <PosTh align="center">TGL TITIP</PosTh><PosTh>ITEMS</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(c=>{
                    const items = Array.isArray(c.items) ? c.items : [];
                    const sent = items.reduce((a,i)=> a + (Number(i.qty_sent)||0), 0);
                    const sold = items.reduce((a,i)=> a + (Number(i.qty_sold)||0), 0);
                    return (
                      <tr key={c.id} className="border-b border-line hover:bg-surface-2 transition bg-white align-top">
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-ink">{c.consignment_number}</td>
                        <td className="px-4 py-3.5 text-center">
                          <PosBadge tone={c.type==='OUT' ? 'teal' : 'sky'}>{c.type}</PosBadge>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-xs text-ink">{c.location_name}</div>
                          <div className="text-[11px] text-ink-2">{c.partner_type}{c.partner_id ? ' #'+c.partner_id : ''} • {c.location_address || 'tanpa alamat'}</div>
                        </td>
                        <td className="px-4 py-3.5 text-center text-xs tabular-nums text-ink-2">{fmtDate(c.start_date)}</td>
                        <td className="px-4 py-3.5 text-xs text-ink-2">
                          <div className="font-semibold">{items.length} produk • {angka(sent)} unit</div>
                          <div className="text-[11px] text-ink-2">terjual {angka(sold)}</div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <PosBadge tone={c.status==='ACTIVE' ? 'amber' : 'slate'}>{c.status}</PosBadge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button onClick={()=>openDetail(c)} className="text-[11px] px-2.5 py-1 rounded-lg border border-line bg-white font-bold text-ink-2 hover:bg-surface-2">Detail</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !err && rows.length > 0 && (
            <PosPager page={page} setPage={setPage} total={rows.length} size={PAGE_SIZE} unit="dokumen" />
          )}
        </PosCardBody>
      </PosCard>

      {/* ------------------------------------------------ modal buat titipan */}
      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-line">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Buat Titipan Konsinyasi</h3>
                <p className="text-xs text-ink-2 mt-1">Stok pindah dari Gudang Pusat ke lokasi konsinyasi (milik kita, tapi tidak di gudang).</p>
              </div>
              <button type="button" onClick={()=>setShow(false)} className="h-9 w-9 grid place-items-center rounded-xl border border-line text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">TIPE TITIPAN</label>
                  <PosSelect size="md" value={form.type} onChange={v=>setForm({...form, type:v})}>
                    <option value="OUT">OUT - kita titip di toko/proyek</option>
                    <option value="IN">IN - supplier titip di gudang kita</option>
                  </PosSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">JENIS PARTNER</label>
                  <PosSelect size="md" value={form.partner_type} onChange={v=>setForm({...form, partner_type:v, partner_id:''})}>
                    <option value="CUSTOMER">Customer</option>
                    <option value="SUPPLIER">Supplier</option>
                  </PosSelect>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">PARTNER</label>
                  <PosSelect size="md" value={form.partner_id} onChange={v=>setForm({...form, partner_id:v})}>
                    <option value="">Pilih {form.partner_type === 'SUPPLIER' ? 'supplier' : 'customer'}</option>
                    {partners.map(p=> <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </PosSelect>
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">TANGGAL MULAI</label>
                  <input type="date" value={form.start_date} onChange={e=>setForm({...form, start_date:e.target.value})} className={posInput+' h-[42px]'}/>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">LOKASI TITIPAN *</label>
                <input value={form.location_name} onChange={e=>setForm({...form, location_name:e.target.value})} placeholder="Nama toko / proyek" className={posInput+' h-[42px]'}/>
              </div>
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">ALAMAT</label>
                <input value={form.location_address} onChange={e=>setForm({...form, location_address:e.target.value})} placeholder="Alamat lengkap lokasi titipan" className={posInput+' h-[42px]'}/>
              </div>

              <div>
                <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-1">PILIH PRODUK</div>
                <div className="rounded-xl border border-line max-h-[150px] overflow-auto divide-y divide-[#e5eeff]">
                  {products.map(p=>(
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-xs text-ink">{p.name} <span className="text-ink-3">{p.sku}</span></span>
                      <button type="button" onClick={()=>addItem(p)} className="text-[11px] px-2.5 py-1 rounded-lg bg-brand text-white font-bold hover:bg-brand-strong">+ Tambah</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-1">ITEM ({form.items.length})</div>
                {form.items.length === 0 ? (
                  <div className="text-xs text-ink-3 border border-dashed border-line rounded-xl px-3 py-4 text-center">Belum ada item.</div>
                ) : (
                  <div className="space-y-1.5">
                    {form.items.map((it, i)=>(
                      <div key={i} className="flex flex-wrap items-center gap-2 bg-surface-2 border border-line rounded-xl px-3 py-2">
                        <span className="flex-1 min-w-[140px] text-xs text-ink truncate">{it.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-ink-2">QTY</span>
                          <PosQtyInput value={it.qty} onChange={v=>updItem(i, { qty: v })} min={1}/>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-ink-2">HARGA JUAL</span>
                          <input type="number" value={it.selling_price} onChange={e=>updItem(i, { selling_price: e.target.value })}
                            className="w-28 h-8 px-2 text-right text-xs tabular-nums bg-white border border-line rounded-lg outline-none focus:border-brand"/>
                        </div>
                        <button type="button" onClick={()=>delItem(i)} className="h-7 w-7 grid place-items-center rounded-lg text-red-600 hover:bg-red-50"><X size={14}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                Stok akan pindah dari Gudang Pusat ke lokasi konsinyasi. Stock opname lokasi titipan dihitung terpisah.
              </div>
              {formErr && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formErr}</div>}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-line">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' disabled:opacity-60'}>{saving ? 'Menyimpan...' : 'Simpan & Kirim'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------------------------------------- modal detail + mutasi */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-line">
              <div>
                <h3 className="font-bold text-[16px] text-ink">{detail.consignment_number || detail.header?.consignment_number}</h3>
                <p className="text-xs text-ink-2 mt-1">
                  {detail.location_name || detail.header?.location_name} • {detail.type || detail.header?.type} • mulai {fmtDate(detail.start_date || detail.header?.start_date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(detail.status || detail.header?.status) === 'ACTIVE' && (
                  <button onClick={closeConsignment} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup Konsinyasi</button>
                )}
                <button onClick={()=>setDetail(null)} className="h-9 w-9 grid place-items-center rounded-xl border border-line text-ink-2 hover:bg-surface-2"><X size={16}/></button>
              </div>
            </div>

            {detail.loading || detailLoading ? <PosSkeleton rows={4} cols={4}/> : (
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-2">ITEM TITIPAN</div>
                  <div className="overflow-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-surface-3 border-b border-line">
                        <PosTh>PRODUK</PosTh><PosTh align="right">DIKIRIM</PosTh><PosTh align="right">TERJUAL</PosTh>
                        <PosTh align="right">KEMBALI</PosTh><PosTh align="right">HILANG</PosTh><PosTh align="right">SISA</PosTh><PosTh align="right">HARGA JUAL</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.items||[]).map(it=>{
                          const sisa = (Number(it.qty_sent)||0) - (Number(it.qty_sold)||0) - (Number(it.qty_returned)||0) - (Number(it.qty_lost)||0);
                          return (
                            <tr key={it.id} className="border-b border-line bg-white">
                              <td className="px-4 py-3"><div className="text-xs font-semibold text-ink">{it.product_name}</div><div className="text-[11px] text-ink-2">{it.sku}</div></td>
                              <td className="px-4 py-3 text-right tabular-nums">{angka(it.qty_sent)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{angka(it.qty_sold)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-sky-700">{angka(it.qty_returned)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-red-600">{angka(it.qty_lost)}</td>
                              <td className="px-4 py-3 text-right font-bold tabular-nums">{angka(sisa)}</td>
                              <td className="px-4 py-3 text-right text-xs tabular-nums">{rupiah(it.selling_price)}</td>
                            </tr>
                          );
                        })}
                        {(detail.items||[]).length === 0 && <PosEmpty colSpan={7} text="Belum ada item"/>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {(detail.status || detail.header?.status) === 'ACTIVE' && (
                  <div className="bg-surface-2 border border-line rounded-xl p-3">
                    <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-2">CATAT MUTASI</div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <PosSelect size="md" value={moveForm.item_id} onChange={v=>setMoveForm({...moveForm, item_id:v})}>
                        <option value="">Pilih item</option>
                        {(detail.items||[]).map(it=> <option key={it.id} value={String(it.id)}>{it.product_name}</option>)}
                      </PosSelect>
                      <PosSelect size="md" value={moveForm.type} onChange={v=>setMoveForm({...moveForm, type:v})}>
                        <option value="SOLD">TERJUAL</option>
                        <option value="RETURNED">DIKEMBALIKAN</option>
                        <option value="LOST">HILANG</option>
                      </PosSelect>
                      <input type="number" min="1" value={moveForm.qty} onChange={e=>setMoveForm({...moveForm, qty:e.target.value})}
                        className={posInput+' h-[42px] text-right tabular-nums'} placeholder="Qty"/>
                      <button onClick={postMovement} className={posBtnPrimary}>Catat</button>
                    </div>
                    <input value={moveForm.notes} onChange={e=>setMoveForm({...moveForm, notes:e.target.value})} placeholder="Catatan (opsional)"
                      className={posInput+' mt-2'}/>
                  </div>
                )}

                {(detail.movements||[]).length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-2">RIWAYAT MUTASI</div>
                    <div className="space-y-1">
                      {detail.movements.map(m=>(
                        <div key={m.id} className="flex items-center justify-between gap-2 text-xs bg-surface-2 border border-line rounded-lg px-3 py-2">
                          <span className="text-ink-2">{m.name || m.product_name}</span>
                          <span className="flex items-center gap-2">
                            <PosBadge tone={m.type==='SOLD' ? 'emerald' : m.type==='RETURNED' ? 'sky' : 'red'}>{m.type}</PosBadge>
                            <b className="tabular-nums text-ink">{angka(m.qty)}</b>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
