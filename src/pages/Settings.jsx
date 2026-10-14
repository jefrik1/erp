
import { useEffect, useState } from 'react';
import api from '../lib/api';
export default function Settings(){
  const [users,setUsers]=useState([]); const [roles,setRoles]=useState([]);
  useEffect(()=>{ api.get('/auth/users').then(r=>setUsers(r.data)); api.get('/auth/roles').then(r=>setRoles(r.data)); },[]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">Master Data & Administration</h1>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border overflow-hidden"><div className="p-4 font-bold border-b">User & Role (RBAC)</div><table className="w-full text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-2 text-left">USER</th><th className="px-4 py-3.5">ROLE</th><th className="px-4 py-3.5">CABANG</th></tr></thead><tbody>{users.map(u=>(
          <tr key={u.id} className="border-t"><td className="px-4 py-3.5"><div className="font-semibold">{u.username}</div><div className="text-xs text-gray-500">{u.email}</div></td><td className="p-2 text-center"><span className="text-xs px-2 py-1 rounded-full bg-[#1E40AF] text-white">{u.roles?.filter(Boolean).join(', ')}</span></td><td className="p-2 text-center text-xs">{u.branch_name}</td></tr>
        ))}</tbody></table></div>
        <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">Approval Workflow Engine</h3><div className="mt-3 space-y-2 text-sm">
          <div className="p-3 border rounded-xl bg-gray-50"><b>SO Diskon 5-10%</b> → Sales Manager</div>
          <div className="p-3 border rounded-xl bg-gray-50"><b>SO Diskon &gt;10%</b> → Sales Manager + Direktur</div>
          <div className="p-3 border rounded-xl bg-gray-50"><b>PO &lt;10jt</b> → Supervisor • <b>10-50jt</b> → Manager • <b>&gt;50jt</b> → Direktur</div>
          <div className="p-3 border rounded-xl bg-gray-50"><b>Stock Adjustment &gt;1jt</b> → Manager Gudang + Finance</div>
          <div className="p-3 border rounded-xl bg-gray-50"><b>Payment &gt;100jt</b> → Direktur</div>
          <div className="text-xs text-gray-500 mt-2">Configurable • Audit trail • Multi-cabang & Multi-company</div>
        </div></div>
      </div>
      <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold">System Settings</h3><div className="grid lg:grid-cols-3 gap-3 mt-3 text-sm">
        <div className="p-3 border rounded-xl"><div className="font-bold">Pajak</div><div className="text-xs text-gray-500">PPN 11% • PPh 21/23 • e-Faktur opsional</div></div>
        <div className="p-3 border rounded-xl"><div className="font-bold">Mata Uang</div><div className="text-xs text-gray-500">IDR, USD • Multi-currency</div></div>
        <div className="p-3 border rounded-xl"><div className="font-bold">Notifikasi</div><div className="text-xs text-gray-500">WA Business API • Email • SMS</div></div>
      </div></div>
    </div>
  )
}
