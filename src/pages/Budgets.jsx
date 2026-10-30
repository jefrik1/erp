import { LOCATION, LOCATION_COORDINATES } from '../config/location';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, Pencil, Trash2, X, Check, Info,
  Save, RefreshCw, AlertCircle, MapPin,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import { PosPageHeader, PosCard, PosCardBody, PosSelect, PosExportButtons, posBtnPrimary, posBtnSecondary } from '../components/PosUI';

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const monthLabel = (m)=> MONTHS[Number(m)-1] || ('M'+m);
const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const progColor = (p)=> p >= 100 ? 'bg-emerald-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500';
const progText = (p)=> p >= 100 ? 'text-emerald-600' : p >= 70 ? 'text-amber-600' : 'text-red-600';
// Tombol toolbar: satu tinggi (h-9) supaya sejajar dengan PosSelect sm - jangan digabung
// dengan posBtnSecondary karena kelas h-[42px]-nya bentrok dengan h-9.
const TB = 'h-9 px-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-xs font-bold text-ink-2 hover:bg-surface-2 active:scale-[0.98] transition whitespace-nowrap';

function Err({ msg }){ return msg ? <p className="text-[11px] text-red-600 font-semibold mt-1">{msg}</p> : null; }

export default function Budgets(){
  const dialog = useDialog();
  const currentYear = new Date().getFullYear();

  // ---------------------------------------------------------------- filters
  const [year, setYear] = useState(currentYear);
  const [accountId, setAccountId] = useState('');

  // ---------------------------------------------------------------- data
  const [rows, setRows] = useState([]);
  const [listErr, setListErr] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [compare, setCompare] = useState({ rows: [], ytd: null });
  const [cf, setCf] = useState(null);
  const [scen, setScen] = useState(null);
  const [accounts, setAccounts] = useState([]);

  // ---------------------------------------------------------------- form
  const [form, setForm] = useState({ fiscal_year: currentYear, branch_id: '', account_id: '', period_month: '', budget_amount: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------- edit / delete
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [busyId, setBusyId] = useState(null);

  // ---------------------------------------------------------------- scenario assumptions
  const [assum, setAssum] = useState({ sales_pct: '0', collection_pct: '85', opex_pct: '8' });
  const [scenLoading, setScenLoading] = useState(false);
  const scenSeq = useRef(0);

  const filterParams = useMemo(()=>({
    fiscal_year: year,
    ...(accountId ? { account_id: accountId } : {}),
  }), [year, accountId]);

  // ---------------------------------------------------------------- loaders
  const loadList = ()=>{
    setLoadingList(true);
    api.get('/budgets', { params: filterParams })
      .then(r=>{ setRows(Array.isArray(r.data) ? r.data : []); setListErr(''); })
      .catch(e=>{ setRows([]); setListErr(e?.response?.data?.error || e.message || 'Gagal memuat budget'); })
      .finally(()=>setLoadingList(false));
  };
  const loadComparison = ()=>{
    api.get('/budgets/comparison', { params: filterParams })
      .then(r=>setCompare({ rows: Array.isArray(r.data?.rows) ? r.data.rows : [], ytd: r.data?.ytd || null }))
      .catch(()=>setCompare({ rows: [], ytd: null }));
  };
  const refresh = ()=>{ loadList(); loadComparison(); };

  useEffect(()=>{ refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year, accountId]);

  useEffect(()=>{
    api.get('/master/branches').then(r=>{
      const first = Array.isArray(r.data) ? r.data[0] : null;
      setForm(f=>({ ...f, branch_id: first?.id ? String(first.id) : '' }));
    }).catch(()=>{});
    api.get('/finance/coa').then(r=>setAccounts(Array.isArray(r.data)?r.data:[])).catch(()=>setAccounts([]));
    api.get('/budgets/cashflow', { params: { days: 90 } }).then(r=>setCf(r.data)).catch(()=>setCf(null));
  }, []);

  // filter tahun jadi konteks form
  useEffect(()=>{ setForm(f=>({ ...f, fiscal_year: year })); }, [year]);

  // skenario: recompute live dengan debounce 400ms
  useEffect(()=>{
    const seq = ++scenSeq.current;
    setScenLoading(true);
    const t = setTimeout(()=>{
      api.get('/budgets/scenarios', {
        params: {
          sales_pct: Number(assum.sales_pct) || 0,
          collection_pct: Number(assum.collection_pct) || 0,
          opex_pct: Number(assum.opex_pct) || 0,
        },
      })
        .then(r=>{ if (seq === scenSeq.current) setScen(r.data); })
        .catch(()=>{ if (seq === scenSeq.current) setScen(null); })
        .finally(()=>{ if (seq === scenSeq.current) setScenLoading(false); });
    }, 400);
    return ()=>clearTimeout(t);
  }, [assum.sales_pct, assum.collection_pct, assum.opex_pct]);

  // ---------------------------------------------------------------- submit
  const setField = (k, v)=>{
    setForm(f=>({ ...f, [k]: v }));
    setErrors(e=>{ if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  };

  const validate = ()=>{
    const e = {};
    const fy = Number(form.fiscal_year);
    if (!Number.isFinite(fy) || fy < 2000 || fy > 2100) e.fiscal_year = 'Tahun wajib diisi (2000-2100)';
    if (!form.branch_id) e.branch_id = 'Lokasi operasional belum tersedia. Muat ulang halaman.';
    if (!form.account_id) e.account_id = 'Akun wajib dipilih';
    const m = Number(form.period_month);
    if (!Number.isInteger(m) || m < 1 || m > 12) e.period_month = 'Bulan harus 1-12';
    const amt = Number(form.budget_amount);
    if (!(amt > 0)) e.budget_amount = 'Nilai budget harus lebih dari 0';
    return e;
  };

  const submit = async (ev)=>{
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      fiscal_year: Number(form.fiscal_year),
      branch_id: Number(form.branch_id),
      account_id: Number(form.account_id),
      period_month: Number(form.period_month),
      budget_amount: Number(form.budget_amount),
      notes: form.notes || undefined,
    };

    setSaving(true);
    try {
      // cek duplikat: kombinasi tahun+akun+bulan akan ditimpa (API upsert)
      let existing = null;
      try {
        const cek = await api.get('/budgets', { params: { fiscal_year: payload.fiscal_year, branch_id: payload.branch_id, account_id: payload.account_id } });
        existing = (Array.isArray(cek.data) ? cek.data : []).find(r=> Number(r.period_month) === payload.period_month);
      } catch { existing = null; }

      if (existing){
        const ok = await dialog.confirm(
          'Budget untuk kombinasi ini sudah ada:\n\n' +
          payload.fiscal_year + ' - ' + LOCATION.name + ' - ' + (existing.account_code || '') + ' ' + (existing.account_name || '') + ' - ' + monthLabel(payload.period_month) + '\n\n' +
          'Nilai lama: ' + rupiah(existing.budget_amount) + '\nNilai baru: ' + rupiah(payload.budget_amount) + '\n\n' +
          'Data lama akan DITIMPA (overwrite). Lanjutkan?',
          { title: 'Kombinasi sudah ada - akan ditimpa', confirmText: 'Ya, Timpa' }
        );
        if (!ok){ setSaving(false); return; }
      }

      await api.post('/budgets', payload);
      await dialog.alert(
        'Budget ' + monthLabel(payload.period_month) + ' ' + payload.fiscal_year + ' sebesar ' + rupiah(payload.budget_amount) + ' berhasil disimpan' + (existing ? ' (menimpa data lama)' : '') + '.',
        { title: 'Berhasil' }
      );
      setForm(f=>({ ...f, budget_amount: '', notes: '' }));
      setErrors({});
      refresh();
    } catch (err){
      await dialog.alert(err?.response?.data?.error || err.message || 'Gagal menyimpan budget', { title: 'Gagal' });
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- edit / delete
  const startEdit = (r)=>{ setEditingId(r.id); setEditValue(String(r.budget_amount ?? '')); };
  const cancelEdit = ()=>{ setEditingId(null); setEditValue(''); };

  const saveEdit = async (r)=>{
    const amt = Number(editValue);
    if (!(amt > 0)){ await dialog.alert('Nilai budget harus lebih dari 0', { title: 'Validasi' }); return; }
    setBusyId(r.id);
    try {
      await api.put('/budgets/' + r.id, { budget_amount: amt });
      cancelEdit();
      refresh();
      await dialog.alert('Nilai budget ' + monthLabel(r.period_month) + ' diubah menjadi ' + rupiah(amt) + '.', { title: 'Berhasil' });
    } catch (err){
      await dialog.alert(err?.response?.data?.error || err.message || 'Gagal mengubah budget', { title: 'Gagal' });
    } finally { setBusyId(null); }
  };

  const hapus = async (r)=>{
    const ok = await dialog.confirm(
      'Hapus budget ' + r.fiscal_year + ' - ' + LOCATION.name + ' - ' + (r.account_code || '') + ' ' + (r.account_name || '') + ' - ' + monthLabel(r.period_month) + ' sebesar ' + rupiah(r.budget_amount) + '?\n\nTindakan ini tidak dapat dibatalkan.',
      { title: 'Hapus Budget', confirmText: 'Ya, Hapus' }
    );
    if (!ok) return;
    setBusyId(r.id);
    try {
      await api.delete('/budgets/' + r.id);
      refresh();
      await dialog.alert('Budget berhasil dihapus.', { title: 'Berhasil' });
    } catch (err){
      await dialog.alert(err?.response?.data?.error || err.message || 'Gagal menghapus budget', { title: 'Gagal' });
    } finally { setBusyId(null); }
  };

  // ---------------------------------------------------------------- derived
  const comparisonRows = compare.rows || [];
  const ytd = compare.ytd;
  const totalList = useMemo(()=> rows.reduce((s,r)=> s + (Number(r.budget_amount)||0), 0), [rows]);
  const netPositive = cf ? Number(cf.net_projection) >= 0 : true;
  const years = useMemo(()=>{ const a = []; for (let y = currentYear-2; y <= currentYear+2; y++) a.push(y); return a; }, [currentYear]);

  // ---------------------------------------------------------------- export
  // Semua export diambil dari server (/budgets/export) supaya file punya judul, periode,
  // filter aktif, baris TOTAL, dan warna yang seragam dengan modul laporan lain.
  const [expBusy, setExpBusy] = useState('');
  const downloadReport = async (dataset, format)=>{
    const key = dataset + '-' + format;
    setExpBusy(key);
    try {
      const params = { dataset, format, fiscal_year: year };
      if (accountId) params.account_id = accountId;
      const r = await api.get('/budgets/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = (dataset === 'comparison' ? 'realisasi-vs-budget-' : 'budget-list-') + year + '.' + format;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err){
      let msg = err.message || 'Gagal mengunduh laporan';
      try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* biarkan */ }
      await dialog.alert(msg, { title: 'Export gagal' });
    } finally { setExpBusy(''); }
  };

  const ExportButtons = ({ dataset, disabled, prefix })=> (
    <PosExportButtons
      onExport={(f)=>downloadReport(dataset, f)}
      busyKey={expBusy.startsWith(dataset + '-') ? expBusy.split('-')[1] : ''}
      prefix={prefix}
      disabled={disabled}
    />
  );

  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={FileText}
        title="Budgeting & Cashflow Projection"
        subtitle="Budget per akun, realisasi vs budget, proyeksi kas dan simulasi skenario"
      />

      {/* ------------------------------------------------------------ filters */}
      <PosCard>
        <PosCardBody className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
          <div className="xl:col-span-2">
            <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">TAHUN ANGGARAN</label>
            <PosSelect value={String(year)} onChange={v=>setYear(Number(v))}>
              {years.map(y=> <option key={y} value={String(y)}>{y}</option>)}
            </PosSelect>
          </div>
          <div className="xl:col-span-3">
            <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">AKUN</label>
            <PosSelect value={accountId} onChange={setAccountId}>
              <option value="">Semua Akun</option>
              {accounts.map(a=> <option key={a.id} value={String(a.id)}>{a.code} {a.name}</option>)}
            </PosSelect>
          </div>
          <div className="xl:col-span-5 flex flex-wrap items-end justify-start xl:justify-end gap-1.5">
            <button onClick={refresh} className={TB}>
              <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''}/> Muat Ulang
            </button>
            <ExportButtons dataset="comparison" disabled={!comparisonRows.length} prefix="Realisasi"/>
          </div>
        </PosCardBody>
      </PosCard>

      <div className="grid lg:grid-cols-3 gap-4 items-stretch">
        {/* ------------------------------------------------------ comparison */}
        <div className="lg:col-span-2 flex">
          <PosCard className="flex-1 flex flex-col">
            <PosCardBody className="flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-ink">Realisasi vs Budget - {year}</h3>
                <span className="text-[11px] text-ink-2">12 bulan penuh (bulan tanpa data = 0)</span>
              </div>
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-2 bg-surface-2 border border-line rounded-xl px-3 py-2">
                <Info size={13} className="mt-0.5 shrink-0 text-brand"/>
                <span>Kolom <b>ACTUAL</b> berasal dari jurnal (journal_entries) yang belum berdimensi akun. Saat filter <b>Akun</b> aktif, angka ACTUAL tetap <b>company-wide</b> - hanya sisi BUDGET yang tersaring.</span>
              </div>

              <div className="overflow-auto mt-3 flex-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                      <th className="px-4 py-3.5 text-left">BULAN</th>
                      <th className="px-4 py-3.5 text-right">BUDGET</th>
                      <th className="px-4 py-3.5 text-right">ACTUAL</th>
                      <th className="px-4 py-3.5 text-right">SELISIH</th>
                      <th className="px-4 py-3.5 text-right">%</th>
                      <th className="px-4 py-3.5 text-left w-[160px]">PROGRESS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map(c=>{
                      const p = Number(c.progress) || 0;
                      const w = Math.max(0, Math.min(100, p));
                      return (
                        <tr key={c.period_month} className="border-b border-line hover:bg-surface-2 transition bg-white">
                          <td className="px-4 py-3 font-bold text-ink">{monthLabel(c.period_month)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{angka(c.budget)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{angka(c.actual)}</td>
                          <td className={'px-4 py-3 text-right font-bold tabular-nums ' + (Number(c.variance) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{angka(c.variance)}</td>
                          <td className={'px-4 py-3 text-right font-bold tabular-nums ' + progText(p)}>{c.pct}%</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-full max-w-[110px] bg-surface-3 rounded-full overflow-hidden">
                                <div className={'h-full rounded-full transition-all ' + progColor(p)} style={{ width: w + '%' }} />
                              </div>
                              <span className={'text-[11px] font-bold tabular-nums shrink-0 ' + progText(p)}>{p}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {comparisonRows.length === 0 && (
                      <tr><td colSpan={6} className="p-4 text-center text-ink-3">Belum ada data perbandingan</td></tr>
                    )}
                  </tbody>
                  {ytd && (
                    <tfoot>
                      <tr className="bg-surface-2 border-t-2 border-line font-bold text-ink">
                        <td className="px-4 py-3.5">YTD (TOTAL)</td>
                        <td className="px-4 py-3.5 text-right tabular-nums">{angka(ytd.budget)}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums">{angka(ytd.actual)}</td>
                        <td className={'px-4 py-3.5 text-right tabular-nums ' + (Number(ytd.variance) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{angka(ytd.variance)}</td>
                        <td className={'px-4 py-3.5 text-right tabular-nums ' + progText(Number(ytd.pct)||0)}>{ytd.pct}%</td>
                        <td className="px-4 py-3.5 text-[11px] font-semibold text-ink-2">Akumulasi Jan-Des</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </PosCardBody>
          </PosCard>
        </div>

        {/* ------------------------------------------------------- cashflow */}
        <div className="flex flex-col gap-3">
          <div className="bg-navy text-white rounded-xl p-5" title={cf?.formula || 'Kas Sekarang + Piutang jatuh tempo - Hutang jatuh tempo - Budget expense'}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">Cashflow {cf?.horizon_days || 90} Hari</h3>
              <span className={'text-[11px] font-bold px-2 py-1 rounded-full border ' + (netPositive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-red-500/20 text-red-300 border-red-400/30')}>
                {netPositive ? 'GAIN' : 'LOSS'}
              </span>
            </div>

            {cf ? (
              <div className="mt-3 space-y-2 text-sm">
                {cf.breakdown.map(b=>(
                  <div key={b.label} className="flex justify-between gap-3">
                    <span className="text-white/70">{b.label}</span>
                    <span className={'font-bold tabular-nums ' + (Number(b.amount) < 0 ? 'text-red-300' : 'text-white')}>{rupiah(b.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center font-bold text-base border-t border-white/20 pt-2">
                  <span>Proyeksi Net</span>
                  <span className={'tabular-nums ' + (netPositive ? 'text-emerald-300' : 'text-red-300')}>{rupiah(cf.net_projection)}</span>
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-white/50 leading-relaxed pt-1">
                  <Info size={11} className="mt-0.5 shrink-0"/>
                  <span>{cf.formula}</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/50">Memuat proyeksi kas...</p>
            )}
          </div>

          {/* ------------------------------------------------------ scenarios */}
          <PosCard className="flex-1 flex flex-col">
            <PosCardBody className="flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-ink">Simulasi Skenario</h3>
                {scenLoading && <span className="text-[11px] font-bold text-brand">menghitung...</span>}
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">% PENJUALAN</label>
                  <input type="number" value={assum.sales_pct} onChange={e=>setAssum(a=>({ ...a, sales_pct: e.target.value }))}
                    className="w-full h-[38px] px-2 bg-surface-2 border border-line rounded-xl text-sm text-right tabular-nums outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">% COLLECTION</label>
                  <input type="number" value={assum.collection_pct} onChange={e=>setAssum(a=>({ ...a, collection_pct: e.target.value }))}
                    className="w-full h-[38px] px-2 bg-surface-2 border border-line rounded-xl text-sm text-right tabular-nums outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">% OPEX</label>
                  <input type="number" value={assum.opex_pct} onChange={e=>setAssum(a=>({ ...a, opex_pct: e.target.value }))}
                    className="w-full h-[38px] px-2 bg-surface-2 border border-line rounded-xl text-sm text-right tabular-nums outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition" />
                </div>
              </div>
              <p className="text-[11px] text-ink-3 mt-1.5">% Penjualan boleh negatif. Perubahan dihitung ulang otomatis (sekitar 0,4 detik).</p>

              {scen ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-surface-2 border border-line rounded-xl p-3">
                      <p className="text-[11px] font-bold tracking-wider text-ink-2">PIUTANG TERTAGIH</p>
                      <p className="text-sm font-bold text-ink tabular-nums mt-1">{rupiah(scen.ar_collected)}</p>
                    </div>
                    <div className="bg-surface-2 border border-line rounded-xl p-3">
                      <p className="text-[11px] font-bold tracking-wider text-ink-2">NET CASH</p>
                      <p className={'text-sm font-bold tabular-nums mt-1 ' + (Number(scen.net_cash) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{rupiah(scen.net_cash)}</p>
                    </div>
                  </div>

                  <div className="overflow-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                          <th className="px-2 py-2.5 text-left">SKENARIO</th>
                          <th className="px-2 py-2.5 text-right">REVENUE</th>
                          <th className="px-2 py-2.5 text-right">OPEX</th>
                          <th className="px-2 py-2.5 text-right">PROFIT</th>
                          <th className="px-2 py-2.5 text-right">MARGIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(scen.scenarios || []).map(s=>(
                          <tr key={s.scenario} className="border-b border-line hover:bg-surface-2 transition bg-white">
                            <td className="px-2 py-2.5 font-bold text-ink">{s.scenario}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{angka(s.revenue)}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-red-600">-{angka(s.opex)}</td>
                            <td className={'px-2 py-2.5 text-right font-bold tabular-nums ' + (Number(s.profit) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{angka(s.profit)}</td>
                            <td className="px-2 py-2.5 text-right font-bold tabular-nums text-ink-2">{s.margin_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-ink-3 mt-2">Base revenue: {rupiah(scen.base_revenue)} - Piutang terbuka: {rupiah(scen.open_ar)}</p>
                </>
              ) : (
                <p className="mt-3 text-xs text-ink-3">Memuat skenario...</p>
              )}
            </PosCardBody>
          </PosCard>
        </div>
      </div>

      {/* ---------------------------------------------------------- input form */}
      <PosCard>
        <PosCardBody>
          <h3 className="font-bold text-ink">Input Budget</h3>
          <p className="text-xs text-ink-2 mt-0.5">Kombinasi tahun + akun + bulan bersifat unik. Menyimpan kombinasi yang sama akan <b>menimpa</b> nilai lama.</p>

          <form onSubmit={submit} className="grid md:grid-cols-3 xl:grid-cols-6 gap-3 mt-3">
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">TAHUN *</label>
              <input type="number" value={form.fiscal_year} onChange={e=>setField('fiscal_year', e.target.value)} placeholder="2026"
                className={'w-full h-[42px] px-3 bg-surface-2 border rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5]/10 transition ' + (errors.fiscal_year ? 'border-red-400' : 'border-line focus:border-brand')} />
              <Err msg={errors.fiscal_year}/>
            </div>
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">AKUN *</label>
              <select value={form.account_id} onChange={e=>setField('account_id', e.target.value)}
                className={'w-full h-[42px] px-3 bg-surface-2 border rounded-xl text-sm outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition ' + (errors.account_id ? 'border-red-400' : 'border-line')}>
                <option value="">Pilih Akun</option>
                {accounts.map(a=> <option key={a.id} value={String(a.id)}>{a.code} {a.name}</option>)}
              </select>
              <Err msg={errors.account_id}/>
            </div>
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">BULAN (1-12) *</label>
              <input type="number" min="1" max="12" value={form.period_month} onChange={e=>setField('period_month', e.target.value)} placeholder="9"
                className={'w-full h-[42px] px-3 bg-surface-2 border rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5]/10 transition ' + (errors.period_month ? 'border-red-400' : 'border-line focus:border-brand')} />
              <Err msg={errors.period_month}/>
            </div>
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">NILAI BUDGET *</label>
              <input type="number" value={form.budget_amount} onChange={e=>setField('budget_amount', e.target.value)} placeholder="0"
                className={'w-full h-[42px] px-3 bg-surface-2 border rounded-xl text-sm text-right tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5]/10 transition ' + (errors.budget_amount ? 'border-red-400' : 'border-line focus:border-brand')} />
              <Err msg={errors.budget_amount}/>
            </div>
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-ink-2 mb-1">CATATAN</label>
              <input value={form.notes} onChange={e=>setField('notes', e.target.value)} placeholder="opsional"
                className="w-full h-[42px] px-3 bg-surface-2 border border-line rounded-xl text-sm outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition" />
            </div>
            <div className="md:col-span-3 xl:col-span-6 flex items-center gap-2 flex-wrap">
              <button type="submit" disabled={saving} className={posBtnPrimary + (saving ? ' opacity-60 pointer-events-none' : '')}>
                <Save size={15}/> {saving ? 'Menyimpan...' : 'Simpan Budget'}
              </button>
              <button type="button" onClick={()=>{ setForm(f=>({ ...f, period_month:'', budget_amount:'', notes:'' })); setErrors({}); }} className={posBtnSecondary}>
                Reset
              </button>
              <span className="text-[11px] text-ink-3">* wajib diisi</span>
            </div>
          </form>
          <Err msg={errors.branch_id}/>
          <p className="text-[11px] text-ink-2 mt-2 flex items-center gap-1.5"><MapPin size={12}/> Lokasi operasional: <b className="text-ink">{LOCATION.name}</b> ({LOCATION_COORDINATES}) - dipakai otomatis untuk semua budget.</p>
        </PosCardBody>
      </PosCard>

      {/* ----------------------------------------------------------- budget list */}
      <PosCard>
        <PosCardBody>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-bold text-ink">Budget List {year}</h3>
              <p className="text-xs text-ink-2 mt-0.5">{rows.length} baris{accountId ? ' (terfilter)' : ''} - Total {rupiah(totalList)}</p>
            </div>
            <ExportButtons dataset="list" disabled={!rows.length} prefix="List"/>
          </div>

          {listErr && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle size={14}/> {listErr}
            </div>
          )}

          <div className="overflow-auto mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <th className="px-4 py-3.5 text-left">TAHUN</th>
                  
                  <th className="px-4 py-3.5 text-left">AKUN</th>
                  <th className="px-4 py-3.5 text-left">BULAN</th>
                  <th className="px-4 py-3.5 text-right">NILAI</th>
                  <th className="px-4 py-3.5 text-left">CATATAN</th>
                  <th className="px-4 py-3.5 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id} className="border-b border-line hover:bg-surface-2 transition bg-white">
                    <td className="px-4 py-3 font-bold text-ink">{r.fiscal_year}</td>
                    
                    <td className="px-4 py-3">{r.account_code} {r.account_name}</td>
                    <td className="px-4 py-3">{monthLabel(r.period_month)} <span className="text-ink-3">({r.period_month})</span></td>
                    <td className="px-4 py-3 text-right">
                      {editingId === r.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input autoFocus type="number" value={editValue} onChange={e=>setEditValue(e.target.value)}
                            onKeyDown={e=>{ if (e.key === 'Enter'){ e.preventDefault(); saveEdit(r); } if (e.key === 'Escape'){ cancelEdit(); } }}
                            className="h-9 w-36 px-2 bg-white border border-brand rounded-lg text-xs text-right tabular-nums outline-none focus:ring-2 focus:ring-[#0051d5]/10" />
                          <button title="Simpan" onClick={()=>saveEdit(r)} disabled={busyId === r.id}
                            className="w-8 h-8 grid place-items-center rounded-lg bg-brand text-white hover:bg-brand-strong disabled:opacity-50"><Check size={14}/></button>
                          <button title="Batal" onClick={cancelEdit} className="w-8 h-8 grid place-items-center rounded-lg bg-white border border-line text-ink-2 hover:bg-surface-2"><X size={14}/></button>
                        </div>
                      ) : (
                        <span className="font-bold tabular-nums">{rupiah(r.budget_amount)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{r.notes || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Ubah nilai" onClick={()=>startEdit(r)} disabled={editingId === r.id || busyId === r.id}
                          className="w-8 h-8 grid place-items-center rounded-lg bg-white border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"><Pencil size={13}/></button>
                        <button title="Hapus" onClick={()=>hapus(r)} disabled={busyId === r.id}
                          className="w-8 h-8 grid place-items-center rounded-lg bg-white border border-line text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loadingList && (
                  <tr><td colSpan={6} className="p-4 text-center text-ink-3">Belum ada budget untuk filter ini</td></tr>
                )}
                {loadingList && rows.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-ink-3">Memuat...</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-2 border-t-2 border-line font-bold text-ink">
                    <td className="px-4 py-3.5" colSpan={3}>TOTAL ({rows.length} baris)</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{rupiah(totalList)}</td>
                    <td className="px-4 py-3.5" colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </PosCardBody>
      </PosCard>
    </div>
  );
}
