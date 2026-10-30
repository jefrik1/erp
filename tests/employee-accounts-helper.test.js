import test from 'node:test';
import assert from 'node:assert/strict';
import { usernameFrom, generatePassword, normalizeRole } from '../src/modules/hr/employeeAccounts.js';

test('username is derived from the name and stays unique-looking',()=>{
  assert.equal(usernameFrom('Budi Santoso','EMP-102'),'budi.santoso');
  assert.equal(usernameFrom('Siti Rahma','EMP-101'),'siti.rahma');
  assert.match(usernameFrom('  ', 'EMP 9/1'), /^emp\.?9\.?1$/);
});
test('generated passwords are long, mixed and never repeat',()=>{
  const a=generatePassword(), b=generatePassword();
  assert.equal(a.length>=14,true);
  assert.match(a,/[A-Z]/); assert.match(a,/[a-z]/); assert.match(a,/[0-9]/);
  assert.notEqual(a,b);
});
test('unknown job roles collapse to the self-service role',()=>{
  assert.equal(normalizeRole('direktur'),'direktur');
  assert.equal(normalizeRole('root'),'employee');
  assert.equal(normalizeRole(null),'employee');
});
