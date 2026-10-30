import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PAGE_ACCESS, MODULE_ROLES } from '../src/config/access.js';

const src = fs.readFileSync(new URL('../src/modules/hr/routes.js', import.meta.url),'utf8');
const routes = [...src.matchAll(/router\.(get|post|put|delete)\('([^']+)'(?:,\s*([^,)]*))?/g)]
  .map(m=>({ method:m[1], path:m[2], guard:(m[3]||'').trim() }));

// Endpoint self-service yang memang boleh diakses semua user login (di-scope ke employee_id sendiri).
const SELF_SERVICE = new Set([
  '/attendance/checkin','/attendance/checkout','/attendance/mine','/me',
  '/leaves/mine','/leaves/attachment','/leaves/:id/attachment','/leaves/quota',
  '/leaves/request','/leaves/:id/cancel',
]);

test('setiap route HR diklasifikasi: guard rbac atau self-service',()=>{
  const unguarded = routes.filter(r=>!r.guard.startsWith('rbac(')).map(r=>r.path);
  for(const p of unguarded) assert.ok(SELF_SERVICE.has(p), 'route tanpa guard di luar allowlist: '+p);
});

test('role pada guard HR konsisten dengan PAGE_ACCESS.hr',()=>{
  const hrPage = PAGE_ACCESS.hr.map(r=>r.toLowerCase());
  for(const r of routes.filter(x=>x.guard.startsWith('rbac('))){
    const roles = [...r.guard.matchAll(/'([^']+)'/g)].map(m=>m[1].toLowerCase());
    assert.ok(roles.length>0, 'rbac kosong di '+r.path);
    for(const role of roles) assert.ok(hrPage.includes(role), role+' di '+r.path+' tidak ada di PAGE_ACCESS.hr');
  }
});

test('role self-service tidak mendapat menu HR maupun modul bisnis',()=>{
  assert.equal(PAGE_ACCESS.hr.includes('employee'), false);
  assert.equal(PAGE_ACCESS.settings.includes('employee'), false);
  for(const [mod, roles] of Object.entries(MODULE_ROLES)){
    assert.equal(roles.map(r=>r.toLowerCase()).includes('employee'), false, mod+' membocorkan akses ke role employee');
  }
  assert.equal(PAGE_ACCESS.myProfile, null);
  assert.equal(PAGE_ACCESS.myAttendance, null);
});
