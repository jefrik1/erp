import { useCallback, useEffect, useState } from 'react';
import { UserCircle, KeyRound, RefreshCw, Building2, Mail, Phone, CalendarDays, Briefcase, Hash, ShieldCheck, Wallet, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosSkeleton, PosError, PosStat,
  posInput, posBtnPrimary, posBtnSecondary,
} from '../components/PosUI';

const iso = (d)=> String(d||'').slice(0,10);
const fmtDate = (d)=>{ const s=iso(d); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };

function Field({ icon:Icon, label, value }){
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-7 h-7 rounded-lg bg-[#F1F5F9] text-[#475569] grid place-items-center shrink-0 mt-0.5"><Icon size={14}/></span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold tracking-widest text-[#94A3B8]">{label}</div>
        <div className="text-sm font-medium text-[#0F172A] break-words">{value || '-'}</div>
      </div>
    </div>
  );
}

export default function MyProfile(){
  const dialog = useDialog();
  const [me,setMe]=useState(null);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({old_password:'', new_password:'', confirm:''});
  const [saving,setSaving]=useState(false); const [formErr,setFormErr]=useState(''); const [okMsg,setOkMsg]=useState('');

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{ const r = await api.get('/hr/me'); setMe(r.data||null); }
    catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat profil'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const submit = async(e)=>{
    e.preventDefault(); setFormErr(''); setOkMsg('');
    if(!form.old_password || !form.new_password || !form.confirm){ setFormErr('Semua kolom password wajib diisi'); return; }
    if(form.new_password.length < 6){ setFormErr('Password baru minimal 6 karakter'); return; }
    if(form.new_password !== form.confirm){ setFormErr('Konfirmasi password baru tidak sama'); return; }
    if(form.new_password === form.old_password){ setFormErr('Password baru harus berbeda dari password lama'); return; }
    setSaving(true);
    try{
      await api.post('/auth/change-password', { old_password: form.old_password, new_password: form.new_password });
      setForm({old_password:'', new_password:'', confirm:''});
      setOkMsg('Password berhasil diganti. Gunakan password baru saat login berikutnya.');
      await dialog.alert('Password berhasil diganti.', { title:'Berhasil' });
    }catch(e2){ setFormErr(e2.response?.data?.error||e2.message||'Gagal mengganti password'); }
    finally{ setSaving(false); }
  };

  if(loading) return <div className="space-y-3"><PosPageHeader icon={UserCircle} title="Profil Saya"/><PosCard><PosSkeleton rows={6} cols={3}/></PosCard></div>;
  if(err) return <div className="space-y-3"><PosPageHeader icon={UserCircle} title="Profil Saya"/><PosCard><PosError message={err} onRetry={load}/></PosCard></div>;

  const initials = (me?.name||me?.username||'U').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const sisa = me?.leave_quota!=null && me?.cuti_terpakai!=null ? Math.max(0, me.leave_quota - me.cuti_terpakai) : null;

  return (
    <div className="space-y-3">
      <PosPageHeader icon={UserCircle} title="Profil Saya"
        subtitle="Data karyawan dan akun Anda - password bisa diganti sendiri di sini"
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PosCard className="lg:col-span-2">
          <PosCardBody>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-16 h-16 rounded-[20px] bg-[#1E40AF] text-white grid place-items-center text-xl font-black shrink-0">{initials}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-black text-[#0F172A] leading-none">{me?.name || me?.username}</div>
                <div className="text-sm text-[#64748B] mt-1">{me?.position || 'Posisi belum diisi'}{me?.department? ' - '+me.department : ''}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {(me?.roles||[]).map(r=><PosBadge key={r} tone="sky">{r}</PosBadge>)}
                  {me?.employee_id? <PosBadge tone="slate">{me.employee_code}</PosBadge> : <PosBadge tone="amber">Akun belum tertaut karyawan</PosBadge>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4 mt-5 pt-5 border-t border-[#F1F5F9]">
              <Field icon={Building2} label="CABANG" value={me?.branch_name}/>
              <Field icon={Briefcase} label="DEPARTEMEN" value={me?.department}/>
              <Field icon={CalendarDays} label="TANGGAL MASUK" value={fmtDate(me?.join_date)}/>
              <Field icon={Phone} label="TELEPON" value={me?.phone}/>
              <Field icon={Mail} label="EMAIL" value={me?.email}/>
              <Field icon={Hash} label="USERNAME" value={me?.username}/>
              <Field icon={Hash} label="NPWP" value={me?.npwp}/>
              <Field icon={ShieldCheck} label="BPJS" value={me?.bpjs_number}/>
            </div>
          </PosCardBody>
        </PosCard>

        <div className="space-y-3">
          <PosCard>
            <PosCardBody>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-xl bg-[#1E40AF] text-white grid place-items-center"><Wallet size={15}/></span>
                <div className="text-[13px] font-bold text-[#0F172A]">Cuti tahun {me?.cuti_tahun}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-2"><div className="text-lg font-black text-[#0F172A] tabular-nums">{me?.leave_quota ?? '-'}</div><div className="text-[10px] font-bold tracking-wide text-[#94A3B8]">JATAH</div></div>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-2"><div className="text-lg font-black text-[#0F172A] tabular-nums">{me?.cuti_terpakai ?? '-'}</div><div className="text-[10px] font-bold tracking-wide text-[#94A3B8]">TERPAKAI</div></div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-2"><div className="text-lg font-black text-emerald-700 tabular-nums">{sisa ?? '-'}</div><div className="text-[10px] font-bold tracking-wide text-emerald-600">SISA</div></div>
              </div>
            </PosCardBody>
          </PosCard>

          <PosCard>
            <PosCardBody>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-xl bg-[#1E40AF] text-white grid place-items-center"><KeyRound size={15}/></span>
                <div className="text-[13px] font-bold text-[#0F172A]">Ganti Password</div>
              </div>
              <form onSubmit={submit} className="space-y-3">
                <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#64748B]">PASSWORD LAMA</span>
                  <input type="password" value={form.old_password} onChange={e=>setForm({...form, old_password:e.target.value})} className={posInput} placeholder="Password saat ini"/></label>
                <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#64748B]">PASSWORD BARU</span>
                  <input type="password" value={form.new_password} onChange={e=>setForm({...form, new_password:e.target.value})} className={posInput} placeholder="Minimal 6 karakter"/></label>
                <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#64748B]">ULANGI PASSWORD BARU</span>
                  <input type="password" value={form.confirm} onChange={e=>setForm({...form, confirm:e.target.value})} className={posInput} placeholder="Ulangi password baru"/></label>
                {formErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formErr}</div>}
                {okMsg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-1.5"><CheckCircle2 size={13}/> {okMsg}</div>}
                <button type="submit" disabled={saving} className={posBtnPrimary+' w-full h-10 text-sm disabled:opacity-50'}>
                  <KeyRound size={14}/> {saving? 'Menyimpan...' : 'Ganti Password'}
                </button>
              </form>
            </PosCardBody>
          </PosCard>
        </div>
      </div>
    </div>
  );
}
