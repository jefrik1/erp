import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Search, RefreshCw, Plus, X, Pencil, CalendarCheck, Wallet, Plane,
  Clock, AlertTriangle, CheckCircle2, Eye, PlayCircle, BadgeCheck, Coins, KeyRound, Receipt,
} from 'lucide-react';
import api from '../lib/api';
import { roleForPosition, POSITION_OPTIONS, ASSIGNABLE_ROLES } from '../config/employeeRoles';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;
const iso = (d)=> d ? String(d).slice(0,10) : '';
// Jam absensi disimpan sebagai jam dinding WIB (bukan UTC), jadi tampilkan apa
// adanya - jangan di-parse Date() yang akan menggeser +7 jam.
const jam = (t)=> t ? String(t).slice(11,16) : '-';

const LEAVE_TYPE = { CUTI:'Cuti tahunan', SAKIT:'Sakit', IZIN:'Izin', DINAS:'Dinas luar', TANPA_BAYAR:'Tanpa upah' };
const LEAVE_TONE = { PENDING:'amber', APPROVED:'emerald', REJECTED:'red' };
const PAY_TONE = { DRAFT:'amber', APPROVED:'sky', PAID:'emerald' };

export default function HR(){
  const dialog = useDialog();
  const initialTab = (()=>{ try{ const t=new URLSearchParams(window.location.search).get('tab'); return ['karyawan','absensi','keterlambatan','payroll','cuti'].includes(t)? t : 'karyawan'; }catch{ return 'karyawan'; } })();
  const [tab, setTab] = useState(initialTab);       // karyawan | absensi | keterlambatan | payroll | cuti
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [modal, setModal] = useState('');           // employee | checkin | leave | generate
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [empTotal, setEmpTotal] = useState(0);
  const [empSummary, setEmpSummary] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState('Semua');
  const [empStatus, setEmpStatus] = useState('Semua');    // Semua | AKTIF | NONAKTIF
  const [editing, setEditing] = useState(null);
  const [empForm, setEmpForm] = useState({ employee_code:'', name:'', position:'', department:'', branch_id:'', join_date:'', basic_salary:'', phone:'', npwp:'', bpjs_number:'', is_active:true, leave_quota:12, create_account:true, username:'', password:'', role_name:'' });
  const [accTarget, setAccTarget] = useState(null);
  const [accForm, setAccForm] = useState({ username:'', password:'', role_name:'' });

  const [attendance, setAttendance] = useState([]);
  const [attTotal, setAttTotal] = useState(0);
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0,10));
  const [attSummary, setAttSummary] = useState(null);
  // Laporan keterlambatan (HR/admin)
  const [late, setLate] = useState({ month:'', cutoff_label:'08:00 WIB', summary:null, rows:[], details:[] });
  const [lateMonth, setLateMonth] = useState(new Date().toISOString().slice(0,7));
  const [attStatus, setAttStatus] = useState('Semua');

  const [payrolls, setPayrolls] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payTotals, setPayTotals] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState('Semua');
  const [payStatus, setPayStatus] = useState('Semua');
  const [genPeriod, setGenPeriod] = useState(new Date().toISOString().slice(0,7));
  const [postingPay, setPostingPay] = useState(false);

  const [leaves, setLeaves] = useState([]);
  const [leaveTotal, setLeaveTotal] = useState(0);
  const [leaveStatus, setLeaveStatus] = useState('Semua');
  const [leaveForm, setLeaveForm] = useState({ employee_id:'', type:'CUTI', start_date:'', end_date:'', reason:'' });

  const [branches, setBranches] = useState([]);

  /* ------------------------------------------------------------------ load */
  const loadEmployees = useCallback(async ()=>{
    const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
    if (appliedQ) params.search = appliedQ;
    if (department!=='Semua') params.department = department;
    if (empStatus==='AKTIF') params.is_active = 'true';
    if (empStatus==='NONAKTIF') params.is_active = 'false';
    const r = await api.get('/hr/employees', { params });
    setEmployees(Array.isArray(r.data?.data)? r.data.data : []);
    setEmpTotal(Number(r.data?.total)||0);
  },[appliedQ,department,empStatus,page]);

  const loadAttendance = useCallback(async ()=>{
    const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE, date:attDate };
    if (appliedQ) params.search = appliedQ;
    if (attStatus!=='Semua') params.status = attStatus;
    const [list, sum] = await Promise.all([
      api.get('/hr/attendance', { params }),
      api.get('/hr/attendance/summary', { params:{ date:attDate } }),
    ]);
    setAttendance(Array.isArray(list.data?.data)? list.data.data : []);
    setAttTotal(Number(list.data?.total)||0);
    setAttSummary(sum.data||null);
  },[appliedQ,attDate,attStatus,page]);

  const loadPayrolls = useCallback(async ()=>{
    const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
    if (appliedQ) params.search = appliedQ;
    if (period!=='Semua') params.period = period;
    if (payStatus!=='Semua') params.status = payStatus;
    const r = await api.get('/hr/payrolls', { params });
    setPayrolls(Array.isArray(r.data?.data)? r.data.data : []);
    setPayTotal(Number(r.data?.total)||0);
    setPayTotals(r.data?.totals||null);
  },[appliedQ,period,payStatus,page]);

  const loadLeaves = useCallback(async ()=>{
    const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
    if (appliedQ) params.search = appliedQ;
    if (leaveStatus!=='Semua') params.status = leaveStatus;
    const r = await api.get('/hr/leaves', { params });
    setLeaves(Array.isArray(r.data?.data)? r.data.data : []);
    setLeaveTotal(Number(r.data?.total)||0);
  },[appliedQ,leaveStatus,page]);

  // Posting jurnal gaji (Dr Beban Gaji / Cr PPh21, BPJS, Hutang Gaji)
  const postPayrollJournal = async ()=>{
    const p = period!=='Semua' ? period : (periods[0]?.period || payrolls[0]?.period || '');
    if(!p){ await dialog.alert('Pilih periode payroll dulu di filter periode.',{title:'Posting jurnal gaji'}); return; }
    const ok = await dialog.confirm(`Posting jurnal gaji periode ${p}? Jurnal: Dr Beban Gaji / Cr Hutang PPh21, Hutang BPJS, Hutang Gaji. Payroll yang sudah diposting akan dilewati.`,{title:'Posting jurnal gaji', confirmText:'Ya, posting'});
    if(!ok) return;
    setPostingPay(true);
    try{
      const r = await api.post('/hr/payrolls/post-journal',{period:p});
      await dialog.alert(r.data.message||'Selesai.',{title:'Jurnal gaji', tone:'success'});
      loadPayrolls();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal posting'}); }
    finally{ setPostingPay(false); }
  };

  const loadLate = useCallback(async ()=>{
    const params = { month: lateMonth };
    if (appliedQ) params.search = appliedQ;
    const r = await api.get('/hr/attendance/late-report', { params });
    setLate({ month:r.data?.month||lateMonth, cutoff_label:r.data?.cutoff_label||'08:00 WIB', summary:r.data?.summary||null, rows:Array.isArray(r.data?.rows)?r.data.rows:[], details:Array.isArray(r.data?.details)?r.data.details:[] });
  },[lateMonth, appliedQ]);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      if (tab==='karyawan') await loadEmployees();
      else if (tab==='absensi') await loadAttendance();
      else if (tab==='keterlambatan') await loadLate();
      else if (tab==='payroll') await loadPayrolls();
      else await loadLeaves();
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal memuat data HR'); }
    finally{ setLoading(false); }
  },[tab,loadEmployees,loadAttendance,loadLate,loadPayrolls,loadLeaves]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,tab,department,empStatus,attStatus,attDate,period,payStatus,leaveStatus,lateMonth]);

  useEffect(()=>{
    (async ()=>{
      const [s, d, p, b] = await Promise.all([
        api.get('/hr/employees/summary').catch(()=>({ data:null })),
        api.get('/hr/employees', { params:{ limit:500 } }).catch(()=>({ data:{ data:[] } })),
        api.get('/hr/payrolls/periods').catch(()=>({ data:[] })),
        api.get('/master/branches').catch(()=>({ data:[] })),
      ]);
      setEmpSummary(s.data||null);
      setBranches(Array.isArray(b.data)? b.data : []);
      setPeriods(Array.isArray(p.data)? p.data : []);
      const list = Array.isArray(d.data?.data)? d.data.data : [];
      const deps = [...new Set(list.map(e=> e.department).filter(Boolean))].sort();
      setDepartments(deps);
    })();
  },[]);

  /* --------------------------------------------------------------- actions */
  const openEmployee = (emp)=>{
    setFormErr('');
    if (emp){
      setEditing(emp);
      setEmpForm({ employee_code:emp.employee_code||'', name:emp.name||'', position:emp.position||'', department:emp.department||'',
        branch_id: emp.branch_id? String(emp.branch_id):'', join_date: iso(emp.join_date), basic_salary: String(num(emp.basic_salary)||''), leave_quota: emp.leave_quota!=null? emp.leave_quota : 12,
        phone:emp.phone||'', npwp:emp.npwp||'', bpjs_number:emp.bpjs_number||'', is_active: emp.is_active!==false,
        create_account:false, username:'', password:'', role_name:(emp.roles&&emp.roles[0])||'' });
    } else {
      setEditing(null);
      setEmpForm({ employee_code:'', name:'', position:'', department:'', branch_id:String(branches[0]?.id || ''), join_date:'', basic_salary:'', phone:'', npwp:'', bpjs_number:'', is_active:true, leave_quota:12, create_account:true, username:'', password:'', role_name:'' });
    }
    setModal('employee');
  };

  const submitEmployee = async (e)=>{
    e.preventDefault();
    if (!empForm.employee_code.trim() || !empForm.name.trim()){ setFormErr('Kode dan nama karyawan wajib diisi.'); return; }
    if (!editing && empForm.create_account){
      if (!empForm.username.trim()){ setFormErr('Username akun wajib diisi (atau matikan "Buat akun login").'); return; }
      if (String(empForm.password).length < 8){ setFormErr('Password minimal 8 karakter.'); return; }
    }
    setSaving(true); setFormErr('');
    const payload = { ...empForm, employee_code:empForm.employee_code.trim().toUpperCase(), basic_salary:num(empForm.basic_salary),
      branch_id: empForm.branch_id? parseInt(empForm.branch_id):(editing ? null : (branches[0]?.id || null)), join_date: empForm.join_date||null };
    if (editing){
      delete payload.create_account; delete payload.username; delete payload.password; delete payload.role_name;
    } else if (!payload.role_name) delete payload.role_name;
    try{
      if (editing) await api.put('/hr/employees/'+editing.id, payload);
      else await api.post('/hr/employees', payload);
      const who = payload.name;
      const uname = payload.username;
      setModal('');
      await dialog.alert(editing? 'Data '+who+' diperbarui.'
        : (payload.create_account? 'Karyawan '+who+' ditambahkan dengan akun login "'+uname+'". Sampaikan password awal langsung ke karyawan; minta segera ganti di menu Profil Saya.' : 'Karyawan '+who+' ditambahkan (tanpa akun login).'),
        { title:'Tersimpan' });
      load();
      api.get('/hr/employees/summary').then(r=>setEmpSummary(r.data)).catch(()=>{});
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan'); }
    finally{ setSaving(false); }
  };

  const openAccount = (emp)=>{
    setFormErr('');
    setAccTarget(emp);
    setAccForm({ username:'', password:'', role_name:(emp.roles&&emp.roles[0])||'' });
    setModal('account');
  };

  const submitAccount = async (e)=>{
    e.preventDefault();
    if (!accForm.username.trim()){ setFormErr('Username wajib diisi.'); return; }
    if (String(accForm.password).length < 8){ setFormErr('Password minimal 8 karakter.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/hr/employees/'+accTarget.id+'/account', { ...accForm, role_name: accForm.role_name || undefined });
      setModal('');
      await dialog.alert('Akun login untuk '+accTarget.name+' dibuat. Sampaikan password awal langsung ke karyawan.', { title:'Akun dibuat' });
      load();
      setDetail(null);
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal membuat akun'); }
    finally{ setSaving(false); }
  };

  const openDetail = async (emp)=>{
    setDetailBusy(true); setDetail({ id:emp.id });
    try{ const r = await api.get('/hr/employees/'+emp.id); setDetail(r.data); }
    catch(e){ setDetail(null); await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal memuat detail' }); }
    finally{ setDetailBusy(false); }
  };

  const checkAction = async (employeeId, mode)=>{
    try{
      // manual: true → HR/admin mengisikan dari kantor, tanpa GPS browser (geofence dilewati).
      const r = await api.post('/hr/attendance/'+(mode==='in'?'checkin':'checkout'), { employee_id: parseInt(employeeId), manual: true });
      const late = r.data?.late;
      await dialog.alert(
        (mode==='in'?'Check-in':'Check-out')+' tercatat pukul '+jam(r.data?.row?.[mode==='in'?'check_in':'check_out'])+'.'
        + (late?.is_late ? '\nTercatat TERLAMBAT '+late.late_minutes+' menit (batas 08:00 WIB).' : ''),
        { title:'Absensi', tone: late?.is_late? 'warning':'success' });
      setModal(''); load();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal absensi' }); }
  };

  const generatePayroll = async (e)=>{
    e.preventDefault();
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/hr/payrolls/generate', { period: genPeriod });
      setModal('');
      await dialog.alert('Payroll periode '+genPeriod+' diproses.\n'+r.data.diproses+' karyawan'+(r.data.dilewati?', '+r.data.dilewati+' dilewati (sudah PAID)':'')+
        '\nTotal gaji bersih: '+rupiah(r.data.total_net), { title:'Payroll Dibuat' });
      setPeriod(genPeriod); setTab('payroll'); load();
      api.get('/hr/payrolls/periods').then(x=>setPeriods(Array.isArray(x.data)? x.data:[])).catch(()=>{});
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal generate payroll'); }
    finally{ setSaving(false); }
  };

  const setPayrollStatus = async (row, status)=>{
    const label = status==='PAID' ? 'tandai SUDAH DIBAYAR' : 'setujui';
    const ok = await dialog.confirm('Payroll '+row.name+' periode '+row.period+' - '+label+'?\nGaji bersih '+rupiah(row.net_salary)+'.', { title:'Ubah Status Payroll' });
    if (!ok) return;
    try{
      await api.post('/hr/payrolls/'+row.id+'/status', { status });
      await dialog.alert('Status payroll '+row.name+' → '+status+'.', { title:'Tersimpan' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal' }); }
  };

  const submitLeave = async (e)=>{
    e.preventDefault();
    if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date){ setFormErr('Karyawan dan tanggal wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/hr/leaves', { ...leaveForm, employee_id: parseInt(leaveForm.employee_id) });
      setModal('');
      await dialog.alert('Pengajuan cuti/izin dicatat (status PENDING).', { title:'Tersimpan' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan pengajuan'); }
    finally{ setSaving(false); }
  };

  const decideLeave = async (row, status)=>{
    const ok = await dialog.confirm((status==='APPROVED'?'Setujui':'Tolak')+' pengajuan '+(LEAVE_TYPE[row.type]||row.type)+' dari '+row.name+' ('+iso(row.start_date)+' s/d '+iso(row.end_date)+')?', { title:'Keputusan Cuti' });
    if (!ok) return;
    try{
      await api.post('/hr/leaves/'+row.id+'/decision', { status });
      await dialog.alert('Pengajuan '+row.name+' → '+status+'.', { title:'Tersimpan' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal' }); }
  };

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const dataset = tab==='karyawan' ? 'employees' : (tab==='absensi'||tab==='keterlambatan') ? 'attendance' : tab==='payroll' ? 'payrolls' : 'leaves';
      const params = { dataset, format };
      if (dataset==='attendance') params.date = attDate;
      if (dataset==='payrolls' && period!=='Semua') params.period = period;
      const r = await api.get('/hr/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = dataset + '.hr.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  const totalPages = Math.max(1, Math.ceil((tab==='karyawan'?empTotal:tab==='absensi'?attTotal:tab==='payroll'?payTotal:tab==='keterlambatan'?0:leaveTotal)/PAGE_SIZE));
  const safePage = Math.min(Math.max(1,page), totalPages);
  const cutiPending = useMemo(()=> leaves.filter(l=> l.status==='PENDING').length, [leaves]);
  const periodeTerakhir = periods[0];

  /* ---------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader icon={Users} title="Karyawan & HR"
        subtitle="Data karyawan • absensi harian • payroll bulanan • cuti & izin"
        badge={empSummary ? empSummary.aktif+' aktif' : null}
        actions={<>
          <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="HR"/>
          {tab==='karyawan' && <button onClick={()=>openEmployee(null)} title="Tambah karyawan + akun login" className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Karyawan Baru</button>}
          {tab==='absensi' && <button onClick={()=>{ setFormErr(''); setModal('checkin'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><CalendarCheck size={14}/> Absen Manual</button>}
          {tab==='payroll' && <button onClick={()=>{ setFormErr(''); setModal('generate'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><PlayCircle size={14}/> Generate Payroll</button>}
          {tab==='cuti' && <button onClick={()=>{ setFormErr(''); setLeaveForm({ employee_id:'', type:'CUTI', start_date:'', end_date:'', reason:'' }); setModal('leave'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Pengajuan</button>}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Users} tone="bg-[#0051d5]/10 text-[#0051d5]" label="KARYAWAN AKTIF" value={empSummary? nf(empSummary.aktif) : '-'} sub={empSummary? 'dari '+empSummary.total+' terdaftar' : ''}/>
        <PosStat icon={CalendarCheck} tone="bg-emerald-50 text-emerald-700" label="HADIR HARI INI"
          value={attSummary? nf(attSummary.hadir) : '-'} sub={attSummary? (attSummary.terlambat+' terlambat • '+attSummary.belum_checkin+' belum absen') : ''}/>
        <PosStat icon={Coins} tone="bg-sky-50 text-sky-700" label="GAJI POKOK / BULAN" value={empSummary? rupiah(empSummary.total_gaji) : '-'} sub={empSummary? 'rata-rata '+rupiah(empSummary.rata_gaji) : ''}/>
        <PosStat icon={Wallet} tone="bg-amber-50 text-amber-700" label="PAYROLL TERAKHIR"
          value={periodeTerakhir? rupiah(periodeTerakhir.total_net) : '-'}
          sub={periodeTerakhir? periodeTerakhir.period+' • '+periodeTerakhir.dibayar+'/'+periodeTerakhir.jumlah+' dibayar' : 'belum ada payroll'}/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari nama / kode / jabatan lalu Enter..." className={posInput+' pl-9'}/>
            </div>
            {tab==='karyawan' && (
              <div className={posSelectWrap}>
                <PosSelect value={department} onChange={setDepartment}>
                  <option value="Semua">Semua Departemen</option>
                  {departments.map(d=> <option key={d} value={d}>{d}</option>)}
                </PosSelect>
              </div>
            )}
            {tab==='absensi' && (
              <input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)} className={posInput+' sm:w-[160px]'}/>
            )}
            {tab==='keterlambatan' && (
              <input type="month" value={lateMonth} onChange={e=>setLateMonth(e.target.value||lateMonth)} className={posInput+' sm:w-[170px]'}/>
            )}
            {tab==='payroll' && (
              <button onClick={postPayrollJournal} disabled={postingPay} className={posBtnSecondary+' h-9 px-3 text-xs'}>
                <Receipt size={13}/> {postingPay? 'Memproses...':'Posting Jurnal'}
              </button>
            )}
            {tab==='payroll' && (
              <div className={posSelectWrap}>
                <PosSelect value={period} onChange={setPeriod}>
                  <option value="Semua">Semua Periode</option>
                  {periods.map(p=> <option key={p.period} value={p.period}>{p.period} ({p.jumlah})</option>)}
                </PosSelect>
              </div>
            )}
          </PosToolbar>

          <PosChipRow label="LIHAT">
            <PosChip active={tab==='karyawan'} onClick={()=>setTab('karyawan')}>Karyawan</PosChip>
            <PosChip active={tab==='absensi'} onClick={()=>setTab('absensi')}>Absensi</PosChip>
            <PosChip active={tab==='keterlambatan'} onClick={()=>setTab('keterlambatan')}>Keterlambatan{late.summary?.days? ' ('+late.summary.days+')':''}</PosChip>
            <PosChip active={tab==='payroll'} onClick={()=>setTab('payroll')}>Payroll</PosChip>
            <PosChip active={tab==='cuti'} onClick={()=>setTab('cuti')}>Cuti &amp; Izin</PosChip>
            {tab!=='keterlambatan' && (<>
            <span className="text-[11px] font-bold tracking-wider text-[#45464d] ml-3">STATUS</span>
            {(tab==='karyawan' ? ['Semua','AKTIF','NONAKTIF']
              : tab==='absensi' ? ['Semua','PRESENT','ABSENT','LEAVE']
              : tab==='payroll' ? ['Semua','DRAFT','APPROVED','PAID']
              : ['Semua','PENDING','APPROVED','REJECTED']).map(s=>(
              <PosChip key={s} active={
                (tab==='karyawan' && empStatus===s) || (tab==='absensi' && attStatus===s) ||
                (tab==='payroll' && payStatus===s) || (tab==='cuti' && leaveStatus===s)}
                onClick={()=>{
                  if (tab==='karyawan') setEmpStatus(s);
                  else if (tab==='absensi') setAttStatus(s);
                  else if (tab==='payroll') setPayStatus(s);
                  else setLeaveStatus(s);
                }}>{s}</PosChip>
            ))}
            </>)}
          </PosChipRow>

          {tab==='keterlambatan' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 font-bold text-amber-800">Batas masuk {late.cutoff_label||'08:00 WIB'}</span>
              <span className="px-2.5 py-1 rounded-full bg-white border font-bold">{late.summary?.employees||0} karyawan</span>
              <span className="px-2.5 py-1 rounded-full bg-white border font-bold">{late.summary?.days||0} kejadian</span>
              <span className="px-2.5 py-1 rounded-full bg-white border font-bold">Total {late.summary?.minutes||0} menit</span>
              <span className="px-2.5 py-1 rounded-full bg-white border font-bold">Rata-rata {late.summary?.avg_minutes||0} menit/kejadian</span>
              <span className="ml-auto text-[11px] text-[#76777d]">Periode {late.month||lateMonth} • data dari absensi (check-in lewat batas)</span>
            </div>
          )}
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                {tab==='karyawan' && (<>
                  <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                    <PosTh>KARYAWAN</PosTh><PosTh>JABATAN / DEPARTEMEN</PosTh>
                    <PosTh align="right">GAJI POKOK</PosTh><PosTh align="center">HADIR 30 HARI</PosTh>
                    <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {employees.map(e=>(
                      <tr key={e.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0b1c30]">{e.name}</div>
                          <div className="text-[11px] text-[#45464d] font-mono">{e.employee_code} • {e.phone||'tanpa telepon'}</div>
                          <div className="mt-1">
                            {e.username
                              ? <PosBadge tone={e.account_active===false?'amber':'emerald'}><KeyRound size={11}/> {e.username} • {((e.roles||[])[0])||'tanpa role'}</PosBadge>
                              : <PosBadge tone="red">belum ada akun</PosBadge>}
                          </div>
                        </td>
                        <td className={posTd}>
                          <div className="text-[#2b3445]">{e.position||'-'}</div>
                          <div className="text-[11px] text-[#76777d]">{e.department||'-'}</div>
                        </td>
                        <td className={posTd+' text-right tabular-nums'}>{rupiah(e.basic_salary)}</td>
                        <td className={posTd+' text-center'}>
                          <PosBadge tone={num(e.hadir_30)>0?'emerald':'slate'}>{e.hadir_30||0} hari</PosBadge>
                        </td>
                        <td className={posTd+' text-center'}>
                          <PosBadge tone={e.is_active?'emerald':'slate'}>{e.is_active?'AKTIF':'NONAKTIF'}</PosBadge>
                          {num(e.cuti_pending)>0 && <div className="mt-1"><PosBadge tone="amber">{e.cuti_pending} cuti pending</PosBadge></div>}
                        </td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            <button onClick={()=>openDetail(e)} className={posBtnSm}><Eye size={13}/> Detail</button>
                            <button onClick={()=>openEmployee(e)} className={posBtnSm}><Pencil size={13}/> Edit</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!employees.length && <PosEmpty colSpan={6} text="Belum ada karyawan"/>}
                  </tbody>
                </>)}

                {tab==='absensi' && (<>
                  <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">TANGGAL</PosTh><PosTh align="center">MASUK</PosTh>
                    <PosTh align="center">PULANG</PosTh><PosTh align="center">JAM KERJA</PosTh>
                    <PosTh align="center">KETERANGAN</PosTh>
                  </tr></thead>
                  <tbody>
                    {attendance.map(a=>(
                      <tr key={a.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0b1c30]">{a.name}</div>
                          <div className="text-[11px] text-[#45464d] font-mono">{a.employee_code} • {a.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs'}>{iso(a.date)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{jam(a.check_in)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{jam(a.check_out)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{a.jam_kerja!=null? Number(a.jam_kerja).toFixed(1)+' jam' : '-'}</td>
                        <td className={posTd+' text-center'}>
                          {a.terlambat ? <PosBadge tone="amber"><Clock size={11}/> Terlambat{parseInt(a.late_minutes||0)>0? ' '+a.late_minutes+' mnt':''}</PosBadge>
                            : a.check_in ? <PosBadge tone="emerald"><CheckCircle2 size={11}/> Tepat waktu</PosBadge>
                            : <PosBadge tone="slate">{a.status||'-'}</PosBadge>}
                          {a.check_in_distance_m!=null && <div className="text-[10px] text-[#76777d] mt-0.5">{a.check_in_distance_m} m dari pusat</div>}
                          {a.note && <div className="text-[10px] text-amber-700 mt-0.5 leading-snug">{a.note}</div>}
                        </td>
                      </tr>
                    ))}
                    {!attendance.length && <PosEmpty colSpan={6} text={'Belum ada absensi pada '+attDate}/>}
                  </tbody>
                </>)}

                {tab==='keterlambatan' && (<>
                  <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">HARI TERLAMBAT</PosTh><PosTh align="right">TOTAL MENIT</PosTh>
                    <PosTh align="right">RATA-RATA</PosTh><PosTh align="center">TERAKHIR</PosTh>
                  </tr></thead>
                  <tbody>
                    {(late.rows||[]).map(r=>(
                      <tr key={r.employee_id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0b1c30]">{r.name}</div>
                          <div className="text-[11px] text-[#45464d] font-mono">{r.employee_code} • {r.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center'}><PosBadge tone="amber">{r.days_late} hari</PosBadge></td>
                        <td className={posTd+' text-right font-bold tabular-nums'}>{nf(r.total_minutes)} mnt</td>
                        <td className={posTd+' text-right tabular-nums'}>{nf(r.avg_minutes)} mnt</td>
                        <td className={posTd+' text-center text-xs'}>{iso(r.last_date)}</td>
                      </tr>
                    ))}
                    {!(late.rows||[]).length && <PosEmpty colSpan={5} text={'Tidak ada keterlambatan pada '+(late.month||lateMonth)}/>}
                  </tbody>
                </>)}

                {tab==='payroll' && (<>
                  <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">PERIODE</PosTh><PosTh align="right">GAJI POKOK</PosTh>
                    <PosTh align="right">TUNJANGAN</PosTh><PosTh align="right">BPJS</PosTh><PosTh align="right">PPh21</PosTh>
                    <PosTh align="right">GAJI BERSIH</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {payrolls.map(p=>(
                      <tr key={p.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0b1c30]">{p.name}</div>
                          <div className="text-[11px] text-[#45464d] font-mono">{p.employee_code} • {p.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs font-mono'}>{p.period}</td>
                        <td className={posTd+' text-right tabular-nums'}>{rupiah(p.basic_salary)}</td>
                        <td className={posTd+' text-right tabular-nums text-emerald-700'}>{rupiah(p.allowances)}</td>
                        <td className={posTd+' text-right tabular-nums text-red-600'}>{rupiah(p.bpjs_employee)}</td>
                        <td className={posTd+' text-right tabular-nums text-red-600'}>{rupiah(p.pph21)}</td>
                        <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(p.net_salary)}</td>
                        <td className={posTd+' text-center'}><PosBadge tone={PAY_TONE[p.status]||'slate'}>{p.status}</PosBadge></td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            {p.status==='DRAFT' && <button onClick={()=>setPayrollStatus(p,'APPROVED')} className={posBtnSm+' bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'}><BadgeCheck size={13}/> Setujui</button>}
                            {p.status!=='PAID' && <button onClick={()=>setPayrollStatus(p,'PAID')} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><Wallet size={13}/> Bayar</button>}
                            {p.status==='PAID' && <span className="text-xs text-[#76777d]">sudah dibayar</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!payrolls.length && <PosEmpty colSpan={9} text="Belum ada payroll - tekan Generate Payroll"/>}
                  </tbody>
                  {payTotals && !!payrolls.length && (
                    <tfoot><tr className="bg-[#eff4ff] border-t-2 border-[#e7ecf7] font-bold">
                      <td className={posTd} colSpan={2}>TOTAL (semua halaman filter ini)</td>
                      <td className={posTd+' text-right tabular-nums'}>{rupiah(payTotals.basic)}</td>
                      <td className={posTd+' text-right tabular-nums'}>{rupiah(payTotals.tunjangan)}</td>
                      <td className={posTd+' text-right tabular-nums'}>{rupiah(payTotals.bpjs)}</td>
                      <td className={posTd+' text-right tabular-nums'}>{rupiah(payTotals.pph)}</td>
                      <td className={posTd+' text-right tabular-nums'}>{rupiah(payTotals.net)}</td>
                      <td className={posTd} colSpan={2}></td>
                    </tr></tfoot>
                  )}
                </>)}

                {tab==='cuti' && (<>
                  <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">JENIS</PosTh><PosTh align="center">PERIODE</PosTh>
                    <PosTh align="center">HARI</PosTh><PosTh>ALASAN</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {leaves.map(l=>(
                      <tr key={l.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0b1c30]">{l.name}</div>
                          <div className="text-[11px] text-[#45464d] font-mono">{l.employee_code} • {l.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs'}>{LEAVE_TYPE[l.type]||l.type||'-'}</td>
                        <td className={posTd+' text-center text-xs'}>{iso(l.start_date)} → {iso(l.end_date)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{l.jumlah_hari||'-'}</td>
                        <td className={posTd+' text-xs text-[#45464d]'}>{(l.reason||'-').slice(0,60)}</td>
                        <td className={posTd+' text-center'}>
                          <PosBadge tone={LEAVE_TONE[l.status]||'slate'}>{l.status||'-'}</PosBadge>
                          {l.approved_by_name && <div className="text-[11px] text-[#76777d] mt-1">oleh {l.approved_by_name}</div>}
                        </td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            {l.status==='PENDING' ? (<>
                              <button onClick={()=>decideLeave(l,'APPROVED')} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><CheckCircle2 size={13}/> Setujui</button>
                              <button onClick={()=>decideLeave(l,'REJECTED')} className={posBtnSm+' bg-white border-red-200 text-red-600 hover:bg-red-50'}>Tolak</button>
                            </>) : <span className="text-xs text-[#76777d]">selesai</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!leaves.length && <PosEmpty colSpan={7} text="Belum ada pengajuan cuti/izin"/>}
                  </tbody>
                </>)}
              </table>
            </div>
            {tab!=='keterlambatan' && (tab==='karyawan'?empTotal:tab==='absensi'?attTotal:tab==='payroll'?payTotal:leaveTotal) > 0 && (
              <PosCardBody>
                <PosPager page={safePage} setPage={setPage}
                  total={tab==='karyawan'?empTotal:tab==='absensi'?attTotal:tab==='payroll'?payTotal:leaveTotal}
                  size={PAGE_SIZE} unit="baris"/>
              </PosCardBody>
            )}
          </>
        )}
      </PosCard>

      {tab==='keterlambatan' && (
        <PosCard>
          <PosCardBody className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-[#45464d]">DETAIL HARIAN KETERLAMBATAN</span>
            <span className="text-[11px] text-[#76777d]">{(late.details||[]).length} baris • jam masuk, menit terlambat, jarak absen, catatan</span>
          </PosCardBody>
          <div className="overflow-auto max-h-[440px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0"><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                <PosTh>TANGGAL</PosTh><PosTh>KARYAWAN</PosTh><PosTh align="center">MASUK</PosTh>
                <PosTh align="right">TERLAMBAT</PosTh><PosTh align="center">JARAK</PosTh><PosTh>CATATAN</PosTh>
              </tr></thead>
              <tbody>
                {(late.details||[]).map(d=>(
                  <tr key={d.id} className={posTr}>
                    <td className={posTd+' text-xs whitespace-nowrap'}>{iso(d.date)}</td>
                    <td className={posTd}>
                      <div className="font-semibold text-[#0b1c30]">{d.name}</div>
                      <div className="text-[11px] text-[#45464d] font-mono">{d.employee_code}</div>
                    </td>
                    <td className={posTd+' text-center tabular-nums'}>{jam(d.check_in)}</td>
                    <td className={posTd+' text-right font-bold tabular-nums text-amber-700'}>{nf(d.late_minutes)} mnt</td>
                    <td className={posTd+' text-center text-xs'}>{d.check_in_distance_m!=null? nf(d.check_in_distance_m)+' m' : '-'}</td>
                    <td className={posTd+' text-[11px] text-[#45464d]'}>{d.note||'-'}</td>
                  </tr>
                ))}
                {!(late.details||[]).length && <PosEmpty colSpan={6} text="Belum ada keterlambatan pada periode ini"/>}
              </tbody>
            </table>
          </div>
        </PosCard>
      )}

      {/* ------------------------------------------------ modal karyawan */}
      {modal==='employee' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitEmployee} className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[92vh] overflow-auto space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">{editing? 'Edit Karyawan':'Karyawan Baru'}</h3>
                <div className="text-xs text-[#45464d] mt-0.5">{editing? editing.name : 'Gaji pokok dipakai untuk generate payroll bulanan'}</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">KODE KARYAWAN *</span>
                <input value={empForm.employee_code} onChange={e=>setEmpForm({...empForm, employee_code:e.target.value})} placeholder="EMP-009" className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA *</span>
                <input value={empForm.name} onChange={e=>setEmpForm({...empForm, name:e.target.value})} placeholder="Nama lengkap" className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">JABATAN</span>
                <input value={empForm.position} onChange={e=>setEmpForm({...empForm, position:e.target.value, role_name:''})}
                  list="hr-positions" placeholder="mis. Kasir" className={posInput} autoComplete="off"/>
                <datalist id="hr-positions">{POSITION_OPTIONS.map(x=><option key={x} value={x}/>)}</datalist>
                <span className="block text-[11px] text-[#76777d]">Role: <b className="text-[#0051d5]">{empForm.role_name || roleForPosition(empForm.position)}</b>{empForm.role_name? ' (dipilih manual)':(empForm.position? ' (otomatis)':'')}</span></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">DEPARTEMEN</span>
                <input value={empForm.department} onChange={e=>setEmpForm({...empForm, department:e.target.value})} placeholder="mis. Sales" className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">TANGGAL MASUK</span>
                <input type="date" value={empForm.join_date} onChange={e=>setEmpForm({...empForm, join_date:e.target.value})} className={posInput}/></label>
              <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#45464d]">KUOTA CUTI TAHUNAN (HARI)</span>
                <input type="number" min="0" value={empForm.leave_quota} onChange={e=>setEmpForm({...empForm, leave_quota:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">GAJI POKOK Rp</span>
                <input type="number" value={empForm.basic_salary} onChange={e=>setEmpForm({...empForm, basic_salary:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">TELEPON</span>
                <input value={empForm.phone} onChange={e=>setEmpForm({...empForm, phone:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NPWP</span>
                <input value={empForm.npwp} onChange={e=>setEmpForm({...empForm, npwp:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NO. BPJS</span>
                <input value={empForm.bpjs_number} onChange={e=>setEmpForm({...empForm, bpjs_number:e.target.value})} className={posInput}/></label>
            </div>
            {!editing && (
              <div className="rounded-xl border border-[#e7ecf7] bg-[#f7faff] p-3 space-y-2">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
                  <input type="checkbox" checked={!!empForm.create_account} onChange={e=>setEmpForm({...empForm, create_account:e.target.checked})}/>
                  Buat akun login sekaligus
                </label>
                {empForm.create_account && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">USERNAME *</span>
                        <input value={empForm.username} onChange={e=>setEmpForm({...empForm, username:e.target.value})} placeholder="mis. budi.santoso" autoComplete="off" className={posInput}/></label>
                      <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">PASSWORD AWAL *</span>
                        <input type="password" value={empForm.password} onChange={e=>setEmpForm({...empForm, password:e.target.value})} placeholder="minimal 8 karakter" autoComplete="new-password" className={posInput}/></label>
                    </div>
                    <label className="block space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ROLE AKUN</span>
                      <select value={empForm.role_name} onChange={e=>setEmpForm({...empForm, role_name:e.target.value})} className={posInput}>
                        <option value="">Otomatis dari jabatan ({roleForPosition(empForm.position)})</option>
                        {ASSIGNABLE_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                      </select></label>
                    <div className="text-[11px] text-[#45464d]">
                      Role efektif: <b className="text-[#0051d5]">{empForm.role_name || roleForPosition(empForm.position)}</b>. Menu &amp; API mengikuti role ini. Password disimpan sebagai hash bcrypt dan tidak bisa dilihat lagi.
                    </div>
                  </>
                )}
              </div>
            )}
            {editing && (
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={empForm.is_active} onChange={e=>setEmpForm({...empForm, is_active:e.target.checked})}/>
                Karyawan aktif (muncul di pilihan absensi &amp; payroll)
              </label>
            )}
            <div className="text-[11px] text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-2">
              Payroll bulanan dihitung: tunjangan 10% dari gaji pokok, BPJS karyawan 2%, BPJS perusahaan 4%, PPh21 5%.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------ modal akun karyawan */}
      {modal==='account' && accTarget && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitAccount} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Buat Akun Login</h3>
                <div className="text-xs text-[#45464d] mt-0.5">{accTarget.name} • {accTarget.employee_code} • {accTarget.position||'tanpa jabatan'}</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="block space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">USERNAME *</span>
              <input value={accForm.username} onChange={e=>setAccForm({...accForm, username:e.target.value})} placeholder="mis. budi.santoso" autoComplete="off" className={posInput}/></label>
            <label className="block space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">PASSWORD AWAL *</span>
              <input type="password" value={accForm.password} onChange={e=>setAccForm({...accForm, password:e.target.value})} placeholder="minimal 8 karakter" autoComplete="new-password" className={posInput}/></label>
            <label className="block space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ROLE AKUN</span>
              <select value={accForm.role_name} onChange={e=>setAccForm({...accForm, role_name:e.target.value})} className={posInput}>
                <option value="">Otomatis dari jabatan ({roleForPosition(accTarget.position)})</option>
                {ASSIGNABLE_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
              </select></label>
            <div className="text-[11px] text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-2">
              Role efektif: <b className="text-[#0051d5]">{accForm.role_name || roleForPosition(accTarget.position)}</b>. Password disimpan sebagai hash dan tidak ditampilkan lagi.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving? <RefreshCw size={14} className="animate-spin"/> : <KeyRound size={14}/>} Buat Akun
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------ modal absensi */}
      {modal==='checkin' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Absen Manual</h3>
                <div className="text-xs text-[#45464d] mt-0.5">Untuk karyawan yang lupa absen - pilih karyawan lalu Check-in / Check-out</div>
              </div>
              <button onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {attSummary?.belum_checkin_list?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <b>{attSummary.belum_checkin} karyawan belum absen hari ini:</b> {attSummary.belum_checkin_list.slice(0,8).map(e=>e.name).join(', ')}
                {attSummary.belum_checkin_list.length>8? ' dan lainnya':''}
              </div>
            )}
            <div className="max-h-[50vh] overflow-auto divide-y divide-[#e5eeff] border border-[#e7ecf7] rounded-xl">
              {employees.filter(e=> e.is_active!==false).map(e=>(
                <div key={e.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-[#0b1c30]">{e.name}</div>
                    <div className="text-[11px] text-[#45464d] font-mono">{e.employee_code} • {e.position||'-'}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={()=>checkAction(e.id,'in')} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><CalendarCheck size={13}/> Masuk</button>
                    <button onClick={()=>checkAction(e.id,'out')} className={posBtnSm+' bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'}><Clock size={13}/> Pulang</button>
                  </div>
                </div>
              ))}
              {!employees.length && <div className="p-4 text-center text-xs text-[#76777d]">Belum ada karyawan</div>}
            </div>
            <div className="flex justify-end"><button onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button></div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ modal payroll */}
      {modal==='generate' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={generatePayroll} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Generate Payroll</h3>
                <div className="text-xs text-[#45464d] mt-0.5">Menghitung gaji semua karyawan aktif untuk periode terpilih</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">PERIODE (YYYY-MM)</span>
              <input value={genPeriod} onChange={e=>setGenPeriod(e.target.value)} placeholder="2026-10" className={posInput+' font-mono'}/></label>
            <div className="text-[11px] text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-2">
              Payroll yang sudah <b>PAID</b> tidak akan ditimpa. Yang masih DRAFT akan dihitung ulang.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving? <RefreshCw size={14} className="animate-spin"/> : <PlayCircle size={14}/>} Generate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------ modal cuti */}
      {modal==='leave' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitLeave} className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 border shadow-raised animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Pengajuan Cuti / Izin</h3>
                <div className="text-xs text-[#45464d] mt-0.5">Pengajuan masuk sebagai PENDING, menunggu persetujuan</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">KARYAWAN *</span>
              <PosSelect size="md" value={leaveForm.employee_id} onChange={v=>setLeaveForm({...leaveForm, employee_id:v})}>
                <option value="">Pilih karyawan</option>
                {employees.filter(e=> e.is_active!==false).map(e=> <option key={e.id} value={e.id}>{e.name} • {e.employee_code}</option>)}
              </PosSelect></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">JENIS</span>
                <PosSelect size="md" value={leaveForm.type} onChange={v=>setLeaveForm({...leaveForm, type:v})}>
                  {Object.entries(LEAVE_TYPE).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">MULAI *</span>
                <input type="date" value={leaveForm.start_date} onChange={e=>setLeaveForm({...leaveForm, start_date:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">SELESAI *</span>
                <input type="date" value={leaveForm.end_date} onChange={e=>setLeaveForm({...leaveForm, end_date:e.target.value})} className={posInput}/></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ALASAN</span>
              <input value={leaveForm.reason} onChange={e=>setLeaveForm({...leaveForm, reason:e.target.value})} placeholder="mis. acara keluarga" className={posInput}/></label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving? <RefreshCw size={14} className="animate-spin"/> : <Plane size={14}/>} Ajukan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------ detail karyawan */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-raised overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">{detail.name||'Karyawan'}</h3>
                <div className="text-xs text-[#45464d] mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{detail.employee_code}</span><span>•</span>
                  <span>{detail.position||'-'}</span><span>•</span>
                  <span>{detail.department||'-'}</span>
                  <PosBadge tone={detail.is_active?'emerald':'slate'}>{detail.is_active?'AKTIF':'NONAKTIF'}</PosBadge>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={5} cols={4}/> : (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-2.5"><div className="text-[#45464d]">Gaji Pokok</div><div className="font-bold text-[#0b1c30]">{rupiah(detail.basic_salary)}</div></div>
                  <div className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-2.5"><div className="text-[#45464d]">Tgl Masuk</div><div className="font-bold">{iso(detail.join_date)||'-'}</div></div>
                  <div className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-2.5"><div className="text-[#45464d]">Hadir Bulan Ini</div><div className="font-bold">{detail.hadir_bulan_ini||0} hari</div></div>
                  <div className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-2.5"><div className="text-[#45464d]">Kontak</div><div className="font-bold">{detail.phone||'-'}</div></div>
                </div>
                <div className="rounded-xl border border-[#e7ecf7] p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="text-[11px] font-bold tracking-wider text-[#45464d]">AKUN LOGIN</div>
                    {detail.account
                      ? <div className="flex items-center gap-2 mt-1">
                          <KeyRound size={13} className="text-[#0051d5]"/>
                          <span className="font-bold">{detail.account.username}</span>
                          <PosBadge tone="sky">{(detail.account.roles||[])[0]||'tanpa role'}</PosBadge>
                          <PosBadge tone={detail.account.account_active?'emerald':'slate'}>{detail.account.account_active?'AKTIF':'NONAKTIF'}</PosBadge>
                        </div>
                      : <div className="text-[#76777d] mt-1">Belum punya akun login.</div>}
                  </div>
                  {!detail.account && (
                    <button onClick={()=>openAccount(detail)} className={posBtnPrimary+' h-8 px-3 text-xs'}><KeyRound size={13}/> Buat Akun</button>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-[#45464d] mb-2">PAYROLL TERAKHIR ({(detail.payrolls||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-[#e7ecf7]">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#e5eeff] border-b border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                        <PosTh>PERIODE</PosTh><PosTh align="right">POKOK</PosTh><PosTh align="right">BERSIH</PosTh><PosTh align="center">STATUS</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.payrolls||[]).map(p=>(
                          <tr key={p.id} className={posTr}>
                            <td className={posTd+' font-mono text-xs'}>{p.period}</td>
                            <td className={posTd+' text-right tabular-nums'}>{rupiah(p.basic_salary)}</td>
                            <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(p.net_salary)}</td>
                            <td className={posTd+' text-center'}><PosBadge tone={PAY_TONE[p.status]||'slate'}>{p.status}</PosBadge></td>
                          </tr>
                        ))}
                        {!(detail.payrolls||[]).length && <PosEmpty colSpan={4} text="Belum ada payroll"/>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-[#45464d] mb-2">ABSENSI TERAKHIR ({(detail.attendance||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-[#e7ecf7] max-h-[220px]">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#e5eeff] border-b border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                        <PosTh>TANGGAL</PosTh><PosTh align="center">MASUK</PosTh><PosTh align="center">PULANG</PosTh><PosTh align="center">STATUS</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.attendance||[]).map(a=>(
                          <tr key={a.id} className={posTr}>
                            <td className={posTd+' text-xs'}>{iso(a.date)}</td>
                            <td className={posTd+' text-center tabular-nums'}>{jam(a.check_in)}</td>
                            <td className={posTd+' text-center tabular-nums'}>{jam(a.check_out)}</td>
                            <td className={posTd+' text-center text-xs'}>{a.status||'-'}</td>
                          </tr>
                        ))}
                        {!(detail.attendance||[]).length && <PosEmpty colSpan={4} text="Belum ada absensi"/>}
                      </tbody>
                    </table>
                  </div>
                </div>
                {!!(detail.leaves||[]).length && (
                  <div>
                    <div className="text-[11px] font-bold tracking-wider text-[#45464d] mb-2">CUTI &amp; IZIN</div>
                    <div className="space-y-2">
                      {detail.leaves.map(l=>(
                        <div key={l.id} className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-2.5 flex items-center justify-between gap-2 text-sm">
                          <span>{LEAVE_TYPE[l.type]||l.type} • {iso(l.start_date)} → {iso(l.end_date)}</span>
                          <PosBadge tone={LEAVE_TONE[l.status]||'slate'}>{l.status}</PosBadge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>)}
            </div>
            <div className="p-3 border-t flex justify-end gap-2">
              <button onClick={()=>{ setDetail(null); openEmployee(detail); }} className={posBtnSecondary+' h-9 px-4 text-xs'}><Pencil size={13}/> Edit</button>
              <button onClick={()=>setDetail(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
