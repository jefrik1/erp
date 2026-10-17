import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings as SettingsIcon, Users, Shield, Plus, X, Pencil, Trash2, RefreshCw,
  Search, Lock, Building2, Check, Sliders, Database, KeyRound,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const TABS = ['PENGGUNA & ROLE','WORKFLOW APPROVAL','PARAMETER SISTEM'];

export default function Settings(){
  const dialog=useDialog();
  const [tab,setTab]=useState('PENGGUNA & ROLE');
  const [users,setUsers]=useState([]);
  const [roles,setRoles]=useState([]);
  const [branches,setBranches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [q,setQ]=useState('');
  const [modal,setModal]=useState('');
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({username:'',email:'',password:'',branch_id:'',role_ids:[],is_active:true});
  const [saving,setSaving]=useState(false);
  const [formErr,setFormErr]=useState('');

  const load=useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const [uRes, rRes]=await Promise.all([
        api.get('/auth/users'),
        api.get('/auth/roles'),
      ]);
      setUsers(Array.isArray(uRes.data)? uRes.data: []);
      setRoles(Array.isArray(rRes.data)? rRes.data: []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat pengaturan'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filteredUsers=useMemo(()=>{
    if(!q.trim()) return users;
    const s=q.trim().toLowerCase();
    return users.filter(u=> (u.username||'').toLowerCase().includes(s) || (u.email||'').toLowerCase().includes(s));
  },[users,q]);

  const openCreate=()=>{
    setEditing(null); setFormErr('');
    setForm({username:'',email:'',password:'',branch_id:'',role_ids:[],is_active:true});
    setModal('user');
  };
  const openEdit=(u)=>{
    setEditing(u); setFormErr('');
    // find role ids for user
    const curRoleNames = (u.roles||[]).filter(Boolean);
    const curRoleIds = roles.filter(r=> curRoleNames.includes(r.name)).map(r=> r.id);
    setForm({
      username: u.username||'',
      email: u.email||'',
      password: '',
      branch_id: u.branch_id? String(u.branch_id): '',
      role_ids: curRoleIds,
      is_active: u.is_active!==false,
    });
    setModal('user');
  };

  const toggleRole=(rid)=>{
    const set=new Set(form.role_ids);
    if(set.has(rid)) set.delete(rid); else set.add(rid);
    setForm({...form, role_ids: Array.from(set)});
  };

  const submitUser=async(e)=>{
    e.preventDefault();
    if(!form.username.trim()||!form.email.trim()){ setFormErr('Username dan email wajib diisi'); return; }
    if(!editing && !form.password){ setFormErr('Password wajib untuk user baru'); return; }
    setSaving(true); setFormErr('');
    try{
      const payload={
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        branch_id: form.branch_id? parseInt(form.branch_id): null,
        role_ids: form.role_ids,
        is_active: form.is_active,
      };
      if(editing) await api.put('/auth/users/'+editing.id, payload);
      else await api.post('/auth/users', payload);
      setModal(''); await dialog.alert(editing? 'Pengguna diperbarui' : 'Pengguna dibuat', {title:'Berhasil'});
      load();
    }catch(e){ setFormErr(e.response?.data?.error||e.message||'Gagal menyimpan pengguna'); }
    finally{ setSaving(false); }
  };

  const deactivate=async(u)=>{
    const ok=await dialog.confirm('Nonaktifkan akun user '+u.username+' ?',{title:'Nonaktifkan User'});
    if(!ok) return;
    try{
      await api.delete('/auth/users/'+u.id);
      await dialog.alert('User dinonaktifkan',{title:'Berhasil'});
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={SettingsIcon} title="Master Data & Pengaturan Sistem" subtitle="Kelola pengguna • peran (RBAC) • aturan batas approval • parameter global" badge={users.length+' pengguna'} actions={tab==='PENGGUNA & ROLE'? <button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Tambah Pengguna</button> : null} />

      <PosChipRow label="MODUL PENGATURAN">
        {TABS.map(t=> <PosChip key={t} active={tab===t} onClick={()=>setTab(t)}>{t}</PosChip>)}
      </PosChipRow>

      {tab==='PENGGUNA & ROLE' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PosStat icon={Users} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="TOTAL PENGGUNA" value={users.length} sub={users.filter(u=>u.is_active!==false).length+' aktif'} />
            <PosStat icon={Shield} tone="bg-emerald-50 text-emerald-700" label="PERAN (ROLES)" value={roles.length} sub="definisi hak akses" />
            <PosStat icon={Building2} tone="bg-sky-50 text-sky-700" label="CABANG" value={new Set(users.map(u=>u.branch_name).filter(Boolean)).size || 1} sub="terpetakan" />
            <PosStat icon={Lock} tone="bg-amber-50 text-amber-700" label="SUPERADMIN" value={users.filter(u=>(u.roles||[]).includes('admin')||(u.roles||[]).includes('direktur')).length} sub="akses penuh" />
          </div>

          <PosCard>
            <PosCardBody className="space-y-3">
              <PosToolbar actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}>
                <div className={posSearchWrap}>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
                  <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari username / email..." className={posInput+' pl-9'} />
                </div>
              </PosToolbar>
            </PosCardBody>

            {loading ? <PosSkeleton rows={5} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !filteredUsers.length ? <PosEmpty text="Tidak ada pengguna ditemukan"/> : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                    <PosTh>USER</PosTh><PosTh>ROLE (RBAC)</PosTh><PosTh>CABANG</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {filteredUsers.map(u=>(
                      <tr key={u.id} className={posTr}>
                        <td className={posTd}><div className="font-bold text-[#0F172A]">{u.username}</div><div className="text-xs text-[#64748B]">{u.email}</div></td>
                        <td className={posTd}><div className="flex flex-wrap gap-1">{(u.roles||[]).filter(Boolean).map(r=><span key={r} className="text-xs px-2 py-0.5 rounded-full bg-[#1E40AF]/10 text-[#1E40AF] font-bold">{r}</span>)}{!u.roles?.length && <span className="text-xs text-[#94A3B8]">-</span>}</div></td>
                        <td className={posTd+' text-xs'}>{u.branch_name||'Pusat'}</td>
                        <td className={posTd+' text-center'}><PosBadge tone={u.is_active!==false?'emerald':'red'}>{u.is_active!==false?'AKTIF':'NONAKTIF'}</PosBadge></td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            <button onClick={()=>openEdit(u)} className={posBtnSm}><Pencil size={13}/> Edit</button>
                            <button onClick={()=>deactivate(u)} className={posBtnSm+' text-red-600 border-red-200 hover:bg-red-50'}><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PosCard>
        </div>
      )}

      {tab==='WORKFLOW APPROVAL' && (
        <PosCard>
          <div className="p-4 border-b"><h3 className="font-bold text-sm text-[#0F172A]">Aturan Approval Workflow Matrix</h3><p className="text-xs text-[#64748B] mt-0.5">Threshold otomatis menentukan tingkat otorisasi yang dibutuhkan sebelum dokumen lanjut status</p></div>
          <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
            <div className="p-4 border rounded-[20px] bg-[#F8FAFC] space-y-1">
              <div className="font-bold text-[#0F172A] flex items-center justify-between"><span>Purchase Order (PO)</span><PosBadge tone="sky">Pembelian</PosBadge></div>
              <div className="text-xs text-[#64748B] pt-2 space-y-1">
                <div>• &lt; Rp 10.000.000 → <b>Supervisor Gudang</b></div>
                <div>• Rp 10.000.000 - Rp 50.000.000 → <b>Manager Pembelian</b></div>
                <div>• &gt; Rp 50.000.000 → <b>Direktur Utama</b> (Wajib di halaman Approval)</div>
              </div>
            </div>
            <div className="p-4 border rounded-[20px] bg-[#F8FAFC] space-y-1">
              <div className="font-bold text-[#0F172A] flex items-center justify-between"><span>Diskon Sales Order (SO)</span><PosBadge tone="emerald">Penjualan</PosBadge></div>
              <div className="text-xs text-[#64748B] pt-2 space-y-1">
                <div>• Diskon 0 - 5% → Otomatis (Sales Staff)</div>
                <div>• Diskon 5% - 10% → <b>Sales Manager</b></div>
                <div>• Diskon &gt; 10% → <b>Sales Manager + Direktur</b></div>
              </div>
            </div>
            <div className="p-4 border rounded-[20px] bg-[#F8FAFC] space-y-1">
              <div className="font-bold text-[#0F172A] flex items-center justify-between"><span>Penyesuaian Stok (Stock In / Opname)</span><PosBadge tone="amber">Persediaan</PosBadge></div>
              <div className="text-xs text-[#64748B] pt-2 space-y-1">
                <div>• Selisih &lt; Rp 1.000.000 → Kepala Gudang</div>
                <div>• Selisih &gt; Rp 1.000.000 → <b>Manager Gudang + Finance</b></div>
              </div>
            </div>
            <div className="p-4 border rounded-[20px] bg-[#F8FAFC] space-y-1">
              <div className="font-bold text-[#0F172A] flex items-center justify-between"><span>Pengeluaran Kas & Bank</span><PosBadge tone="teal">Keuangan</PosBadge></div>
              <div className="text-xs text-[#64748B] pt-2 space-y-1">
                <div>• Payment &lt; Rp 25.000.000 → Finance Manager</div>
                <div>• Payment &gt; Rp 25.000.000 → <b>Direktur Keuangan</b></div>
                <div>• Payment &gt; Rp 100.000.000 → <b>Direktur Utama</b></div>
              </div>
            </div>
          </div>
        </PosCard>
      )}

      {tab==='PARAMETER SISTEM' && (
        <div className="grid md:grid-cols-3 gap-3">
          <PosCard>
            <div className="p-4 border-b font-bold text-sm">Perpajakan & Fiskal</div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b"><span>PPN Berlaku</span><b>11% (UU HPP)</b></div>
              <div className="flex justify-between py-1 border-b"><span>PPh 22 Besi / Baja</span><b>0.30%</b></div>
              <div className="flex justify-between py-1 border-b"><span>PPh 23 Jasa</span><b>2.00%</b></div>
              <div className="flex justify-between py-1"><span>Format e-Faktur</span><b>DJPOne v2.0</b></div>
            </div>
          </PosCard>
          <PosCard>
            <div className="p-4 border-b font-bold text-sm">Kebijakan Persediaan</div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b"><span>Metode Valuasi</span><b>Weighted Moving Average</b></div>
              <div className="flex justify-between py-1 border-b"><span>Karantina Retur</span><b>Gudang Karantina (Auto)</b></div>
              <div className="flex justify-between py-1 border-b"><span>Alokasi Landed Cost</span><b>Nilai / Berat / Volume</b></div>
              <div className="flex justify-between py-1"><span>Toleransi Susut</span><b>Max 2.0%</b></div>
            </div>
          </PosCard>
          <PosCard>
            <div className="p-4 border-b font-bold text-sm">Keamanan & Audit</div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b"><span>Session Expiry</span><b>1 Jam (JWT Stateless)</b></div>
              <div className="flex justify-between py-1 border-b"><span>Audit Trail Log</span><b>Aktif (IP, Route, Changes)</b></div>
              <div className="flex justify-between py-1 border-b"><span>Closing Period Lock</span><b>Per Akhir Bulan</b></div>
              <div className="flex justify-between py-1"><span>Backup Database</span><b>Harian 02:00 WIB</b></div>
            </div>
          </PosCard>
        </div>
      )}

      {modal==='user' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitUser} className="bg-white rounded-[20px] p-5 w-full max-w-lg space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-black text-[16px] text-[#0F172A]">{editing? 'Edit Pengguna':'Pengguna Baru'}</h3><div className="text-xs text-[#64748B] mt-0.5">Kelola kredensial dan hak akses RBAC</div></div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border grid place-items-center"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">USERNAME *</span><input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})} className={posInput} /></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">EMAIL *</span><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className={posInput} /></label>
            </div>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PASSWORD {editing && '(kosongkan jika tidak diganti)'}</span><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={editing?'••••••••':''} className={posInput} /></label>
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-widest text-[#64748B]">PERAN (ROLES)</span>
              <div className="flex flex-wrap gap-1.5">
                {roles.map(r=>{
                  const sel=form.role_ids.includes(r.id);
                  return (
                    <button type="button" key={r.id} onClick={()=>toggleRole(r.id)} className={'px-3 py-1 rounded-full text-xs font-bold border transition '+(sel?'bg-[#1E40AF] text-white border-[#1E40AF]':'bg-white text-[#64748B] border-[#E2E8F0]')}>
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 pt-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})} className="rounded" /><span className="text-xs font-bold text-[#0F172A]">Akun Aktif (dapat login)</span></label>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button><button disabled={saving} className={posBtnPrimary+' h-9 px-6 text-xs'}>{saving?'Menyimpan...':'Simpan Pengguna'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
