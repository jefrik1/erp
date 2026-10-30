# Dokumentasi Fitur — ERP Sumber Material Jaya (`E:\erptest`)

> Dokumen ini merangkum **semua fitur yang sudah ada di kode** (bukan rencana), dipakai sebagai
> peta kerja untuk pengembangan lanjutan. Disusun dari kode sumber: `src/modules/*`, `src/pages/*`,
> `src/config/access.js`, `migrations/*`, `scripts/*`.
>
> Terakhir diperbarui: **30 Oktober 2026** · Versi aplikasi: `1.0.0` (`APP_VERSION`)

---

## Daftar isi

1. [Ringkasan sistem](#1-ringkasan-sistem)
2. [Peta cepat modul → halaman → API](#2-peta-cepat-modul--halaman--api)
3. [Detail per modul](#3-detail-per-modul)
4. [Alur bisnis inti](#4-alur-bisnis-inti)
5. [RBAC (hak akses)](#5-rbac-hak-akses)
6. [Library & mekanisme lintas modul](#6-library--mekanisme-lintas-modul)
7. [Operasional (Docker, skrip, env)](#7-operasional-docker-skrip-env)
8. [Kualitas data persediaan](#8-kualitas-data-persediaan)
9. [Status & backlog pengembangan](#9-status--backlog-pengembangan)
10. [Konvensi kode (aturan keras)](#10-konvensi-kode-aturan-keras)
11. [Lampiran: tabel database](#11-lampiran-tabel-database)

---

## 1. Ringkasan sistem

| Aspek | Isi |
|---|---|
| Nama paket | `erp-material` v1.0.0 |
| Backend | Node.js + Express 4, ES Modules, PostgreSQL (`pg`), Redis opsional (`ioredis`) |
| Frontend | React 18 + Vite, Tailwind, React Router, Zustand (`src/store/auth.js`), `motion`, `leaflet` (peta), `lucide-react` |
| Entry backend | `src/index.js` (port **4000**) |
| Entry frontend | `src/main.jsx` → `src/App.jsx` (Vite dev :5173, build produksi disajikan nginx :5174 & :5443) |
| Database | PostgreSQL 16, database `erp_db`, user `erp` (port host **5434**) |
| Cache/queue opsional | Redis 7 (port host **6380**) |
| Deploy | `docker-compose.yml`: `erp_backend`, `erp_frontend`, `erp_postgres`, `erp_redis`, `backup` |
| Auth | JWT (`Authorization: Bearer`), payload `{id, username, roles}`; MFA TOTP opsional |
| Zona waktu bisnis | **WIB (UTC+7)** — tanggal/jam disimpan sebagai *wall-clock* tanpa zona |

### Struktur folder

```
src/
  index.js              # bootstrap: middleware global, mount semua modul, migrasi, graceful shutdown
  config/
    db.js               # pool pg + parser tanggal (WAJIB: string, bukan Date)
    access.js           # SATU sumber RBAC: PAGE_ACCESS (frontend) + MODULE_ROLES (backend)
  middleware/
    auth.js             # auth (JWT) + rbac(...roles)
    security.js         # rate limit, lockout login, aturan password
    error-capture.js    # rekam error 5xx ke error_logs
  lib/
    journal.js          # postJournal (double-entry), ensureCoa, withTx, assertPeriodOpen
    exporters.js        # ekspor CSV / XLSX / PDF (judul, subjudul, baris TOTAL)
    error-log.js        # fingerprint error, resolve, statistik
    totp.js             # MFA TOTP + kode cadangan
    message-provider.js # WA/SMS/Email (console bila gateway kosong)
    outbox-worker.js    # worker notifikasi tiap 60 detik
    offline-queue.js    # antrian POS IndexedDB (frontend)
    redis.js            # client Redis opsional
  modules/<modul>/      # 33 modul backend (routes.js, sebagian + file pendukung)
  pages/*.jsx           # 60 halaman React (lazy-loaded per halaman)
  components/           # Layout, PosUI (design system POS), DialogProvider, AddressMapPicker, SearchModal
migrations/             # 24 file SQL; dijalankan otomatis saat boot (ditandai di audit_logs)
scripts/                # backup, restore, load test, uptime, provisioning akun, audit & perbaikan data
tests/                  # node:test (RBAC, guard route, helper akun, smoke API)
docs/                   # PRODUCTION-CHECKLIST.md, FITUR-LENGKAP.md (dokumen ini)
```

---

## 2. Peta cepat modul → halaman → API

| Modul (mount API) | Halaman utama | Prefix API |
|---|---|---|
| Auth & MFA | `/login`, `/profil`, `/settings` | `/api/auth`, `/api/auth/mfa` |
| Dashboard | `/` | `/api/dashboard` |
| Master data | `/master/products`, `/master/customers`, `/master/suppliers` | `/api/master` |
| Penjualan | `/sales/orders`, `/sales/orders/new`, `/sales/orders/detail/:id`, `/sales/invoices`, `/sales/order-history` | `/api/sales` |
| POS (kasir) | `/sales/pos`, `/pos/receipt/:id` | `/api/pos`, `/api/pos/auth`, `/api/pos/shift` |
| Pembelian | `/purchase/requests`, `/purchase/rfqs`, `/purchase/orders`, `/purchase/receipts` | `/api/purchase` |
| Persediaan | `/inventory/stocks`, `/inventory/stock-in`, `/inventory/movements`, `/inventory/transfers`, `/inventory/opname` | `/api/inventory`, `/api/inventory/opname`, `/api/inventory/reorder` |
| Laporan persediaan | `/reports/inventory` | `/api/reports` |
| Keuangan | `/finance/coa`, `/finance/journals`, `/finance/arap`, `/finance/tax`, `/finance/periods`, `/finance/recon` | `/api/finance`, `/api/finance/periods`, `/api/finance/recon`, `/api/tax` |
| Laporan umum | `/reports` | `/api/reports` |
| SDM | `/hr`, `/absen`, `/cuti`, `/izin` | `/api/hr` |
| Logistik & armada | `/logistics`, `/fleet`, `/driver`, `/surat-jalan`, `/surat-jalan/:id` | `/api/logistics`, `/api/fleet` |
| CRM & kredit | `/crm`, `/credit` | `/api/crm`, `/api/credit` |
| Proyek | `/projects` | `/api/projects`, `/api/project-terms` |
| Konsinyasi | `/consignments` | `/api/consignments` |
| Harga & promosi | `/pricing` | `/api/pricing` |
| Retur & klaim | `/returns` | `/api/returns` |
| Landed cost | `/landed-costs` | `/api/landed-costs` |
| Baja / steel | (dipakai di Master Produk & Laporan) | `/api/steel` |
| Limbah / waste | `/waste` | `/api/waste` |
| Anggaran | `/budgets` | `/api/budgets` |
| Loyalty | `/loyalty` | `/api/loyalty` |
| Aset tetap | `/assets` | `/api/assets` |
| Kalkulator harga | `/calculator` | `/api/calculator` |
| Approval matrix | `/approvals`, `/approval-rules` | `/api/approvals`, `/api/approval-rules` |
| Audit trail | `/audit` | `/api/audit` |
| Notifikasi | `/notify` | `/api/notify` |
| Pengumuman | `/pengumuman` | `/api/announcements` |
| Monitoring error | `/errors` | `/api/errors` |
| Pelacakan publik | `/lacak/:token` | `/api/public` |
| Panduan | `/panduan` | — |
| Pencarian global | (modal `SearchModal` di header) | `/api/search` |
| Kesehatan & metrik | — | `/api/health`, `/api/metrics`, `/api/metrics/errors` |

---

## 3. Detail per modul

### 3.1 Auth & keamanan (`/api/auth`)
- **Login** `POST /login` → JWT + profil + daftar role; ada rate limit khusus (default 20/15 menit),
  lockout setelah 5 gagal (15 menit), dan langkah kedua bila MFA aktif.
- **MFA/TOTP** `GET /mfa/status`, `POST /mfa/setup`, `/mfa/enable`, `/mfa/disable`, `/mfa/verify-login`
  (+ 8 kode cadangan, audit `LOGIN_MFA`).
- **Profil** `GET /me`, `POST /change-password` (validasi kekuatan password di `middleware/security.js`).
- **Manajemen user** `GET /users`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`, `GET /roles`.
- Tabel: `users`, `roles`, `user_roles`, `employees`.

### 3.2 Dashboard (`/api/dashboard`)
- `GET /kpi`, `/sales-trend`, `/top-products`, `/top-customers`, `/profit-margin` — **hanya** untuk
  direktur/super_admin/sales/sales_trading/POS_*; role lain menerima 403 dan memakai dashboard
  operasional sesuai role di frontend.
- `GET /notifications`, `GET /my-notifications` — bell notifikasi.
- Tabel: `sales_orders`, `invoices`, `products`, `notification_outbox`.

### 3.3 Master data (`/api/master`)
- Produk: `GET/POST /products`, `GET/PUT/DELETE /products/:id`, `POST /products/photo` (unggah foto).
- Pendukung: `GET /categories`, `/units`, `/warehouses`, `/branches`, `/taxes`, `/accounts`.
- Pelanggan: `GET/POST /customers`, `GET/PUT /customers/:id`.
- Pemasok: `GET/POST /suppliers`, `GET/PUT /suppliers/:id`.
- `GET /export` — ekspor master (CSV/XLSX/PDF).
- Tabel: `products`, `product_units`, `product_categories`, `units`, `warehouses`, `branches`,
  `customers`, `suppliers`, `taxes`, `accounts`.

### 3.4 Penjualan (`/api/sales`)
- **Sales Order**: `GET /orders`, `GET /orders/history`, `GET /orders/:id`, `POST /orders`,
  `POST /orders/:id/approve`, `/cancel`, `/picking`, `/complete`.
- **Link lacak publik**: `POST /orders/:id/track-link`, `DELETE /orders/:id/track-link`
  (dibuka pelanggan di `/lacak/:token`).
- **Surat jalan / DO**: `GET /deliveries`, `POST /deliveries`, `POST /deliveries/:id/confirm-office`.
  Stok dipotong saat DO dibuat untuk order non-POS; order POS tidak memotong dua kali.
- **Invoice**: `GET /invoices`, `GET /invoices/:id`, `POST /invoices`, `POST /invoices/:id/pay`.
  Invoice memposting jurnal: Dr Piutang, Cr Penjualan, Cr Hutang Pajak.
- **Checkout POS via sales**: `POST /pos` (validasi stok atomik per item, `FOR UPDATE`).
- Tabel: `sales_orders`, `so_details`, `delivery_orders`, `do_details`, `invoices`, `invoice_details`, `payments`.

### 3.5 POS / Kasir (`/api/pos`, `/api/pos/auth`, `/api/pos/shift`)
- **Auth kasir terpisah** `POST /pos/auth/cashier-login` & `/cashier-logout`.
- **Shift**: `GET /pos/shift/current`, `POST /pos/shift/open`, `POST /pos/shift/close`,
  `GET /pos/shift/history` — aturan: **1 outlet = 1 shift OPEN**, **1 kasir = 1 shift aktif**;
  setelah tutup shift diarahkan ke modal buka shift (bukan logout).
- **Transaksi**: `POST /pos/transaction` (idempotensi via `client_ref`), `POST /pos/sync` (batch offline),
  `GET /pos/product-lookup`, `POST /pos/products-batch`, `GET /pos/health`.
- **Void & refund**: `POST /pos/void-request`, `POST /pos/void-approve`, `GET /pos/pending-voids`,
  `POST /pos/refund`.
- **Rekonsiliasi kas**: `POST /pos/reconciliation-submit`, `GET /pos/pending-reconciliations`,
  `POST /pos/reconciliation-approve`.
- **Laporan**: `GET /pos/daily-report`, `POST /pos/daily-report-send`, `GET /pos/revenue-summary`,
  `GET /pos/cashier-monthly`, `GET /pos/product-sales`, `GET /pos/low-stock-alert`,
  `GET /pos/cashier-performance`, `GET /pos/fraud-alerts`, `POST /pos/fraud-alert-resolve`.
- **Antrian offline**: `src/lib/offline-queue.js` (IndexedDB) + banner antrian; kirim ulang tidak
  menggandakan invoice.
- Tabel: `pos_transactions`, `pos_transaction_items`, `pos_cashier_shifts`, `pos_reconciliation`,
  `pos_daily_reports`, `pos_fraud_alerts`, `pos_refunds`, `pos_transaction_voids`, `pos_sync_queue`,
  `pos_settings`, `pos_members`, `pos_promotions`, `pos_member_transactions`, `pos_stock_locations`.

### 3.6 Pembelian (`/api/purchase`)
- **PR**: `GET/POST /requests`, `POST /requests/:id/approve`, `POST /requests/:id/rfq`.
- **RFQ**: `GET/POST /rfqs`, `GET /rfqs/:id`, `POST /rfqs/:id/quotations`, `POST /rfqs/:id/select-winner`.
- **PO**: `GET/POST /orders`, `GET /orders/:id`, `POST /orders/:id/approve` (ambang approval dari `approval_rules`).
- **Penerimaan (GRN)**: `GET/POST /receipts`, `GET /receipts/:id` — menambah stok + memperbarui HPP rata-rata tertimbang.
- **Faktur pembelian (PINV)**: `GET/POST /invoices`, `GET /invoices/:id`, `POST /invoices/:id/approve`,
  `POST /invoices/:id/hold`, `GET /three-way` (match PO–GRN–PINV).
- Tabel: `purchase_requests`, `rfqs`, `rfq_quotations`, `purchase_orders`, `po_details`,
  `goods_receipts`, `grn_details`, `purchase_invoices`, `purchase_invoice_items`, `purchase_returns`.

### 3.7 Persediaan (`/api/inventory`, `/api/inventory/opname`, `/api/inventory/reorder`)
- **Stok**: `GET /stocks` (per baris), `GET /stocks/summary` (per produk, status KRITIS/WASPADA/AMAN).
- **Input manual (satu-satunya pintu resmi)**: `POST /adjustments` dengan `type`:
  `IN` (tambah: stok awal, pembelian tanpa PO, retur, hibah), `OUT` (susut, rusak, pemakaian),
  `SET` (opname fisik: qty = jumlah nyata, sekaligus bisa menetapkan HPP).
  Alasan valid: `GET /adjustment-reasons`. Riwayat: `GET /adjustments`, `GET /adjustments/:id`.
- **Kartu stok**: `GET /movements` (per produk/gudang/tipe/periode).
- **Transfer**: `GET /transfers`, `POST /transfers` (validasi stok, HPP ikut terbawa, kartu stok dua sisi),
  `POST /transfers/:id/receive`.
- **Stock Opname** (`/api/inventory/opname`): `GET/POST /sessions`, `GET /sessions/:id`,
  `PATCH /sessions/:id/items` (qty fisik + HPP penilaian), `POST /sessions/:id/submit|approve|post|cancel`.
  Alur **DRAFT → COUNTING → SUBMITTED → APPROVED → POSTED**; posting menyetel stok = hasil hitung,
  melebur baris kembar, menulis kartu stok `ADJ/OPNAME`, dan memposting jurnal selisih
  (Dr/Kr Persediaan vs Selisih Stok Opname). Approve/posting: direktur/super_admin/finance.
- **Perawatan**: `POST /stocks/merge-duplicates` (gabung baris non-batch kembar, `dry_run` tersedia).
- **Reorder otomatis** (`/api/inventory/reorder`): `GET /suggestions`, `POST /run` → membuat PR untuk
  produk ≤ reorder point (melewati yang sudah punya PR terbuka).
- **Ekspor**: `GET /export` (dataset `stocks` / `movements` / `transfers`).
- Tabel: `stocks`, `stock_movements`, `stock_adjustments`, `stock_adjustment_items`,
  `stock_opname_sessions`, `stock_opname_items`, `stock_transfers`, `stock_transfer_details`, `bin_locations`.

### 3.8 Laporan persediaan (`/api/reports`)
- `GET /stock-valuation` — valuasi qty × HPP per produk/gudang; **baris negatif dipisahkan** dari total
  (`negative_count`, `negative_value`) agar tidak mengacaukan nilai persediaan.
- `GET /product-margin` — pendapatan vs estimasi HPP; mengembalikan `cost_missing` (produk terjual tanpa HPP)
  dan `price_outliers` (harga jual >5x atau <0,2x HPP) untuk banner peringatan.
- Halaman `/reports/inventory`: 2 tab (Valuasi Stok, Margin per Produk) + ekspor CSV.

### 3.9 Keuangan (`/api/finance`, `/api/finance/periods`, `/api/finance/recon`, `/api/tax`)
- **COA**: `GET/POST /coa`, `PUT/DELETE /coa/:id`.
- **Jurnal**: `GET /journals`, `POST /journals` (double-entry, ditolak bila tidak balance).
- **AR/AP**: `GET /ar`, `GET /ap`, `POST /ap/pay`, `PATCH /ar/:id/due-date`.
- **Kas & bank**: `GET /cash`, `GET /cash/movements`, `POST /cash/deposit`.
- **Laporan**: `GET /trial-balance`, `GET /profit-loss`, `GET /export`.
- **Tutup buku**: `GET /periods`, `POST /periods/:period/close`, `POST /periods/:period/reopen`,
  `GET /periods/:period/status`; `assertPeriodOpen()` dipakai semua posting.
- **Rekonsiliasi bank**: `POST /recon/import`, `POST /recon/auto`, `GET /recon/candidates/:lineId`,
  `POST /recon/:id/match|unmatch|ignore`.
- **Pajak** (`/api/tax`): `GET /summary`, `GET /invoices`, `POST/DELETE /invoices/:id/number`
  (nomor e-Faktur), `GET/POST /pph`, `DELETE /pph/:id`, `GET /export`.
- Tabel: `accounts`, `journal_entries`, `journal_details`, `accounting_periods`, `bank_accounts`,
  `bank_statement_lines`, `cash_movements`, `payments`, `tax_invoices`, `pph_withholdings`.

### 3.10 SDM (`/api/hr`)
- **Karyawan**: `GET /employees`, `/employees/summary`, `/employees/:id`, `POST /employees`,
  `PUT /employees/:id`, `POST /employees/:id/account` (buat akun login dari data karyawan).
- **Absensi**: `GET /attendance`, `/attendance/summary`, `/attendance/late-report`, `/attendance/policy`;
  self-service `POST /attendance/checkin`, `/attendance/checkout`, `GET /attendance/mine`
  (geofence 200 m dari titik pusat, cutoff 08:00 → status terlambat, jam WIB).
- **Cuti & izin**: `GET/POST /leaves`, `POST /leaves/:id/decision`, self-service `GET /leaves/mine`,
  `GET /leaves/quota` (kuota dari `employees.leave_quota`), `POST /leaves/request`, `POST /leaves/:id/cancel`,
  lampiran `POST /leaves/attachment`, `GET /leaves/:id/attachment`.
- **Payroll**: `GET /payrolls`, `GET /payrolls/periods`, `POST /payrolls/generate`,
  `POST /payrolls/:id/status`, `POST /payrolls/post-journal` (+ per payroll) — memposting jurnal gaji.
- Tabel: `employees`, `attendances`, `leaves`, `payrolls`, `claim_attachments`.

### 3.11 Logistik, armada, surat jalan (`/api/logistics`, `/api/fleet`)
- **Logistik**: `GET /deliveries`, `/deliveries/:id`, `/delivered-notes`, `/vehicles`, `/fleet-stats`,
  `POST /deliveries/:id/confirm-office` (konfirmasi kantor), `POST /deliveries/:id/pod` (bukti terima).
- **Armada**: `GET/POST /vehicles`, `GET /vehicles/:id/history`, `PUT /vehicles/:id`, `GET/POST /drivers`,
  `GET /employees`, `GET/POST /trips`, `POST /trips/:id/complete|cancel`, `GET/POST /maintenance`,
  `GET /stats`, `GET /zones`, `GET /geocode`.
- **Driver**: `GET /my-deliveries`, `GET /claimable`, `POST /claim`, `GET /surat-jalan`, `GET /surat-jalan/:id`.
- Tabel: `vehicles`, `drivers`, `trips`, `vehicle_maintenance`, `delivery_orders`, `do_details`.

### 3.12 CRM (`/api/crm`)
- `GET /leads`, `GET /pipeline`, `GET /leads/:id`, `POST /leads`, `PUT /leads/:id`,
  `POST /leads/:id/convert` (lead → sales order, kolom `converted_so_id`).
- Tabel: `leads`, `customers`.

### 3.13 Kredit & penagihan (`/api/credit`)
- **Hold kredit**: `GET /holds`, `POST /hold`, `POST /unhold`, `GET /check/:customer_id`.
- **Janji bayar**: `GET/POST /promises`, `PATCH /promises/:id`.
- **Penagihan**: `GET/POST /dunning`, `GET /reminders`, `POST /reminders/send`.
- Tabel: `customers` (`is_hold`, `hold_reason`), `promise_to_pay`, `dunning_letters`, `data_change_logs`.

### 3.14 Proyek (`/api/projects`, `/api/project-terms`)
- `GET /`, `GET /:id`, `POST /`, `PUT /:id/status`, `POST /generate`, `DELETE /:id`.
- Termin & harga: `POST /:id/terms`, `POST /:id/prices`, `GET /:id/cashflow`, `POST /:id/documents`,
  `POST /:id/invoice` (invoice termin, mis. DP 30%).
- Tabel: `projects`, `project_terms`, `project_prices`, `project_documents`, `project_rab`,
  `project_surplus_items`, `project_surplus_returns`.

### 3.15 Konsinyasi (`/api/consignments`)
- `GET /`, `GET /:id`, `POST /` (kirim barang), `POST /:id/movement` (terjual/retur),
  `POST /:id/close`, `GET /stats/summary`, `GET /export`.
- Tabel: `consignments`, `consignment_items`, `consignment_movements`.

### 3.16 Harga & promosi (`/api/pricing`)
- Price list: `GET/POST /lists`, `GET/POST /lists/:id/items`.
- Harga per pelanggan: `GET/POST /customer-prices`. Harga lantai: `GET /floor-prices`,
  `PUT /floor-prices/:product_id`. Promosi: `GET/POST /promotions`. Cek harga: `POST /check`,
  riwayat: `GET /history`, ekspor: `GET /export`.
- Tabel: `price_lists`, `price_list_items`, `customer_prices`, `promotions`, `products.floor_price`.

### 3.17 Retur & klaim (`/api/returns`)
- Retur penjualan: `GET /invoice/:id`, `GET /sales`, `GET /sales/:id`, `POST /sales`,
  `POST /sales/:id/approve` (stok masuk kembali).
- Retur pembelian: `GET /purchase`, `POST /purchase`.
- Klaim: `GET /claims`, `POST /claims`, `POST /claims/:id/settle`, `POST /claims/:id/attach`, `GET /export`.
- Tabel: `sales_returns`, `sales_return_items`, `purchase_returns`, `claims`, `claim_attachments`.

### 3.18 Landed cost (`/api/landed-costs`)
- `GET /`, `GET /summary`, `GET /:id`, `POST /`, `POST /:id/calculate` (alokasi biaya ke HPP),
  `POST /:id/post`, `DELETE /:id`, `GET /export`.
- Tabel: `landed_costs`, `landed_cost_details`, `landed_cost_allocations`.

### 3.19 Baja / steel (`/api/steel`)
- Spesifikasi & produk baja: `GET /products`, `GET /products/:id`, `POST /products`.
- Harga: `GET /prices/:product_id`, `POST /prices` (+ `steel_price_locks`).
- Sisa potong: `GET /remnants`, `POST /remnants`, `PATCH /remnants/:id`, `GET /convert`
  (konversi batang → berat/panjang), `GET/POST /cutting-orders`.
- Tabel: `product_steel_specs`, `product_steel_conversions`, `steel_batches`, `steel_price_history`,
  `steel_price_locks`, `remnants`, `remnant_movements`, `cutting_orders`, `cutting_order_items`,
  `cutting_order_outputs`.

### 3.20 Limbah / waste (`/api/waste`)
- `GET /`, `POST /`, `POST /:id/approve`, `GET /stats/summary`, `GET /export` — pemusnahan barang
  mengurangi stok dan tercatat di `waste_logs`.

### 3.21 Anggaran (`/api/budgets`)
- `GET/POST /`, `PUT/DELETE /:id`, `GET /comparison` (realisasi vs anggaran), `GET /cashflow`,
  `GET /scenarios`, `GET /export`.
- Tabel: `budgets`, `budget_actuals`.

### 3.22 Loyalty (`/api/loyalty`)
- `GET/POST /tiers`, `GET /points`, `POST /earn`, `POST /redeem`, `GET /transactions`, `GET /export`.
- Tabel: `customer_tiers`, `loyalty_points`, `loyalty_transactions`.

### 3.23 Aset tetap (`/api/assets`)
- `GET /`, `GET /summary`, `GET /meta`, `POST /`, `PUT/DELETE /:id`, `POST /sync-fleet` (armada → aset).
- Maintenance: `GET/POST /:id/maintenance`. Penyusutan: `GET /:id/depreciation`, `POST /:id/depreciate`,
  `POST /depreciation/run`, `GET /depreciations`. Pelepasan: `POST /:id/dispose`. `GET /export`.
- Tabel: `fixed_assets`, `asset_depreciations`, `asset_maintenance`.

### 3.24 Kalkulator & penawaran (`/api/calculator`)
- `POST /estimate` (estimasi material dari daftar SKU), `POST /quotation` (bentuk penawaran).
  Dipakai halaman `/calculator` (sales/kasir).

### 3.25 Approval (`/api/approvals`, `/api/approval-rules`)
- Inbox: `GET /`, `POST /request`, `POST /:id/approve|reject|delegate`, `GET /check`, `GET /export`.
- Aturan: `GET/POST /approval-rules`, `PUT/DELETE /:id` — ambang nilai/diskon per modul.
- Tabel: `approval_requests`, `approval_rules`.

### 3.26 Audit (`/api/audit`)
- `GET /logs`, `/logs/summary`, `/data-changes` (log perubahan field), `/fraud` (indikasi kecurangan),
  `/segregation` (pemisahan tugas), `/export`.
- Tabel: `audit_logs`, `data_change_logs`.

### 3.27 Notifikasi (`/api/notify`)
- Status & antrian: `GET /status`, `GET /outbox`, `POST /outbox`, `POST /outbox/:id/send|retry`,
  `POST /outbox/send-pending`, `DELETE /outbox/:id`.
- Template: `GET /templates`, `PUT /templates/:key`, `POST /templates/:key/queue`.
- Worker `outbox-worker.js` mengirim otomatis tiap 60 detik; gateway kosong → mode console.
- Tabel: `notification_outbox`, `notification_templates`.

### 3.28 Pengumuman (`/api/announcements`)
- `GET /` (semua user login; hanya yang aktif & belum kedaluwarsa), `POST /`, `PUT /:id`, `DELETE /:id`
  (tulis: hrd/direktur/super_admin).

### 3.29 Monitoring error (`/api/errors`)
- `GET /` (filter status/pencarian), `POST /:id/resolve`, `POST /resolve-all`.
- Error 5xx dari route direkam otomatis oleh `middleware/error-capture.js` ke file + tabel `error_logs`
  dengan fingerprint (deduplikasi). Halaman `/errors` untuk direktur/super_admin/auditor.

### 3.30 Pelacakan publik (`/api/public`)
- `GET /track/:token` — status order untuk pelanggan tanpa login (halaman `/lacak/:token`).

### 3.31 Pencarian global (`/api/search`)
- `GET /?q=` — lintas entitas (produk, pelanggan, SO, PO, invoice) untuk `SearchModal` di header.

### 3.32 Panduan (`/panduan`)
- Halaman statis publik (bisa dicetak) berisi alur pemakaian aplikasi per peran.

---

## 4. Alur bisnis inti

### 4.1 Penjualan (SO → DO → Invoice → AR)
1. **SO** dibuat (`POST /sales/orders`): validasi stok, diskon di atas ambang → butuh approval
   (`approval_rules`).
2. **Approve → Picking → Complete**; status SO: `PENDING → APPROVED → PICKING → SHIPPED → COMPLETED`.
3. **Surat Jalan / DO** (`POST /sales/deliveries`): pilih kendaraan + driver; stok dipotong di sini
   (kecuali order POS yang sudah memotong saat checkout). Konfirmasi kantor + POD oleh driver.
4. **Invoice** (`POST /sales/invoices`): jurnal Dr Piutang / Cr Penjualan / Cr Hutang Pajak (PPN 11%).
5. **Pembayaran** (`POST /sales/invoices/:id/pay`) → `paid_amount`, status `PARTIAL/PAID`;
   AR aging di `/reports` dan `/finance/arap`.

### 4.2 POS
1. Kasir **buka shift** (`POST /pos/shift/open`) — 1 outlet hanya boleh 1 shift OPEN.
2. **Transaksi** (`POST /pos/transaction`): potong stok gudang outlet, catat `pos_transactions`,
   cetak struk 80 mm (`/pos/receipt/:id`). Mode offline: antrian IndexedDB + `client_ref` (idempoten).
3. **Void** butuh persetujuan supervisor (`void-request` → `void-approve`).
4. **Tutup shift** (`POST /pos/shift/close`): kas fisik, selisih, jurnal tutup shift; lalu
   **rekonsiliasi** (`reconciliation-submit` → `reconciliation-approve`).
5. Laporan harian POS bisa dikirim (`daily-report-send`).

### 4.3 Pembelian (PR → RFQ → PO → GRN → PINV)
1. **PR** (`POST /purchase/requests`) — bisa otomatis dari reorder (`POST /inventory/reorder/run`).
2. **RFQ** ke pemasok → **quotation** → **pilih pemenang**.
3. **PO** (`POST /purchase/orders`); approval bila nilai di atas ambang.
4. **GRN** (`POST /purchase/receipts`): stok masuk + **HPP rata-rata tertimbang** diperbarui
   (`avg_cost = (qty_lama×HPP_lama + qty_masuk×harga_beli) / qty_total`).
5. **PINV** (`POST /purchase/invoices`) + **three-way match** (`GET /purchase/three-way`) → bayar AP.

### 4.4 Persediaan
- Input manual hanya lewat **Penambahan Stok** (`/inventory/stock-in` → `POST /inventory/adjustments`).
- Transfer antar gudang membawa HPP; kartu stok ditulis dua sisi (keluar & masuk).
- **Stock Opname**: hitung fisik → ajukan → approve → posting (stok disetel, baris kembar dilebur,
  jurnal selisih). Sesi yang sudah POSTED tidak bisa dibatalkan.
- Perintah pemeliharaan: `POST /inventory/stocks/merge-duplicates`.

### 4.5 Keuangan
- Semua aksi keuangan memakai `postJournal()` (menolak jurnal tidak balance) dan `assertPeriodOpen()`
  (menolak posting di periode yang ditutup).
- Sumber jurnal otomatis: invoice penjualan, pembayaran, tutup shift POS, setor kas, payroll,
  penyusutan aset, opname, landed cost.

---

## 5. RBAC (hak akses)

**Satu sumber kebenaran:** `src/config/access.js` — dipakai sidebar + route guard (frontend) dan
mount `rbac()` (backend). Jangan menduplikasi daftar role di tempat lain.

| Layer | Isi |
|---|---|
| `PAGE_ACCESS` | role yang boleh membuka tiap halaman (`dashboard`, `salesOrders`, `inventory`, `opname`, `finance`, `hr`, …). Nilai `null` = semua user login (mis. `myLeave`, `myAttendance`, `myProfile`, `announcements`). |
| `MODULE_ROLES` | role yang boleh memanggil modul API (mount-level di `src/index.js`). |
| `R_ALL` | `direktur`, `super_admin` (selalu lolos `rbac()`). |
| `R_POS` | `POS_CASHIER`, `POS_SUPERVISOR`, `POS_MANAGER`. |

Role di DB: `direktur`, `super_admin`, `finance`, `sales`, `sales_trading`, `warehouse`, `purchasing`,
`buyer_admin`, `hrd`, `auditor`, `project_manager`, `site_engineer`, `driver`, `POS_CASHIER`,
`POS_SUPERVISOR`, `POS_MANAGER`.

**Operasional akun:**
- `npm run provision:accounts` → buat akun karyawan dari tabel `employees` (role dipetakan per jabatan
  di `src/config/employeeRoles.js`); kredensial ditulis ke `~/erp-credentials/*.csv`, tidak pernah ke log.
- `npm run verify:rbac` → uji RBAC end-to-end terhadap API & DB nyata.
- `npm test` / `node --test "tests/*.test.js"` → 26 test: RBAC, guard route HR, helper akun, smoke API.

---

## 6. Library & mekanisme lintas modul

| File | Fungsi | Catatan |
|---|---|---|
| `src/lib/journal.js` | `postJournal`, `ensureCoa`, `withTx` | Menolak jurnal tidak balance; cek periode; nomor jurnal unik |
| `src/lib/exporters.js` | `sendReport` CSV/XLSX/PDF | Judul, subjudul (periode/filter), baris TOTAL, berwarna |
| `src/lib/error-log.js` | fingerprint & statistik error | Dipakai middleware + `/errors` |
| `src/lib/totp.js` | TOTP MFA | 8 kode cadangan, audit login MFA |
| `src/lib/message-provider.js` | WA/SMS/Email | Kosong = mode console |
| `src/lib/outbox-worker.js` | kirim antrian notifikasi | Interval 60 detik |
| `src/lib/offline-queue.js` | antrian POS di IndexedDB | Idempoten via `client_ref` |
| `src/lib/redis.js` | Redis opsional | Aktif bila `REDIS_URL` diisi |
| `src/lib/api.js` (frontend) | axios instance | Sisipkan token, redirect ke `/login` saat 401 |
| `src/components/PosUI.jsx` | design system POS | `PosCard`, `PosStat`, `PosBadge`, `PosTh`, `posTd`, dll — dipakai hampir semua halaman |

Middleware: `auth` (JWT), `rbac(...roles)`, `security` (rate limit + lockout + aturan password),
`error-capture` (rekam 5xx), rate limit global `/api` (default 600/menit), rate limit khusus login.

---

## 7. Operasional (Docker, skrip, env)

### 7.1 Container & port (host)

| Container | Image | Port | Keterangan |
|---|---|---|---|
| `erp_backend` | `Dockerfile.backend` | `4000` | Bind-mount repo, `restart: unless-stopped`, **tanpa watcher** → setelah edit backend: `docker restart erp_backend` |
| `erp_frontend` | `Dockerfile.frontend` | `5174` (http), `5443` (https) | Menyajikan **hasil build** (`dist` di dalam image) → setelah ubah UI: `npm run build` + rebuild image + recreate container |
| `erp_postgres` | `postgres:16` | `5434` | Volume `pgdata`; `migrations/` juga dipasang di `docker-entrypoint-initdb.d` |
| `erp_redis` | `redis:7-alpine` | `6380` | Opsional |
| `backup` | — | — | `pg_dump` harian, retensi 14 hari |

> Port 4000: pastikan tidak ada `node src/index.js` lokal yang menabrak container
> (`netstat -ano | grep :4000`) — gejalanya perubahan backend tidak berefek.

### 7.2 Skrip (`scripts/`)

| Skrip | Kegunaan |
|---|---|
| `backup-db.sh` / `restore-db.sh` | Backup & restore PostgreSQL (uji restore sebelum go-live) |
| `load-test.mjs` | Uji beban (pernah lulus 257,7 rps, p95 148 ms, 0 error) |
| `uptime-monitor.sh` | Cek `/api/health` 3×, kirim webhook `ERROR_WEBHOOK_URL` bila gagal |
| `gen-self-signed-cert.sh` | Sertifikat TLS self-signed untuk `nginx.conf` 443 |
| `provision-employee-accounts.mjs` | Buat akun login karyawan + CSV kredensial |
| `verify-employee-rbac.mjs` | Verifikasi RBAC end-to-end |
| `seed_demo_roles.mjs` | Seed role demo |
| **`audit-inventory-data.mjs`** | **Audit kualitas data persediaan (read-only)** — stok minus, HPP 0, baris kembar, batch nyasar, GL vs stok, kartu stok kosong, harga jual aneh. `--json` untuk otomasi; exit code 1 bila ada P1 |
| **`fix-inventory-data.mjs`** | **Perbaikan data lewat API resmi** (opname + penambahan stok). Default **dry-run**; eksekusi dengan `--apply`; `--only=STOK_MINUS,HPP_NOL` untuk memilih kelas perbaikan |
| **`repair-ledger.mjs`** | **Perbaikan buku besar & harga jual**: `HARGA_INVOICE` (harga jual ekstrem → daftar harga), `JURNAL_INVOICE` (jurnal invoice/pelunasan yang belum ada), `KARTU_STOK_AWAL`, `KAS_AWAL`, `KAPITALISASI` (GL Persediaan = nilai stok). Default dry-run; `--apply`; `--only=<langkah>` |

Jalankan:
```bash
node scripts/audit-inventory-data.mjs          # temuan
node scripts/fix-inventory-data.mjs            # rencana (dry-run)
node scripts/fix-inventory-data.mjs --apply    # eksekusi
node scripts/repair-ledger.mjs --apply         # perbaikan buku besar + cetak neraca saldo
```

### 7.3 Environment penting (`.env`)

| Variabel | Fungsi | Default |
|---|---|---|
| `DATABASE_URL` | koneksi PostgreSQL | `postgres://erp:…@localhost:5432/erp_db` |
| `PORT` | port backend | `4000` |
| `NODE_ENV` | mode produksi (secret guard, log) | `development` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | tanda tangan token | **wajib diganti** (≥32 char, `openssl rand -hex 32`) |
| `ALLOWED_ORIGINS` | whitelist CORS | `http://localhost:5173,http://localhost:5174` |
| `TRUST_PROXY` | ambil IP asli dari `X-Forwarded-For` | `1` |
| `RATE_LIMIT_PER_MIN` / `LOGIN_RATE_MAX` | batas request | `600` / `20` |
| `LOGIN_MAX_FAILS` / `LOGIN_LOCK_MINUTES` | lockout login | `5` / `15` |
| `REDIS_URL` | aktifkan Redis | kosong |
| `WA_GATEWAY_URL`, `SMS_GATEWAY_URL`, `SMTP_URL` (+token) | gateway notifikasi nyata | kosong = console |
| `ERROR_WEBHOOK_URL` | webhook alert uptime | kosong |
| `PGPOOL_MAX` | ukuran pool DB | default `pg` |
| `APP_VERSION` | versi di `/api/health` | `1.0.0` |

### 7.4 Migrasi
`src/index.js` menjalankan semua `migrations/*.sql` saat boot, sekali per file (penanda di
`audit_logs` dengan `entity_type='MIGRATION'`). `009_aging_rebuild.sql` sengaja dijalankan ulang
(`forceRerun`). Menambah skema = tambahkan file `0NN_*.sql` baru (idempoten: `IF NOT EXISTS`),
lalu `docker restart erp_backend`.

### 7.5 Endpoint operasional
- `GET /api/health` — cek DB; `503` bila DB mati; mengembalikan `version`, `env`.
- `GET /api/metrics` — metrik proses & DB (direktur/super_admin/auditor).
- `GET /api/metrics/errors` — ringkasan error.
- `GET /api/pos/health` — kesehatan POS.

---

## 8. Kualitas data persediaan

### 8.1 Yang sudah dibereskan (30 Oktober 2026)

| Temuan | Tindakan | Hasil |
|---|---|---|
| `PAS-001` stok **−83.108,4** di Gudang Pusat Bekasi (nilai −Rp 20,7 M) | Stock Opname `OPN-20261030-004`: hitung fisik 0, **HPP penilaian 0** (nilai minus itu warisan impor tanpa kartu stok & tanpa jurnal, jadi tidak dibukukan sebagai aset) | stok 0, HPP 250.000 tetap tersimpan untuk penerimaan berikutnya; laporan valuasi bersih dari nilai negatif |
| Stok ber-**HPP 0** (`BJR-C75` @ Gudang Jakarta, 5 unit) akibat transfer lama yang menulis `avg_cost = 0` | Penambahan Stok jenis Opname Fisik `OP-20261030-0001`: qty 5 @ HPP 82.551,02 (harga rata-rata gudang asal) | margin produk tidak lagi 100% |
| **Baris stok kembar** `BESI-BETON-13-SNI` @ Gudang Bandung (18 batch + 7 non-batch = 25, padahal hasil hitung terakhir 7) | Stock Opname `OPN-20261030-005`: 25 → 7, baris dilebur jadi satu (nilai 0 karena selisihnya sudah dijurnal di opname sebelumnya) | satu baris stok, angka = hasil hitung |
| Transfer antar gudang menghapus HPP di gudang tujuan | `migrations/022_stock_transfer_cost.sql` + `POST /inventory/transfers` sekarang membawa `avg_cost` (rata-rata tertimbang), memvalidasi stok, menulis kartu stok dua sisi, transaksional | akar masalah HPP 0 hilang |
| Opname tidak bisa membuat sesi bila satu produk punya >1 baris stok (UNIQUE `session_id+product_id`), dan posting hanya menyentuh baris non-batch | `opname-routes.js`: snapshot **dijumlahkan per produk** (qty + HPP tertimbang), posting **melebur semua baris** jadi satu = hasil hitung, tolak hitung fisik negatif, `unit_cost` per baris bisa diisi | sesi & posting benar untuk data batch/kembar |
| Halaman opname tidak bisa menetapkan dasar penilaian selisih | Kolom **HPP/Satuan** di modal Stock Opname (editable saat DRAFT/COUNTING) | operator bisa mengisi 0 atau HPP korektif |
| Laporan margin bisa menyesatkan | `/reports/product-margin` menambah `price_outliers`; halaman `/reports/inventory` menampilkan banner merah bila harga jual >5x/<0,2x HPP (banner HPP kosong sudah ada sebelumnya) | angka ekstrem ditandai, bukan disembunyikan |
| **21 baris harga jual tidak wajar** di invoice (Rp 12 jt–250 jt per sak semen; 19 baris `SEM-001` + `BTK-001` + `BTB-001`) — kolom harga satuan terisi nilai total baris | `scripts/repair-ledger.mjs` langkah `HARGA_INVOICE`: harga dikembalikan ke daftar harga produk, lalu subtotal/PPN/total invoice, `paid_amount`, baris `payments`, dan SO terkait dihitung ulang | invoice `INV-20261005-9071` 133,2 jt → 72.150; pendapatan periode dari Rp 2,47 M → Rp 4,07 jt (angka wajar) |
| **27 jurnal invoice tanpa baris** (hanya header: `total_debit = total_credit` tanpa `journal_details`) sehingga tidak berpengaruh ke buku besar | Kode: `POST /sales/invoices` kini memakai `postJournal` (Dr Piutang / Cr Penjualan / Cr PPN + **Dr HPP / Cr Persediaan**). Data lama dibangun ulang lewat `JURNAL_INVOICE` (termasuk jurnal pelunasan) | Piutang GL **=** sisa tagihan invoice (selisih Rp 0); HPP penjualan tercatat Rp 4,63 jt |
| **Pelunasan invoice & penerimaan barang (GRN) tidak pernah dijurnal** | Kode: `POST /sales/invoices/:id/pay` → Dr Kas & Bank / Cr Piutang (khusus invoice yang punya piutang; POS tidak, karena uangnya masuk lewat tutup shift). `POST /purchase/receipts` → Dr Persediaan / Cr Hutang Usaha. POS checkout → Dr HPP / Cr Persediaan | siklus jual–beli–bayar kini menutup di GL |
| **Saldo GL Persediaan (1-1200) tidak sama dengan nilai stok** | `KAPITALISASI`: selisih dibukukan sebagai saldo awal (Dr Persediaan / Cr Modal) | Persediaan GL **=** nilai stok **Rp 20.000.344.583,70** (selisih Rp 0) |
| **Kas & Bank (1-1000) minus Rp 1,04 M** karena saldo awal kas/bank tidak pernah dibukukan padahal pembayaran AP dijurnal sebagai kas keluar | `KAS_AWAL`: saldo awal kas & bank dari data awal (BCA 1,5 M + Mandiri 800 jt) dibukukan sekali (Dr Kas & Bank / Cr Modal) | Kas & Bank **+Rp 1,256 M** |
| **Kartu stok kosong** untuk 10 baris stok | `KARTU_STOK_AWAL`: dibuat pergerakan `IN` bertipe `OPENING` (qty tidak berubah, hanya jejak audit) | semua baris stok punya riwayat |

Verifikasi (`node scripts/audit-inventory-data.mjs` + `node scripts/repair-ledger.mjs --apply`):
stok minus **0**, HPP 0 **0**, baris kembar **0**, batch nyasar **0**, kartu stok kosong **0**,
harga jual aneh **0**, nilai persediaan **Rp 20.000.344.583,70** = GL `1-1200`,
neraca saldo **seimbang** (Rp 24.047.560.360,46 D = K), piutang GL = sisa tagihan invoice.

### 8.2 Temuan yang masih terbuka (butuh keputusan)

| # | Temuan | Dampak | Usulan |
|---|---|---|---|
| 1 | ✅ **Selesai** — Hutang Usaha: jurnal GRN & invoice pemasok historis dibukukan dari dokumen sumber; saldo kini Rp −3,08 jt dan cocok dengan subledger (selisih 0) | — | — |
| 2 | ✅ **Selesai** — Kas & Bank: 103 penerimaan AR dicatat ke `cash_movements` + `bank_accounts`; sisa selisih Rp 300 rb (kas awal tunai) | — | — |
| 3 | **Penjualan di bawah HPP**: `BJR-C75` dijual Rp 65.000 vs HPP Rp 82.551 (3 invoice, margin −21,3%) | Setiap penjualan BJR rugi; margin laporan negatif | Naikkan harga jual atau koreksi harga beli. Keputusan bisnis — tidak diubah otomatis |
| 4 | **Pendapatan POS hanya masuk GL saat tutup shift, dan hanya sisi tunai** (lewat `creditCash`); penjualan POS non-tunai & POS yang shiftnya belum ditutup tidak pernah masuk buku besar | Pendapatan GL < pendapatan operasional | Jurnal pendapatan saat checkout POS (Dr Piutang/Kas per metode bayar / Cr Penjualan), lalu tutup shift hanya merekonsiliasi kas |
| 5 | 7 produk aktif belum punya baris stok (BESI-BETON-06/08/10/16-SNI, BSI-10-ULIR, KRM-60-GLS, SEM-PC-40) | Tidak berdampak nilai; HPP terisi saat penerimaan pertama | Tidak perlu tindakan |

---

## 9. Status & backlog pengembangan

### 9.1 Sudah selesai (terverifikasi)

| Area | Status | Bukti |
|---|---|---|
| Modul bisnis (sales, POS, gudang, pembelian, keuangan, HR, proyek, aset, armada) | ✅ | 33 modul API + 60 halaman |
| Akuntansi double-entry | ✅ | `postJournal` menolak jurnal tidak balance; TB seimbang |
| RBAC tiga lapis (menu, route, API) | ✅ | `src/config/access.js`, 26 test |
| Audit trail | ✅ | middleware mutasi + `/audit` (fraud & segregation) |
| Tutup buku / period lock | ✅ | `/finance/periods` + `assertPeriodOpen` |
| Rekonsiliasi bank | ✅ | `/finance/recon` |
| Reorder otomatis | ✅ | `POST /inventory/reorder/run` |
| Valuasi & margin + banner peringatan | ✅ | `/reports/inventory` |
| Approval matrix | ✅ | `/approval-rules` (SO diskon %, PO nilai) |
| Struk thermal 80 mm | ✅ | `/pos/receipt/:id` |
| PWA + halaman offline | ✅ | `manifest.webmanifest`, `sw.js`, `offline.html` |
| Antrian notifikasi | ✅ | `outbox-worker` tiap 60 detik |
| TLS/HTTPS | ✅ | `nginx.conf` 443 (TLS 1.2/1.3 + HSTS), compose `5443:443`, uji `curl -k https://localhost:5443/healthz` → 200 |
| Error tracking | ✅ | `error_logs` + `/errors` + webhook |
| Uptime alert | ✅ | `scripts/uptime-monitor.sh` |
| Uji beban | ✅ | `scripts/load-test.mjs` (257,7 rps, p95 148 ms, 0 error) |
| MFA TOTP | ✅ | `/api/auth/mfa/*` |
| Offline POS (IndexedDB) | ✅ | `src/lib/offline-queue.js` + `client_ref` idempoten |
| Backup harian | ✅ | service `backup` + `scripts/backup-db.sh` |
| Audit & perbaikan data persediaan | ✅ | `scripts/audit-inventory-data.mjs`, `scripts/fix-inventory-data.mjs`, `scripts/repair-ledger.mjs` |
| **Mutasi stok satu pintu** (`src/lib/stock-service.js`) | ✅ | `mutateStock()` kunci baris `FOR UPDATE`, tolak stok minus 422 `INSUFFICIENT_STOCK`, HPP rata-rata tertimbang, kartu stok otomatis; dipakai DO, POS, GRN, transfer, retur, waste, konsinyasi |
| **Penjaga harga jual** | ✅ | `assertPriceSanity()`: harga >5× HPP → 422 `PRICE_OUTLIER_DETECTED`; di bawah HPP/harga lantai → 422 `PRICE_BELOW_LIMIT` (kecuali direktur/super admin). Aktif di SO, invoice, checkout POS |
| **Perpetual journal lengkap** | ✅ | GRN: Dr Persediaan / Cr GR/IR (2-1150) · Invoice pemasok: Dr GR/IR + Dr PPN Masukan + Dr/Cr PPV / Cr Hutang Usaha · DO: Dr HPP / Cr Persediaan · Retur penjualan: pembalik HPP + nota kredit · Waste: Dr 5-1300 · Konsinyasi: Dr 1-1250 |
| **Buku besar append-only** | ✅ | `migrations/025` + `026`: trigger `IMMUTABLE_RECORD_VIOLATION` pada `journal_entries`, `journal_details`, `audit_logs`, `data_change_logs`, `stock_movements` (escape hatch `app.allow_ledger_mutation`) + CHECK `qty_on_hand >= 0` |
| **Jurnal pembalik resmi** | ✅ | `POST /api/finance/journals/:id/reverse` → jurnal lawan `REVERSAL`, menandai asal `reversed_by`, tolak pembalik ganda |
| **Barcode scanner HID** | ✅ | `src/components/ui/useBarcodeScanner.js` + `ScanStatusPill` — terpasang di POS (cari & masukkan keranjang) dan Stock Opname (filter baris) |
| **Cetak thermal langsung** | ✅ | `src/components/ui/ThermalPrintButton.jsx`: mode dialog browser / RawBT (Android) / WebUSB ESC/POS + pintasan F9, dipakai halaman struk `/pos/receipt/:id` |
| **Jembatan timbang (catch-weight)** | ✅ | `POST /api/logistics/scale/readings` (gross/tare/net + HMAC `SCALE_HMAC_KEY`), `GET /readings`, `POST /readings/:id/bind` → hitung selisih vs berat teoretis, di luar toleransi SNI → `WEIGHT_VARIANCE_HOLD` |
| **Dual UOM & toleransi SNI** | ✅ | `grn_details`/`do_details`/`stock_movements` menyimpan `secondary_qty_actual`, `secondary_qty_theoretical`, `weight_variance_pct`, `hold_status`; GRN menolak 422 bila selisih > toleransi (default 3,5%) kecuali direktur/super admin atau `override_reason` |
| **Drop-ship & cross-warehouse** | ✅ | `POST /api/sales/orders/:id/create-dropship-po` (PO otomatis dari SO), GRN `is_dropship: true` tidak menambah stok + jurnal Dr HPP / Cr GR/IR, `so_details.source_warehouse_id` |
| **FEFO kedaluwarsa** | ✅ | `GET /api/inventory/stocks/fefo/:product_id` (batch terdekat kedaluwarsa dulu) + `GET /api/inventory/expiring?days=30`; `stocks.manufactured_date` & `expired_date` diisi dari GRN |
| **Pusat Integritas Keuangan & Rekonsiliasi (P0)** | ✅ | `GET /api/finance/recon-center` (+ `/:key` drilldown): AR, AP, GR/IR, Persediaan, Kas & Bank, PPN, integritas jurnal, jurnal yatim, trial balance — status OK/P1/P2 dengan angka & catatan. CLI: `npm run recon:gl` (exit 1 bila P1) |
| **Jurnal GRN & invoice pemasok historis** | ✅ | `repair-ledger.mjs` langkah `JURNAL_GRN_PINV`: 10 GRN (Rp 1,01 M) + 5 invoice pemasok dibukukan dari dokumen sumber → Hutang Usaha dari debit Rp 1,13 M menjadi **Rp −3,08 jt** (selisih nol vs subledger) |
| **Penerimaan AR masuk saldo rekening** | ✅ | langkah `KAS_AR`: 103 pembayaran pelanggan dicatat ke `cash_movements` + `bank_accounts.balance` → selisih kas dari Rp 84 jt menjadi **Rp 300 rb** (kas awal tunai) |
| **Pendapatan POS diakui saat checkout** | ✅ (kode) | `POST /sales/pos` menjurnal Dr Kas Tunai/Bank + Dr Piutang / Cr Penjualan + Cr PPN; tutup shift hanya merekonsiliasi kas (`creditCash(..., withJournal:false)`). Data POS historis belum dibukukan (lihat `docs/AUDIT-DAN-STATUS.md` F16) |
| **Ketahanan transaksi** | ✅ | `withTx()` retry otomatis untuk `40P01`/`40001` (3 percobaan + jitter); migrasi dibungkus `pg_advisory_lock(948271)` agar dua container tidak berlomba |
| **Backfill F16 (pendapatan & PPN POS historis)** | ✅ | `npm run f16:dry` / `f16:apply`: 68 invoice, net Rp 322,6 jt + PPN Rp 35,5 jt, idempoten (unique index per invoice), 1 jurnal pembalik shift, jejak di `data_backfill_batches/items`. Laporan: `docs/F16-BACKFILL-REPORT.md` |
| **Gerbang go-live** | ✅ | `npm run verify:golive` — 21 invarian (rahasia, akun demo, stok minus/HPP 0/kembar, TB, GL persediaan, jurnal, AR/AP, trigger, CHECK, backup, Redis) dengan exit code |

### 9.2 Belum / perlu keputusan

**P0 (sebelum produksi)**
1. Ganti secret produksi (`JWT_SECRET`, `JWT_REFRESH_SECRET`, password DB) + `ALLOWED_ORIGINS` domain asli.
2. Sertifikat TLS asli (Let's Encrypt/Cloudflare) menggantikan self-signed.
3. Hapus/nonaktifkan akun demo (`admin`, `kasir`, `driver`, `hrd`, `purchasing`, `auditor`, dst.).
4. Sambungkan gateway notifikasi (WA/Email) bila dipakai — tanpa itu hanya mode console.
5. Uji restore backup di mesin berbeda.

**P1 (data & akuntansi)**
1. Kapitalisasi persediaan ke GL (temuan §8.2 #1) + sambungkan GRN/penjualan ke jurnal.
2. Revisi invoice dengan harga tidak wajar (§8.2 #2).
3. Dokumen "stok awal" untuk baris yang kartu stoknya kosong (§8.2 #3).

**P2 (skala & kematangan)**
1. **PgBouncer** / connection pooling saat pengguna bertambah; **partisi** `stock_movements`,
   `audit_logs`, `payments` bila > 5 juta baris.
2. **Multi-outlet/multi-company** eksplisit (sekarang `branch_id` baru sebagian dipakai; beberapa
   jalur masih hardcode gudang `WH=1`).
3. **Scanner barcode** di POS (sekarang input manual/SKU).
4. **Portal pelanggan** (riwayat order, unduh invoice) di atas `/lacak/:token`.
5. **e-Faktur langsung ke DJP** (API) alih-alih ekspor CSV.
6. **Redis** untuk rate limit lintas instance & cache dashboard.
7. **Job queue** untuk laporan besar / sinkronisasi eksternal.
8. **SSO** (Google/Microsoft) di samping MFA.

### 9.3 Ide pengembangan berikutnya (belum ada di kode)
- Rekonsiliasi otomatis nilai persediaan GL vs stok per gudang (skrip + laporan selisih harian).
- Approval berjenjang multi-level (sekarang satu level per aturan).
- RMA/klaim garansi terintegrasi retur penjualan.
- Analitik POS: basket analysis, prediksi stok dari tren penjualan.

### 9.4 Roadmap prompt pack enterprise (status eksekusi)

| Tahap | Isi | Status |
|---|---|---|
| Prompt 1 · Phase 1 | Perpetual GL, `mutateStock()`, penjaga harga, immutable ledger, jurnal pembalik | ✅ **selesai** (31 test lulus, audit P1 = 0) |
| Prompt 3 | Remediasi data historis (GL opening, invoice outlier, kartu stok awal) | ✅ selesai lewat `scripts/repair-ledger.mjs` |
| Prompt 2 · sebagian | Barcode scanner HID, cetak thermal ESC/POS/RawBT | ✅ terpasang di POS, opname, struk |
| Prompt 1 · Phase 2 | Dual UOM catch-weight & toleransi SNI, weighbridge, drop-ship/cross-warehouse, FEFO expiry | ✅ **selesai** — `migrations/027`, `src/modules/logistics/scale-routes.js`, `POST /sales/orders/:id/create-dropship-po`, GRN `is_dropship`, `GET /inventory/stocks/fefo/:id`, `GET /inventory/expiring` (35 test lulus) |
| Prompt 1 · Phase 3 | Tax engine dinamis (PPN 11/12, DPP nilai lain), Coretax, e-Bupot, PSAK 115, SNAP BI | ⏳ |
| Prompt 1 · Phase 4 | Data-scope RBAC (user_warehouses/branches), approval multi-tahap + SLA, idempotency key, Redis rate limit | ⏳ |
| Prompt 1 · Phase 5 | PITR/off-site backup, `verify-restore.sh`, rekonsiliasi GL↔stok realtime, perluasan test | ⏳ |
| Prompt 2 · sisa | Sync Conflict Drawer POS, ApprovalStepper, banner weight variance | ⏳ |
| Prompt 4 | Neraca & arus kas, giro mundur, credit exposure, rebate, RAB proyek, marketplace, ODOL, PPh 21 TER/BPJS, partisi, UU PDP | ⏳ |
| Prompt 5 | Multi-company, import LC/FX, steel WIP/MTC, shade keramik & repack semen, portal B2B, SSO/JWT revocation, arsip 10 tahun | ⏳ |

> Identitas tetap **toko bangunan / distributor material & baja**: produk semen, besi, pasir, bata,
> keramik, cat, pipa; gudang Bekasi/Jakarta/Bandung/retur; peran kasir, gudang, sales, purchasing,
> finance, HRD, driver, auditor. Semua penambahan fitur mengikuti domain ini, bukan ERP generik.

---

## 10. Konvensi kode (aturan keras)

1. **Tanggal = WIB (UTC+7), disimpan sebagai wall-clock tanpa zona.** `src/config/db.js` mengembalikan
   `timestamp`/`date` sebagai **string** (parser 1114 & 1082) — jangan diubah menjadi `Date`, kalau tidak
   jam bergeser −7 jam. Jangan pakai `toISOString()` mentah untuk "hari ini".
2. **`stocks.qty_available` adalah kolom GENERATED** (`qty_on_hand - qty_reserved`). Update hanya
   `qty_on_hand` / `qty_reserved`.
3. **Satu baris stok per (produk, gudang) dengan `batch_no IS NULL`.** Ada UNIQUE constraint
   `uq_stocks_no_batch`. Jangan membuat baris baru setiap transaksi; update baris yang ada.
4. **Semua mutasi stok wajib menulis `stock_movements`** (kartu stok) dan, bila menyentuh nilai,
   memakai `postJournal`.
5. **Jurnal wajib double-entry** lewat `src/lib/journal.js`; jangan INSERT ke `journal_entries` langsung.
6. **RBAC satu sumber**: tambah role di `src/config/access.js`, bukan di route.
7. **Navigasi frontend** memakai `Link`/`useNavigate`; halaman di-`React.lazy` per route.
8. **Backend tanpa watcher di container**: setelah edit, `docker restart erp_backend`.
9. **Ubah UI = build ulang**: `npm run build` → `docker compose build frontend` → recreate container.
10. **Jangan print kredensial**: skrip provisioning menulis password ke CSV, bukan ke log/console.

---

## 11. Lampiran: tabel database

125 tabel di schema `public`. Dikelompokkan:

- **Master**: `products`, `product_units`, `product_categories`, `units`, `warehouses`, `bin_locations`,
  `branches`, `companies`, `customers`, `suppliers`, `taxes`, `accounts`, `users`, `roles`, `user_roles`,
  `employees`, `drivers`, `vehicles`.
- **Penjualan**: `sales_orders`, `so_details`, `delivery_orders`, `do_details`, `invoices`,
  `invoice_details`, `payments`, `sales_returns`, `sales_return_items`, `customer_prices`,
  `customer_tiers`, `price_lists`, `price_list_items`, `promotions`, `loyalty_points`,
  `loyalty_transactions`, `dunning_letters`, `promise_to_pay`, `leads`.
- **POS**: `pos_transactions`, `pos_transaction_items`, `pos_cashier_shifts`, `pos_reconciliation`,
  `pos_daily_reports`, `pos_fraud_alerts`, `pos_refunds`, `pos_transaction_voids`, `pos_sync_queue`,
  `pos_settings`, `pos_members`, `pos_promotions`, `pos_promotion_items`, `pos_member_transactions`,
  `pos_stock_locations`.
- **Pembelian**: `purchase_requests`, `rfqs`, `rfq_quotations`, `purchase_orders`, `po_details`,
  `goods_receipts`, `grn_details`, `purchase_invoices`, `purchase_invoice_items`, `purchase_returns`,
  `landed_costs`, `landed_cost_details`, `landed_cost_allocations`, `consignments`,
  `consignment_items`, `consignment_movements`.
- **Persediaan**: `stocks`, `stock_movements`, `stock_adjustments`, `stock_adjustment_items`,
  `stock_opname_sessions`, `stock_opname_items`, `stock_transfers`, `stock_transfer_details`,
  `waste_logs`, `scale_readings`.
- **Baja**: `product_steel_specs`, `product_steel_conversions`, `steel_batches`, `steel_price_history`,
  `steel_price_locks`, `remnants`, `remnant_movements`, `cutting_orders`, `cutting_order_items`,
  `cutting_order_outputs`.
- **Keuangan**: `journal_entries`, `journal_details`, `accounting_periods`, `bank_accounts`,
  `bank_statement_lines`, `cash_movements`, `tax_invoices`, `pph_withholdings`, `budgets`,
  `budget_actuals`, `fixed_assets`, `asset_depreciations`, `asset_maintenance`, `marketplace_channels`,
  `marketplace_orders`.
- **Proyek**: `projects`, `project_terms`, `project_prices`, `project_documents`, `project_rab`,
  `project_surplus_items`, `project_surplus_returns`.
- **SDM**: `attendances`, `leaves`, `payrolls`, `claims`, `claim_attachments`.
- **Sistem**: `audit_logs`, `data_change_logs`, `error_logs`, `notification_outbox`,
  `notification_templates`, `announcements`, `approval_requests`, `approval_rules`, `trips`,
  `vehicle_maintenance`.

---

*Dokumen ini dihasilkan dari kode sumber. Bila menambah modul/halaman/endpoint, tambahkan barisnya di
[§2](#2-peta-cepat-modul--halaman--api) dan [§3](#3-detail-per-modul) agar peta tetap akurat.*
