import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tags, Search, RefreshCw, Plus, X, ShieldAlert, Percent, Save, Sparkles, Tag,
  Layers, Building2, Calculator, CheckCircle2, History,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const TYPE_LABEL = { RETAIL:'Retail', WHOLESALE:'Grosir', CONTRACTOR:'Kontraktor', PROJECT:'Proyek' };
const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));

export default function Pricing(){
  const dialog = useDialog();
  const [tab, setTab] = useState('list');            // list | customer | floor | promo | check
  const [lists, setLists] = useState([]);
  const [selList, setSelList] = useState('');
  const [items, setItems] = useState([]);
  const [customerPrices, setCustomerPrices] = useState([]);
  const [floorRows, setFloorRows] = useState([]);
  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState('');            // item | customer | promo
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [itemForm, setItemForm] = useState({ product_id:'', price:'', min_qty:'1' });
  const [cpForm, setCpForm] = useState({ customer_id:'', product_id:'', price:'', valid_from:'', valid_to:'' });
  const [promoForm, setPromoForm] = useState({ code:'', name:'', type:'PERCENT', start_date:'', end_date:'', percent:'', min_qty:'' });
  const [floorEdit, setFloorEdit] = useState({});    // { [product_id]: value }
  const [check, setCheck] = useState({ customer_id:'', project_id:'', product_id:'', qty:'10' });
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  /* --------------------------------------------------------------- loading */
  const loadAll = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const [l, cp, fl, pr, pd, cu] = await Promise.all([
        api.get('/pricing/lists').catch(()=>({ data:[] })),
        api.get('/pricing/customer-prices').catch(()=>({ data:[] })),
        api.get('/pricing/floor-prices').catch(()=>({ data:[] })),
        api.get('/pricing/promotions').catch(()=>({ data:[] })),
        api.get('/master/products', { params:{ limit:200 } }).catch(()=>({ data:{ data:[] } })),
        api.get('/master/customers', { params:{ limit:200 } }).catch(()=>({ data:{ data:[] } })),
      ]);
      setLists(Array.isArray(l.data)? l.data : []);
      setCustomerPrices(Array.isArray(cp.data)? cp.data : []);
      setFloorRows(Array.isArray(fl.data)? fl.data : []);
      setPromos(Array.isArray(pr.data)? pr.data : []);
      setProducts(Array.isArray(pd.data?.data)? pd.data.data : (Array.isArray(pd.data)? pd.data : []));
      setCustomers(Array.isArray(cu.data?.data)? cu.data.data : (Array.isArray(cu.data)? cu.data : []));
      if (!selList && Array.isArray(l.data) && l.data.length) setSelList(String(l.data[0].id));
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal memuat data pricing'); }
    finally{ setLoading(false); }
  },[selList]);

  useEffect(()=>{ loadAll(); },[]);   // sekali saat mount
  useEffect(()=>{ api.get('/projects').then(r=> setProjects(Array.isArray(r.data)? r.data : [])).catch(()=> setProjects([])); },[]);
  useEffect(()=>{ setPage(1); },[appliedQ,tab,selList]);

  const loadItems = useCallback(async ()=>{
    if (!selList){ setItems([]); return; }
    try{ const r = await api.get('/pricing/lists/'+selList+'/items'); setItems(Array.isArray(r.data)? r.data : []); }
    catch(e){ setItems([]); }
  },[selList]);
  useEffect(()=>{ loadItems(); },[loadItems]);

  const loadHistory = useCallback(async (productId)=>{
    try{ const r = await api.get('/pricing/history', { params:{ product_id: productId||undefined } }); setHistory(Array.isArray(r.data)? r.data : []); }
    catch(e){ setHistory([]); }
  },[]);

  /* --------------------------------------------------------------- derived */
  const filtered = useMemo(()=>{
    const s = appliedQ.trim().toLowerCase();
    if (tab==='list') return items.filter(it=> !s || String(it.product_name||'').toLowerCase().includes(s) || String(it.sku||'').toLowerCase().includes(s));
    if (tab==='customer') return customerPrices.filter(cp=> !s || String(cp.customer_name||'').toLowerCase().includes(s) || String(cp.product_name||'').toLowerCase().includes(s));
    if (tab==='floor') return floorRows.filter(f=> !s || String(f.name||'').toLowerCase().includes(s) || String(f.sku||'').toLowerCase().includes(s));
    if (tab==='promo') return promos.filter(p=> !s || String(p.name||'').toLowerCase().includes(s) || String(p.code||'').toLowerCase().includes(s));
    return [];
  },[tab,items,customerPrices,floorRows,promos,appliedQ]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  const safePage = Math.min(Math.max(1,page), totalPages);
  const pageRows = filtered.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);

  const activePromos = promos.filter(p=> p.is_active).length;
  const avgDiscount = customerPrices.length
    ? customerPrices.reduce((a,c)=>{
        const prod = products.find(p=> p.id===c.product_id);
        const base = Number(prod?.selling_price)||0;
        return a + (base>0 ? ((base-Number(c.price))/base*100) : 0);
      },0)/customerPrices.length
    : 0;

  /* --------------------------------------------------------------- actions */
  const addItem = async (e)=>{
    e.preventDefault();
    if (!itemForm.product_id || !itemForm.price){ setFormErr('Produk dan harga wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/pricing/lists/'+selList+'/items', {
        product_id:parseInt(itemForm.product_id), price:parseFloat(itemForm.price), min_qty:parseInt(itemForm.min_qty)||1, unit_id:1 });
      setModal(''); loadItems();
      await dialog.alert('Item harga ditambahkan ke price list.', { title:'Tersimpan' });
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan item'); }
    finally{ setSaving(false); }
  };

  const addCustomerPrice = async (e)=>{
    e.preventDefault();
    if (!cpForm.customer_id || !cpForm.product_id || !cpForm.price){ setFormErr('Customer, produk, dan harga wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/pricing/customer-prices', {
        customer_id:parseInt(cpForm.customer_id), product_id:parseInt(cpForm.product_id),
        price:parseFloat(cpForm.price), valid_from:cpForm.valid_from||null, valid_to:cpForm.valid_to||null });
      setModal('');
      const r = await api.get('/pricing/customer-prices'); setCustomerPrices(Array.isArray(r.data)? r.data : []);
      await dialog.alert('Harga khusus customer disimpan (tercatat di audit log).', { title:'Tersimpan' });
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan harga customer'); }
    finally{ setSaving(false); }
  };

  const addPromo = async (e)=>{
    e.preventDefault();
    if (!promoForm.code || !promoForm.name){ setFormErr('Kode dan nama promo wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/pricing/promotions', {
        code:promoForm.code.toUpperCase(), name:promoForm.name, type:promoForm.type,
        start_date:promoForm.start_date||null, end_date:promoForm.end_date||null,
        conditions:{ min_qty:parseInt(promoForm.min_qty)||0 },
        benefits:{ percent:parseFloat(promoForm.percent)||0 } });
      setModal('');
      const r = await api.get('/pricing/promotions'); setPromos(Array.isArray(r.data)? r.data : []);
      await dialog.alert('Promo '+promoForm.code.toUpperCase()+' dibuat.', { title:'Tersimpan' });
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan promo'); }
    finally{ setSaving(false); }
  };

  const saveFloor = async (row)=>{
    const val = floorEdit[row.id];
    if (val===undefined) return;
    setBusy('floor-'+row.id);
    try{
      await api.put('/pricing/floor-prices/'+row.id, { floor_price:parseFloat(val)||0 });
      const r = await api.get('/pricing/floor-prices'); setFloorRows(Array.isArray(r.data)? r.data : []);
      setFloorEdit(f=>{ const c={...f}; delete c[row.id]; return c; });
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal menyimpan floor price' }); }
    finally{ setBusy(''); }
  };

  const runCheck = async (e)=>{
    e.preventDefault();
    if (!check.product_id){ await dialog.alert('Pilih produk dulu.', { title:'Validasi' }); return; }
    setChecking(true); setCheckResult(null);
    try{
      const r = await api.post('/pricing/check', {
        customer_id:parseInt(check.customer_id)||null, project_id:parseInt(check.project_id)||null,
        product_id:parseInt(check.product_id), qty:parseFloat(check.qty)||1 });
      setCheckResult(r.data);
      loadHistory(parseInt(check.product_id));
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal cek harga' }); }
    finally{ setChecking(false); }
  };

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const dataset = tab==='customer' ? 'customer-prices' : tab==='floor' ? 'floor' : tab==='list' && !selList ? 'lists' : 'items';
      const params = { format, dataset };
      if (dataset==='items' && selList) params.list_id = selList;
      const r = await api.get('/pricing/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = dataset + '-pricing.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  const selListObj = lists.find(l=> String(l.id)===String(selList));

  /* ---------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={Tags}
        title="Pricing Engine"
        subtitle="Harga bertingkat: price list per tipe customer • override per customer • floor price • promo"
        badge={lists.length + ' price list'}
        actions={<>
          <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Harga"/>
          {tab==='list' && <button onClick={()=>{ setFormErr(''); setItemForm({ product_id:'', price:'', min_qty:'1' }); setModal('item'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Item Harga</button>}
          {tab==='customer' && <button onClick={()=>{ setFormErr(''); setCpForm({ customer_id:'', product_id:'', price:'', valid_from:'', valid_to:'' }); setModal('customer'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Harga Customer</button>}
          {tab==='promo' && <button onClick={()=>{ setFormErr(''); setPromoForm({ code:'', name:'', type:'PERCENT', start_date:'', end_date:'', percent:'', min_qty:'' }); setModal('promo'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Promo</button>}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Layers} tone="bg-brand/10 text-brand" label="PRICE LIST" value={lists.length + ' daftar'} sub={Object.keys(TYPE_LABEL).filter(t=> lists.some(l=> l.type===t)).map(t=> TYPE_LABEL[t]).join(' • ')||'-'}/>
        <PosStat icon={Building2} tone="bg-sky-50 text-sky-700" label="HARGA KHUSUS" value={customerPrices.length + ' baris'} sub={'rata-rata diskon '+avgDiscount.toFixed(1)+'%'}/>
        <PosStat icon={ShieldAlert} tone="bg-amber-50 text-amber-700" label="FLOOR PRICE" value={floorRows.length + ' produk'} sub="batas bawah harga jual"/>
        <PosStat icon={Sparkles} tone="bg-emerald-50 text-emerald-700" label="PROMO" value={promos.length + ' program'} sub={activePromos+' sedang aktif'}/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); loadAll(); loadItems(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari produk / customer / kode promo lalu Enter..." className={posInput+' pl-9'}/>
            </div>
          </PosToolbar>

          <PosChipRow label="LIHAT">
            <PosChip active={tab==='list'} onClick={()=>setTab('list')}>Price List</PosChip>
            <PosChip active={tab==='customer'} onClick={()=>setTab('customer')}>Harga Customer</PosChip>
            <PosChip active={tab==='floor'} onClick={()=>setTab('floor')}>Floor Price</PosChip>
            <PosChip active={tab==='promo'} onClick={()=>setTab('promo')}>Promo</PosChip>
            <PosChip active={tab==='check'} onClick={()=>setTab('check')}>Cek Harga</PosChip>
          </PosChipRow>
        </PosCardBody>
      </PosCard>

      {/* -------------------------------------------------------- price list */}
      {tab==='list' && (
        <div className="grid lg:grid-cols-4 gap-3 items-start">
          <PosCard className="lg:col-span-1">
            <PosCardBody className="space-y-2">
              <div className="text-[11px] font-bold tracking-wider text-ink-2">DAFTAR HARGA</div>
              {lists.map(l=>(
                <button key={l.id} onClick={()=>setSelList(String(l.id))}
                  className={'w-full text-left px-3 py-2 rounded-xl border transition '+(String(selList)===String(l.id)?'bg-brand text-white border-brand shadow':'bg-surface-2 border-line hover:bg-white')}>
                  <div className="text-sm font-bold">{l.code}</div>
                  <div className={'text-[11px] '+(String(selList)===String(l.id)?'text-white/80':'text-ink-2')}>{l.name} • {TYPE_LABEL[l.type]||l.type}</div>
                </button>
              ))}
              {!lists.length && !loading && <div className="text-xs text-ink-3">Belum ada price list.</div>}
            </PosCardBody>
          </PosCard>

          <PosCard className="lg:col-span-3">
            <PosCardBody className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold tracking-wider text-ink-2">ITEM HARGA</div>
                <div className="text-sm font-bold text-ink">{selListObj ? selListObj.name+' ('+(TYPE_LABEL[selListObj.type]||selListObj.type)+')' : 'Pilih price list'}</div>
              </div>
              <PosBadge tone="slate">{total} item</PosBadge>
            </PosCardBody>
            {loading ? <PosSkeleton rows={5} cols={4}/> : err ? <PosError message={err} onRetry={loadAll}/> : (
              <>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                      <PosTh>PRODUK</PosTh><PosTh>SKU</PosTh><PosTh align="right">MIN QTY</PosTh><PosTh align="right">HARGA</PosTh>
                    </tr></thead>
                    <tbody>
                      {pageRows.map(it=>(
                        <tr key={it.id} className={posTr}>
                          <td className={posTd+' font-bold text-ink'}>{it.product_name}</td>
                          <td className={posTd+' font-mono text-xs text-ink-2'}>{it.sku||'-'}</td>
                          <td className={posTd+' text-right tabular-nums'}>{Number(it.min_qty)||1}</td>
                          <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(it.price)}</td>
                        </tr>
                      ))}
                      {!pageRows.length && <PosEmpty colSpan={4} text="Belum ada item di price list ini"/>}
                    </tbody>
                  </table>
                </div>
                {total>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit="item"/></PosCardBody>}
              </>
            )}
          </PosCard>
        </div>
      )}

      {/* ---------------------------------------------------- harga customer */}
      {tab==='customer' && (
        <PosCard>
          <PosCardBody className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold tracking-wider text-ink-2">HARGA KHUSUS PER CUSTOMER</div>
            <PosBadge tone="slate">{total} baris</PosBadge>
          </PosCardBody>
          {loading ? <PosSkeleton rows={5} cols={5}/> : (
            <>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                    <PosTh>CUSTOMER</PosTh><PosTh>PRODUK</PosTh><PosTh>SKU</PosTh>
                    <PosTh align="right">HARGA KHUSUS</PosTh><PosTh align="center">BERLAKU</PosTh>
                  </tr></thead>
                  <tbody>
                    {pageRows.map(cp=>{
                      const valid = !cp.valid_to || new Date(cp.valid_to) >= new Date();
                      return (
                        <tr key={cp.id} className={posTr}>
                          <td className={posTd+' font-bold text-ink'}>{cp.customer_name}</td>
                          <td className={posTd}>{cp.product_name}</td>
                          <td className={posTd+' font-mono text-xs text-ink-2'}>{cp.sku||'-'}</td>
                          <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(cp.price)}</td>
                          <td className={posTd+' text-center'}>
                            <PosBadge tone={valid?'emerald':'slate'}>
                              {cp.valid_from?String(cp.valid_from).slice(0,10):'-'} → {cp.valid_to?String(cp.valid_to).slice(0,10):'selamanya'}
                            </PosBadge>
                          </td>
                        </tr>
                      );
                    })}
                    {!pageRows.length && <PosEmpty colSpan={5} text="Belum ada harga khusus customer"/>}
                  </tbody>
                </table>
              </div>
              {total>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit="baris"/></PosCardBody>}
            </>
          )}
        </PosCard>
      )}

      {/* ------------------------------------------------------- floor price */}
      {tab==='floor' && (
        <PosCard>
          <PosCardBody className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-amber-50 text-amber-700 shrink-0"><ShieldAlert size={14}/></span>
            <div className="text-xs text-ink-2 leading-relaxed">
              <b className="text-ink">Floor price</b> = batas bawah harga jual. Kalau sales memberi harga di bawah angka ini,
              sistem menandai butuh approval. Isi floor price di bawah, perubahan tercatat di audit log.
            </div>
          </PosCardBody>
          {loading ? <PosSkeleton rows={5} cols={4}/> : (
            <>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                    <PosTh>PRODUK</PosTh><PosTh>SKU</PosTh><PosTh align="right">FLOOR PRICE</PosTh><PosTh align="right">UBAH</PosTh>
                  </tr></thead>
                  <tbody>
                    {pageRows.map(f=>(
                      <tr key={f.id} className={posTr}>
                        <td className={posTd+' font-bold text-ink'}>{f.name}</td>
                        <td className={posTd+' font-mono text-xs text-ink-2'}>{f.sku||'-'}</td>
                        <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(f.floor_price)}</td>
                        <td className={posTd}>
                          <div className="flex items-center justify-end gap-1.5">
                            <input type="number" value={floorEdit[f.id] ?? ''} placeholder={String(Math.round(Number(f.floor_price)||0))}
                              onChange={e=>setFloorEdit({...floorEdit, [f.id]:e.target.value})}
                              className={posInput+' w-[140px] text-right tabular-nums'}/>
                            <button onClick={()=>saveFloor(f)} disabled={floorEdit[f.id]===undefined || busy==='floor-'+f.id}
                              className={posBtnSm+' bg-brand text-white border-brand hover:bg-brand-strong disabled:opacity-40'}>
                              <Save size={13} className={busy==='floor-'+f.id?'animate-pulse':''}/> Simpan
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!pageRows.length && <PosEmpty colSpan={4} text="Belum ada produk dengan floor price"/>}
                  </tbody>
                </table>
              </div>
              {total>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit="produk"/></PosCardBody>}
            </>
          )}
        </PosCard>
      )}

      {/* ------------------------------------------------------------- promo */}
      {tab==='promo' && (
        <>
          {loading ? <PosCard><PosSkeleton rows={4} cols={4}/></PosCard> : !total ? (
            <PosCard><PosEmpty text="Belum ada promo"/></PosCard>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pageRows.map(p=>{
                const ben = p.benefits||{}, con = p.conditions||{};
                return (
                  <div key={p.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl grid place-items-center bg-emerald-50 text-emerald-700"><Tag size={15}/></span>
                        <div>
                          <div className="font-bold text-[14px] text-ink">{p.code}</div>
                          <div className="text-xs text-ink-2">{p.name}</div>
                        </div>
                      </div>
                      <PosBadge tone={p.is_active?'emerald':'slate'}>{p.is_active?'AKTIF':'NONAKTIF'}</PosBadge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <PosBadge tone="sky"><Percent size={11}/> {Number(ben.percent)||0}%</PosBadge>
                      {Number(con.min_qty)>0 && <PosBadge tone="slate">min {con.min_qty} qty</PosBadge>}
                      <PosBadge tone="slate">{p.type}</PosBadge>
                    </div>
                    <div className="mt-3 text-[11px] text-ink-2">
                      {p.start_date?String(p.start_date).slice(0,10):'-'} → {p.end_date?String(p.end_date).slice(0,10):'-'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* -------------------------------------------------------- cek harga */}
      {tab==='check' && (
        <div className="grid lg:grid-cols-3 gap-3 items-start">
          <PosCard className="lg:col-span-2">
            <PosCardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg grid place-items-center bg-brand/10 text-brand"><Calculator size={14}/></span>
                <div>
                  <div className="text-sm font-bold text-ink">Cek Harga Jual</div>
                  <div className="text-[11px] text-ink-2">Urutan prioritas: harga proyek → harga khusus customer → price list tipe → harga dasar</div>
                </div>
              </div>
              <form onSubmit={runCheck} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">CUSTOMER</span>
                  <PosSelect size="md" value={check.customer_id} onChange={v=>setCheck({...check, customer_id:v})}>
                    <option value="">Tanpa customer</option>
                    {customers.map(c=> <option key={c.id} value={c.id}>{c.name} ({c.type||'-'})</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">PROYEK</span>
                  <PosSelect size="md" value={check.project_id} onChange={v=>setCheck({...check, project_id:v})}>
                    <option value="">Tanpa proyek</option>
                    {projects.map(p=> <option key={p.id} value={p.id}>{p.project_code} {p.name}</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">PRODUK *</span>
                  <PosSelect size="md" value={check.product_id} onChange={v=>setCheck({...check, product_id:v})}>
                    <option value="">Pilih produk</option>
                    {products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">QTY</span>
                  <input type="number" value={check.qty} onChange={e=>setCheck({...check, qty:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                  <button disabled={checking} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                    {checking ? <RefreshCw size={14} className="animate-spin"/> : <Calculator size={14}/>} Cek Harga
                  </button>
                </div>
              </form>

              {checkResult && (
                <div className={'rounded-xl border p-4 '+(checkResult.below_floor?'border-red-200 bg-red-50':'border-emerald-200 bg-emerald-50')}>
                  <div className="flex items-center gap-2">
                    {checkResult.below_floor ? <ShieldAlert size={16} className="text-red-600"/> : <CheckCircle2 size={16} className="text-emerald-600"/>}
                    <span className="font-bold text-[18px] text-ink">{rupiah(checkResult.price)}</span>
                    <PosBadge tone={checkResult.below_floor?'red':'emerald'}>sumber: {checkResult.source}</PosBadge>
                  </div>
                  <div className="text-xs text-ink-2 mt-2">
                    Floor price: <b>{rupiah(checkResult.floor_price)}</b> • qty {checkResult._qty}
                  </div>
                  {checkResult.warning && <div className="text-xs text-red-700 mt-1 font-bold">{checkResult.warning}</div>}
                </div>
              )}
            </PosCardBody>
          </PosCard>

          <PosCard>
            <PosCardBody>
              <div className="flex items-center gap-2">
                <History size={14} className="text-ink-2"/>
                <div className="text-[11px] font-bold tracking-wider text-ink-2">RIWAYAT PERUBAHAN HARGA</div>
              </div>
            </PosCardBody>
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <PosTh>TANGGAL</PosTh><PosTh>TABEL</PosTh><PosTh align="right">NILAI BARU</PosTh>
                </tr></thead>
                <tbody>
                  {history.map(h=>(
                    <tr key={h.id} className={posTr}>
                      <td className={posTd+' text-xs whitespace-nowrap'}>{String(h.changed_at||'').slice(0,10)}</td>
                      <td className={posTd+' text-xs'}>{h.table_name} #{h.record_id}</td>
                      <td className={posTd+' text-right tabular-nums'}>{h.new_value}</td>
                    </tr>
                  ))}
                  {!history.length && <PosEmpty colSpan={3} text="Belum ada riwayat - jalankan Cek Harga dulu"/>}
                </tbody>
              </table>
            </div>
          </PosCard>
        </div>
      )}

      {/* ---------------------------------------------------------- modals */}
      {modal==='item' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={addItem} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Item Harga</h3>
                <div className="text-xs text-ink-2 mt-0.5">Tambah produk ke {selListObj? selListObj.name : 'price list'}</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-line grid place-items-center text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">PRODUK *</span>
              <PosSelect size="md" value={itemForm.product_id} onChange={v=>setItemForm({...itemForm, product_id:v})}>
                <option value="">Pilih produk</option>
                {products.map(p=> <option key={p.id} value={p.id}>{p.name} {p.sku?('• '+p.sku):''}</option>)}
              </PosSelect></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">HARGA Rp *</span>
                <input type="number" value={itemForm.price} onChange={e=>setItemForm({...itemForm, price:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">MIN QTY</span>
                <input type="number" value={itemForm.min_qty} onChange={e=>setItemForm({...itemForm, min_qty:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {modal==='customer' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={addCustomerPrice} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Harga Khusus Customer</h3>
                <div className="text-xs text-ink-2 mt-0.5">Override harga untuk satu customer (tercatat di audit log)</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-line grid place-items-center text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">CUSTOMER *</span>
              <PosSelect size="md" value={cpForm.customer_id} onChange={v=>setCpForm({...cpForm, customer_id:v})}>
                <option value="">Pilih customer</option>
                {customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
              </PosSelect></label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">PRODUK *</span>
              <PosSelect size="md" value={cpForm.product_id} onChange={v=>setCpForm({...cpForm, product_id:v})}>
                <option value="">Pilih produk</option>
                {products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
              </PosSelect></label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">HARGA KHUSUS Rp *</span>
              <input type="number" value={cpForm.price} onChange={e=>setCpForm({...cpForm, price:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">BERLAKU DARI</span>
                <input type="date" value={cpForm.valid_from} onChange={e=>setCpForm({...cpForm, valid_from:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">SAMPAI</span>
                <input type="date" value={cpForm.valid_to} onChange={e=>setCpForm({...cpForm, valid_to:e.target.value})} className={posInput}/></label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {modal==='promo' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={addPromo} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Promo Baru</h3>
                <div className="text-xs text-ink-2 mt-0.5">Diskon persen dengan minimal qty (mis. beli 10 gratis ongkir)</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-line grid place-items-center text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">KODE *</span>
                <input value={promoForm.code} onChange={e=>setPromoForm({...promoForm, code:e.target.value})} placeholder="SEMEN10" className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">TIPE</span>
                <PosSelect size="md" value={promoForm.type} onChange={v=>setPromoForm({...promoForm, type:v})}>
                  <option value="PERCENT">Diskon persen</option>
                  <option value="AMOUNT">Potongan nominal</option>
                  <option value="BUNDLING">Bundling</option>
                </PosSelect></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-ink-2">NAMA PROMO *</span>
              <input value={promoForm.name} onChange={e=>setPromoForm({...promoForm, name:e.target.value})} placeholder="mis. Diskon Semen 10 sak" className={posInput}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">DISKON %</span>
                <input type="number" step="0.5" value={promoForm.percent} onChange={e=>setPromoForm({...promoForm, percent:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">MIN QTY</span>
                <input type="number" value={promoForm.min_qty} onChange={e=>setPromoForm({...promoForm, min_qty:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">MULAI</span>
                <input type="date" value={promoForm.start_date} onChange={e=>setPromoForm({...promoForm, start_date:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-2">SELESAI</span>
                <input type="date" value={promoForm.end_date} onChange={e=>setPromoForm({...promoForm, end_date:e.target.value})} className={posInput}/></label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} Simpan Promo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
