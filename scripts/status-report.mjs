#!/usr/bin/env node
/**
 * npm run status:report — menghasilkan docs/STATUS.generated.md dari hasil nyata:
 * verify:golive, recon:gl, audit:data, npm test, dan info lingkungan.
 * Tabel status TIDAK boleh ditulis tangan lagi; jalankan skrip ini.
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT_MD = path.join(ROOT, 'docs', 'STATUS.generated.md');
const OUT_JSON = path.join(ROOT, 'docs', 'STATUS.generated.json');

function run(cmd, args, timeout = 240000) {
  const t0 = Date.now();
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, code: 0, out: out.trim(), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}`.trim(), ms: Date.now() - t0 };
  }
}

const checks = {
  test: (() => {
    const t0 = Date.now();
    try { return { ok: true, code: 0, out: String(execSync('npm test', { encoding: 'utf8', timeout: 420000 })).trim(), ms: Date.now() - t0 }; }
    catch (e) { return { ok: false, code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}`.trim(), ms: Date.now() - t0 }; }
  })(),
  audit: run(process.execPath, ['scripts/audit-inventory-data.mjs', '--json']),
  recon: run(process.execPath, ['scripts/reconcile-gl-inventory.mjs', '--json']),
  golive: run(process.execPath, ['scripts/production-cutover-check.mjs', '--json']),
  goliveProd: run(process.execPath, ['scripts/production-cutover-check.mjs', '--json', '--profile=production']),
};

const parse = (r) => { try { return JSON.parse(r.out); } catch { return null; } };
const testCount = (out) => {
  const p = /(?:ℹ|#)\s*pass\s+(\d+)/.exec(out || '');
  const f = /(?:ℹ|#)\s*fail\s+(\d+)/.exec(out || '');
  return { pass: p ? Number(p[1]) : null, fail: f ? Number(f[1]) : null };
};
const tc = testCount(checks.test.out);
const audit = parse(checks.audit);
const recon = parse(checks.recon);
const gl = parse(checks.golive);
const glp = parse(checks.goliveProd);

let p1Audit = null;
if (audit) {
  const list = audit.findings || audit.issues || audit.checks || [];
  if (Array.isArray(list) && list.length) {
    p1Audit = list.filter((f) => String(f.severity || f.priority || f.level || '').toUpperCase() === 'P1'
      && (Number(f.count ?? 1) > 0 || Number(f.value ?? 0) !== 0)).length;
  }
}
if (p1Audit === null) {
  const m = /P1[^0-9]{0,12}(\d+)/i.exec(checks.audit.out || '');
  if (m) p1Audit = Number(m[1]);
}
const reconChecks = recon?.checks || [];
const reconP1 = reconChecks.filter((c) => c.status === 'P1');
const reconP2 = reconChecks.filter((c) => c.status === 'P2');
const glFail = (gl?.results || []).filter((r) => !r.ok && r.critical);
const glWarn = (gl?.results || []).filter((r) => !r.ok && !r.critical);
const glpFail = (glp?.results || []).filter((r) => !r.ok && r.critical);
const glpWarn = (glp?.results || []).filter((r) => !r.ok && !r.critical);

const verdict = glpFail.length === 0 ? 'SIAP (profil produksi)' : 'BELUM SIAP (profil produksi)';
const lines = [
  '# STATUS.generated.md',
  '',
  '> **Dihasilkan otomatis** oleh `npm run status:report` — jangan diedit tangan.',
  `> Waktu: ${new Date(Date.now() + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 19)} WIB · commit: \`${run('git', ['rev-parse', '--short', 'HEAD']).out || '-'}\``,
  '',
  '## Ringkasan gerbang',
  '',
  '| Gerbang | Hasil |',
  '|---|---|',
  `| \`npm test\` | ${checks.test.ok ? 'LULUS' : 'GAGAL'} · pass ${tc.pass ?? '?'} · fail ${tc.fail ?? '?'} (${checks.test.ms} ms) |`,
  `| \`npm run audit:data\` | ${checks.audit.ok ? 'LULUS' : 'GAGAL'} · P1 = ${p1Audit ?? '?'} |`,
  `| \`npm run recon:gl\` | ${checks.recon.ok ? 'LULUS' : 'ADA P1'} · P1 ${reconP1.length} · P2 ${reconP2.length} |`,
  `| \`npm run verify:golive\` | ${glFail.length === 0 ? 'LULUS' : 'GAGAL'} · ${(gl?.results || []).length - glFail.length - glWarn.length}/${(gl?.results || []).length} lulus · ${glFail.length} FAIL · ${glWarn.length} WARN |`,
  `| \`verify:golive --profile=production\` | ${glpFail.length === 0 ? 'LULUS' : 'GAGAL'} · ${glpFail.length} FAIL · ${glpWarn.length} WARN |`,
  '',
  `**Verdict go-live:** ${verdict}`,
  '',
  '## Rekonsiliasi keuangan',
  '',
  '| Cek | Status | GL | Subledger | Selisih |',
  '|---|---|---:|---:|---:|',
  ...reconChecks.map((c) => `| ${c.label} | ${c.status} | ${Number(c.gl || 0).toLocaleString('id-ID')} | ${Number(c.subledger || 0).toLocaleString('id-ID')} | ${Number(c.difference || 0).toLocaleString('id-ID')} |`),
  '',
  '## Item yang belum lulus',
  '',
  ...(glpFail.length || glpWarn.length
    ? [...glpFail.map((r) => `- **FAIL (produksi)** ${r.label} — ${r.detail || ''}`), ...glpWarn.map((r) => `- WARN ${r.label} — ${r.detail || ''}`)]
    : ['- Tidak ada.']),
  '',
  '## Rekonsiliasi P2 terbuka',
  '',
  ...(reconP2.length ? reconP2.map((c) => `- ${c.label} — selisih ${Number(c.difference || 0).toLocaleString('id-ID')}${c.note ? ` (${c.note})` : ''}`) : ['- Tidak ada.']),
  '',
  '## Cara mereproduksi',
  '',
  '```bash',
  'npm run status:report',
  '```',
  '',
];

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, lines.join('\n'), 'utf8');
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generated_at: new Date().toISOString(),
  commit: run('git', ['rev-parse', '--short', 'HEAD']).out,
  tests: { ...tc, ok: checks.test.ok },
  audit: { ok: checks.audit.ok, p1: p1Audit },
  recon: { ok: checks.recon.ok, p1: reconP1.length, p2: reconP2.length, checks: reconChecks.map((c) => ({ key: c.key, status: c.status, gl: c.gl, subledger: c.subledger })) },
  golive: { ok: glFail.length === 0, fail: glFail.map((r) => r.label), warn: glWarn.map((r) => r.label) },
  golive_production: { ok: glpFail.length === 0, fail: glpFail.map((r) => r.label), warn: glpWarn.map((r) => r.label) },
  verdict,
}, null, 2), 'utf8');

console.log(`STATUS.generated.md ditulis · verdict: ${verdict}`);
console.log(`  test ${tc.pass}/${tc.fail} fail · audit P1 ${p1Audit} · recon P1 ${reconP1.length} P2 ${reconP2.length} · golive FAIL ${glFail.length} · produksi FAIL ${glpFail.length}`);
process.exitCode = glpFail.length === 0 && (tc.fail === 0) ? 0 : 1;
