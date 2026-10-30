import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Search, RefreshCw, Plus, X, Pencil, PackagePlus, Info, Boxes, Warehouse,
  AlertTriangle, Layers, Barcode,
  ImagePlus, Upload, Trash2, Loader2,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 12;
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + angka(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;

const STOK_FILTERS = ['Semua','ADA STOK','STOK KOSONG','DI BAWAH MINIMUM'];
const emptyForm = ()=>({
  sku:'', barcode:'', name:'', category_id:'', base_unit_id:'', tax_id:'',
  min_stock:'', max_stock:'', reorder_point:'', description:'', image_url:'',
});
const FOTO_MAX = 3 * 1024 * 1024;
const FOTO_MIME = ['image/jpeg','image/png','image/webp'];
const fileKeBase64 = (file)=> new Promise((resolve,reject)=>{
  const fr = new FileReader();
  fr.onload = ()=> resolve(String(fr.result).split(',')[1] || '');
  fr.onerror = ()=> reject(new Error('Gagal membaca berkas'));
  fr.readAsDataURL(file);
});

export default function MasterProducts(){
  const dialog = useDialog();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [cats, setCats] = useState([]);
  const [units, setUnits] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [category, setCategory] = useState('');
  const [stokFilter, setStokFilter] = useState('Semua');
  const [page, setPage] = useState(1);

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [fotoBusy, setFotoBusy] = useState(false);
  const fotoRef = useRef(null);
  const [detail, setDetail] = useState(null);        // stok per gudang (di modal edit)
  const [detailBusy, setDetailBusy] = useState(false);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
      if (appliedQ) params.search = appliedQ;
      if (category) params.category = category;
      const r = await api.get('/master/products', { params });
      setData(Array.isArray(r.data?.data) ? r.data.data : []);
      setTotal(Number(r.data?.total) || 0);
    }catch(e){ setData([]); setTotal(0); setErr(e.response?.data?.error || e.message || 'Gagal memuat produk'); }
    finally{ setLoading(false); }
  },[appliedQ,category,page]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,category,stokFilter]);

  useEffect(()=>{
    (async ()=>{
      const [c,u,t] = await Promise.all([
        api.get('/master/categories').catch(()=>({ data:[] })),
        api.get('/master/units').catch(()=>({ data:[] })),
        api.get('/master/taxes').catch(()=>({ data:[] })),
      ]);
      setCats(Array.isArray(c.data)? c.data : []);
      setUnits(Array.isArray(u.data)? u.data : []);
      setTaxes(Array.isArray(t.data)? t.data : []);
    })();
  },[]);

  /* --------------------------------------------------------------- derived */
  const statusStok = (p)=>{
    const onhand = num(p.stock_onhand);
    if (onhand <= 0) return 'STOK KOSONG';
    if (onhand <= num(p.reorder_point)) return 'DI BAWAH MINIMUM';
    return 'ADA STOK';
  };
  const STATUS_TONE = { 'ADA STOK':'emerald', 'STOK KOSONG':'red', 'DI BAWAH MINIMUM':'amber' };

  const rows = stokFilter==='Semua' ? data : data.filter(p=> statusStok(p)===stokFilter);
  const totalNilai = data.reduce((a,p)=> a + num(p.stock_value), 0);
  const adaStok = data.filter(p=> num(p.stock_onhand) > 0).length;
  const kosong = data.filter(p=> num(p.stock_onhand) <= 0).length;
  const kritis = data.filter(p=> statusStok(p)==='DI BAWAH MINIMUM').length;

  /* --------------------------------------------------------------- actions */
  const openCreate = ()=>{
    setEditing(null); setDetail(null); setFormErr('');
    setForm({ ...emptyForm(), category_id: cats[0]? String(cats[0].id):'', base_unit_id: units[0]? String(units[0].id):'', tax_id: taxes[0]? String(taxes[0].id):'', min_stock:'10', reorder_point:'20' });
    setShow(true);
  };

  const openEdit = async (p)=>{
    setEditing(p); setFormErr(''); setDetail(null); setShow(true);
    setForm({
      sku:p.sku||'', barcode:p.barcode||'', name:p.name||'',
      category_id: p.category_id? String(p.category_id):'', base_unit_id: p.base_unit_id? String(p.base_unit_id):'',
      tax_id: p.tax_id? String(p.tax_id):'', min_stock: p.min_stock!=null? String(p.min_stock):'',
      max_stock: p.max_stock!=null? String(p.max_stock):'', reorder_point: p.reorder_point!=null? String(p.reorder_point):'',
      description: p.description||'', image_url: p.image_url||'',
    });
    // stok per gudang: inti dari kebingungan "barang ini stoknya di mana?"
    setDetailBusy(true);
    try{ const r = await api.get('/master/products/'+p.id); setDetail(r.data); }
    catch(e){ setDetail(null); }
    finally{ setDetailBusy(false); }
  };

  const pilihFoto = async (file)=>{
    if(!file) return;
    setFormErr('');
    if(!FOTO_MIME.includes(file.type)){ setFormErr('Foto harus JPG, PNG, atau WEBP'); return; }
    if(file.size > FOTO_MAX){ setFormErr('Ukuran foto maksimal 3 MB'); return; }
    setFotoBusy(true);
    try{
      const data = await fileKeBase64(file);
      const r = await api.post('/master/products/photo', { name:file.name, mime:file.type, data });
      setForm(f=>({ ...f, image_url: r.data.url }));
    }catch(e){ setFormErr(e.response?.data?.error||e.message||'Gagal mengunggah foto'); }
    finally{ setFotoBusy(false); }
  };

  const submit = async (e)=>{
    e.preventDefault();
    if (!String(form.sku).trim() || !String(form.name).trim()){ setFormErr('SKU dan nama produk wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    const payload = {
      sku: String(form.sku).trim().toUpperCase(), barcode: form.barcode||null, name: String(form.name).trim(),
      category_id: form.category_id? parseInt(form.category_id):null,
      base_unit_id: form.base_unit_id? parseInt(form.base_unit_id):null,
      tax_id: form.tax_id? parseInt(form.tax_id):null,
      min_stock: form.min_stock===''? null : num(form.min_stock),
      max_stock: form.max_stock===''? null : num(form.max_stock),
      reorder_point: form.reorder_point===''? null : num(form.reorder_point),
      description: form.description||null,
      image_url: form.image_url||null,
    };
    try{
      if (editing) await api.put('/master/products/'+editing.id, payload);
      else await api.post('/master/products', payload);
      setShow(false);
      await dialog.alert(editing ? 'Produk '+payload.name+' diperbarui.' : 'Produk '+payload.name+' ditambahkan.\n\nStoknya masih 0 - tambahkan lewat tombol "Tambah Stok".',
        { title: editing? 'Tersimpan' : 'Produk Baru' });
      load();
    }catch(e){
      setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan produk');
    }finally{ setSaving(false); }
  };

  const tambahStok = (p)=> navigate('/inventory/stock-in' + (p ? '?product_id='+p.id : ''));

  /* --------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader icon={Package} title="Katalog Produk"
        subtitle="Identitas barang: nama, SKU, satuan, harga jual, batas minimum. Jumlah stok diatur di halaman Stok / Penambahan Stok."
        badge={`${total} produk`}
        actions={<>
          <button onClick={()=>navigate('/inventory/stocks')} className={posBtnSecondary+' h-9 px-4 text-xs'}><Boxes size={14}/> Lihat Stok</button>
          <button onClick={()=>tambahStok(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}><PackagePlus size={14}/> Tambah Stok</button>
          <button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Produk Baru</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Package} tone="bg-[#0051d5]/10 text-[#0051d5]" label="TOTAL PRODUK" value={angka(total)} sub="katalog aktif"/>
        <PosStat icon={Boxes} tone="bg-emerald-50 text-emerald-700" label="ADA STOK" value={angka(adaStok)} sub={`${angka(kosong)} produk stoknya 0`}/>
        <PosStat icon={AlertTriangle} tone="bg-amber-50 text-amber-700" label="DI BAWAH MINIMUM" value={angka(kritis)} sub="perlu segera ditambah"/>
        <PosStat icon={Layers} tone="bg-sky-50 text-sky-700" label="NILAI STOK" value={rupiah(totalNilai)} sub="halaman ini saja (per halaman)"/>
      </div>

      <PosCard>
        <PosCardBody className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-[#0051d5]/10 text-[#0051d5] shrink-0"><Info size={14}/></span>
          <div className="text-xs text-[#45464d] leading-relaxed">
            <b className="text-[#0b1c30]">Produk vs Stok.</b> Halaman ini hanya <b>katalog</b> - mendaftarkan barang, satuan, harga jual, dan batas minimum.
            Jumlah stok tidak diketik di sini: stok bertambah lewat <b>Penambahan Stok</b> (stok awal, pembelian tanpa PO) atau <b>Goods Receipt</b> (dari PO),
            dan berkurang lewat <b>POS / Sales Order</b>, <b>Susut &amp; Pecah</b>, atau <b>Transfer</b>. Klik <b>Tambah Stok</b> pada baris produk untuk langsung menambah stoknya.
          </div>
        </PosCardBody>
      </PosCard>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); load(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari nama / SKU / barcode lalu Enter..." className={posInput+' pl-9'}/>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={category} onChange={setCategory}>
                <option value="">Semua Kategori</option>
                {cats.map(c=> <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </PosSelect>
            </div>
          </PosToolbar>

          <PosChipRow label="STOK">
            {STOK_FILTERS.map(f=> <PosChip key={f} active={stokFilter===f} onClick={()=>setStokFilter(f)}>{f==='Semua'?'Semua':f}</PosChip>)}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? (
          <PosEmpty text={data.length ? 'Tidak ada produk pada filter ini' : 'Belum ada produk di katalog'}/>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                  <PosTh>PRODUK</PosTh><PosTh>KATEGORI</PosTh><PosTh align="center">SATUAN</PosTh>
                  <PosTh align="right">HARGA JUAL</PosTh><PosTh align="right">STOK</PosTh>
                  <PosTh align="right">MIN / REORDER</PosTh><PosTh align="center">STATUS STOK</PosTh>
                  <PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {rows.map(p=>{
                    const st = statusStok(p);
                    return (
                      <tr key={p.id} className="border-b border-[#e5eeff] hover:bg-[#eff4ff] transition bg-white">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#eff4ff] border border-[#e7ecf7] overflow-hidden grid place-items-center shrink-0">
                              {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover"/> : <span className="text-[9px] font-bold text-[#76777d]">{(p.sku||'?').slice(0,4)}</span>}
                            </div>
                            <div className="min-w-0">
                          <div className="font-semibold text-[#0b1c30]">{p.name}</div>
                          <div className="text-[11px] text-[#45464d] flex items-center gap-2 flex-wrap">
                            <span className="font-mono">{p.sku}</span>
                            {p.barcode && <span className="inline-flex items-center gap-1"><Barcode size={11}/> {p.barcode}</span>}
                          </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#2b3445]">{p.category_name||'-'}</td>
                        <td className="px-4 py-3.5 text-center text-xs"><PosBadge tone="slate">{p.unit_code||'-'}</PosBadge></td>
                        <td className="px-4 py-3.5 text-right tabular-nums">{p.base_price>0 ? rupiah(p.base_price) : <span className="text-[#76777d]">belum diisi</span>}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="font-bold tabular-nums text-[#0b1c30]">{angka(p.stock_onhand)}</div>
                          <div className="text-[11px] text-[#45464d]">
                            {p.stock_warehouses>1 ? p.stock_warehouses+' gudang' : p.stock_warehouses===1 ? '1 gudang' : 'belum ada baris stok'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right text-xs tabular-nums text-[#45464d]">
                          {angka(p.min_stock)} / {angka(p.reorder_point)}
                        </td>
                        <td className="px-4 py-3.5 text-center"><PosBadge tone={STATUS_TONE[st]}>{st}</PosBadge></td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={()=>tambahStok(p)} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'} title="Tambah / sesuaikan stok produk ini">
                              <PackagePlus size={13}/> Stok
                            </button>
                            <button onClick={()=>openEdit(p)} className={posBtnSm}><Pencil size={13}/> Edit</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > 0 && <PosCardBody><PosPager page={page} setPage={setPage} total={total} size={PAGE_SIZE} unit="produk"/></PosCardBody>}
          </>
        )}
      </PosCard>

      {/* -------------------------------------------------------- modal produk */}
      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-raised overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">{editing ? 'Edit Produk' : 'Produk Baru'}</h3>
                <div className="text-xs text-[#45464d] mt-0.5">{editing ? (editing.name+' • '+editing.sku) : 'Daftarkan barang ke katalog. Stok ditambahkan setelah produk dibuat.'}</div>
              </div>
              <button type="button" onClick={()=>setShow(false)} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>

            <div className="p-4 space-y-3 overflow-auto">
              {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}

              <div className="grid sm:grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">SKU / KODE *</span>
                  <input value={form.sku} onChange={e=>setForm({...form, sku:e.target.value})} placeholder="mis. SEM-40" className={posInput}/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">BARCODE</span>
                  <input value={form.barcode} onChange={e=>setForm({...form, barcode:e.target.value})} placeholder="opsional" className={posInput}/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">SATUAN</span>
                  <PosSelect size="md" value={form.base_unit_id} onChange={v=>setForm({...form, base_unit_id:v})}>
                    <option value="">Pilih satuan</option>
                    {units.map(u=> <option key={u.id} value={u.id}>{u.code} • {u.name}</option>)}
                  </PosSelect></label>
              </div>

              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA PRODUK *</span>
                <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="mis. Semen Gresik 40kg" className={posInput}/></label>

              <div className="grid sm:grid-cols-2 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">KATEGORI</span>
                  <PosSelect size="md" value={form.category_id} onChange={v=>setForm({...form, category_id:v})}>
                    <option value="">Tanpa kategori</option>
                    {cats.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">PAJAK</span>
                  <PosSelect size="md" value={form.tax_id} onChange={v=>setForm({...form, tax_id:v})}>
                    <option value="">Tanpa pajak</option>
                    {taxes.map(t=> <option key={t.id} value={t.id}>{t.name} ({num(t.rate)}%)</option>)}
                  </PosSelect></label>
              </div>

              <div>
                <span className="text-[11px] font-bold tracking-wider text-[#45464d] block mb-1">FOTO BARANG</span>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-xl bg-[#eff4ff] border border-[#e7ecf7] overflow-hidden grid place-items-center shrink-0">
                    {form.image_url
                      ? <img src={form.image_url} alt="Foto produk" className="w-full h-full object-cover"/>
                      : <ImagePlus size={22} className="text-[#76777d]"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={()=>fotoRef.current?.click()} disabled={fotoBusy}
                        className={posBtnSm+' bg-[#0051d5] text-white hover:bg-[#003ea8] disabled:opacity-50'}>
                        {fotoBusy ? <><Loader2 size={13} className="animate-spin"/> Mengunggah...</> : <><Upload size={13}/> {form.image_url?'Ganti foto':'Unggah foto'}</>}
                      </button>
                      {form.image_url && (
                        <button type="button" onClick={()=>setForm(f=>({...f, image_url:''}))} className={posBtnSm+' text-red-600 hover:bg-red-50'}>
                          <Trash2 size={13}/> Hapus
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#76777d] mt-1.5">JPG / PNG / WEBP, maksimal 3 MB. Dipakai di katalog &amp; POS.</p>
                  </div>
                  <input ref={fotoRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
                    onChange={e=>{ pilihFoto(e.target.files?.[0]); e.target.value=''; }}/>
                </div>
              </div>

              <div className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wider text-[#45464d]">BATAS STOK (ALARM)</span>
                  <span className="text-[11px] text-[#76777d]">dipakai untuk badge KRITIS / WASPADA</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">MINIMUM</span>
                    <input type="number" value={form.min_stock} onChange={e=>setForm({...form, min_stock:e.target.value})} placeholder="10" className={posInput+' text-right tabular-nums'}/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">REORDER POINT</span>
                    <input type="number" value={form.reorder_point} onChange={e=>setForm({...form, reorder_point:e.target.value})} placeholder="20" className={posInput+' text-right tabular-nums'}/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">MAKSIMUM</span>
                    <input type="number" value={form.max_stock} onChange={e=>setForm({...form, max_stock:e.target.value})} placeholder="opsional" className={posInput+' text-right tabular-nums'}/></label>
                </div>
                <div className="text-[11px] text-[#45464d]">Stok di bawah <b>reorder point</b> ditandai KRITIS. Harga jual diatur di <b>Pricing Engine</b>, harga beli dari pembelian/penambahan stok.</div>
              </div>

              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">DESKRIPSI</span>
                <input value={form.description} onChange={e=>setForm({...form, description:e.target.value})} placeholder="opsional" className={posInput}/></label>

              {editing && (
                <div className="rounded-xl border border-[#e7ecf7] overflow-hidden">
                  <div className="bg-[#eff4ff] px-3 py-2 border-b border-[#e7ecf7] flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-wider text-[#45464d]">STOK PER GUDANG</span>
                    <button type="button" onClick={()=>tambahStok(editing)} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}>
                      <PackagePlus size={13}/> Tambah Stok
                    </button>
                  </div>
                  {detailBusy ? <PosSkeleton rows={2} cols={3}/> : (
                    <div className="divide-y divide-[#e5eeff]">
                      {(detail?.stocks||[]).length ? detail.stocks.map(s=>(
                        <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Warehouse size={14} className="text-[#45464d]"/>
                            <span className="text-[#2b3445]">{s.warehouse_code||''} {s.warehouse_name||''}</span>
                            {s.batch_no && <PosBadge tone="slate">batch {s.batch_no}</PosBadge>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[#45464d]">avg {rupiah(s.avg_cost)}</span>
                            <span className="font-bold tabular-nums">{angka(s.qty_on_hand)}</span>
                          </div>
                        </div>
                      )) : (
                        <div className="px-3 py-4 text-center text-xs text-[#76777d]">
                          Belum ada baris stok untuk produk ini - klik "Tambah Stok" untuk mengisi stok awal.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 border-t flex justify-end gap-2">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} {editing ? 'Simpan Perubahan' : 'Simpan Produk'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
