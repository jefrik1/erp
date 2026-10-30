# Checklist Produksi — ERP Sumber Material Jaya

Dokumen ini memisahkan **apa yang sudah ada**, **apa yang wajib sebelum go-live (P0)**,
dan **apa yang menyusul (P1/P2)**. Update setiap kali ada perubahan arsitektur.

> Peta lengkap semua fitur (modul, halaman, endpoint, alur bisnis, RBAC, konvensi kode):
> **[`docs/FITUR-LENGKAP.md`](./FITUR-LENGKAP.md)**

---

## Status kesiapan (ringkas)

| Area | Status | Catatan |
|---|---|---|
| Modul bisnis (sales, POS, gudang, pembelian, keuangan, HR, proyek) | ✅ Siap | Sudah diuji end-to-end dengan data nyata |
| Akuntansi (jurnal, trial balance, pajak, payroll, penyusutan) | ✅ Siap | Semua aksi keuangan double-entry; TB seimbang |
| RBAC (menu + route + API) | ✅ Siap | Satu sumber `src/config/access.js` |
| Audit trail | ✅ Siap | Middleware mencatat semua mutasi sukses |
| Guidebook | ✅ Siap | `/panduan`, publik, bisa dicetak |
| Rate limit & lockout login | ✅ Siap | In-memory (lihat catatan scaling) |
| Health check | ✅ Siap | `/api/health` mengecek DB (503 bila DB mati) |
| Graceful shutdown | ✅ Siap | SIGTERM/SIGINT menutup HTTP + pool |
| Backup database | ✅ Siap | Skrip + service `backup` di compose (pg_dump harian, retensi 14 hari) |
| TLS/HTTPS | ❌ Belum | nginx masih :80; butuh sertifikat |
| Monitoring & alerting | ⚠️ Sebagian | `/api/metrics` + health check ada; error tracking belum |
| CI/CD | ✅ Siap | `.github/workflows/ci.yml` (build + 18 smoke test API) |
| Automated test | ✅ Siap | `tests/api-smoke.test.js` (18 test: auth, RBAC, scope, modul baru) |
| Redis | ✅ Siap (opsional) | `src/lib/redis.js` pakai ioredis; aktif bila `REDIS_URL` diisi |
| Tutup buku (period lock) | ✅ Siap | `/finance/periods`, `assertPeriodOpen` di semua posting |
| Rekonsiliasi bank | ✅ Siap | `/finance/recon` (impor mutasi, auto-match, manual match) |
| Reorder otomatis | ✅ Siap | `POST /inventory/reorder/run` + tombol di Stok per Gudang |
| Valuasi stok & margin | ✅ Siap | `/reports/inventory` (2 tab + export CSV) |
| Approval matrix | ✅ Siap | `/approval-rules`; dipakai SO (diskon %) & PO (nilai) |
| Struk thermal | ✅ Siap | `/pos/receipt/:id` (80mm, `@page` 80mm) |
| PWA | ✅ Siap | `manifest.webmanifest` + `sw.js` + `offline.html` (aktif di build produksi) |
| Antrian notifikasi | ✅ Siap | `src/lib/outbox-worker.js` (kirim otomatis tiap 60 detik) |

---

## P0 — Wajib sebelum dipakai produksi

1. **Ganti semua secret** (`JWT_SECRET`, `JWT_REFRESH_SECRET`, password DB) dengan nilai acak ≥32 char.
   Backend sudah menolak boot bila `NODE_ENV=production` dan secret masih default.
   ```bash
   openssl rand -hex 32
   ```
2. **Pasang TLS** (nginx + certbot / Cloudflare / load balancer). Arahkan `ALLOWED_ORIGINS` ke domain HTTPS.
3. **Backup otomatis + uji restore**
   ```bash
   ./scripts/backup-db.sh                 # manual
   0 1 * * * cd /path/erptest && ./scripts/backup-db.sh >> backups/backup.log 2>&1
   ```
   Uji `scripts/restore-db.sh` minimal sekali sebelum go-live, simpan salinan backup di mesin/cloud berbeda.
