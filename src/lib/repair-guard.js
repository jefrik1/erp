/**
 * INF-6 — Pengaman skrip perbaikan data/ledger.
 * Wajib: ALLOW_LEDGER_REPAIR=1 dan --approved-by=<nama> saat mode --apply.
 * Dry-run tetap bebas agar aman dijalankan siapa pun yang berwenang membaca.
 */
export function assertRepairAllowed(scriptName) {
  const apply = process.argv.includes('--apply');
  if (!apply) return { apply: false };
  const approved = (process.argv.find((a) => a.startsWith('--approved-by=')) || '').split('=')[1] || '';
  if (process.env.ALLOW_LEDGER_REPAIR !== '1') {
    console.error(`[${scriptName}] DITOLAK: set ALLOW_LEDGER_REPAIR=1 untuk mode --apply.`);
    process.exit(2);
  }
  if (approved.trim().length < 3) {
    console.error(`[${scriptName}] DITOLAK: --approved-by="<nama penyetuju>" wajib untuk mode --apply.`);
    process.exit(2);
  }
  console.log(`[${scriptName}] mode --apply disetujui oleh: ${approved}`);
  return { apply: true, approvedBy: approved };
}
