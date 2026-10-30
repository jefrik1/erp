import test from 'node:test';
import assert from 'node:assert/strict';
import { roleForPosition } from '../src/config/employeeRoles.js';
import { canAccess, PAGE_ACCESS } from '../src/config/access.js';
test('positions map explicitly without granting unknown jobs admin',()=>{assert.equal(roleForPosition('Supir'),'driver');assert.equal(roleForPosition('Kasir'),'POS_CASHIER');assert.equal(roleForPosition('HR Manager'),'hrd');assert.equal(roleForPosition('unknown'),'employee');});
test('roleless users cannot open protected pages',()=>assert.equal(canAccess([],PAGE_ACCESS.settings),false));
