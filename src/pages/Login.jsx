import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Loader2, ShieldCheck, BookOpen, ChevronRight, KeyRound, Building2, CheckCircle2, Shield, Lock, Layers, Sparkles } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import { Link, useNavigate } from 'react-router-dom';
import { homeFor } from '../config/access';

const TYPEWRITER_ITEMS = [
  {
    text: 'Kelola material.',
    sub: 'Sistem ERP terintegrasi untuk distribusi bahan bangunan & baja: multi-gudang, kartu stok FEFO, jembatan timbang, dan buku besar append-only.',
    badge: 'Multi-Gudang & Material'
  },
  {
    text: 'Kirim tepat waktu.',
    sub: 'Pelacakan armada logistik real-time, klaim trip pengemudi, navigasi GPS proyek, dan tanda tangan digital 3 pihak.',
    badge: 'Logistik & Delivery Order'
  },
  {
    text: 'Catat otomatis.',
    sub: 'Transaksi kasir POS dan DO langsung membentuk jurnal double-entry otomatis tanpa proses re-entry manual.',
    badge: 'Automasi Kasir & Pembukuan'
  },
  {
    text: 'Pantau stok presisi.',
    sub: 'Audit kartu stok append-only, sistem reorder point cerdas, dan deteksi dini barang kedaluwarsa atau susut.',
    badge: 'Integritas Stok & FEFO'
  },
  {
    text: 'Buku besar seimbang.',
    sub: 'Neraca saldo Rp 27,5 M seimbang sempurna, rekonsiliasi bank otomatis, dan penguncian periode tutup buku paten.',
    badge: 'Audit Finansial & Ledger'
  },
];

