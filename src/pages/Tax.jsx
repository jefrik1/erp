import { useCallback, useEffect, useState } from 'react';
import { Receipt, Download, RefreshCw, Save, Plus, Trash2, FileSpreadsheet, Percent, Sparkles, Building2, FileText } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, PosChipRow, PosChip, PosSelect,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const tgl = (v)=> v ? String(v).slice(0,10).split('-').reverse().join('/') : '-';
const thisPeriod = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);

export const formatNSFP = (val) => {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '').slice(0, 16);
  let res = '';
  if (digits.length > 0) res += digits.slice(0, 3);
  if (digits.length > 3) res += '.' + digits.slice(3, 6);
  if (digits.length > 6) res += '-' + digits.slice(6, 8);
  if (digits.length > 8) res += '.' + digits.slice(8, 16);
  return res;
};

export default function Tax(){
  const dialog = useDialog();
  const [period,setPeriod]=useState(thisPeriod());
  const [summary,setSummary]=useState(null);
  const [invoices,setInvoices]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [pph,setPph]=useState([]);
  const [tab,setTab]=useState('keluaran');
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [draft,setDraft]=useState({});           // invoice_id → nomor faktur
  const [busyId,setBusyId]=useState(null);
  const [form,setForm]=useState({ pph_type:'PPH23', base:'', rate:'2', amount:'', partner_name:'', invoice_number:'', notes:'' });
  const [saving,setSaving]=useState(false);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const [s,i,p,sup] = await Promise.all([
        api.get('/tax/summary', { params:{ period } }),
        api.get('/tax/invoices', { params:{ period } }),
        api.get('/tax/pph', { params:{ period } }),
        api.get('/master/suppliers').catch(()=>({ data:[] })),
      ]);
      setSummary(s.data||null);
      setInvoices(Array.isArray(i.data?.data)? i.data.data : []);
      setPph(Array.isArray(p.data?.data)? p.data.data : []);
      setSuppliers(Array.isArray(sup.data)? sup.data : []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data pajak'); }
    finally{ setLoading(false); }
  },[period]);
  useEffect(()=>{ load(); },[load]);

  const saveNumber = async (inv)=>{
    const rawVal = draft[inv.id] ?? inv.tax_number ?? '';
    const cleanDigits = String(rawVal).replace(/\D/g, '');
    setBusyId(inv.id);
    try{
      const r = await api.post(`/tax/invoices/${inv.id}/number`, { tax_number: cleanDigits });
      await dialog.alert(`Nomor faktur ${r.data.tax_number} tersimpan untuk ${inv.invoice_number}.`, { title:'Faktur pajak', tone:'success' });
      setDraft(prev=>{ const n={...prev}; delete n[inv.id]; return n; });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menyimpan nomor' }); }
    finally{ setBusyId(null); }
  };

  const removeNumber = async (inv)=>{
    const ok = await dialog.confirm(`Hapus nomor faktur untuk ${inv.invoice_number}?`, { title:'Hapus nomor faktur', confirmText:'Ya, hapus' });
    if(!ok) return;
    try{ await api.delete(`/tax/invoices/${inv.id}/number`); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  const autoGenerateAll = async ()=>{
    const ok = await dialog.confirm(
      `Generate nomor seri faktur pajak (NSFP 16-digit) otomatis berurutan untuk semua invoice yang belum bernomor pada periode ${period}?`,
      { title:'Isi Otomatis Semua NSFP', confirmText:'Generate Otomatis' }
    );
    if(!ok) return;
    setLoading(true);
    try{
      const r = await api.post('/tax/invoices/auto-generate', { period });
      await dialog.alert(`Berhasil menomori otomatis ${r.data.generated} invoice pada periode ${period}.`, { title:'e-Faktur Otomatis', tone:'success' });
      load();
    }catch(e){
      await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal generate otomatis' });
      setLoading(false);
    }
  };

  // PPh form rate and calculation logic
  const handleTypeChange = (newType)=>{
    const defaultRates = { PPH23:'2', PPH21:'5', PPH4_2:'10' };
    const r = defaultRates[newType] || '2';
    const b = parseFloat(form.base)||0;
    const rateNum = parseFloat(r)||0;
    const calc = b > 0 && rateNum > 0 ? String(Math.round(b * rateNum / 100)) : '';
    setForm(f=>({...f, pph_type: newType, rate: r, amount: calc }));
  };

  const handleBaseChange = (val)=>{
    const b = parseFloat(val)||0;
    const r = parseFloat(form.rate)||0;
    const calc = b > 0 && r > 0 ? String(Math.round(b * r / 100)) : '';
    setForm(f=>({...f, base: val, amount: calc }));
  };

  const handleRateChange = (val)=>{
    const b = parseFloat(form.base)||0;
    const r = parseFloat(val)||0;
    const calc = b > 0 && r > 0 ? String(Math.round(b * r / 100)) : '';
    setForm(f=>({...f, rate: val, amount: calc }));
  };

  const handleSelectInvoice = (invId)=>{
    if(!invId) return;
    const inv = invoices.find(x=> String(x.id) === String(invId));
    if(inv){
      const b = inv.dpp || (inv.total - (inv.ppn||0));
      const r = parseFloat(form.rate)||2;
      const calc = String(Math.round(b * r / 100));
      setForm(f=>({
        ...f,
        partner_name: inv.customer_name || f.partner_name,
        invoice_number: inv.invoice_number,
        base: String(b),
        amount: calc,
        notes: inv.npwp ? `NPWP: ${inv.npwp}` : f.notes,
      }));
    }
  };

  const handleSelectSupplier = (suppId)=>{
    if(!suppId) return;
    const s = suppliers.find(x=> String(x.id) === String(suppId));
    if(s){
      setForm(f=>({
        ...f,
        partner_name: s.name,
        notes: s.tax_id || s.npwp ? `NPWP: ${s.tax_id || s.npwp}` : f.notes,
      }));
    }
  };

  const addPph = async ()=>{
    const base = parseFloat(form.base)||0;
    if(base<=0) return dialog.alert('Isi dasar pengenaan (base).', { title:'Tambah PPh' });
    setSaving(true);
    try{
      await api.post('/tax/pph', { ...form, base, rate: parseFloat(form.rate)||undefined, amount: form.amount? parseFloat(form.amount):undefined, period });
      setForm({ pph_type:'PPH23', base:'', rate:'2', amount:'', partner_name:'', invoice_number:'', notes:'' });
      await dialog.alert('Pemotongan PPh dicatat.', { title:'Tersimpan', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menyimpan PPh' }); }
    finally{ setSaving(false); }
  };

  const delPph = async (row)=>{
    const ok = await dialog.confirm('Hapus catatan PPh ini?', { title:'Hapus PPh', confirmText:'Ya, hapus' });
    if(!ok) return;
    try{ await api.delete('/tax/pph/'+row.id); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  const exportCsv = ()=>{
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const base = (import.meta.env.VITE_API_URL || '/api');
    fetch(base+'/tax/export?period='+period, { headers: token? { Authorization:'Bearer '+token }:{} })
      .then(r=> r.blob())
      .then(b=>{
        const url = URL.createObjectURL(b);
        const a = document.createElement('a'); a.href=url; a.download=`rekap-pajak-${period}.csv`; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(async()=> dialog.alert('Gagal mengunduh rekap.', { title:'Export' }));
  };

  const kb = summary? Number(summary.ppn_kurang_bayar)||0 : 0;
  const lb = summary? Number(summary.ppn_lebih_bayar)||0 : 0;

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Receipt} title="Administrasi Pajak"
        subtitle="Faktur pajak keluaran (e-Faktur), rekap PPN masa, dan pemotongan PPh 21/23/4(2)"
        badge={period}
        actions={<>
          <input
            type="month"
            value={period}
            onChange={e=>setPeriod(e.target.value||thisPeriod())}
            className="h-9 w-auto sm:w-[165px] px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink outline-none focus:border-brand"
          />
          <button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat</button>
          <button onClick={exportCsv} className={posBtnPrimary+' h-9 px-3 text-xs'}><Download size={13}/> Export CSV</button>
        </>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Percent} tone="bg-brand/10 text-brand" label="PPN KELUARAN" value={rupiah(summary?.ppn_keluaran)} sub={(summary?.invoices||0)+' invoice penjualan'}/>
        <PosStat icon={FileSpreadsheet} tone="bg-sky-50 text-sky-700" label="PPN MASUKAN" value={rupiah(summary?.ppn_masukan)} sub={(summary?.purchase_invoices||0)+' invoice pembelian'}/>
        <PosStat icon={Receipt} tone={kb>0?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700'} label={kb>0?'PPN KURANG BAYAR':'PPN LEBIH BAYAR'} value={rupiah(kb>0?kb:lb)} sub={kb>0?'setor ke kas negara':'dikompensasi bulan depan'}/>
        <PosStat icon={Percent} tone="bg-violet-50 text-violet-700" label="PPh DIPOTONG" value={rupiah(summary?.pph_total)} sub={(summary?.pph||[]).map(x=>x.type+':'+x.count).join(' • ')||'belum ada'}/>
      </div>

      <PosCard>
        <PosCardBody className="flex flex-wrap items-center justify-between gap-2 border-b border-line">
          <PosChipRow>
            <PosChip active={tab==='keluaran'} onClick={()=>setTab('keluaran')}>Faktur Keluaran{summary? ` (${summary.invoices_with_number}/${summary.invoices})`:''}</PosChip>
            <PosChip active={tab==='pph'} onClick={()=>setTab('pph')}>PPh Dipotong{pph.length? ` (${pph.length})`:''}</PosChip>
          </PosChipRow>
          <div className="flex flex-wrap items-center gap-2">
            {tab==='keluaran' && summary?.invoices_missing_number > 0 && (
              <button
                onClick={autoGenerateAll}
                className={posBtnSecondary+' h-8 px-2.5 text-xs text-brand font-semibold shadow-sm hover:border-brand/40'}
                title="Generate otomatis nomor faktur berurutan 16 digit"
              >
                <Sparkles size={13} className="text-brand"/> Isi Otomatis Semua
              </button>
            )}
            {summary?.invoices_missing_number>0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                {summary.invoices_missing_number} invoice belum punya nomor faktur
              </span>
            )}
          </div>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : (
          <>
            {tab==='keluaran' && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                    <PosTh>INVOICE</PosTh><PosTh>PEMBELI</PosTh><PosTh align="right">DPP</PosTh><PosTh align="right">PPN</PosTh>
                    <PosTh>NOMOR FAKTUR</PosTh><PosTh align="center">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {invoices.map(inv=>{
                      const currentVal = draft[inv.id] !== undefined ? draft[inv.id] : formatNSFP(inv.tax_number || '');
                      const rawDigits = String(currentVal).replace(/\D/g, '');
                      const valid = rawDigits.length === 16;
                      return (
                        <tr key={inv.id} className={posTr}>
                          <td className={posTd}>
                            <div className="font-mono text-xs font-bold text-ink">{inv.invoice_number}</div>
                            <div className="text-[10px] text-ink-3">{tgl(inv.invoice_date)} • {inv.status}</div>
                          </td>
                          <td className={posTd+' text-xs'}>
                            <div className="font-semibold text-ink">{inv.customer_name||'-'}</div>
                            <div className="text-[10px] font-mono text-ink-3">{inv.npwp||'NPWP belum ada'}</div>
                          </td>
                          <td className={posTd+' text-right tabular-nums'}>{rupiah(inv.dpp)}</td>
                          <td className={posTd+' text-right tabular-nums font-semibold text-ink'}>{rupiah(inv.ppn)}</td>
                          <td className={posTd}>
                            <div className="flex items-center gap-1.5">
                              <input
                                value={currentVal}
                                onChange={e=> {
                                  const formatted = formatNSFP(e.target.value);
                                  setDraft(prev=>({...prev, [inv.id]: formatted }));
                                }}
                                maxLength={21}
                                placeholder="010.000-26.00000001"
                                className={posInput+' h-8 text-xs font-mono w-[200px]'}
                              />
                              {inv.tax_number && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold shrink-0">terbit</span>}
                            </div>
                            {currentVal && !valid && <div className="text-[10px] text-red-600 mt-0.5">harus 16 digit ({rawDigits.length}/16)</div>}
                          </td>
                          <td className={posTd+' text-center whitespace-nowrap'}>
                            <button onClick={()=>saveNumber(inv)} disabled={busyId===inv.id || !valid}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-white text-[11px] font-bold disabled:opacity-40">
                              <Save size={11}/> Simpan
                            </button>
                            {inv.tax_number && <button onClick={()=>removeNumber(inv)} className="ml-1 text-[11px] text-red-600 font-bold hover:underline">Hapus</button>}
                          </td>
                        </tr>
                      );
                    })}
                    {!invoices.length && <PosEmpty colSpan={6} text="Tidak ada invoice pada periode ini"/>}
                  </tbody>
                </table>
              </div>
            )}

            {tab==='pph' && (
              <>
                <div className="p-3 bg-surface-2 border-b border-line space-y-2">
                  <div className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">Isi Cepat Dari Referensi Transaksi</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-ink-3 flex items-center gap-1"><FileText size={12}/> Ambil Dari Invoice Penjualan</span>
                      <select onChange={e=>handleSelectInvoice(e.target.value)} defaultValue="" className="w-full h-8 px-2.5 bg-surface border border-line rounded-lg text-xs text-ink outline-none focus:border-brand">
                        <option value="">-- Pilih Invoice Periode Ini --</option>
                        {invoices.map(inv=>(
                          <option key={inv.id} value={inv.id}>{inv.invoice_number} • {inv.customer_name||'Tanpa Pelanggan'} • DPP {rupiah(inv.dpp)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-ink-3 flex items-center gap-1"><Building2 size={12}/> Ambil Pihak Dari Master Supplier</span>
                      <select onChange={e=>handleSelectSupplier(e.target.value)} defaultValue="" className="w-full h-8 px-2.5 bg-surface border border-line rounded-lg text-xs text-ink outline-none focus:border-brand">
                        <option value="">-- Pilih Supplier Master --</option>
                        {suppliers.map(sup=>(
                          <option key={sup.id} value={sup.id}>{sup.name} {sup.tax_id? `(NPWP: ${sup.tax_id})`:''}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <PosCardBody className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-end">
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Jenis</span>
                    <PosSelect value={form.pph_type} onChange={handleTypeChange}>
                      <option value="PPH21">PPh 21 (5%)</option>
                      <option value="PPH23">PPh 23 (2%)</option>
                      <option value="PPH4_2">PPh 4(2) (10%)</option>
                    </PosSelect>
                  </label>
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Base (DPP)</span>
                    <input type="number" value={form.base} onChange={e=>handleBaseChange(e.target.value)} placeholder="0" className={posInput+' h-9 text-xs'}/>
                  </label>
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Tarif %</span>
                    <input type="number" step="0.1" value={form.rate} onChange={e=>handleRateChange(e.target.value)} placeholder="2" className={posInput+' h-9 text-xs'}/>
                  </label>
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Nominal PPh</span>
                    <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="auto" className={posInput+' h-9 text-xs font-semibold text-brand'}/>
                  </label>
                  <label className="block space-y-1 sm:col-span-2"><span className="text-[11px] font-bold text-ink-2">Pihak Dipotong / Catatan</span>
                    <input value={form.partner_name} onChange={e=>setForm(f=>({...f,partner_name:e.target.value}))} placeholder="nama supplier / kontraktor" className={posInput+' h-9 text-xs'}/>
                  </label>
                  <button onClick={addPph} disabled={saving} className={posBtnPrimary+' h-9 px-3 text-xs'}><Plus size={13}/> Tambah</button>
                </PosCardBody>

                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                      <PosTh>TANGGAL</PosTh><PosTh>JENIS</PosTh><PosTh>PIHAK</PosTh><PosTh align="right">BASE</PosTh>
                      <PosTh align="center">TARIF</PosTh><PosTh align="right">PPh</PosTh><PosTh align="center">AKSI</PosTh>
                    </tr></thead>
                    <tbody>
                      {pph.map(p=>(
                        <tr key={p.id} className={posTr}>
                          <td className={posTd+' text-xs'}>{tgl(p.created_at)}</td>
                          <td className={posTd+' text-center'}><PosBadge tone="violet">{String(p.pph_type).replace('PPH','PPh ')}</PosBadge></td>
                          <td className={posTd+' text-xs'}>
                            <div className="font-semibold text-ink">{p.partner_name||'-'}</div>
                            {p.invoice_number && <span className="block text-[10px] font-mono text-ink-3">{p.invoice_number}</span>}
                            {p.notes && <span className="block text-[10px] text-ink-3">{p.notes}</span>}
                          </td>
                          <td className={posTd+' text-right tabular-nums'}>{rupiah(p.base)}</td>
                          <td className={posTd+' text-center tabular-nums'}>{Number(p.rate)}%</td>
                          <td className={posTd+' text-right tabular-nums font-bold text-ink'}>{rupiah(p.amount)}</td>
                          <td className={posTd+' text-center'}><button onClick={()=>delPph(p)} className="text-red-600 hover:underline p-1"><Trash2 size={13}/></button></td>
                        </tr>
                      ))}
                      {!pph.length && <PosEmpty colSpan={7} text="Belum ada pemotongan PPh pada periode ini"/>}
                    </tbody>
                    {pph.length>0 && <tfoot><tr className="bg-navy text-white font-bold"><td colSpan={5} className="p-2.5 text-right text-[11px] tracking-wider">TOTAL PPh</td><td className="p-2.5 text-right tabular-nums">{rupiah(summary?.pph_total)}</td><td/></tr></tfoot>}
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </PosCard>

      <div className="text-[11px] text-ink-3 px-1">
        PPN keluaran dihitung dari <b>invoices.tax</b>, PPN masukan dari <b>purchase_invoices.tax</b> pada periode terpilih.
        Nomor faktur wajib 16 digit (format e-Faktur <span className="font-mono">010.000-26.00000001</span>) — {summary? summary.invoices_with_number:0} dari {summary? summary.invoices:0} invoice sudah bernomor.
      </div>
    </div>
  );
}
