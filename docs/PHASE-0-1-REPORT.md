# Laporan Phase 0 & Phase 1 — Hardening Pra-Produksi

> Format §15. Semua angka diambil dari `docs/STATUS.generated.md` (dihasilkan `npm run status:report`).
> Tidak ada klaim "siap produksi" di dokumen ini.

## Ringkasan gerbang (hasil nyata, 30 Okt 2026 20:5x WIB)

| Gerbang | Hasil |
|---|---|
| `npm test` | **LULUS** · 40 pass · 0 fail |
| `npm run audit:data` | **LULUS** · P1 = 0 |
| `npm run recon:gl` | **LULUS** · P1 = 0 · P2 = 3 (GRIR Rp 1,43 jt, kas Rp 300 rb, 2 referensi ganda) |
| `npm run verify:golive` | **LULUS** · 16/21 · 0 FAIL · 5 WARN |
| `npm run verify:golive --profile=production` | **GAGAL** · 5 FAIL (NODE_ENV, ALLOWED_ORIGINS, 6 akun demo, 2 referensi jurnal ganda, 2 GRN tanpa jurnal) |

**Verdict:** `BELUM SIAP (profil produksi)` — sesuai kondisi nyata, bukan opini.

---

## Phase 0 — Baseline & rekonsiliasi dokumen

| ID | Status | Yang berubah | Bukti |
|---|---|---|---|
| P0-1 Baseline snapshot | **COMPLETE AND VERIFIED** | `docs/baseline/2026-10-30/{test,audit-data,recon-gl,verify-golive,verify-golive-prod}.txt`, `backend.log`, `git-status.txt` | keenam file terisi; jumlah test tercatat **40**, bukan 18/26/31/35/41 |
| P0-2 Backup terverifikasi | **COMPLETE AND VERIFIED** | `backups/erp_20261030-205150.dump` (4,1 MB, retensi 14 hari) | output `scripts/backup-db.sh`; restore drill otomatis **belum** (lihat INF-2) |
| P0-3 Doc truth pass | **PARTIAL** | `docs/STATUS.generated.md` + `.json` dibuat lewat `npm run status:report`; `AUDIT-DAN-STATUS.md` menunjuk ke file generated | `npm run status:report` → `verdict: BELUM SIAP (profil produksi)` |

**Catatan P0-3:** tabel status manual di `AUDIT-DAN-STATUS.md` §3 masih ada (sejarah), tetapi status
kini **wajib** dibaca dari `STATUS.generated.md`. Item yang belum dipindahkan ke register: X1, X2/X3,
X4, saldo debit AP, F17 — sudah tercatat di `F16-BACKFILL-REPORT.md` §6 dan akan dipindah pada Phase 2 (DATA-4).

---

## Phase 1 — Infrastruktur & keamanan

| ID | Status | Yang berubah | Bukti | Risiko sisa |
|---|---|---|---|---|
| INF-1 Tutup F18 | **PARTIAL** | `.env.production.example` (NODE_ENV, TRUST_PROXY, ALLOWED_ORIGINS, secret, S3 backup, Sentry, ALLOW_LEDGER_REPAIR); `scripts/disable-demo-accounts.mjs` (dry-run default, menolak bila tak ada direktur/super_admin aktif ber-MFA, `--approved-by` wajib, audit log); `verify:golive --profile=production` menjadikan item keamanan/infra **FAIL** (bukan WARN) | `npm run golive:prod` → 5 FAIL, 16 lulus | Akun demo **belum** dinonaktifkan (butuh akun direktur asli + MFA lebih dulu) |
| INF-2 Backup/PITR | **NOT DONE** | — | — | Belum ada WAL archiving, off-site terenkripsi, atau drill restore otomatis. Butuh keputusan target S3 + GPG key |
| INF-3 Deployment immutable | **NOT DONE** | — | — | Masih bind-mount repo; belum ada `docker-compose.prod.yml`/release runbook |
| INF-4 Network exposure | **NOT DONE** | — | — | Postgres/Redis masih terekspos sesuai compose dev |
| INF-5 Isolasi DB test | **NOT DONE** | — | Temuan nyata: `npm test` dijalankan dua kali dalam <3 menit gagal **16 test** karena rate-limit login in-memory (`429 !== 401`). Perlu `TEST_DATABASE_URL` + limiter khusus test | Test belum aman dijalankan berulang/paralel |
| INF-6 Guard skrip perbaikan | **PARTIAL** | `src/lib/repair-guard.js` + dipasang di `repair-ledger.mjs`, `fix-inventory-data.mjs`, `f16-pos-backfill.mjs`: `--apply` wajib `ALLOW_LEDGER_REPAIR=1` **dan** `--approved-by` | `node scripts/f16-pos-backfill.mjs --apply` → `DITOLAK: set ALLOW_LEDGER_REPAIR=1`; dengan env+approval → jalan (`68 dilewati`, idempoten) | Pemisahan role DB `erp_repair` + trigger `current_user` **belum**; escape hatch masih bisa dipakai role aplikasi |
| INF-7 Session security | **NOT DONE** | — | — | Belum ada revocation list/jti, refresh rotation, rate limit Redis |
| INF-8 Observability | **NOT DONE** | — | `/api/metrics` sudah ada; alert channel belum | Tidak ada notifikasi saat backup/gate gagal |
| INF-9 Upload hardening | **NOT DONE** (belum diaudit) | — | — | Belum diverifikasi MIME sniffing/ukuran/nama acak |
| INF-10 Dependency/CI security | **NOT DONE** | — | — | `npm audit` gate & secret scanning belum ada di CI |

---

## Keputusan & asumsi

1. **Profil produksi** dibuat sebagai flag, bukan file terpisah, agar satu skrip menjadi satu sumber kebenaran gerbang.
2. **Akun demo tidak dinonaktifkan otomatis.** Skrip menolak berjalan tanpa direktur/super_admin aktif ber-MFA — mencegah lockout. Ini butuh tindakan pemilik.
3. **Status dokumen kini dihasilkan mesin.** Tabel manual dianggap tidak otoritatif.
4. **Rate limiter in-memory** ditemukan sebagai penyebab test flaky saat dijalankan berulang; dicatat sebagai bagian INF-5/INF-7, bukan ditambal dengan menaikkan limit.

## Pertanyaan Stop-and-Ask (menunggu pemilik)

1. **DATA-1 — keputusan cutover:** (A) database produksi bersih dengan saldo awal dari stock opname + AR/AP/kas terkonfirmasi, data sekarang diarsipkan read-only; atau (B) pertahankan data sekarang (hanya jika semua transaksi nyata, perlu sign-off + hapus record uji). **Semua pekerjaan Phase 2 bergantung pada ini.**
2. **X1:** 3 jurnal shift (Rp 494.300) tanpa invoice — dibalik atau terbitkan invoice susulan?
3. **X4:** kas Rp 300.000 — sumbernya kas awal tunai? Bila ya, posting jurnal saldo awal.
4. **Target backup off-site** (endpoint S3/bucket/GPG recipient) untuk INF-2.
5. **Nilai legal** (PPN/TER/BPJS/toleransi SNI) untuk Phase 4 — harus dikonfirmasi konsultan pajak/HR.

## Tindakan pemilik yang diperlukan sebelum lanjut

- Aktifkan MFA pada akun direktur asli → jalankan `npm run demo:off -- --apply --approved-by="<nama>"`.
- Isi `.env.production.example` → `.env.production` di server (domain asli, secret ≥32 char).
- Putuskan DATA-1.
