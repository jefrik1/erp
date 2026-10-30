// Explicit job mapping; unknown jobs receive self-service only, never administrator access.
export const POSITION_ROLES = {
  direktur:'direktur', 'manager keuangan':'finance', finance:'finance',
  'sales manager':'sales', sales:'sales', 'manager gudang':'warehouse', warehouse:'warehouse',
  'hr manager':'hrd', 'hrd staff':'hrd', hrd:'hrd', purchasing:'purchasing',
  'auditor internal':'auditor', auditor:'auditor', driver:'driver', supir:'driver',
  kasir:'POS_CASHIER', cashier:'POS_CASHIER', 'pos supervisor':'POS_SUPERVISOR',
  'pos manager':'POS_MANAGER', 'project manager':'project_manager', 'site engineer':'site_engineer',
  'sales trading':'sales_trading', 'buyer admin':'buyer_admin'
};
export function roleForPosition(position){return POSITION_ROLES[String(position||'').trim().toLowerCase()] || 'employee';}

// Pilihan role yang boleh diberikan lewat UI HR (admin tidak pernah dari sini).
export const ASSIGNABLE_ROLES = [
  'employee','driver','hrd','finance','sales','warehouse','purchasing','auditor',
  'sales_trading','project_manager','site_engineer','buyer_admin',
  'POS_CASHIER','POS_SUPERVISOR','POS_MANAGER',
];

// Label jabatan untuk datalist form karyawan — diambil dari peta yang sama,
// supaya ejaan jabatan tidak pernah lepas dari role-nya.
const titleCase = (s)=> s.replace(/\b[a-z]/g, m=>m.toUpperCase());
export const POSITION_OPTIONS = Object.keys(POSITION_ROLES).map(titleCase);
