import { useCallback, useEffect, useState } from 'react';
import { Receipt, Download, RefreshCw, Save, Plus, Trash2, FileSpreadsheet, Percent } from 'lucide-react';
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
const fmtTax = (digits)=> String(digits||'').replace(/^(\d{3})(\d{3})(\d{2})(\d{8})$/, '$1.$2-$3.$4');

export default function Tax(){
  const dialog = useDialog();
  const [period,setPeriod]=useState(thisPeriod());
  const [summary,setSummary]=useState(null);
  const [invoices,setInvoices]=useState([]);
  const [pph,setPph]=useState([]);
  const [tab,setTab]=useState('keluaran');
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [draft,setDraft]=useState({});           // invoice_id → nomor faktur
  const [busyId,setBusyId]=useState(null);
  const [form,setForm]=useState({ pph_type:'PPH23', base:'', rate:'', amount:'', partner_name:'', invoice_number:'', notes:'' });
  const [saving,setSaving]=useState(false);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const [s,i,p] = await Promise.all([
        api.get('/tax/summary', { params:{ period } }),
        api.get('/tax/invoices', { params:{ period } }),
        api.get('/tax/pph', { params:{ period } }),
      ]);
      setSummary(s.data||null);
      setInvoices(Array.isArray(i.data?.data)? i.data.data : []);
      setPph(Array.isArray(p.data?.data)? p.data.data : []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data pajak'); }
    finally{ setLoading(false); }
  },[period]);
  useEffect(()=>{ load(); },[load]);

  const saveNumber = async (inv)=>{
    const raw = draft[inv.id] ?? inv.tax_number ?? '';
    setBusyId(inv.id);
    try{
      const r = await api.post(`/tax/invoices/${inv.id}/number`, { tax_number: raw });
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

  const addPph = async ()=>{
    const base = parseFloat(form.base)||0;
    if(base<=0) return dialog.alert('Isi dasar pengenaan (base).', { title:'Tambah PPh' });
    setSaving(true);
    try{
      await api.post('/tax/pph', { ...form, base, rate: parseFloat(form.rate)||undefined, amount: form.amount? parseFloat(form.amount):undefined, period });
      setForm({ pph_type:'PPH23', base:'', rate:'', amount:'', partner_name:'', invoice_number:'', notes:'' });
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
          <input type="month" value={period} onChange={e=>setPeriod(e.target.value||thisPeriod())} className={posInput+' h-9 w-[150px] text-xs'}/>
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
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <PosChipRow>
            <PosChip active={tab==='keluaran'} onClick={()=>setTab('keluaran')}>Faktur Keluaran{summary? ` (${summary.invoices_with_number}/${summary.invoices})`:''}</PosChip>
            <PosChip active={tab==='pph'} onClick={()=>setTab('pph')}>PPh Dipotong{pph.length? ` (${pph.length})`:''}</PosChip>
          </PosChipRow>
          {summary?.invoices_missing_number>0 && (
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold">
              {summary.invoices_missing_number} invoice belum punya nomor faktur
            </span>
          )}
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
                      const val = draft[inv.id] ?? inv.tax_number ?? '';
                      const valid = String(val).replace(/[^0-9]/g,'').length === 16;
                      return (
                        <tr key={inv.id} className={posTr}>
                          <td className={posTd}>
                            <div className="font-mono text-xs font-bold">{inv.invoice_number}</div>
                            <div className="text-[10px] text-ink-3">{tgl(inv.invoice_date)} • {inv.status}</div>
                          </td>
                          <td className={posTd+' text-xs'}>
                            <div className="font-semibold">{inv.customer_name||'-'}</div>
                            <div className="text-[10px] font-mono text-ink-3">{inv.npwp||'NPWP belum ada'}</div>
                          </td>
                          <td className={posTd+' text-right tabular-nums'}>{rupiah(inv.dpp)}</td>
                          <td className={posTd+' text-right tabular-nums font-semibold'}>{rupiah(inv.ppn)}</td>
                          <td className={posTd}>
                            <div className="flex items-center gap-1.5">
                              <input value={val} onChange={e=>setDraft(prev=>({...prev,[inv.id]:e.target.value}))}
                                placeholder="16 digit" className={posInput+' h-8 text-xs font-mono w-[190px]'}/>
                              {inv.tax_number && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">terbit</span>}
                            </div>
                            {val && !valid && <div className="text-[10px] text-red-600 mt-0.5">harus 16 digit</div>}
                          </td>
                          <td className={posTd+' text-center whitespace-nowrap'}>
                            <button onClick={()=>saveNumber(inv)} disabled={busyId===inv.id || !valid}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand text-white text-[11px] font-bold disabled:opacity-40">
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
                <PosCardBody className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-end">
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Jenis</span>
                    <PosSelect value={form.pph_type} onChange={v=>setForm(f=>({...f,pph_type:v}))}>
                      <option value="PPH21">PPh 21</option><option value="PPH23">PPh 23</option><option value="PPH4_2">PPh 4(2)</option>
                    </PosSelect>
                  </label>
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Base</span>
                    <input type="number" value={form.base} onChange={e=>setForm(f=>({...f,base:e.target.value}))} className={posInput+' h-9 text-xs'}/>
                  </label>
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Tarif %</span>
                    <input type="number" value={form.rate} onChange={e=>setForm(f=>({...f,rate:e.target.value}))} placeholder="2" className={posInput+' h-9 text-xs'}/>
                  </label>
                  <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-ink-2">Nominal</span>
                    <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="auto" className={posInput+' h-9 text-xs'}/>
                  </label>
                  <label className="block space-y-1 sm:col-span-2"><span className="text-[11px] font-bold text-ink-2">Pihak dipotong</span>
                    <input value={form.partner_name} onChange={e=>setForm(f=>({...f,partner_name:e.target.value}))} placeholder="nama supplier/penerima" className={posInput+' h-9 text-xs'}/>
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
                          <td className={posTd+' text-xs'}>{p.partner_name||'-'}{p.invoice_number? <span className="block text-[10px] font-mono text-ink-3">{p.invoice_number}</span>:null}</td>
                          <td className={posTd+' text-right tabular-nums'}>{rupiah(p.base)}</td>
                          <td className={posTd+' text-center tabular-nums'}>{Number(p.rate)}%</td>
                          <td className={posTd+' text-right tabular-nums font-bold'}>{rupiah(p.amount)}</td>
                          <td className={posTd+' text-center'}><button onClick={()=>delPph(p)} className="text-red-600 hover:underline"><Trash2 size={13}/></button></td>
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
