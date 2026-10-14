
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function Budgets(){
  const [rows,setRows]=useState([]); const [compare,setCompare]=useState([]); const [cf,setCf]=useState(null); const [scenarios,setScenarios]=useState([]);
  const [branches,setBranches]=useState([]); const [accounts,setAccounts]=useState([]);
  const [form,setForm]=useState({fiscal_year:2024, branch_id:1, period_month:9, account_id:7, budget_amount:''});
  const load=()=>{ api.get('/budgets').then(r=>setRows(r.data)); api.get('/budgets/comparison').then(r=>setCompare(r.data)); api.get('/budgets/cashflow').then(r=>setCf(r.data)); api.get('/budgets/scenarios').then(r=>setScenarios(r.data)); };
  useEffect(()=>{ load(); api.get('/master/branches').then(r=>setBranches(r.data)); api.get('/finance/coa').then(r=>setAccounts(r.data)); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/budgets',{fiscal_year: parseInt(form.fiscal_year), branch_id: parseInt(form.branch_id), account_id: parseInt(form.account_id), period_month: parseInt(form.period_month), budget_amount: parseFloat(form.budget_amount)});
    load();
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Budgeting & Cashflow Projection</h1></div></div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
          <h3 className="font-bold">Realisasi vs Budget</h3>
          <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5">BULAN</th><th className="px-4 py-3.5 text-right">BUDGET</th><th className="px-4 py-3.5 text-right">ACTUAL</th><th className="px-4 py-3.5 text-right">SELISIH</th><th className="px-4 py-3.5 text-right">%</th></tr></thead><tbody>{compare.map(c=>(
            <tr key={c.period_month} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 text-center">M{c.period_month}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(c.budget)}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(c.actual)}</td><td className={"p-2 text-right font-bold "+(c.variance>0?"text-emerald-600":"text-red-600")}>{new Intl.NumberFormat('id-ID').format(c.variance)}</td><td className="px-4 py-3.5 text-right">{c.pct}%</td></tr>
          ))}{compare.length===0 && <tr><td colSpan={5} className="p-4 text-center text-[#94A3B8]">Belum ada budget</td></tr>}</tbody></table></div>
        </div>
        <div className="bg-[#0F172A] text-white rounded-2xl p-5">
          <h3 className="font-bold">Cashflow 90 Hari</h3>
          {cf && <div className="mt-3 space-y-2 text-sm">{cf.breakdown.map(b=>(
            <div key={b.label} className="flex justify-between"><span className="text-white/70">{b.label}</span><span className="font-bold">{new Intl.NumberFormat('id-ID').format(b.amount)}</span></div>
          ))}<div className="flex justify-between font-black text-base border-t border-white/20 pt-2"><span>Proyeksi Net</span><span className={cf.net_projection>0?"text-emerald-300":"text-red-300"}>{new Intl.NumberFormat('id-ID').format(cf.net_projection)}</span></div></div>}
          <div className="mt-4 space-y-2 text-xs">{scenarios.map(s=>(
            <div key={s.scenario} className="flex justify-between bg-white/10 rounded-lg px-3 py-2"><span>{s.scenario}</span><span>{new Intl.NumberFormat('id-ID',{notation:'compact'}).format(s.profit)}</span></div>
          ))}</div>
        </div>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
        <h3 className="font-bold">Input Budget</h3>
        <form onSubmit={submit} className="grid md:grid-cols-6 gap-2 mt-3">
          <input type="number" value={form.fiscal_year} onChange={e=>setForm({...form,fiscal_year:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]" placeholder="Tahun"/>
          <select value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})} className="h-10 border rounded-xl px-2"><option value="">Cabang</option>{branches.map(b=> <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select value={form.account_id} onChange={e=>setForm({...form,account_id:e.target.value})} className="h-10 border rounded-xl px-2"><option value="">Akun</option>{accounts.map(a=> <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
          <input type="number" min={1} max={12} value={form.period_month} onChange={e=>setForm({...form,period_month:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]" placeholder="Bulan 1-12"/>
          <input type="number" value={form.budget_amount} onChange={e=>setForm({...form,budget_amount:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]" placeholder="Nilai"/>
          <button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button>
        </form>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
        <h3 className="font-bold">Budget List 2024</h3>
        <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5">TAHUN</th><th className="px-4 py-3.5">CABANG</th><th className="px-4 py-3.5">AKUN</th><th className="px-4 py-3.5">BULAN</th><th className="px-4 py-3.5 text-right">NILAI</th></tr></thead><tbody>{rows.map(r=>(
          <tr key={r.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 text-center">{r.fiscal_year}</td><td className="px-4 py-3.5">{r.branch_name||r.branch_id}</td><td className="px-4 py-3.5">{r.account_code} {r.account_name}</td><td className="p-2 text-center">{r.period_month}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(r.budget_amount)}</td></tr>
        ))}</tbody></table></div>
      </div>
    </div>
  )
}
