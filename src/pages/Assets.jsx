import { useEffect, useState, useCallback } from 'react';
import { FileText, Plus, Search, Pencil, Trash2, Wrench, TrendingDown, Banknote, X, PackageSearch, Wallet, Layers, AlertTriangle, Sparkles, CalendarClock, RefreshCw, Truck } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import { PosPageHeader, PosExportButtons } from '../components/PosUI';

/* ---------- helpers ---------- */
function rupiah(n){ return 'Rp '+new Intl.NumberFormat('id-ID').format(Math.round(n||0)); }
function fmtDate(d){ if(!d) return '-'; return String(d).slice(0,10); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function monthLabel(m,y){ const mm=String(m||0).padStart(2,'0'); return y? (mm+'/'+y) : mm; }

const FALLBACK_CATEGORIES=['BANGUNAN','KENDARAAN','ARMADA','ALAT','KANTOR'];
const FALLBACK_STATUSES=['ACTIVE','MAINTENANCE','DISPOSED'];
const STATUS_BADGE={
  ACTIVE:'bg-emerald-50 text-emerald-700 border-emerald-200',
  MAINTENANCE:'bg-amber-50 text-amber-700 border-amber-200',
  DISPOSED:'bg-red-50 text-red-700 border-red-200'
};
const STATUS_LABEL={ ACTIVE:'Aktif', MAINTENANCE:'Maintenance', DISPOSED:'Disposed' };
const METHOD_LABEL={ STRAIGHT:'Garis Lurus', DECLINING:'Saldo Menurun' };
const MAINT_TYPES=['PREVENTIVE','CORRECTIVE','MAINTENANCE'];

const CARD='bg-white rounded-xl border border-line shadow-card overflow-hidden p-5';
const INPUT='w-full h-[42px] px-3 bg-surface-2 border border-line rounded-xl text-sm outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition placeholder:text-ink-3';
const BTN_PRIMARY='h-[42px] px-5 bg-brand text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-card hover:bg-brand-strong active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY='h-[42px] px-5 bg-white border border-line rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2 active:scale-[0.98] transition';
const BTN_SM='h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-60';
const TH='px-4 py-3.5 text-[11px] font-bold tracking-wider text-ink-2';
const PAGE_SIZE=6;

function emptyForm(){
  return { asset_code:'', name:'', category:FALLBACK_CATEGORIES[0], acquisition_date:todayISO(), acquisition_cost:'', useful_life_years:'5', depreciation_method:'STRAIGHT', residual_value:'0', location:'', photo_url:'' };
}

function StatCard({ icon, label, value, tone }){
  return (
    <div className="bg-white rounded-xl border border-line shadow-card p-4">
      <div className="flex items-center gap-2">
        <div className={'w-8 h-8 rounded-xl grid place-items-center shrink-0 '+tone}>{icon}</div>
        <div className="text-[11px] font-bold tracking-wider text-ink-2 uppercase leading-tight">{label}</div>
      </div>
      <div className="mt-3 text-[17px] font-bold text-ink leading-none break-words">{value}</div>
    </div>
  );
}

export default function Assets(){
  const dialog=useDialog();

  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [summary,setSummary]=useState(null);
  const [meta,setMeta]=useState(null);
  // Penyusutan otomatis (garis lurus) → jurnal Dr Beban / Cr Akumulasi
  const [depBusy,setDepBusy]=useState(false);
  const [depInfo,setDepInfo]=useState(null);
  const thisPeriod = new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
  const loadDep = useCallback(()=>{
    api.get('/assets/depreciations',{params:{period:thisPeriod}})
      .then(r=>setDepInfo(r.data)).catch(()=>setDepInfo(null));
  },[thisPeriod]);
  useEffect(()=>{ loadDep(); },[loadDep]);
  const runDepreciation = async ()=>{
    const ok = await dialog.confirm(`Jalankan penyusutan aset periode ${thisPeriod}? Jurnal Dr Beban Penyusutan / Cr Akumulasi Penyusutan akan dibuat.`, { title:'Penyusutan bulan ini', confirmText:'Ya, jalankan' });
    if(!ok) return;
    setDepBusy(true);
    try{
      const r = await api.post('/assets/depreciation/run', { period: thisPeriod });
      await dialog.alert(r.data.message || 'Selesai.', { title:'Penyusutan', tone:'success' });
      loadDep(); load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menjalankan penyusutan' }); }
    finally{ setDepBusy(false); }
  };

  const [q,setQ]=useState('');
  const [dq,setDq]=useState('');
  const [category,setCategory]=useState('Semua');
  const [status,setStatus]=useState('Semua');
  const [sort,setSort]=useState('umur');
  const [page,setPage]=useState(1);

  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(emptyForm());
  const [saving,setSaving]=useState(false);
  const [formErr,setFormErr]=useState('');

  const [dep,setDep]=useState(null);
  const [depLoading,setDepLoading]=useState(false);
  const [showAllMonths,setShowAllMonths]=useState(false);
  const [posting,setPosting]=useState(false);

  const [maintAsset,setMaintAsset]=useState(null);
  const [maintRows,setMaintRows]=useState([]);
  const [maintTotal,setMaintTotal]=useState(0);
  const [maintLoading,setMaintLoading]=useState(false);
  const [maintSaving,setMaintSaving]=useState(false);
  const [maintForm,setMaintForm]=useState({ maintenance_date:todayISO(), type:'PREVENTIVE', cost:'', description:'' });

  const [dispAsset,setDispAsset]=useState(null);
  const [dispForm,setDispForm]=useState({ price:'', disposal_date:todayISO() });
  const [fleetBusy,setFleetBusy]=useState(false);
  const [dispSaving,setDispSaving]=useState(false);

  /* ---------- loading ---------- */
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await api.get('/assets',{ params:{ q:dq, category, status, sort } });
      setData(Array.isArray(r.data)? r.data : []);
    }catch(e){ setData([]); }
    finally{ setLoading(false); }
  },[dq,category,status,sort]);

  const loadSummary=useCallback(async()=>{
    try{ const r=await api.get('/assets/summary'); setSummary(r.data||null); }
    catch(e){ setSummary(null); }
  },[]);

  const loadMeta=useCallback(async()=>{
    try{ const r=await api.get('/assets/meta'); setMeta(r.data||null); }
    catch(e){ setMeta(null); }
  },[]);

  /* ---------- armada -> aset tetap ---------- */
  // Idempoten: aman diklik berkali-kali. Hanya armada ownership OWNED yang ditarik.
  const syncFleet=useCallback(async()=>{
    setFleetBusy(true);
    try{
      const r=await api.post('/assets/sync-fleet',{});
      const d=r.data||{};
      await dialog.alert(
        'Armada ditarik ke Aset Tetap.\n'+
        'Aset baru: '+((d.created)||0)+'\nDiperbarui: '+((d.updated)||0)+
        (d.skipped && d.skipped.length ? '\nDilewati: '+d.skipped.length+' (sudah DISPOSED)' : '')+
        '\nTotal aset kategori ARMADA: '+((d.armada_assets)||0)+
        (d.tanpa_harga_perolehan ? '\n\n'+d.tanpa_harga_perolehan+' armada belum punya harga perolehan - isi di halaman Armada agar depresiasi terhitung.' : ''),
        { title:'Tarik Armada' });
      load(); loadSummary(); loadMeta();
    }catch(e){
      await dialog.alert((e.response && e.response.data && e.response.data.error) || e.message || 'Gagal menarik data armada.', { title:'Gagal' });
    }finally{ setFleetBusy(false); }
  },[dialog,load,loadSummary,loadMeta]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ loadSummary(); loadMeta(); },[loadSummary,loadMeta]);
  useEffect(()=>{ const t=setTimeout(()=>setDq(q),400); return ()=>clearTimeout(t); },[q]);
  useEffect(()=>{ setPage(1); },[dq,category,status,sort]);

  /* ---------- derived ---------- */
  const categories=(meta && Array.isArray(meta.categories) && meta.categories.length)? meta.categories : FALLBACK_CATEGORIES;
  const methods=(meta && Array.isArray(meta.methods) && meta.methods.length)? meta.methods : ['STRAIGHT','DECLINING'];
  const statuses=(meta && Array.isArray(meta.statuses) && meta.statuses.length)? meta.statuses : FALLBACK_STATUSES;

  const total=data.length;
  const armadaTanpaHarga=data.filter(a=> a.vehicle_id && !(Number(a.acquisition_cost)>0)).length;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const safePage=Math.min(Math.max(1,page),totalPages);
  const paged=data.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);
  const fromIdx= total===0? 0 : (safePage-1)*PAGE_SIZE+1;
  const toIdx= Math.min(safePage*PAGE_SIZE,total);

  const monthlyAll=(dep && Array.isArray(dep.schedule_monthly))? dep.schedule_monthly : [];
  const monthlyVisible= showAllMonths? monthlyAll : monthlyAll.filter(m=>m && m.accrued);
  const accruedCount=monthlyAll.filter(m=>m && m.accrued).length;

  const dispBook=Number(dispAsset && dispAsset.book_value)||0;
  const dispPriceNum=parseFloat(dispForm.price);
  const dispGL= isNaN(dispPriceNum)? null : (dispPriceNum-dispBook);

  /* ---------- create / edit ---------- */
  const openCreate=()=>{ setEditing(null); setForm(emptyForm()); setFormErr(''); setShowForm(true); };

  const openEdit=(a)=>{
    setEditing(a);
    setForm({
      asset_code:a.asset_code||'',
      name:a.name||'',
      category:a.category||FALLBACK_CATEGORIES[0],
      acquisition_date: fmtDate(a.acquisition_date)==='-'? '' : fmtDate(a.acquisition_date),
      acquisition_cost: a.acquisition_cost==null? '' : String(a.acquisition_cost),
      useful_life_years: a.useful_life_years==null? '' : String(a.useful_life_years),
      depreciation_method: a.depreciation_method||'STRAIGHT',
      residual_value: a.residual_value==null? '0' : String(a.residual_value),
      location: a.location||'',
      photo_url: a.photo_url||''
    });
    setFormErr('');
    setShowForm(true);
  };

  const generateCode=()=>{
    let max=0;
    (Array.isArray(data)?data:[]).forEach(a=>{
      const m=/^AST-(\d+)$/.exec(String((a && a.asset_code)||''));
      if(m){ const n=parseInt(m[1],10); if(!isNaN(n) && n>max) max=n; }
    });
    const code='AST-'+String(max+1).padStart(3,'0');
    setForm(f=>({ ...f, asset_code:code }));
  };

  const submitForm=async(e)=>{
    if(e && e.preventDefault) e.preventDefault();
    setFormErr('');
    const cost=parseFloat(form.acquisition_cost);
    const life=parseInt(form.useful_life_years,10);
    const residRaw=form.residual_value===''? 0 : parseFloat(form.residual_value);
    const resid=isNaN(residRaw)? 0 : residRaw;
    if(!String(form.asset_code).trim() || !String(form.name).trim()){ setFormErr('Kode aset dan nama aset wajib diisi.'); return; }
    if(!form.acquisition_date){ setFormErr('Tanggal perolehan wajib diisi.'); return; }
    if(!(cost>0)){ setFormErr('Harga perolehan harus berupa angka lebih dari 0.'); return; }
    if(!(life>0)){ setFormErr('Umur ekonomis harus lebih dari 0 tahun.'); return; }
    if(resid<0){ setFormErr('Nilai residu tidak boleh negatif.'); return; }
    const payload={
      asset_code:String(form.asset_code).trim(),
      name:String(form.name).trim(),
      category:form.category,
      acquisition_date:form.acquisition_date,
      acquisition_cost:cost,
      useful_life_years:life,
      depreciation_method:form.depreciation_method,
      residual_value:resid,
      location:form.location,
      photo_url:form.photo_url
    };
    const wasEdit=!!(editing && editing.id);
    setSaving(true);
    try{
      if(wasEdit) await api.put('/assets/'+editing.id, payload);
      else await api.post('/assets', payload);
      setShowForm(false); setEditing(null);
      await load(); loadSummary();
      dialog.alert(wasEdit? ('Aset '+payload.asset_code+' berhasil diperbarui.') : ('Aset '+payload.asset_code+' berhasil ditambahkan.'),{ title:'Berhasil' });
    }catch(err){
      setFormErr((err && err.response && err.response.data && err.response.data.error) || (err && err.message) || 'Gagal menyimpan aset.');
    }finally{ setSaving(false); }
  };

  const removeAsset=async(a)=>{
    const ok=await dialog.confirm('Hapus aset '+a.asset_code+' - '+a.name+'?\nTindakan ini tidak bisa dibatalkan.',{ title:'Hapus Aset' });
    if(!ok) return;
    try{
      await api.delete('/assets/'+a.id);
      await load(); loadSummary();
      dialog.alert('Aset '+a.asset_code+' telah dihapus.',{ title:'Berhasil' });
    }catch(err){
      dialog.alert((err && err.response && err.response.data && err.response.data.error) || 'Gagal menghapus aset.',{ title:'Gagal' });
    }
  };

  /* ---------- depreciation ---------- */
  const openDep=async(a)=>{
    setDep({ asset:a, schedule:[], schedule_monthly:[], monthly:a.monthly_depreciation, months_elapsed:a.months_elapsed });
    setShowAllMonths(false);
    setDepLoading(true);
    try{
      const r=await api.get('/assets/'+a.id+'/depreciation');
      setDep(r.data||null);
    }catch(err){
      setDep(null);
      dialog.alert((err && err.response && err.response.data && err.response.data.error) || 'Gagal memuat jadwal depresiasi.',{ title:'Gagal' });
    }finally{ setDepLoading(false); }
  };

  // Export diambil dari server (/assets/export) - file berjudul, berwarna, ada baris TOTAL.
  const [expBusy, setExpBusy] = useState('');
  const downloadReport = async (dataset, format, id)=>{
    const key = dataset + '-' + format;
    setExpBusy(key);
    try {
      const params = { dataset, format };
      if (id) params.id = id;
      else { if (q) params.q = q; if (category !== 'Semua') params.category = category; if (status !== 'Semua') params.status = status; }
      const r = await api.get('/assets/export', { params, responseType: 'blob' });
      const name = dataset === 'depreciation' ? 'depresiasi-' + ((dep && dep.asset && dep.asset.asset_code) || 'aset')
                 : dataset === 'maintenance' ? 'maintenance-' + ((maintAsset && maintAsset.asset_code) || 'aset')
                 : 'daftar-aset-tetap';
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = name + '.' + format;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err){
      let msg = (err && err.message) || 'Gagal mengunduh laporan';
      try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* biarkan */ }
      await dialog.alert(msg, { title: 'Export gagal' });
    } finally { setExpBusy(''); }
  };

  const ExportBtns = ({ dataset, id })=> (
    <PosExportButtons
      onExport={(f)=>downloadReport(dataset, f, id)}
      busyKey={expBusy.startsWith(dataset + '-') ? expBusy.split('-')[1] : ''}
    />
  );

  const postDepreciation=async()=>{
    if(!dep || !dep.asset) return;
    const ok=await dialog.confirm('Post jurnal depresiasi untuk '+dep.asset.asset_code+' - '+dep.asset.name+'?\nEntri jurnal akan tercatat pada buku besar.',{ title:'Post Jurnal Depresiasi' });
    if(!ok) return;
    setPosting(true);
    try{
      const r=await api.post('/assets/'+dep.asset.id+'/depreciate',{});
      const d=(r && r.data)||{};
      await dialog.alert('Jurnal berhasil diposting.\nNomor entri: '+(d.entry_number||'-')+'\nBeban depresiasi: '+rupiah(d.amount)+'\nAkumulasi: '+rupiah(d.accumulated)+'\nNilai buku: '+rupiah(d.book_value),{ title:'Jurnal Terposting' });
      const rr=await api.get('/assets/'+dep.asset.id+'/depreciation');
      setDep(rr.data||null);
      load(); loadSummary();
    }catch(err){
      dialog.alert((err && err.response && err.response.data && err.response.data.error) || 'Gagal posting jurnal depresiasi.',{ title:'Gagal' });
    }finally{ setPosting(false); }
  };

  /* ---------- maintenance ---------- */
  const reloadMaint=async(id)=>{
    try{
      const r=await api.get('/assets/'+id+'/maintenance');
      setMaintRows((r.data && Array.isArray(r.data.rows))? r.data.rows : []);
      setMaintTotal(Number(r.data && r.data.total_cost)||0);
    }catch(e){ setMaintRows([]); setMaintTotal(0); }
  };

  const openMaint=async(a)=>{
    setMaintAsset(a);
    setMaintRows([]); setMaintTotal(0); setMaintLoading(true);
    setMaintForm({ maintenance_date:todayISO(), type:'PREVENTIVE', cost:'', description:'' });
    await reloadMaint(a.id);
    setMaintLoading(false);
  };

  const submitMaint=async(e)=>{
    if(e && e.preventDefault) e.preventDefault();
    if(!maintAsset) return;
    if(!maintForm.maintenance_date){ dialog.alert('Tanggal maintenance wajib diisi.',{ title:'Validasi' }); return; }
    setMaintSaving(true);
    try{
      await api.post('/assets/'+maintAsset.id+'/maintenance',{
        maintenance_date:maintForm.maintenance_date,
        type:maintForm.type,
        cost:parseFloat(maintForm.cost)||0,
        description:maintForm.description
      });
      await reloadMaint(maintAsset.id);
      setMaintForm({ maintenance_date:todayISO(), type:maintForm.type, cost:'', description:'' });
      loadSummary();
    }catch(err){
      dialog.alert((err && err.response && err.response.data && err.response.data.error) || 'Gagal menyimpan log maintenance.',{ title:'Gagal' });
    }finally{ setMaintSaving(false); }
  };

  /* ---------- disposal ---------- */
  const openDisp=(a)=>{ setDispAsset(a); setDispForm({ price:'', disposal_date:todayISO() }); };

  const submitDisp=async(e)=>{
    if(e && e.preventDefault) e.preventDefault();
    if(!dispAsset) return;
    if(dispForm.price==='' || isNaN(parseFloat(dispForm.price)) || parseFloat(dispForm.price)<0){ dialog.alert('Harga jual wajib diisi (angka, minimal 0).',{ title:'Validasi' }); return; }
    if(!dispForm.disposal_date){ dialog.alert('Tanggal disposal wajib diisi.',{ title:'Validasi' }); return; }
    const price=parseFloat(dispForm.price);
    const ok=await dialog.confirm('Proses disposal '+dispAsset.asset_code+' - '+dispAsset.name+' dengan harga jual '+rupiah(price)+'?',{ title:'Konfirmasi Disposal' });
    if(!ok) return;
    setDispSaving(true);
    try{
      const r=await api.post('/assets/'+dispAsset.id+'/dispose',{ price, disposal_date:dispForm.disposal_date });
      const d=(r && r.data)||{};
      const gl=Math.abs(Number(d.gain_loss)||0);
      await dialog.alert('Disposal '+dispAsset.asset_code+' selesai.\nNilai buku: '+rupiah(d.book_value)+'\nHarga jual: '+rupiah(d.price)+'\n'+(d.type==='GAIN'? 'Laba':'Rugi')+' disposal: '+rupiah(gl)+'\nJurnal: '+(d.entry_number||'-'),{ title:'Hasil Disposal' });
      setDispAsset(null);
      await load(); loadSummary();
    }catch(err){
      dialog.alert((err && err.response && err.response.data && err.response.data.error) || 'Gagal memproses disposal.',{ title:'Gagal' });
    }finally{ setDispSaving(false); }
  };

  /* ---------- render ---------- */
  return (
    <div className="space-y-3">
      {/* header */}
      <PosPageHeader icon={FileText} title="Aset Tetap & Maintenance" subtitle="Depresiasi PSAK straight/declining • Pemeliharaan • Disposal gain/loss" actions={<><button onClick={runDepreciation} disabled={depBusy} className="h-9 px-3 rounded-xl border border-line bg-white text-xs font-bold text-ink-2 hover:bg-surface-2 inline-flex items-center gap-1.5 disabled:opacity-50"><TrendingDown size={14}/>{depBusy? 'Memproses...':'Penyusutan Bulan Ini'}</button><button onClick={openCreate} className={BTN_PRIMARY}><Plus size={16} strokeWidth={2.6}/> Tambah Aset</button></>}/>

      {/* summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Wallet size={15} strokeWidth={2.4}/>} tone="bg-brand/10 text-brand" label="Total Perolehan" value={rupiah(summary && summary.total_acquisition)}/>
        <StatCard icon={<Layers size={15} strokeWidth={2.4}/>} tone="bg-emerald-50 text-emerald-700" label="Total Nilai Buku" value={rupiah(summary && summary.total_book_value)}/>
        <StatCard icon={<TrendingDown size={15} strokeWidth={2.4}/>} tone="bg-amber-50 text-amber-700" label="Depresiasi Tahun Ini" value={rupiah(summary && summary.total_depreciation_this_year)}/>
        <StatCard icon={<Wrench size={15} strokeWidth={2.4}/>} tone="bg-red-50 text-red-700" label="Perlu Maintenance" value={String((summary && summary.needs_maintenance)||0)+' aset'}/>
      </div>

      {depInfo && (
        <div className="rounded-xl border border-line bg-white px-3 py-2 text-[11px] text-ink-2 flex flex-wrap items-center gap-2">
          <TrendingDown size={12} className="text-brand"/>
          <b>Penyusutan {depInfo.period}:</b>
          <span>{depInfo.data?.length||0} aset • {rupiah(depInfo.total)}</span>
          {depInfo.data?.length
            ? <span className="text-emerald-700">sudah diposting ke jurnal</span>
            : <span className="text-amber-700">belum dijalankan bulan ini</span>}
          {depInfo.data?.length>0 && <span className="text-ink-3 ml-auto">Jurnal Dr Beban Penyusutan / Cr Akumulasi Penyusutan</span>}
        </div>
      )}

      {/* toolbar */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari kode atau nama aset..." className={INPUT+' pl-9'}/>
          </div>
          <select value={category} onChange={e=>setCategory(e.target.value)} className={INPUT+' sm:w-[170px]'}>
            <option value="Semua">Semua Kategori</option>
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={e=>setStatus(e.target.value)} className={INPUT+' sm:w-[160px]'}>
            <option value="Semua">Semua Status</option>
            {statuses.map(s=><option key={s} value={s}>{STATUS_LABEL[s]||s}</option>)}
          </select>
          <select value={sort} onChange={e=>setSort(e.target.value)} className={INPUT+' sm:w-[190px]'}>
            <option value="umur">Urut: Umur</option>
            <option value="nilai">Urut: Nilai Buku</option>
            <option value="perolehan">Urut: Perolehan Terbesar</option>
          </select>
          <button onClick={()=>{ load(); loadSummary(); }} className={BTN_SECONDARY}><CalendarClock size={16}/> Muat Ulang</button>
          <button onClick={syncFleet} disabled={fleetBusy}
            title="Tarik armada milik sendiri (ownership OWNED) menjadi aset tetap"
            className={BTN_SECONDARY+' disabled:opacity-50 disabled:cursor-not-allowed'}>
            {fleetBusy ? <RefreshCw size={16} className="animate-spin"/> : <Truck size={16}/>} Tarik Armada
          </button>
          <div className="sm:ml-auto"><ExportBtns dataset="assets"/></div>
        </div>
      </div>

      {armadaTanpaHarga>0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5"/>
          <div className="text-xs text-amber-800">
            <b>{armadaTanpaHarga} aset armada belum punya harga perolehan</b> - nilainya 0 sehingga depresiasi ikut 0.
            Isi <b>Tanggal Perolehan</b> dan <b>Harga Perolehan</b> di halaman <b>Armada</b> (form armada) atau lewat tombol Edit di kartu aset ini.
          </div>
        </div>
      )}

      {/* grid */}
      {loading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[0,1,2,3,4,5].map(i=>(
            <div key={i} className="bg-white rounded-xl border border-line shadow-card p-5 animate-pulse">
              <div className="h-5 w-24 bg-[#e7ecf7] rounded-full"/>
              <div className="h-4 w-3/4 bg-[#e7ecf7] rounded mt-3"/>
              <div className="h-3 w-1/2 bg-surface-3 rounded mt-2"/>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="h-16 bg-surface-3 rounded-xl"/>
                <div className="h-16 bg-surface-3 rounded-xl"/>
              </div>
              <div className="h-9 w-full bg-surface-3 rounded-xl mt-4"/>
            </div>
          ))}
        </div>
      ) : total===0 ? (
        <div className={CARD}>
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-3 text-ink-2 grid place-items-center mx-auto"><PackageSearch size={22}/></div>
            <div className="mt-3 text-sm font-bold text-ink">Tidak ada aset ditemukan</div>
            <p className="text-xs text-ink-2 mt-1">{dq? ('Tidak ada hasil untuk "'+dq+'". Coba kata kunci lain.') : 'Belum ada aset terdaftar. Tambahkan aset tetap pertama Anda.'}</p>
            {!dq && <button onClick={openCreate} className={BTN_PRIMARY+' mt-4'}><Plus size={16}/> Tambah Aset</button>}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {paged.map(a=>{
            const st=STATUS_BADGE[a.status]||'bg-slate-50 text-slate-600 border-slate-200';
            const book=Number(a.book_value!=null? a.book_value : a.acquisition_cost)||0;
            const cost=Number(a.acquisition_cost)||0;
            const accum=Number(a.accumulated_depreciation)||0;
            const pct= cost>0? Math.min(100,Math.round((accum/cost)*100)) : 0;
            return (
              <div key={a.id} className="bg-white rounded-xl border border-line shadow-card overflow-hidden flex flex-col">
                {a.photo_url? <img src={a.photo_url} alt={a.name} className="h-32 w-full object-cover bg-surface-3"/> : null}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold bg-surface-3 border border-line text-ink-2 px-2 py-1 rounded-full break-all">{a.asset_code}</span>
                    <span className={'shrink-0 text-[11px] font-bold tracking-wider uppercase px-2 py-1 rounded-full border '+st}>{STATUS_LABEL[a.status]||a.status||'-'}</span>
                  </div>
                  {a.vehicle_id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase px-2 py-1 rounded-full border bg-sky-50 text-sky-700 border-sky-200">
                        <Truck size={11}/> ARMADA
                      </span>
                      {a.fleet_plat && <span className="font-mono text-[11px] font-bold bg-white border border-line text-ink-2 px-2 py-1 rounded-full">{a.fleet_plat}</span>}
                      {!(cost>0) && <span className="text-[11px] font-bold px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Harga perolehan belum diisi</span>}
                    </div>
                  ) : null}
                  <div className="font-bold text-[15px] text-ink mt-2 leading-snug">{a.name}</div>
                  <div className="text-xs text-ink-2 mt-1">{a.category} • {a.vehicle_id ? ('Armada '+(a.fleet_plat||'')) : (a.location||'-')} • Perolehan {fmtDate(a.acquisition_date)}</div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-surface-3 border border-line rounded-xl p-2">
                      <div className="text-ink-2">Harga Perolehan</div>
                      <div className="font-bold text-ink break-words">{rupiah(cost)}</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-2">
                      <div className="text-blue-700">Nilai Buku</div>
                      <div className="font-bold text-blue-800 break-words">{rupiah(book)}</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full bg-brand" style={{ width:pct+'%' }}/>
                    </div>
                    <div className="text-[11px] text-ink-2 mt-1">Akumulasi {rupiah(accum)} • {pct}% tersusut</div>
                  </div>

                  <div className="text-[11px] text-ink-2 mt-2">
                    Umur {a.useful_life_years} th • {METHOD_LABEL[a.depreciation_method]||a.depreciation_method} • Residu {rupiah(a.residual_value)} • /bln {rupiah(a.monthly_depreciation)}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-line">
                    <button onClick={()=>openDep(a)} className={BTN_SM+' bg-brand text-white hover:bg-brand-strong'}><TrendingDown size={14}/> Depresiasi</button>
                    <button onClick={()=>openEdit(a)} className={BTN_SM+' bg-white border border-line text-ink-2 hover:bg-surface-2'}><Pencil size={14}/> Edit</button>
                    <button onClick={()=>openMaint(a)} className={BTN_SM+' bg-white border border-line text-ink-2 hover:bg-surface-2'}><Wrench size={14}/> Maintenance</button>
                    {a.status!=='DISPOSED' && (
                      <button onClick={()=>openDisp(a)} className={BTN_SM+' bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'}><Banknote size={14}/> Jual / Disposal</button>
                    )}
                    <button onClick={()=>removeAsset(a)} className={BTN_SM+' bg-white border border-red-200 text-red-600 hover:bg-red-50'}><Trash2 size={14}/> Hapus</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* pagination */}
      {!loading && total>0 && (
        <div className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ink-2">Menampilkan <b className="text-ink">{fromIdx}-{toIdx}</b> dari <b className="text-ink">{total}</b> aset</div>
            <div className="flex items-center gap-2">
              <button disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className={BTN_SECONDARY+' disabled:opacity-50 disabled:cursor-not-allowed'}>Prev</button>
              <div className="text-xs font-bold text-ink-2 px-2">Hal. {safePage} / {totalPages}</div>
              <button disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className={BTN_SECONDARY+' disabled:opacity-50 disabled:cursor-not-allowed'}>Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== create / edit modal ===== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitForm} className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">{editing? 'Edit Aset - '+editing.asset_code : 'Tambah Aset'}</h3>
                <p className="text-xs text-ink-2 mt-1">Data aset tetap, metode depresiasi, dan lokasi penyimpanan.</p>
              </div>
              <button type="button" onClick={()=>{ setShowForm(false); setEditing(null); }} className="h-9 w-9 grid place-items-center rounded-xl border border-line text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>

            {formErr && (
              <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">
                <AlertTriangle size={15} className="shrink-0 mt-[1px]"/> <span className="break-words">{formErr}</span>
              </div>
            )}

            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Kode Aset *</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.asset_code} onChange={e=>setForm({...form, asset_code:e.target.value})} placeholder="AST-001" className={INPUT}/>
                  <button type="button" onClick={generateCode} title="Isi kode otomatis" className={BTN_SECONDARY+' shrink-0 whitespace-nowrap'}><Sparkles size={15}/> Otomatis</button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Nama Aset *</label>
                <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Contoh: Toyota Hilux Double Cabin" className={INPUT+' mt-1'}/>
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Kategori *</label>
                <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})} className={INPUT+' mt-1'}>
                  {categories.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Tanggal Perolehan *</label>
                <input type="date" value={form.acquisition_date} onChange={e=>setForm({...form, acquisition_date:e.target.value})} className={INPUT+' mt-1'}/>
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Harga Perolehan *</label>
                <input type="number" min="0" step="any" value={form.acquisition_cost} onChange={e=>setForm({...form, acquisition_cost:e.target.value})} placeholder="0" className={INPUT+' mt-1'}/>
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Nilai Residu</label>
                <input type="number" min="0" step="any" value={form.residual_value} onChange={e=>setForm({...form, residual_value:e.target.value})} placeholder="0" className={INPUT+' mt-1'}/>
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Umur Ekonomis (tahun) *</label>
                <input type="number" min="1" step="1" value={form.useful_life_years} onChange={e=>setForm({...form, useful_life_years:e.target.value})} placeholder="5" className={INPUT+' mt-1'}/>
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Metode Depresiasi *</label>
                <select value={form.depreciation_method} onChange={e=>setForm({...form, depreciation_method:e.target.value})} className={INPUT+' mt-1'}>
                  {methods.map(m=><option key={m} value={m}>{METHOD_LABEL[m]||m}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Lokasi</label>
                <input value={form.location} onChange={e=>setForm({...form, location:e.target.value})} placeholder="Contoh: Gudang Utama - Rak B3" className={INPUT+' mt-1'}/>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">URL Foto</label>
                <input value={form.photo_url} onChange={e=>setForm({...form, photo_url:e.target.value})} placeholder="https://..." className={INPUT+' mt-1'}/>
                <p className="text-[11px] text-ink-3 mt-1">Tempel tautan gambar aset (opsional).</p>
              </div>
            </div>

            {form.photo_url? <img src={form.photo_url} alt="Pratinjau" className="mt-3 h-28 w-full object-cover rounded-xl border border-line bg-surface-3"/> : null}

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
              <button type="button" onClick={()=>{ setShowForm(false); setEditing(null); }} className={BTN_SECONDARY}>Batal</button>
              <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving? 'Menyimpan...' : (editing? 'Simpan Perubahan' : 'Simpan Aset')}</button>
            </div>
          </form>
        </div>
      )}

      {/* ===== depreciation modal ===== */}
      {dep && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Jadwal Depresiasi - {dep.asset && dep.asset.name}</h3>
                <p className="text-xs text-ink-2 mt-1">
                  {dep.asset && dep.asset.asset_code} • Metode {METHOD_LABEL[dep.asset && dep.asset.depreciation_method]||(dep.asset && dep.asset.depreciation_method)} • Nilai buku {rupiah(dep.asset && dep.asset.book_value)}
                </p>
              </div>
              <button onClick={()=>setDep(null)} className="h-9 w-9 grid place-items-center rounded-xl border border-line text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <div className="text-ink-2">Per Bulan</div>
                <div className="font-bold text-ink break-words">{rupiah(dep.monthly)}</div>
              </div>
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <div className="text-ink-2">Akumulasi</div>
                <div className="font-bold text-ink break-words">{rupiah(dep.accumulated)}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-blue-700">Nilai Buku</div>
                <div className="font-bold text-blue-800 break-words">{rupiah(dep.book_value)}</div>
              </div>
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <div className="text-ink-2">Bulan Berjalan</div>
                <div className="font-bold text-ink">{Number(dep.months_elapsed)||0} bulan</div>
              </div>
            </div>

            {depLoading ? (
              <div className="mt-4 space-y-2 animate-pulse">
                <div className="h-10 bg-surface-3 rounded-xl"/>
                <div className="h-10 bg-surface-3 rounded-xl"/>
                <div className="h-10 bg-surface-3 rounded-xl"/>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-5">
                  <h4 className="text-xs font-bold tracking-wider text-ink-2 uppercase">Jadwal Tahunan</h4>
                  <div className="flex flex-wrap gap-2">
                    <ExportBtns dataset="depreciation" id={dep && dep.asset && dep.asset.id}/>
                    <button onClick={postDepreciation} disabled={posting} className={BTN_SM+' bg-brand text-white hover:bg-brand-strong'}>{posting? 'Memproses...' : 'Post Jurnal Depresiasi'}</button>
                  </div>
                </div>

                <div className="overflow-auto mt-2 rounded-xl border border-line">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-3 border-b border-line text-left">
                        <th className={TH}>TAHUN</th>
                        <th className={TH+' text-right'}>DEPRESIASI</th>
                        <th className={TH+' text-right'}>AKUMULASI</th>
                        <th className={TH+' text-right'}>NILAI BUKU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(dep.schedule)?dep.schedule:[]).map(s=>(
                        <tr key={s.year} className="border-b border-line hover:bg-surface-2 transition bg-white">
                          <td className="px-4 py-3 font-bold text-ink-2">Tahun {s.year}</td>
                          <td className="px-4 py-3 text-right">{rupiah(s.depreciation)}</td>
                          <td className="px-4 py-3 text-right">{rupiah(s.accumulated)}</td>
                          <td className="px-4 py-3 text-right font-bold text-ink">{rupiah(s.book_value)}</td>
                        </tr>
                      ))}
                      {(!Array.isArray(dep.schedule)||dep.schedule.length===0) && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Jadwal tahunan belum tersedia.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-5">
                  <h4 className="text-xs font-bold tracking-wider text-ink-2 uppercase">Rincian Bulanan ({accruedCount} bulan berjalan dari {monthlyAll.length})</h4>
                  <button onClick={()=>setShowAllMonths(v=>!v)} className={BTN_SM+' bg-white border border-line text-ink-2 hover:bg-surface-2'}>{showAllMonths? 'Tampilkan hanya bulan berjalan' : 'Tampilkan semua rencana'}</button>
                </div>

                <div className="overflow-auto mt-2 rounded-xl border border-line">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-3 border-b border-line text-left">
                        <th className={TH}>PERIODE</th>
                        <th className={TH+' text-right'}>DEPRESIASI</th>
                        <th className={TH+' text-right'}>AKUMULASI</th>
                        <th className={TH+' text-right'}>NILAI BUKU</th>
                        <th className={TH+' text-center'}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyVisible.map((m,i)=>(
                        <tr key={monthLabel(m.month,m.year)+'-'+i} className={'border-b border-line transition '+(m.accrued? 'bg-white hover:bg-surface-2' : 'bg-surface-2 text-ink-3')}>
                          <td className="px-4 py-3 font-bold">{monthLabel(m.month,m.year)}</td>
                          <td className="px-4 py-3 text-right">{rupiah(m.depreciation)}</td>
                          <td className="px-4 py-3 text-right">{rupiah(m.accumulated)}</td>
                          <td className="px-4 py-3 text-right font-bold">{rupiah(m.book_value)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={'text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border '+(m.accrued? 'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-surface-3 text-ink-2 border-line')}>{m.accrued? 'Sudah':'Rencana'}</span>
                          </td>
                        </tr>
                      ))}
                      {monthlyVisible.length===0 && (
                        <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-3">{monthlyAll.length===0? 'Rincian bulanan belum tersedia.' : 'Belum ada bulan yang berjalan.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
              <button onClick={()=>setDep(null)} className={BTN_SECONDARY}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== maintenance modal ===== */}
      {maintAsset && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Log Maintenance - {maintAsset.name}</h3>
                <p className="text-xs text-ink-2 mt-1">{maintAsset.asset_code} • {maintAsset.category} • {maintAsset.location||'-'}</p>
              </div>
              <button onClick={()=>setMaintAsset(null)} className="h-9 w-9 grid place-items-center rounded-xl border border-line text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <div className="text-ink-2">Jumlah Log</div>
                <div className="font-bold text-ink">{maintRows.length} entri</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-amber-700">Total Biaya Maintenance</div>
                <div className="font-bold text-amber-800 break-words">{rupiah(maintTotal)}</div>
              </div>
            </div>
            <div className="mt-3"><ExportBtns dataset="maintenance" id={maintAsset.id}/></div>

            <form onSubmit={submitMaint} className="mt-4 bg-surface-2 border border-line rounded-xl p-3 space-y-2">
              <div className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Tambah Log Baru</div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input type="date" value={maintForm.maintenance_date} onChange={e=>setMaintForm({...maintForm, maintenance_date:e.target.value})} className={INPUT}/>
                <select value={maintForm.type} onChange={e=>setMaintForm({...maintForm, type:e.target.value})} className={INPUT}>
                  {MAINT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" min="0" step="any" value={maintForm.cost} onChange={e=>setMaintForm({...maintForm, cost:e.target.value})} placeholder="Biaya" className={INPUT}/>
              </div>
              <input value={maintForm.description} onChange={e=>setMaintForm({...maintForm, description:e.target.value})} placeholder="Deskripsi pekerjaan (contoh: ganti oli + filter)" className={INPUT}/>
              <div className="flex justify-end">
                <button type="submit" disabled={maintSaving} className={BTN_PRIMARY}>{maintSaving? 'Menyimpan...' : 'Simpan Log'}</button>
              </div>
            </form>

            <div className="overflow-auto mt-4 rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-3 border-b border-line text-left">
                    <th className={TH}>TANGGAL</th>
                    <th className={TH}>TIPE</th>
                    <th className={TH}>DESKRIPSI</th>
                    <th className={TH+' text-right'}>BIAYA</th>
                  </tr>
                </thead>
                <tbody>
                  {maintLoading && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Memuat log...</td></tr>}
                  {!maintLoading && maintRows.map(r=>(
                    <tr key={r.id} className="border-b border-line hover:bg-surface-2 transition bg-white">
                      <td className="px-4 py-3 font-bold text-ink-2">{fmtDate(r.maintenance_date)}</td>
                      <td className="px-4 py-3"><span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border bg-surface-3 text-ink-2 border-line">{r.type}</span></td>
                      <td className="px-4 py-3 text-ink-2">{r.description||'-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink">{rupiah(r.cost)}</td>
                    </tr>
                  ))}
                  {!maintLoading && maintRows.length===0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Belum ada log maintenance untuk aset ini.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
              <button onClick={()=>setMaintAsset(null)} className={BTN_SECONDARY}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== disposal modal ===== */}
      {dispAsset && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitDisp} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Disposal / Jual Aset</h3>
                <p className="text-xs text-ink-2 mt-1">{dispAsset.asset_code} • {dispAsset.name}</p>
              </div>
              <button type="button" onClick={()=>setDispAsset(null)} className="h-9 w-9 grid place-items-center rounded-xl border border-line text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <div className="text-ink-2">Harga Perolehan</div>
                <div className="font-bold text-ink break-words">{rupiah(dispAsset.acquisition_cost)}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-blue-700">Nilai Buku Saat Ini</div>
                <div className="font-bold text-blue-800 break-words">{rupiah(dispBook)}</div>
              </div>
            </div>

            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Harga Jual *</label>
                <input type="number" min="0" step="any" value={dispForm.price} onChange={e=>setDispForm({...dispForm, price:e.target.value})} placeholder="0" className={INPUT+' mt-1'}/>
              </div>
              <div>
                <label className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Tanggal Disposal *</label>
                <input type="date" value={dispForm.disposal_date} onChange={e=>setDispForm({...dispForm, disposal_date:e.target.value})} className={INPUT+' mt-1'}/>
              </div>
            </div>

            <div className={'mt-4 rounded-xl border p-4 text-xs '+(dispGL==null? 'bg-surface-2 border-line' : (dispGL>=0? 'bg-emerald-50 border-emerald-200':'bg-red-50 border-red-200'))}>
              <div className="text-[11px] font-bold tracking-wider uppercase text-ink-2">Estimasi Laba / Rugi Disposal</div>
              {dispGL==null ? (
                <div className="mt-1 text-ink-2">Masukkan harga jual untuk melihat perhitungan.</div>
              ) : (
                <>
                  <div className={'mt-1 text-[18px] font-bold '+(dispGL>=0? 'text-emerald-700':'text-red-700')}>{rupiah(Math.abs(dispGL))}</div>
                  <div className={'mt-1 font-bold '+(dispGL>=0? 'text-emerald-700':'text-red-700')}>{dispGL>=0? 'LABA (GAIN)':'RUGI (LOSS)'} • Harga jual {rupiah(dispPriceNum)} − Nilai buku {rupiah(dispBook)}</div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
              <button type="button" onClick={()=>setDispAsset(null)} className={BTN_SECONDARY}>Batal</button>
              <button type="submit" disabled={dispSaving} className={BTN_PRIMARY}>{dispSaving? 'Memproses...' : 'Proses Disposal'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