4. **Monitoring**: uptime check ke `/api/health` (harus 200) + alert bila 503/5xx, dan error tracking (Sentry/Logtail).
5. **Hapus akun demo** (`admin/admin123`, `kasir123`, dst.) atau ganti password-nya. Blok `seed pw` untuk produksi.
6. **Set `NODE_ENV=production`**, `TRUST_PROXY=1`, `ALLOWED_ORIGINS=https://erp.domain-anda.com`.
7. **Aktifkan gateway notifikasi** bila WA/Email dipakai: `WA_GATEWAY_URL`, `SMTP_URL` (+ token). Tanpa itu
   Pusat Notifikasi berjalan **mode console** (pesan dicatat, tidak terkirim).
8. **Uji beban dasar**: 50–100 request/detik pada endpoint POS & dashboard; pastikan pool DB cukup
   (`PGPOOL_MAX`), dan rate limit tidak mengganggu kasir.

## P1 — Segera setelah stabil (1–2 bulan)

1. ✅ **Tutup buku / period lock** — `/finance/periods` + `assertPeriodOpen()` di `postJournal`; buka kembali hanya direktur/super admin (audit).
2. ✅ **Rekonsiliasi bank** — `/finance/recon`: impor mutasi, auto-match nominal ±5 hari, cocokkan manual, abaikan biaya admin.
3. ✅ **Reorder otomatis** — `POST /inventory/reorder/run` membuat PR untuk produk ≤ reorder point (lewati yang sudah punya PR terbuka).
4. ✅ **Laporan valuasi stok & margin** — `/reports/inventory` (valuasi per gudang + margin per produk, export CSV).
5. ⚠️ **Offline POS** — backend sudah menerima `offline:true`; antrian IndexedDB di browser belum dibuat (P2).
6. ✅ **PWA + cetak thermal** — `manifest.webmanifest`, `sw.js`, `offline.html`, struk 80mm `/pos/receipt/:id`. Scanner barcode belum (input manual/SKU).
7. ✅ **Approval matrix** — `/approval-rules`; SO diskon % dan PO nilai memakai ambang dari DB (bukan hardcode).
8. ✅ **Test otomatis** — 18 smoke test API (`npm run test:api`).
9. ✅ **CI** — `.github/workflows/ci.yml`: postgres service → `npm ci` → `npm run build` → start API → smoke test.

## P2 — Skala & kematangan (3–6 bulan)

1. **Redis aktif** untuk cache dashboard, rate-limit lintas instance, dan antrian notifikasi
   (perbaiki impor `redis` → `ioredis`, atau ganti dependency).
2. **Job queue** untuk kirim pesan, generate laporan besar, dan sinkronisasi eksternal.
3. **Read replica / connection pooling (PgBouncer)** bila pengguna bertambah.
4. **Partisi tabel** `stock_movements`, `audit_logs`, `payments` bila > 5 juta baris.
5. **Multi-outlet/multi-company** yang eksplisit (sekarang `branch_id` baru sebagian dipakai).
6. **SSO / MFA** untuk admin & finance.
7. **e-Faktur langsung ke DJP** (API) alih-alih ekspor CSV.
8. **Portal pelanggan** (riwayat order, unduh invoice) di atas link lacak yang sudah ada.

---

## Catatan teknis penting (jangan diubah tanpa paham)

- **WIB**: tanggal bisnis = WIB (UTC+7). `src/config/db.js` mengembalikan `timestamp`/`date` sebagai
  string apa adanya — jangan dihapus, kalau tidak jam bergeser −7 jam.
- **Jurnal**: semua aksi keuangan memakai `src/lib/journal.js` (`postJournal`) yang menolak jurnal tidak balance.
- **Stok**: `qty_available` adalah kolom GENERATED; update hanya `qty_on_hand`.
- **POS**: stok dipotong saat checkout; DO dari order POS tidak memotong lagi.
- **Rate limit in-memory**: aman untuk 1 instance. Kalau scale >1, pindahkan ke Redis.
- **Port 4000**: pastikan tidak ada `node src/index.js` lokal yang menabrak container.

