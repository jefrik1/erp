
import { useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import { useNavigate } from 'react-router-dom';

export default function Login(){
  const [u,setU]=useState('admin'); const [p,setP]=useState('admin123'); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false);
  const {setAuth} = useAuth(); const nav=useNavigate();
  const submit=async(e)=>{
    e.preventDefault(); setLoading(true); setErr('');
    try{ const r=await api.post('/auth/login',{username:u,password:p}); setAuth(r.data.user, r.data.token); nav('/'); }catch(e){ setErr(e.response?.data?.error||'Login gagal'); }finally{setLoading(false);}
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-[#0F172A] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{background:'radial-gradient(600px 600px at 20% 20%, #1E40AF, transparent), radial-gradient(800px 600px at 80% 80%, #F59E0B, transparent)'}}/>
        <div className="relative">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[#1E40AF] grid place-items-center font-black">M</div><span className="font-extrabold tracking-widest text-sm">MATERIAL ERP</span></div>
          <div className="mt-16 max-w-[520px]">
            <h1 className="text-[40px] font-black leading-[0.95]">Kelola material.<br/>Kirim tepat waktu.<br/><span className="text-[#F59E0B]">Catat otomatis.</span></h1>
            <p className="text-white/70 mt-4 leading-relaxed">ERP untuk toko & distributor material: semen, besi, pasir, keramik, cat. Multi-gudang, multi-satuan, approval matriks, dan laporan laba rugi per cabang.</p>
            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4"><div className="text-2xl font-black">98%</div><div className="text-xs text-white/60">Akurasi stok</div></div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4"><div className="text-2xl font-black">30%</div><div className="text-xs text-white/60">Efisiensi ↑</div></div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4"><div className="text-2xl font-black">&lt;2s</div><div className="text-xs text-white/60">Cetak SO/Invoice</div></div>
            </div>
          </div>
        </div>
        <div className="relative text-xs text-white/50">Cabang Bekasi • Jakarta • Bandung • Multi-currency IDR/USD • PPN 11% • PSAK</div>
      </div>
      <div className="flex items-center justify-center p-6 bg-[#F9FAFB]">
        <form onSubmit={submit} className="w-full max-w-[420px] bg-white rounded-[20px] shadow-xl border p-8">
          <div className="lg:hidden flex items-center gap-2 mb-6"><div className="w-9 h-9 rounded-xl bg-[#1E40AF] grid place-items-center text-white font-black">M</div><span className="font-black">MATERIAL ERP</span></div>
          <h2 className="text-[22px] font-extrabold">Masuk ke ERP</h2>
          <p className="text-sm text-gray-500 mt-1">Gunakan akun demo di bawah. Role-based dashboard.</p>
          <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
            <div className="bg-gray-50 border rounded-xl p-2"><b>admin</b> / admin123 <span className="text-gray-500">Direktur</span></div>
            <div className="bg-gray-50 border rounded-xl p-2"><b>finance</b> / finance123</div>
            <div className="bg-gray-50 border rounded-xl p-2"><b>sales</b> / sales123</div>
            <div className="bg-gray-50 border rounded-xl p-2"><b>gudang</b> / gudang123</div>
          </div>
          <label className="block text-sm font-medium mt-6">Username</label>
          <input value={u} onChange={e=>setU(e.target.value)} className="mt-1 w-full h-11 px-3 border rounded-xl outline-none focus:border-[#1E40AF]" placeholder="admin"/>
          <label className="block text-sm font-medium mt-4">Password</label>
          <input type="password" value={p} onChange={e=>setP(e.target.value)} className="mt-1 w-full h-11 px-3 border rounded-xl outline-none focus:border-[#1E40AF]" placeholder="••••••••"/>
          {err && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-2">{err}</div>}
          <button disabled={loading} className="mt-6 w-full h-11 bg-[#1E40AF] text-white rounded-xl font-semibold hover:bg-blue-800 disabled:opacity-60">{loading?'Memproses...':'Masuk'}</button>
          <div className="text-xs text-center text-gray-400 mt-4">PRD v1.0 • Workflow Sales→Cash & Procure→Pay • Audit trail aktif</div>
        </form>
      </div>
    </div>
  )
}
