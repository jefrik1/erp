import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Search, RefreshCw, Plus, X, Pencil, CalendarCheck, Wallet, Plane,
  Clock, AlertTriangle, CheckCircle2, Eye, PlayCircle, BadgeCheck, Building2, Coins,
} from 'lucide-react';
import api from '../lib/api';
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
const jam = (t)=> t ? new Date(t).toTimeString().slice(0,5) : '-';

const LEAVE_TYPE = { CUTI:'Cuti tahunan', SAKIT:'Sakit', IZIN:'Izin', DINAS:'Dinas luar', TANPA_BAYAR:'Tanpa upah' };
const LEAVE_TONE = { PENDING:'amber', APPROVED:'emerald', REJECTED:'red' };
const PAY_TONE = { DRAFT:'amber', APPROVED:'sky', PAID:'emerald' };

export default function HR(){
  const dialog = useDialog();
  const [tab, setTab] = useState('karyawan');       // karyawan | absensi | payroll | cuti
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
  const [empForm, setEmpForm] = useState({ employee_code:'', name:'', position:'', department:'', branch_id:'', join_date:'', basic_salary:'', phone:'', npwp:'', bpjs_number:'', is_active:true, leave_quota:12 });

  const [attendance, setAttendance] = useState([]);
  const [attTotal, setAttTotal] = useState(0);
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0,10));
  const [attSummary, setAttSummary] = useState(null);
  const [attStatus, setAttStatus] = useState('Semua');

  const [payrolls, setPayrolls] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payTotals, setPayTotals] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState('Semua');
  const [payStatus, setPayStatus] = useState('Semua');
  const [genPeriod, setGenPeriod] = useState(new Date().toISOString().slice(0,7));

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

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      if (tab==='karyawan') await loadEmployees();
      else if (tab==='absensi') await loadAttendance();
      else if (tab==='payroll') await loadPayrolls();
      else await loadLeaves();
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal memuat data HR'); }
    finally{ setLoading(false); }
  },[tab,loadEmployees,loadAttendance,loadPayrolls,loadLeaves]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,tab,department,empStatus,attStatus,attDate,period,payStatus,leaveStatus]);

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
        phone:emp.phone||'', npwp:emp.npwp||'', bpjs_number:emp.bpjs_number||'', is_active: emp.is_active!==false });
    } else {
      setEditing(null);
      setEmpForm({ employee_code:'', name:'', position:'', department:'', branch_id:'', join_date:'', basic_salary:'', phone:'', npwp:'', bpjs_number:'', is_active:true, leave_quota:12 });
    }
    setModal('employee');
  };

  const submitEmployee = async (e)=>{
    e.preventDefault();
    if (!empForm.employee_code.trim() || !empForm.name.trim()){ setFormErr('Kode dan nama karyawan wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    const payload = { ...empForm, employee_code:empForm.employee_code.trim().toUpperCase(), basic_salary:num(empForm.basic_salary),
      branch_id: empForm.branch_id? parseInt(empForm.branch_id):null, join_date: empForm.join_date||null };
    try{
      if (editing) await api.put('/hr/employees/'+editing.id, payload);
      else await api.post('/hr/employees', payload);
      setModal('');
      await dialog.alert(editing? 'Data '+payload.name+' diperbarui.' : 'Karyawan '+payload.name+' ditambahkan.', { title:'Tersimpan' });
      load();
      api.get('/hr/employees/summary').then(r=>setEmpSummary(r.data)).catch(()=>{});
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan'); }
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
      const r = await api.post('/hr/attendance/'+(mode==='in'?'checkin':'checkout'), { employee_id: parseInt(employeeId) });
      await dialog.alert((mode==='in'?'Check-in':'Check-out')+' tercatat pukul '+jam(r.data?.row?.[mode==='in'?'check_in':'check_out'])+'.', { title:'Absensi' });
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
      const dataset = tab==='karyawan' ? 'employees' : tab==='absensi' ? 'attendance' : tab==='payroll' ? 'payrolls' : 'leaves';
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

  const totalPages = Math.max(1, Math.ceil((tab==='karyawan'?empTotal:tab==='absensi'?attTotal:tab==='payroll'?payTotal:leaveTotal)/PAGE_SIZE));
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
          {tab==='karyawan' && <button onClick={()=>openEmployee(null)} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Karyawan</button>}
          {tab==='absensi' && <button onClick={()=>{ setFormErr(''); setModal('checkin'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><CalendarCheck size={14}/> Absen Manual</button>}
          {tab==='payroll' && <button onClick={()=>{ setFormErr(''); setModal('generate'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><PlayCircle size={14}/> Generate Payroll</button>}
          {tab==='cuti' && <button onClick={()=>{ setFormErr(''); setLeaveForm({ employee_id:'', type:'CUTI', start_date:'', end_date:'', reason:'' }); setModal('leave'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Pengajuan</button>}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Users} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="KARYAWAN AKTIF" value={empSummary? nf(empSummary.aktif) : '-'} sub={empSummary? 'dari '+empSummary.total+' terdaftar' : ''}/>
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
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
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
            <PosChip active={tab==='payroll'} onClick={()=>setTab('payroll')}>Payroll</PosChip>
            <PosChip active={tab==='cuti'} onClick={()=>setTab('cuti')}>Cuti &amp; Izin</PosChip>
            <span className="text-[11px] font-bold tracking-widest text-[#64748B] ml-3">STATUS</span>
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
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                {tab==='karyawan' && (<>
                  <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                    <PosTh>KARYAWAN</PosTh><PosTh>JABATAN / DEPARTEMEN</PosTh><PosTh align="center">CABANG</PosTh>
                    <PosTh align="right">GAJI POKOK</PosTh><PosTh align="center">HADIR 30 HARI</PosTh>
                    <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {employees.map(e=>(
                      <tr key={e.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0F172A]">{e.name}</div>
                          <div className="text-[11px] text-[#64748B] font-mono">{e.employee_code} • {e.phone||'tanpa telepon'}</div>
                        </td>
                        <td className={posTd}>
                          <div className="text-[#334155]">{e.position||'-'}</div>
                          <div className="text-[11px] text-[#94A3B8]">{e.department||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs'}>{e.branch_name||'-'}</td>
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
                    {!employees.length && <PosEmpty colSpan={7} text="Belum ada karyawan"/>}
                  </tbody>
                </>)}

                {tab==='absensi' && (<>
                  <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">TANGGAL</PosTh><PosTh align="center">MASUK</PosTh>
                    <PosTh align="center">PULANG</PosTh><PosTh align="center">JAM KERJA</PosTh>
                    <PosTh align="center">KETERANGAN</PosTh>
                  </tr></thead>
                  <tbody>
                    {attendance.map(a=>(
                      <tr key={a.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0F172A]">{a.name}</div>
                          <div className="text-[11px] text-[#64748B] font-mono">{a.employee_code} • {a.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs'}>{iso(a.date)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{jam(a.check_in)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{jam(a.check_out)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{a.jam_kerja!=null? Number(a.jam_kerja).toFixed(1)+' jam' : '-'}</td>
                        <td className={posTd+' text-center'}>
                          {a.terlambat ? <PosBadge tone="amber"><Clock size={11}/> Terlambat</PosBadge>
                            : a.check_in ? <PosBadge tone="emerald"><CheckCircle2 size={11}/> Tepat waktu</PosBadge>
                            : <PosBadge tone="slate">{a.status||'-'}</PosBadge>}
                        </td>
                      </tr>
                    ))}
                    {!attendance.length && <PosEmpty colSpan={6} text={'Belum ada absensi pada '+attDate}/>}
                  </tbody>
                </>)}

                {tab==='payroll' && (<>
                  <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">PERIODE</PosTh><PosTh align="right">GAJI POKOK</PosTh>
                    <PosTh align="right">TUNJANGAN</PosTh><PosTh align="right">BPJS</PosTh><PosTh align="right">PPh21</PosTh>
                    <PosTh align="right">GAJI BERSIH</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {payrolls.map(p=>(
                      <tr key={p.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0F172A]">{p.name}</div>
                          <div className="text-[11px] text-[#64748B] font-mono">{p.employee_code} • {p.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs font-mono'}>{p.period}</td>
                        <td className={posTd+' text-right tabular-nums'}>{rupiah(p.basic_salary)}</td>
                        <td className={posTd+' text-right tabular-nums text-emerald-700'}>{rupiah(p.allowances)}</td>
                        <td className={posTd+' text-right tabular-nums text-red-600'}>{rupiah(p.bpjs_employee)}</td>
                        <td className={posTd+' text-right tabular-nums text-red-600'}>{rupiah(p.pph21)}</td>
                        <td className={posTd+' text-right font-black tabular-nums'}>{rupiah(p.net_salary)}</td>
                        <td className={posTd+' text-center'}><PosBadge tone={PAY_TONE[p.status]||'slate'}>{p.status}</PosBadge></td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            {p.status==='DRAFT' && <button onClick={()=>setPayrollStatus(p,'APPROVED')} className={posBtnSm+' bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'}><BadgeCheck size={13}/> Setujui</button>}
                            {p.status!=='PAID' && <button onClick={()=>setPayrollStatus(p,'PAID')} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><Wallet size={13}/> Bayar</button>}
                            {p.status==='PAID' && <span className="text-xs text-[#94A3B8]">sudah dibayar</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!payrolls.length && <PosEmpty colSpan={9} text="Belum ada payroll - tekan Generate Payroll"/>}
                  </tbody>
                  {payTotals && !!payrolls.length && (
                    <tfoot><tr className="bg-[#F8FAFC] border-t-2 border-[#E2E8F0] font-bold">
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
                  <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                    <PosTh>KARYAWAN</PosTh><PosTh align="center">JENIS</PosTh><PosTh align="center">PERIODE</PosTh>
                    <PosTh align="center">HARI</PosTh><PosTh>ALASAN</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {leaves.map(l=>(
                      <tr key={l.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold text-[#0F172A]">{l.name}</div>
                          <div className="text-[11px] text-[#64748B] font-mono">{l.employee_code} • {l.position||'-'}</div>
                        </td>
                        <td className={posTd+' text-center text-xs'}>{LEAVE_TYPE[l.type]||l.type||'-'}</td>
                        <td className={posTd+' text-center text-xs'}>{iso(l.start_date)} → {iso(l.end_date)}</td>
                        <td className={posTd+' text-center tabular-nums'}>{l.jumlah_hari||'-'}</td>
                        <td className={posTd+' text-xs text-[#64748B]'}>{(l.reason||'-').slice(0,60)}</td>
                        <td className={posTd+' text-center'}>
                          <PosBadge tone={LEAVE_TONE[l.status]||'slate'}>{l.status||'-'}</PosBadge>
                          {l.approved_by_name && <div className="text-[10px] text-[#94A3B8] mt-1">oleh {l.approved_by_name}</div>}
                        </td>
                        <td className={posTd}>
                          <div className="flex justify-end gap-1.5">
                            {l.status==='PENDING' ? (<>
                              <button onClick={()=>decideLeave(l,'APPROVED')} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><CheckCircle2 size={13}/> Setujui</button>
                              <button onClick={()=>decideLeave(l,'REJECTED')} className={posBtnSm+' bg-white border-red-200 text-red-600 hover:bg-red-50'}>Tolak</button>
                            </>) : <span className="text-xs text-[#94A3B8]">selesai</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!leaves.length && <PosEmpty colSpan={7} text="Belum ada pengajuan cuti/izin"/>}
                  </tbody>
                </>)}
              </table>
            </div>
            {(tab==='karyawan'?empTotal:tab==='absensi'?attTotal:tab==='payroll'?payTotal:leaveTotal) > 0 && (
              <PosCardBody>
                <PosPager page={safePage} setPage={setPage}
                  total={tab==='karyawan'?empTotal:tab==='absensi'?attTotal:tab==='payroll'?payTotal:leaveTotal}
                  size={PAGE_SIZE} unit="baris"/>
              </PosCardBody>
            )}
          </>
        )}
      </PosCard>

      {/* ------------------------------------------------ modal karyawan */}
      {modal==='employee' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitEmployee} className="bg-white rounded-[20px] p-5 w-full max-w-2xl max-h-[92vh] overflow-auto space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">{editing? 'Edit Karyawan':'Karyawan Baru'}</h3>
                <div className="text-xs text-[#64748B] mt-0.5">{editing? editing.name : 'Gaji pokok dipakai untuk generate payroll bulanan'}</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">KODE KARYAWAN *</span>
                <input value={empForm.employee_code} onChange={e=>setEmpForm({...empForm, employee_code:e.target.value})} placeholder="EMP-009" className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NAMA *</span>
                <input value={empForm.name} onChange={e=>setEmpForm({...empForm, name:e.target.value})} placeholder="Nama lengkap" className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">JABATAN</span>
                <input value={empForm.position} onChange={e=>setEmpForm({...empForm, position:e.target.value})} placeholder="mis. Sales Counter" className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">DEPARTEMEN</span>
                <input value={empForm.department} onChange={e=>setEmpForm({...empForm, department:e.target.value})} placeholder="mis. Sales" className={posInput}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CABANG</span>
                <PosSelect size="md" value={empForm.branch_id} onChange={v=>setEmpForm({...empForm, branch_id:v})}>
                  <option value="">Tanpa cabang</option>
                  {branches.map(b=> <option key={b.id} value={b.id}>{b.code} • {b.name}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TANGGAL MASUK</span>
                <input type="date" value={empForm.join_date} onChange={e=>setEmpForm({...empForm, join_date:e.target.value})} className={posInput}/></label>
              <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#64748B]">KUOTA CUTI TAHUNAN (HARI)</span>
                <input type="number" min="0" value={empForm.leave_quota} onChange={e=>setEmpForm({...empForm, leave_quota:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">GAJI POKOK Rp</span>
                <input type="number" value={empForm.basic_salary} onChange={e=>setEmpForm({...empForm, basic_salary:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TELEPON</span>
                <input value={empForm.phone} onChange={e=>setEmpForm({...empForm, phone:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NPWP</span>
                <input value={empForm.npwp} onChange={e=>setEmpForm({...empForm, npwp:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NO. BPJS</span>
                <input value={empForm.bpjs_number} onChange={e=>setEmpForm({...empForm, bpjs_number:e.target.value})} className={posInput}/></label>
            </div>
            {editing && (
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={empForm.is_active} onChange={e=>setEmpForm({...empForm, is_active:e.target.checked})}/>
                Karyawan aktif (muncul di pilihan absensi & payroll)
              </label>
            )}
            <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">
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

      {/* ------------------------------------------------ modal absensi */}
      {modal==='checkin' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-[20px] p-5 w-full max-w-lg space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Absen Manual</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Untuk karyawan yang lupa absen - pilih karyawan lalu Check-in / Check-out</div>
              </div>
              <button onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {attSummary?.belum_checkin_list?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <b>{attSummary.belum_checkin} karyawan belum absen hari ini:</b> {attSummary.belum_checkin_list.slice(0,8).map(e=>e.name).join(', ')}
                {attSummary.belum_checkin_list.length>8? ' dan lainnya':''}
              </div>
            )}
            <div className="max-h-[50vh] overflow-auto divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-xl">
              {employees.filter(e=> e.is_active!==false).map(e=>(
                <div key={e.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-[#0F172A]">{e.name}</div>
                    <div className="text-[11px] text-[#64748B] font-mono">{e.employee_code} • {e.position||'-'}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={()=>checkAction(e.id,'in')} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><CalendarCheck size={13}/> Masuk</button>
                    <button onClick={()=>checkAction(e.id,'out')} className={posBtnSm+' bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'}><Clock size={13}/> Pulang</button>
                  </div>
                </div>
              ))}
              {!employees.length && <div className="p-4 text-center text-xs text-[#94A3B8]">Belum ada karyawan</div>}
            </div>
            <div className="flex justify-end"><button onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button></div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ modal payroll */}
      {modal==='generate' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={generatePayroll} className="bg-white rounded-[20px] p-5 w-full max-w-md space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Generate Payroll</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Menghitung gaji semua karyawan aktif untuk periode terpilih</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PERIODE (YYYY-MM)</span>
              <input value={genPeriod} onChange={e=>setGenPeriod(e.target.value)} placeholder="2026-10" className={posInput+' font-mono'}/></label>
            <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">
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
          <form onSubmit={submitLeave} className="bg-white rounded-[20px] p-5 w-full max-w-lg space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Pengajuan Cuti / Izin</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Pengajuan masuk sebagai PENDING, menunggu persetujuan</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">KARYAWAN *</span>
              <PosSelect size="md" value={leaveForm.employee_id} onChange={v=>setLeaveForm({...leaveForm, employee_id:v})}>
                <option value="">Pilih karyawan</option>
                {employees.filter(e=> e.is_active!==false).map(e=> <option key={e.id} value={e.id}>{e.name} • {e.employee_code}</option>)}
              </PosSelect></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">JENIS</span>
                <PosSelect size="md" value={leaveForm.type} onChange={v=>setLeaveForm({...leaveForm, type:v})}>
                  {Object.entries(LEAVE_TYPE).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">MULAI *</span>
                <input type="date" value={leaveForm.start_date} onChange={e=>setLeaveForm({...leaveForm, start_date:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">SELESAI *</span>
                <input type="date" value={leaveForm.end_date} onChange={e=>setLeaveForm({...leaveForm, end_date:e.target.value})} className={posInput}/></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ALASAN</span>
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
          <div className="bg-white rounded-[20px] w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">{detail.name||'Karyawan'}</h3>
                <div className="text-xs text-[#64748B] mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{detail.employee_code}</span><span>•</span>
                  <span>{detail.position||'-'}</span><span>•</span>
                  <span>{detail.department||'-'}</span>
                  {detail.branch_name && <><span>•</span><span><Building2 size={11} className="inline"/> {detail.branch_name}</span></>}
                  <PosBadge tone={detail.is_active?'emerald':'slate'}>{detail.is_active?'AKTIF':'NONAKTIF'}</PosBadge>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={5} cols={4}/> : (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Gaji Pokok</div><div className="font-black text-[#0F172A]">{rupiah(detail.basic_salary)}</div></div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Tgl Masuk</div><div className="font-bold">{iso(detail.join_date)||'-'}</div></div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Hadir Bulan Ini</div><div className="font-bold">{detail.hadir_bulan_ini||0} hari</div></div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Kontak</div><div className="font-bold">{detail.phone||'-'}</div></div>
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">PAYROLL TERAKHIR ({(detail.payrolls||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
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
                  <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">ABSENSI TERAKHIR ({(detail.attendance||[]).length})</div>
                  <div className="overflow-auto rounded-xl border border-[#E2E8F0] max-h-[220px]">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
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
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">CUTI &amp; IZIN</div>
                    <div className="space-y-2">
                      {detail.leaves.map(l=>(
                        <div key={l.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 flex items-center justify-between gap-2 text-sm">
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
