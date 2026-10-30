import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, Search, RefreshCw, Plus, Minus, Crown, Sparkles, Users, Coins, X, Trophy, Gift,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const TIER_TONE = { Silver:'slate', Gold:'amber', Platinum:'sky' };
const TX_TONE = { EARN:'emerald', REDEEM:'red', ADJUST:'amber', EXPIRE:'slate' };

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));

export default function Loyalty(){
  const dialog = useDialog();
  const [tab, setTab] = useState('saldo');           // saldo | mutasi | tier
  const [points, setPoints] = useState([]);
  const [tx, setTx] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [txFilter, setTxFilter] = useState('Semua');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');

  const [modal, setModal] = useState('');            // earn | redeem | tier
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [form, setForm] = useState({ customer_id:'', points:'', reference_type:'MANUAL', description:'' });
  const [tierForm, setTierForm] = useState({ name:'', min_spend:'', discount_pct:'', prioritas:false, gratis_ongkir:false });

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const [p, t, tr] = await Promise.all([
        api.get('/loyalty/points').catch(()=>({ data:[] })),
        api.get('/loyalty/transactions').catch(()=>({ data:[] })),
        api.get('/loyalty/tiers').catch(()=>({ data:[] })),
      ]);
      setPoints(Array.isArray(p.data) ? p.data : []);
      setTx(Array.isArray(t.data) ? t.data : []);
      setTiers(Array.isArray(tr.data) ? tr.data : []);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal memuat data loyalty'); }
    finally{ setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,txFilter,tab]);

  const loadCustomers = useCallback(async ()=>{
    try{ const r = await api.get('/master/customers', { params:{ limit:200 } }); setCustomers(Array.isArray(r.data?.data)? r.data.data : (Array.isArray(r.data)? r.data : [])); }
    catch(e){ setCustomers([]); }
  },[]);
  useEffect(()=>{ loadCustomers(); },[loadCustomers]);

  /* -------------------------------------------------------------- derived */
  const saldoRows = useMemo(()=>{
    const s = appliedQ.trim().toLowerCase();
    return points.filter(p=> !s || String(p.name||'').toLowerCase().includes(s));
  },[points,appliedQ]);

  const txRows = useMemo(()=>{
    const s = appliedQ.trim().toLowerCase();
    return tx.filter(t=>{
      if (txFilter!=='Semua' && t.transaction_type!==txFilter) return false;
      if (!s) return true;
      return String(t.name||'').toLowerCase().includes(s) || String(t.description||'').toLowerCase().includes(s);
    });
  },[tx,appliedQ,txFilter]);

  const rows = tab==='mutasi' ? txRows : saldoRows;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  const safePage = Math.min(Math.max(1,page), totalPages);
  const pageRows = rows.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);

  const totalBeredar = points.reduce((a,p)=> a + (Number(p.points_balance)||0), 0);
  const totalLifetime = points.reduce((a,p)=> a + (Number(p.lifetime_points)||0), 0);
  const tierOf = (balance)=>{
    const b = Number(balance)||0;
    const sorted = [...tiers].sort((x,y)=> Number(y.min_spend)-Number(x.min_spend));
    const hit = sorted.find(t=> b >= 0 && (Number(t.min_spend)||0) <= 0) || null; // fallback
    return sorted.find(t=> b >= (Number(t.min_spend)||0)) || hit;
  };

  /* -------------------------------------------------------------- actions */
  const openEarn = (customerId)=>{
    setFormErr('');
    setForm({ customer_id: customerId ? String(customerId) : '', points:'', reference_type:'MANUAL', description:'' });
    setModal('earn');
  };
  const openRedeem = (customerId)=>{
    setFormErr('');
    setForm({ customer_id: customerId ? String(customerId) : '', points:'', reference_type:'REDEEM', description:'' });
    setModal('redeem');
  };

  const submitPoints = async (e)=>{
    e.preventDefault();
    if (!form.customer_id){ setFormErr('Pilih customer dulu.'); return; }
    const poin = parseInt(form.points);
    if (!poin || poin <= 0){ setFormErr('Jumlah poin harus lebih dari 0.'); return; }
    setSaving(true); setFormErr('');
    try{
      if (modal==='earn'){
        await api.post('/loyalty/earn', { customer_id:parseInt(form.customer_id), points:poin,
          reference_type:form.reference_type||'MANUAL', description:form.description||'Poin manual' });
        await dialog.alert(poin+' poin ditambahkan.', { title:'Poin Masuk' });
      } else {
        await api.post('/loyalty/redeem', { customer_id:parseInt(form.customer_id), points:poin,
          description:form.description||'Redeem poin' });
        await dialog.alert(poin+' poin ditukar.', { title:'Poin Keluar' });
      }
      setModal(''); load();
    }catch(e){
      setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan poin');
    }finally{ setSaving(false); }
  };

  const submitTier = async (e)=>{
    e.preventDefault();
    if (!tierForm.name.trim()){ setFormErr('Nama tier wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/loyalty/tiers', { name:tierForm.name.trim(), min_spend:parseFloat(tierForm.min_spend)||0,
        discount_pct:parseFloat(tierForm.discount_pct)||0,
        benefits:{ prioritas:!!tierForm.prioritas, gratis_ongkir:!!tierForm.gratis_ongkir } });
      setModal(''); load();
      await dialog.alert('Tier '+tierForm.name+' ditambahkan.', { title:'Tier Baru' });
    }catch(e){
      setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan tier');
    }finally{ setSaving(false); }
  };

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const dataset = tab==='mutasi' ? 'transactions' : tab==='tier' ? 'tiers' : 'points';
      const r = await api.get('/loyalty/export', { params:{ format, dataset }, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = dataset + '-loyalty.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  /* --------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={Award}
        title="Loyalty & Membership"
        subtitle="Poin per transaksi • Tier Silver/Gold/Platinum • Diskon & benefit otomatis menurut belanja"
        badge={points.length + ' member'}
        actions={<>
          <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Loyalty"/>
          <button onClick={()=>openEarn('')} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Poin Masuk</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Users} tone="bg-[#0051d5]/10 text-[#0051d5]" label="MEMBER BERPOIN" value={points.length + ' customer'} sub="punya saldo poin"/>
        <PosStat icon={Coins} tone="bg-amber-50 text-amber-700" label="POIN BEREDAR" value={nf(totalBeredar)} sub="siap ditukar"/>
        <PosStat icon={Sparkles} tone="bg-emerald-50 text-emerald-700" label="LIFETIME POIN" value={nf(totalLifetime)} sub="akumulasi semua transaksi"/>
        <PosStat icon={Trophy} tone="bg-sky-50 text-sky-700" label="TIER AKTIF" value={tiers.length + ' tier'} sub={tiers.map(t=>t.name).join(' • ')||'-'}/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); load(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
            {tab==='tier' && <button onClick={()=>{ setFormErr(''); setTierForm({ name:'', min_spend:'', discount_pct:'', prioritas:false, gratis_ongkir:false }); setModal('tier'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Tier Baru</button>}
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari nama customer / keterangan lalu Enter..." className={posInput+' pl-9'}/>
            </div>
          </PosToolbar>

          <PosChipRow label="LIHAT">
            <PosChip active={tab==='saldo'} onClick={()=>setTab('saldo')}>Saldo Poin</PosChip>
            <PosChip active={tab==='mutasi'} onClick={()=>setTab('mutasi')}>Mutasi Poin</PosChip>
            <PosChip active={tab==='tier'} onClick={()=>setTab('tier')}>Tier & Benefit</PosChip>
            {tab==='mutasi' && <>
              <span className="text-[11px] font-bold tracking-wider text-[#45464d] ml-3">TIPE</span>
              {['Semua','EARN','REDEEM'].map(t=> <PosChip key={t} active={txFilter===t} onClick={()=>setTxFilter(t)}>{t==='Semua'?'Semua':t}</PosChip>)}
            </>}
          </PosChipRow>
        </PosCardBody>

        {tab==='tier' ? (
          <PosCardBody className="pt-0">
            {loading ? <PosSkeleton rows={3} cols={4}/> : !tiers.length ? <PosEmpty text="Belum ada tier"/> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tiers.map(t=>(
                  <div key={t.id} className="rounded-xl border border-[#e7ecf7] bg-white p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl grid place-items-center bg-[#0051d5]/10 text-[#0051d5]"><Crown size={15}/></span>
                        <span className="font-bold text-[15px] text-[#0b1c30]">{t.name}</span>
                      </div>
                      <PosBadge tone={TIER_TONE[t.name]||'slate'}>{Number(t.discount_pct)||0}% diskon</PosBadge>
                    </div>
                    <div className="mt-3 text-xs text-[#45464d]">Minimal belanja</div>
                    <div className="font-bold text-[#0b1c30]">{rupiah(t.min_spend)}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(t.benefits||{}).filter(([,v])=>v).map(([k])=>(
                        <PosBadge key={k} tone="emerald"><Gift size={11}/> {k.replace(/_/g,' ')}</PosBadge>
                      ))}
                      {!Object.values(t.benefits||{}).some(v=>v) && <span className="text-[11px] text-[#76777d]">Tanpa benefit tambahan</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PosCardBody>
        ) : (
          <>
            {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : (
              <>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    {tab==='saldo' ? (
                      <>
                        <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                          <PosTh>CUSTOMER</PosTh><PosTh align="center">TIER</PosTh>
                          <PosTh align="right">SALDO POIN</PosTh><PosTh align="right">LIFETIME</PosTh><PosTh align="right">AKSI</PosTh>
                        </tr></thead>
                        <tbody>
                          {pageRows.map(p=>{
                            const tier = tierOf(p.points_balance);
                            return (
                              <tr key={p.customer_id} className={posTr}>
                                <td className={posTd}>
                                  <div className="font-bold text-[#0b1c30]">{p.name}</div>
                                  <div className="text-xs text-[#76777d]">ID {p.customer_id}</div>
                                </td>
                                <td className={posTd+' text-center'}>
                                  {tier ? <PosBadge tone={TIER_TONE[tier.name]||'slate'}><Crown size={11}/> {tier.name}</PosBadge> : <span className="text-xs text-[#76777d]">-</span>}
                                </td>
                                <td className={posTd+' text-right font-bold text-amber-600 tabular-nums'}>{nf(p.points_balance)}</td>
                                <td className={posTd+' text-right tabular-nums text-[#45464d]'}>{nf(p.lifetime_points)}</td>
                                <td className={posTd}>
                                  <div className="flex justify-end gap-1.5">
                                    <button onClick={()=>openEarn(p.customer_id)} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><Plus size={13}/> Poin</button>
                                    <button onClick={()=>openRedeem(p.customer_id)} className={posBtnSm+' bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}><Minus size={13}/> Tukar</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {!pageRows.length && <PosEmpty colSpan={5} text="Belum ada customer dengan poin"/>}
                        </tbody>
                      </>
                    ) : (
                      <>
                        <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                          <PosTh>TANGGAL</PosTh><PosTh>CUSTOMER</PosTh><PosTh align="center">TIPE</PosTh>
                          <PosTh align="right">POIN</PosTh><PosTh>REFERENSI</PosTh><PosTh>KETERANGAN</PosTh>
                        </tr></thead>
                        <tbody>
                          {pageRows.map(t=>(
                            <tr key={t.id} className={posTr}>
                              <td className={posTd+' text-xs whitespace-nowrap'}>{String(t.transaction_date||'').slice(0,10)}</td>
                              <td className={posTd+' font-bold text-[#0b1c30]'}>{t.name||('-')}</td>
                              <td className={posTd+' text-center'}><PosBadge tone={TX_TONE[t.transaction_type]||'slate'}>{t.transaction_type}</PosBadge></td>
                              <td className={posTd+' text-right font-bold tabular-nums '+((Number(t.points)||0)<0?'text-red-600':'text-emerald-600')}>
                                {(Number(t.points)||0)>0?'+':''}{nf(t.points)}
                              </td>
                              <td className={posTd+' text-xs text-[#45464d]'}>{t.reference_type ? `${t.reference_type} #${t.reference_id ?? '-'}` : '-'}</td>
                              <td className={posTd+' text-xs text-[#45464d]'}>{t.description||'-'}</td>
                            </tr>
                          ))}
                          {!pageRows.length && <PosEmpty colSpan={6} text="Belum ada mutasi poin"/>}
                        </tbody>
                      </>
                    )}
                  </table>
                </div>
                {total>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit={tab==='saldo'?'member':'transaksi'}/></PosCardBody>}
              </>
            )}
          </>
        )}
      </PosCard>

      {/* modal poin */}
      {(modal==='earn' || modal==='redeem') && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitPoints} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">{modal==='earn' ? 'Tambah Poin' : 'Tukar Poin'}</h3>
                <div className="text-xs text-[#45464d] mt-0.5">{modal==='earn' ? 'Poin masuk manual (bonus, koreksi, referral)' : 'Poin keluar karena ditukar hadiah/diskon'}</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CUSTOMER *</span>
              <PosSelect size="md" value={form.customer_id} onChange={v=>setForm({...form, customer_id:v})}>
                <option value="">Pilih customer</option>
                {customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
              </PosSelect>
            </label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">JUMLAH POIN *</span>
              <input type="number" value={form.points} onChange={e=>setForm({...form, points:e.target.value})} placeholder="1000" className={posInput+' text-right tabular-nums'}/></label>
            {modal==='earn' && (
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">SUMBER</span>
                <PosSelect size="md" value={form.reference_type} onChange={v=>setForm({...form, reference_type:v})}>
                  <option value="MANUAL">Manual / bonus</option>
                  <option value="INVOICE">Transaksi (invoice)</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="CAMPAIGN">Kampanye</option>
                </PosSelect>
              </label>
            )}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">KETERANGAN</span>
              <input value={form.description} onChange={e=>setForm({...form, description:e.target.value})} placeholder="mis. bonus pembelian 10 sak" className={posInput}/></label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : (modal==='earn' ? <Plus size={14}/> : <Minus size={14}/>)} Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* modal tier */}
      {modal==='tier' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitTier} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Tier Baru</h3>
                <div className="text-xs text-[#45464d] mt-0.5">Tier ditentukan otomatis dari total belanja customer</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA TIER *</span>
              <input value={tierForm.name} onChange={e=>setTierForm({...tierForm, name:e.target.value})} placeholder="mis. Diamond" className={posInput}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">MIN BELANJA Rp</span>
                <input type="number" value={tierForm.min_spend} onChange={e=>setTierForm({...tierForm, min_spend:e.target.value})} placeholder="0" className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">DISKON %</span>
                <input type="number" step="0.5" value={tierForm.discount_pct} onChange={e=>setTierForm({...tierForm, discount_pct:e.target.value})} placeholder="0" className={posInput+' text-right tabular-nums'}/></label>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={tierForm.prioritas} onChange={e=>setTierForm({...tierForm, prioritas:e.target.checked})}/> Prioritas layanan</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={tierForm.gratis_ongkir} onChange={e=>setTierForm({...tierForm, gratis_ongkir:e.target.checked})}/> Gratis ongkir</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} Simpan Tier
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