## Variabel environment penting

| Variabel | Fungsi | Default |
|---|---|---|
| `NODE_ENV` | mode produksi (secret guard, log combined) | `development` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | tanda tangan token | **wajib diganti** |
| `ALLOWED_ORIGINS` | whitelist CORS | localhost:5173/5174 |
| `TRUST_PROXY` | ambil IP asli dari X-Forwarded-For | `1` |
| `RATE_LIMIT_PER_MIN` | batas request per IP | `600` |
| `LOGIN_MAX_FAILS` / `LOGIN_LOCK_MINUTES` | lockout login | `5` / `15` |
| `WA_GATEWAY_URL` / `SMTP_URL` | pengiriman notifikasi nyata | kosong (console) |

---

## Update terakhir (hardening lanjutan)

| Item | Status | Bukti / catatan |
|---|---|---|
| HTTPS | ✅ Siap | `nginx.conf` server 443 (TLS1.2/1.3, HSTS), compose `5443:443`, `scripts/gen-self-signed-cert.sh`. Uji: `curl -k https://localhost:5443/healthz` → 200 |
| Secret kuat | ✅ Siap | `.env` JWT_SECRET/JWT_REFRESH_SECRET 64 char; backend menolak boot bila default & `NODE_ENV=production` |
| Error tracking | ✅ Siap | `src/lib/error-log.js` (file + DB `error_logs`, fingerprint, resolve) + `src/middleware/error-capture.js` + halaman `/errors` |
| Uptime alert | ✅ Siap | `scripts/uptime-monitor.sh` (3 percobaan, webhook `ERROR_WEBHOOK_URL`) |
| Uji beban | ✅ Lulus | `scripts/load-test.mjs`: 20 worker/15 s → **257,7 rps, p50 74 ms, p95 148 ms, p99 216 ms, 0 error** (rate limit dinaikkan khusus uji) |
| MFA (TOTP) | ✅ Siap | `src/lib/totp.js` + `/api/auth/mfa/*`; login 2 langkah, 8 kode cadangan, audit `LOGIN_MFA` |
| Offline POS | ✅ Siap | `src/lib/offline-queue.js` (IndexedDB) + banner antrian di POS + idempotensi `client_ref` (kirim ulang tidak membuat invoice ganda) |
| Bug diperbaiki | ✅ | `products.name_id` tidak ada (POS lookup, steel, manager report → 500), Redis client dipakai sebelum siap, error 5xx dari route kini tercatat |

### Masih terbuka
- **Hutang Usaha bersaldo debit Rp 1,13 M**: pembayaran PO/PINV dijurnal, penerimaan barang historis tidak. Perlu jurnal koreksi (Dr Modal / Cr Hutang Usaha) atau backdate jurnal GRN.
- **Kas di GL (Rp 1,26 M) vs master bank (Rp 1,17 M)**: penerimaan AR belum menambah `bank_accounts`/`cash_movements`.
- **Pendapatan POS non-tunai** belum masuk GL (hanya sisi tunai saat tutup shift).
- **Penjualan di bawah HPP**: `BJR-C75` Rp 65.000 vs HPP Rp 82.551 (−21,3%) — keputusan harga.
- **PgBouncer / partisi tabel**: belum dipasang (butuh perubahan koneksi & migrasi data besar).
- **Multi-outlet** (satu instalasi banyak cabang dengan stok terpisah) dan **portal pelanggan**: belum dibangun — perlu desain skema & keputusan bisnis.
- **Sentry**: opsional; saat ini memakai error-log internal + webhook.

> Status data persediaan & buku besar (apa yang sudah dibereskan, apa yang tersisa) ada di
> [`docs/FITUR-LENGKAP.md`](./FITUR-LENGKAP.md) §8. Alat kerjanya: `npm run audit:data`,
> `npm run fix:data`, `npm run repair:ledger`.

> Status terkini: lihat `docs/STATUS.generated.md` (dihasilkan `npm run status:report`).
