// Sumber tunggal akses per role. Dipakai frontend (sidebar + route guard) DAN backend (rbac mount).
// Jangan duplikat daftar role di tempat lain.
// Role di DB (lowercase): direktur, super_admin, finance, sales, warehouse, purchasing, hrd,
// auditor, sales_trading, project_manager, site_engineer, buyer_admin, POS_CASHIER,
// POS_SUPERVISOR, POS_MANAGER, driver.
export const R_ALL = ['direktur','super_admin'];
export const R_POS = ['POS_CASHIER','POS_SUPERVISOR','POS_MANAGER'];

export const PAGE_ACCESS = {
  dashboard:    [...R_ALL,'finance','sales','warehouse','purchasing','hrd','auditor','sales_trading','project_manager','site_engineer','buyer_admin'],
  salesOrders:  [...R_ALL,'sales','sales_trading','finance'],
  invoices:     [...R_ALL,'sales','sales_trading','finance'],
  pos:          [...R_ALL,'sales','sales_trading',...R_POS],
  purchase:     [...R_ALL,'purchasing','warehouse','buyer_admin','finance'],
  inventory:    [...R_ALL,'warehouse','purchasing'],
  finance:      [...R_ALL,'finance','auditor'],
  logistics:    [...R_ALL,'warehouse'],
  hr:           [...R_ALL,'hrd'],
  crm:          [...R_ALL,'sales','sales_trading'],
  reports:      [...R_ALL,'finance','auditor'],
  settings:     [...R_ALL],
  projects:     [...R_ALL,'sales','project_manager','site_engineer'],
  consignments: [...R_ALL,'warehouse','sales'],
  pricing:      [...R_ALL,'sales','sales_trading'],
  returns:      [...R_ALL,'sales','finance','warehouse'],
  landedCosts:  [...R_ALL,'purchasing','warehouse','finance'],
  fleet:        [...R_ALL,'warehouse'],
  waste:        [...R_ALL,'warehouse'],
  budgets:      [...R_ALL,'finance'],
  loyalty:      [...R_ALL,'sales','sales_trading'],
  assets:       [...R_ALL,'finance'],
  calculator:   [...R_ALL,'sales','sales_trading'],
  approvals:    [...R_ALL,'finance','sales','warehouse','purchasing','hrd','project_manager','sales_trading'],
  audit:        [...R_ALL,'auditor'],
  masterProducts:  [...R_ALL,'warehouse','purchasing'],
  masterCustomers: [...R_ALL,'sales','sales_trading','finance'],
  masterSuppliers: [...R_ALL,'purchasing','warehouse','finance'],
  myLeave:      null, // semua role yang login
  myAttendance: null, // semua role yang login
  myProfile:    null, // semua role yang login
  announcements:null, // semua role yang login (kelola: HRD/admin, dicek di halaman)
  driverTrips:  ['driver',...R_ALL],
};

// Role yang boleh mengakses modul API (mount-level rbac di src/index.js).
export const MODULE_ROLES = {
  finance:      [...R_ALL,'finance','auditor'],
  reporting:    [...R_ALL,'finance','auditor'],
  audit:        [...R_ALL,'auditor'],
  budget:       [...R_ALL,'finance'],
  assets:       [...R_ALL,'finance'],
  credit:       [...R_ALL,'finance'],
  purchase:     [...R_ALL,'purchasing','warehouse','buyer_admin','finance'],
  landedcost:   [...R_ALL,'purchasing','warehouse','finance'],
  consignment:  [...R_ALL,'warehouse','sales'],
  waste:        [...R_ALL,'warehouse'],
  projects:     [...R_ALL,'sales','project_manager','site_engineer'],
  pricing:      [...R_ALL,'sales','sales_trading'],
  loyalty:      [...R_ALL,'sales','sales_trading'],
  returns:      [...R_ALL,'sales','finance','warehouse'],
  inventory:    [...R_ALL,'warehouse','purchasing'],
  sales:        [...R_ALL,'sales','sales_trading','finance','warehouse',...R_POS],
  logistics:    [...R_ALL,'warehouse','finance'],
  crm:          [...R_ALL,'sales','sales_trading'],
};

const norm = (roles)=> (roles||[]).map(r=>String(r).toLowerCase());
export function canAccess(roles, allowed){
  if(!allowed || !allowed.length) return true;       // null = semua boleh
  const r = norm(roles);
  if(r.length===0) return true;                      // user tanpa role: jangan lockout
  const allow = norm(allowed);
  return r.some(x=>allow.includes(x));
}
export function homeFor(roles){
  const r = norm(roles);
  if(r.includes('driver') && !r.some(x=>['direktur','super_admin','warehouse'].includes(x))) return '/driver';
  if(r.some(x=>['direktur','super_admin','finance','sales','warehouse','purchasing','hrd','auditor','sales_trading','project_manager','site_engineer','buyer_admin'].includes(x))) return '/';
  if(r.some(x=>['pos_cashier','pos_supervisor','pos_manager'].includes(x))) return '/sales/pos';
  return '/';
}