export default function Login(){
  const [u,setU]=useState('admin');
  const [p,setP]=useState('admin123');
  const [err,setErr]=useState('');
  const [loading,setLoading]=useState(false);
  const [shake, setShake]=useState(false);
  const {setAuth} = useAuth();
  const nav=useNavigate();
  const [mfa,setMfa]=useState(false);
  const [mfaToken,setMfaToken]=useState('');
  const [code,setCode]=useState('');

  const triggerShake = () => {
    setShake(true);
    setTimeout(()=>setShake(false), 500);
  };

  const [typeIndex, setTypeIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentFull = TYPEWRITER_ITEMS[typeIndex].text;
    let timer;

    if (!isDeleting) {
      if (displayText.length < currentFull.length) {
        timer = setTimeout(() => {
          setDisplayText(currentFull.slice(0, displayText.length + 1));
        }, 65);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 2200);
      }
    } else {
      if (displayText.length > 0) {
        timer = setTimeout(() => {
          setDisplayText(currentFull.slice(0, displayText.length - 1));
        }, 32);
      } else {
        setIsDeleting(false);
        setTypeIndex((prev) => (prev + 1) % TYPEWRITER_ITEMS.length);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, typeIndex]);

  const submit=async(e)=>{
    e.preventDefault();
    setLoading(true); setErr('');
    try{
      const r=await api.post('/auth/login',{username:u,password:p});
      if(r.data?.mfa_required){
        setMfaToken(r.data.mfa_token); setMfa(true); setErr('');
        return;
      }
      setAuth(r.data.user, r.data.token);
      nav(homeFor(r.data.user?.roles||[]));
    }catch(e){
      triggerShake();
      setErr(e.response?.data?.error||'Login gagal. Periksa username dan password.');
    }finally{
      setLoading(false);
    }
  };

  const verifyMfa=async(e)=>{
    e.preventDefault();
    setLoading(true); setErr('');
    try{
      const r=await api.post('/auth/mfa/verify-login',{ mfa_token:mfaToken, code });
      setAuth(r.data.user, r.data.token);
      nav(homeFor(r.data.user?.roles||[]));
    }catch(err){
      triggerShake();
      setErr(err.response?.data?.error||'Kode MFA tidak valid atau kadaluarsa');
    }finally{
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[1.1fr_1fr] bg-bg selection:bg-brand/20">
      {/* Left panel — Industrial Architecture Showcase */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-navy text-white relative overflow-hidden select-none">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />

        {/* Ambient Animated Aurora Mesh Orbs */}
        <motion.div
          className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-brand/35 blur-[100px] pointer-events-none"
          animate={{
            x: [0, 45, -25, 0],
            y: [0, -35, 25, 0],
            scale: [1, 1.18, 0.95, 1],
          }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-28 -right-28 w-[480px] h-[480px] rounded-full bg-emerald-600/30 blur-[90px] pointer-events-none"
          animate={{
            x: [0, -40, 30, 0],
            y: [0, 45, -30, 0],
            scale: [1, 1.15, 0.92, 1],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/2 left-1/4 w-[380px] h-[380px] rounded-full bg-sky-500/20 blur-[85px] pointer-events-none"
          animate={{
            x: [0, 30, -35, 0],
            y: [0, -30, 35, 0],
            opacity: [0.2, 0.45, 0.2],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Rotating Cyber Blueprint Rings */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-28 -right-28 w-[420px] h-[420px] rounded-full border border-white/[0.04] pointer-events-none flex items-center justify-center"
        >
          <div className="w-[320px] h-[320px] rounded-full border border-dashed border-white/[0.05]" />
          <div className="w-[200px] h-[200px] rounded-full border border-white/[0.03]" />
          <div className="w-[100px] h-[100px] rounded-full border border-dashed border-white/[0.04]" />
        </motion.div>

        {/* Vertical Scanning Laser Beam */}
        <motion.div
          className="absolute inset-x-0 h-[140px] bg-gradient-to-b from-transparent via-brand-tint/15 to-transparent pointer-events-none"
          animate={{ y: ['-100%', '700%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />

        {/* Twinkling Tech Grid Nodes */}
        <div className="absolute top-[22%] left-[28%] w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px_#34d399] animate-pulse" />
        <div className="absolute top-[68%] left-[72%] w-1.5 h-1.5 rounded-full bg-sky-400/80 shadow-[0_0_8px_#38bdf8] animate-pulse" style={{ animationDelay: '1.2s' }} />
        <div className="absolute top-[48%] left-[84%] w-1.5 h-1.5 rounded-full bg-indigo-400/80 shadow-[0_0_8px_#818cf8] animate-pulse" style={{ animationDelay: '2.4s' }} />
        <div className="absolute top-[82%] left-[35%] w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px_#34d399] animate-pulse" style={{ animationDelay: '1.8s' }} />

        {/* Top brand header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand to-brand-tint grid place-items-center font-display font-bold text-white text-[16px] shadow-lg shadow-brand/30">
            SM
          </div>
          <div className="flex flex-col">
            <span className="font-display text-headline-sm font-bold leading-tight tracking-tight text-white">Sumber Material</span>
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">Enterprise ERP</span>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 my-auto max-w-[540px]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 font-medium mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
            Single-Company Distribution Platform
          </div>

          <div className="mb-2">
            <span className="text-label-sm uppercase font-mono tracking-wider text-emerald-400/90 font-semibold flex items-center gap-1.5">
              <Sparkles size={12}/> {TYPEWRITER_ITEMS[typeIndex].badge}
            </span>
          </div>

          <h1 className="font-display text-[40px] sm:text-[46px] leading-[1.08] font-bold tracking-tight text-white min-h-[105px]">
            <span className="bg-gradient-to-r from-emerald-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              {displayText}
            </span>
            <span className="inline-block w-[3.5px] h-[36px] ml-1.5 bg-emerald-400 align-middle animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.9)] rounded-full"/>
          </h1>

          {/* Interactive Tagline Selector Pills */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {TYPEWRITER_ITEMS.map((item, idx) => (
              <button
                key={item.text}
                type="button"
                onClick={() => {
                  setTypeIndex(idx);
                  setDisplayText('');
                  setIsDeleting(false);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-300 ${
                  typeIndex === idx
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                    : 'bg-white/5 text-white/45 border border-white/10 hover:text-white/80 hover:bg-white/10'
                }`}
              >
                <span className="font-mono text-[9px] mr-1 opacity-70">0{idx + 1}</span>
                {item.text.replace('.', '')}
              </button>
            ))}
          </div>

          <p className="text-body-lg text-white/70 mt-5 leading-relaxed max-w-[480px] min-h-[58px] transition-all duration-300">
            {TYPEWRITER_ITEMS[typeIndex].sub}
          </p>

          {/* Floating Metric Badges */}
          <div className="grid grid-cols-2 gap-3 mt-8">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-white/20 transition-all duration-200"
            >
              <div className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">Buku Besar</div>
              <div className="text-lg font-bold num mt-0.5 text-white flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-400"/> Rp 27,5 M Seimbang
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-white/20 transition-all duration-200"
            >
              <div className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">Audit Trail</div>
              <div className="text-lg font-bold num mt-0.5 text-white flex items-center gap-1.5">
                <Shield size={16} className="text-sky-400"/> 100% Immutable Trigger
              </div>
            </motion.div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center justify-between text-label-sm text-white/40 pt-6 border-t border-white/10">
          <span>PT Sumber Material Jaya</span>
          <span className="flex items-center gap-1.5 font-medium"><ShieldCheck size={14} className="text-emerald-400"/> Sesi aman & teraudit</span>
        </div>
      </div>

      {/* Right panel — Auth Form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          {/* Mobile brand header */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-brand grid place-items-center text-white font-display font-bold">SM</div>
            <div className="flex flex-col">
              <span className="font-display text-headline-sm font-bold leading-tight">Sumber Material</span>
              <span className="text-label-sm uppercase tracking-wider text-ink-3">Enterprise ERP</span>
            </div>
          </div>

          <motion.div
            animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
            transition={{ duration: 0.45 }}
            className="bg-surface rounded-3xl shadow-card border border-line p-7 sm:p-8 relative overflow-hidden"
          >
            <div className="mb-6">
              <h2 className="font-display text-headline-lg font-bold text-ink tracking-tight">Masuk ke ERP</h2>
              <p className="text-body-sm text-ink-2 mt-1">Pilih profil peran di bawah atau gunakan kredensial resmi Anda.</p>
            </div>

            {/* Demo selector pill grid */}
            <div className="rounded-2xl border border-line bg-surface-2/60 p-2.5 mb-6">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">Akses Demo Cepat</span>
                <span className="text-[11px] text-ink-3">1-klik auto-fill</span>
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
                ].map(([usr,pw,roleName])=>(
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    type="button" key={usr} onClick={()=>{setU(usr);setP(pw);setErr('');}}
                    title={usr+' / '+pw}
                    className={"text-left rounded-xl px-2.5 py-1.5 border transition-all "+
                      (u===usr
                        ? 'bg-brand text-white border-brand shadow-sm font-semibold'
                        : 'bg-surface hover:bg-surface-3 border-line/60 text-ink')
                    }
                  >
                    <span className={"block text-label-sm font-bold truncate "+(u===usr?'text-white':'text-ink')}>{roleName}</span>
                    <span className={"block text-[11px] font-mono truncate "+(u===usr?'text-white/70':'text-ink-3')}>{usr}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Form Step Transition */}
            <AnimatePresence mode="wait">
              {mfa ? (
                <motion.form
                  key="mfa-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={verifyMfa}
                  className="space-y-4"
                >
                  <div className="rounded-2xl bg-brand-soft border border-brand/20 text-brand-strong text-body-sm p-3.5">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <KeyRound size={16}/> Verifikasi Dua Langkah (MFA)
                    </div>
                    Akun <b>{u}</b> diamankan dengan Authenticator TOTP. Masukkan 6 digit dari aplikasi Anda.
                  </div>

                  <div>
                    <label className="block text-label-md font-semibold text-ink-2" htmlFor="login-mfa">Kode Verifikasi 6 Digit</label>
                    <input
                      id="login-mfa"
                      value={code}
                      onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6))}
                      inputMode="numeric"
                      autoFocus
                      className="mt-1.5 w-full h-12 px-3 bg-surface-2 border border-line rounded-xl text-center text-headline-sm tracking-[0.4em] font-mono font-bold text-ink outline-none focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                      placeholder="000000"
                    />
                  </div>

                  {err && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-body-sm text-danger bg-danger-soft border border-danger-line/60 rounded-xl px-3 py-2 font-medium" role="alert">
                      {err}
                    </motion.div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    disabled={loading || code.length < 6}
                    className="w-full h-11 bg-brand text-white rounded-xl text-label-lg font-bold shadow-sm hover:bg-brand-strong disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin"/> Memverifikasi...</> : 'Verifikasi & Masuk'}
                  </motion.button>

                  <button
                    type="button" onClick={()=>{ setMfa(false); setCode(''); setErr(''); }}
                    className="w-full h-9 text-label-sm font-semibold text-ink-3 hover:text-ink transition-colors"
                  >
                    ← Kembali ke Username & Password
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="password-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={submit}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-label-md font-semibold text-ink-2" htmlFor="login-username">Username</label>
                    <input
                      id="login-username"
                      value={u}
                      onChange={e=>setU(e.target.value)}
                      autoComplete="username"
                      className="mt-1.5 w-full h-11 px-3.5 bg-surface-2 border border-line rounded-xl text-body-md font-medium text-ink outline-none focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                      placeholder="admin"
                    />
                  </div>

                  <div>
                    <label className="block text-label-md font-semibold text-ink-2" htmlFor="login-password">Password</label>
                    <input
                      id="login-password"
                      type="password"
                      value={p}
                      onChange={e=>setP(e.target.value)}
                      autoComplete="current-password"
                      className="mt-1.5 w-full h-11 px-3.5 bg-surface-2 border border-line rounded-xl text-body-md font-medium text-ink outline-none focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  {err && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-body-sm text-danger bg-danger-soft border border-danger-line/60 rounded-xl px-3 py-2 font-medium" role="alert">
                      {err}
                    </motion.div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    disabled={loading}
                    className="mt-2 w-full h-11 bg-brand text-white rounded-xl text-label-lg font-bold shadow-sm hover:bg-brand-strong disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin"/> Memproses...</> : 'Masuk ke Sistem'}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Guidebook link */}
            <Link to="/panduan" className="mt-5 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 hover:bg-surface hover:border-brand/40 transition-all px-3 py-2.5 group shadow-xs">
              <span className="h-8 w-8 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0 group-hover:bg-brand group-hover:text-white transition-colors">
                <BookOpen size={15}/>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-label-md font-bold text-ink group-hover:text-brand transition-colors">Buku Panduan Penggunaan</span>
                <span className="block text-[11px] text-ink-3 truncate">Alur penjualan, POS kasir, stok, dan absensi</span>
              </span>
              <ChevronRight size={15} className="text-ink-3 group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0"/>
            </Link>
          </motion.div>

          <div className="text-label-sm text-center text-ink-3 mt-5 font-normal">
            © 2026 PT Sumber Material Jaya — Single-Company Production
          </div>
        </div>
      </div>
    </div>
  );
}
