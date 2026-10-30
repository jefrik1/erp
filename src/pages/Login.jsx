import { useState } from 'react';
import { Check, Loader2, ShieldCheck, BookOpen, ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import { Link, useNavigate } from 'react-router-dom';
import { homeFor } from '../config/access';

export default function Login(){
  const [u,setU]=useState('admin'); const [p,setP]=useState('admin123'); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false);
  const {setAuth} = useAuth(); const nav=useNavigate();
  const [mfa,setMfa]=useState(false);
  const [mfaToken,setMfaToken]=useState('');
  const [code,setCode]=useState('');
  const submit=async(e)=>{
    e.preventDefault(); setLoading(true); setErr('');
    try{
      const r=await api.post('/auth/login',{username:u,password:p});
      if(r.data?.mfa_required){
        setMfaToken(r.data.mfa_token); setMfa(true); setErr('');
        return;
      }
      setAuth(r.data.user, r.data.token); nav(homeFor(r.data.user?.roles||[]));
    }catch(e){ setErr(e.response?.data?.error||'Login gagal'); }finally{setLoading(false);}
  };
  const verifyMfa=async(e)=>{
    e.preventDefault();
    setLoading(true); setErr('');
    try{
      const r=await api.post('/auth/mfa/verify-login',{ mfa_token:mfaToken, code });
      setAuth(r.data.user, r.data.token);
      nav(homeFor(r.data.user?.roles||[]));
    }catch(err){ setErr(err.response?.data?.error||'Kode MFA salah'); }
    finally{ setLoading(false); }
  };

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[1.05fr_1fr] bg-bg">
      {/* panel kiri — navy, mengikuti sidebar Stitch */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-navy text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.18]" style={{background:'radial-gradient(720px 480px at 15% 10%, #316bf3, transparent 70%), radial-gradient(600px 420px at 90% 95%, #009668, transparent 70%)'}}/>
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand grid place-items-center font-display font-bold text-[17px]">SM</div>
            <div className="flex flex-col">
              <span className="font-display text-headline-sm font-bold leading-tight tracking-tight">Sumber Material</span>
              <span className="text-label-sm uppercase tracking-wider text-white/45">Enterprise ERP</span>
            </div>
          </div>
          <div className="mt-20 max-w-[520px]">
            <h1 className="font-display text-[40px] leading-[1.05] font-bold tracking-tight">
              Kelola material.<br/>Kirim tepat waktu.<br/><span className="text-[#6ffbbe]">Catat otomatis.</span>
            </h1>
            <p className="text-body-lg text-white/60 mt-5 leading-relaxed max-w-[440px]">
              ERP untuk distributor material bangunan: multi-gudang, multi-satuan, batch, dan approval berjenjang untuk satu lokasi operasional.
            </p>
            <div className="mt-10 space-y-3">
              {['Multi-gudang, multi-satuan, dan batch','Approval berjenjang dengan audit trail','PPN 11%, faktur pajak, dan laporan keuangan'].map(t=>(
                <div key={t} className="flex items-center gap-3 text-body-md text-white/75">
                  <span className="w-5 h-5 rounded-full bg-white/10 grid place-items-center shrink-0"><Check size={12}/></span>{t}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-between text-label-sm text-white/40">
          <span>PT Sumber Material Jaya — sistem ERP internal</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={14}/> Akses teraudit</span>
        </div>
      </div>

      {/* panel kanan — form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-brand grid place-items-center text-white font-display font-bold">SM</div>
            <div className="flex flex-col">
              <span className="font-display text-headline-sm font-bold leading-tight">Sumber Material</span>
              <span className="text-label-sm uppercase tracking-wider text-ink-3">Enterprise ERP</span>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-card p-8">
            <h2 className="font-display text-headline-lg font-bold text-ink tracking-tight">Masuk ke ERP</h2>
            <p className="text-body-sm text-ink-2 mt-1.5">Pilih akun demo di bawah — dashboard & menu menyesuaikan role akun.</p>

            {/* Akun demo untuk testing — hapus blok ini sebelum produksi. */}
            <div className="mt-5 rounded-xl border border-line bg-surface-2/60 p-2">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-label-sm font-semibold text-ink-2 uppercase tracking-wider">Akun demo</span>
                <span className="text-label-sm text-ink-3">klik untuk isi otomatis</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ['admin','admin123','Admin'],
                  ['kasir','kasir123','Kasir'],
                  ['sales','sales123','Sales'],
                  ['finance','finance123','Keuangan'],
                  ['gudang','gudang123','Gudang'],
                  ['purchasing','purchasing123','Purchasing'],
                  ['hrd','hrd123','HRD'],
                  ['driver','driver123','Driver'],
                  ['auditor','auditor123','Auditor'],
                ].map(([usr,pw,role])=>(
                  <button type="button" key={usr} onClick={()=>{setU(usr);setP(pw);setErr('');}}
                    title={usr+' / '+pw}
                    className={"text-left rounded-lg px-2 py-1.5 border transition-colors "+(u===usr?'bg-brand text-white border-brand shadow-sm':'bg-surface hover:bg-surface-3 border-transparent')}>
                    <span className={"block text-label-md font-semibold truncate "+(u===usr?'text-white':'text-ink')}>{role}</span>
                    <span className={"block text-label-sm font-normal truncate "+(u===usr?'text-white/70':'text-ink-3')}>{usr}</span>
                    <span className={"block text-[10px] font-mono truncate "+(u===usr?'text-white/55':'text-ink-3/80')}>{pw}</span>
                  </button>
                ))}
              </div>
            </div>

            {mfa ? (
              <form onSubmit={verifyMfa} className="mt-6">
                <div className="rounded-lg bg-brand-soft text-brand-strong text-body-sm px-3 py-2 mb-4">
                  Akun <b>{u}</b> memakai verifikasi dua langkah. Masukkan 6 digit dari aplikasi authenticator
                  (atau kode cadangan).
                </div>
                <label className="block text-label-md text-ink-2" htmlFor="login-mfa">Kode MFA</label>
                <input id="login-mfa" value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoFocus
                  className="mt-1.5 w-full h-11 px-3 bg-surface-2 border border-transparent rounded-lg text-body-lg tracking-[0.3em] font-mono text-ink outline-none focus:bg-surface focus:border-brand-tint/40 transition" placeholder="000000"/>
                {err && <div className="mt-3 text-body-sm text-danger bg-danger-soft rounded-lg px-3 py-2" role="alert">{err}</div>}
                <button disabled={loading}
                  className="mt-6 w-full h-11 bg-brand text-white rounded-lg text-label-lg shadow-sm hover:bg-brand-strong disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">
                  {loading ? <><Loader2 size={16} className="animate-spin"/> Memverifikasi...</> : 'Verifikasi & Masuk'}
                </button>
                <button type="button" onClick={()=>{ setMfa(false); setCode(''); setErr(''); }}
                  className="mt-2 w-full h-9 text-label-sm text-ink-3 hover:text-ink">Kembali</button>
              </form>
            ) : (
            <form onSubmit={submit} className="mt-6">
              <label className="block text-label-md text-ink-2" htmlFor="login-username">Username</label>
              <input id="login-username" value={u} onChange={e=>setU(e.target.value)} autoComplete="username"
                className="mt-1.5 w-full h-11 px-3 bg-surface-2 border border-transparent rounded-lg text-body-md text-ink outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 transition" placeholder="admin"/>

              <label className="block text-label-md text-ink-2 mt-4" htmlFor="login-password">Password</label>
              <input id="login-password" type="password" value={p} onChange={e=>setP(e.target.value)} autoComplete="current-password"
                className="mt-1.5 w-full h-11 px-3 bg-surface-2 border border-transparent rounded-lg text-body-md text-ink outline-none focus:bg-surface focus:border-brand-tint/40 focus:ring-2 focus:ring-brand-tint/15 transition" placeholder="••••••••"/>

              {err && <div className="mt-3 text-body-sm text-danger bg-danger-soft rounded-lg px-3 py-2" role="alert">{err}</div>}

              <button disabled={loading}
                className="mt-6 w-full h-11 bg-brand text-white rounded-lg text-label-lg shadow-sm hover:bg-brand-strong disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={16} className="animate-spin"/> Memproses...</> : 'Masuk'}
              </button>
            </form>
            )}

            <div className="text-label-sm text-center text-ink-3 mt-5">Hubungi IT support jika mengalami kendala login</div>

            {/* Guidebook publik — bisa dibaca sebelum punya akun */}
            <Link to="/panduan" className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 hover:bg-surface hover:border-brand-tint/40 transition px-3 py-2.5 group">
              <span className="h-8 w-8 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0"><BookOpen size={15}/></span>
              <span className="min-w-0">
                <span className="block text-label-md font-semibold text-ink group-hover:text-brand">Panduan Penggunaan (Guidebook)</span>
                <span className="block text-label-sm text-ink-3 truncate">Alur penjualan, POS, gudang, keuangan, dan absensi</span>
              </span>
              <ChevronRight size={15} className="ml-auto text-ink-3 group-hover:text-brand shrink-0"/>
            </Link>
          </div>

          <div className="text-label-sm text-center text-ink-3 mt-4">© 2026 PT Sumber Material Jaya</div>
        </div>
      </div>
    </div>
  )
}
