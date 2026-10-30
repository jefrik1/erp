# Audit & Status Transformasi ERP — Sumber Material Jaya

> Dokumen bukti untuk master prompt §30 (Final Deliverables). Setiap status disertai bukti yang
> bisa dijalankan ulang. Dokumen ini **tidak** mengklaim produksi siap tanpa bukti.
>
> Terakhir diperbarui: **30 Oktober 2026** · Basis: `erp-material v1.0.0`
>
> ⚠️ **Status otoritatif = [`docs/STATUS.generated.md`](STATUS.generated.md)** yang dihasilkan
> `npm run status:report`. Tabel di bawah adalah catatan historis/analitis, bukan gerbang.
> Laporan per fase: [`PHASE-0-1-REPORT.md`](PHASE-0-1-REPORT.md), [`F16-BACKFILL-REPORT.md`](F16-BACKFILL-REPORT.md).

## 1. Cara memverifikasi ulang (satu perintah per area)

```bash
cd /e/erptest
npm test                 # 40 test API/RBAC/guard (butuh backend :4000 hidup)
npm run audit:data       # kualitas data persediaan — target P1 = 0
npm run recon:gl         # rekonsiliasi GL vs subledger — exit 1 bila ada P1
npm run verify:golive    # 21 invarian pra-peluncuran — exit 1 bila ada FAIL kritis
npm run golive:prod      # profil produksi: keamanan/infra jadi WAJIB
npm run status:report    # regenerasi docs/STATUS.generated.md (satu sumber kebenaran status)
docker logs --tail 30 erp_backend   # pastikan migrasi 0NN "done" & tanpa error
```

## 2. Hasil audit (Phase 0) — temuan & status

| # | Temuan | Akar masalah | Dampak | Status | Bukti |
|---|---|---|---|---|---|
| F1 | Stok `PAS-001` −83.108,4 (nilai −Rp 20,7 M) | data awal/impor tanpa kartu stok | nilai persediaan negatif di laporan | **SELESAI** — opname `OPN-20261030-004` | `audit:data` stok minus 0 |
| F2 | Banyak baris ber-HPP 0 (margin ~100%) | transfer lama menulis `avg_cost=0` | margin menyesatkan | **SELESAI** — `OP-20261030-0001` + transfer kini membawa HPP | `audit:data` HPP 0 = 0 |
| F3 | Baris stok kembar (batch + non-batch) | opname lama tidak melebur baris | total stok ≠ hasil hitung | **SELESAI** — opname melebur baris | `audit:data` kembar 0 |
| F4 | 21 baris harga jual tidak wajar (Rp 12 jt–250 jt/sak) | nilai total masuk kolom harga satuan | pendapatan & PPN salah | **SELESAI** — `repair-ledger` HARGA_INVOICE + penjaga harga baru | `audit:data` harga aneh 0 |
| F5 | 27 jurnal invoice tanpa baris | route invoice menulis header jurnal langsung | buku besar tidak terpengaruh | **SELESAI** — `postJournal` + `JURNAL_INVOICE` | recon JOURNALS tanpa_baris 0 |
| F6 | GL Persediaan (−Rp 687 rb) ≠ nilai stok (Rp 20 M) | tidak ada kapitalisasi awal | neraca salah | **SELESAI** — `KAPITALISASI` | recon INVENTORY selisih 0 |
| F7 | Hutang Usaha bersaldo debit Rp 1,13 M | GRN & invoice pemasok historis tidak dijurnal | liabilitas negatif | **SELESAI** — `JURNAL_GRN_PINV` (10 GRN + 5 PINV) | recon AP selisih 0 |
| F8 | Kas GL ≠ saldo rekening (Rp 84 jt) | penerimaan AR tidak menulis `cash_movements` | saldo kas master salah | **SELESAI** — `KAS_AR` (103 penerimaan) | recon CASH selisih Rp 300 rb |
| F9 | 10 baris stok tanpa kartu stok | data awal | jejak audit bolong | **SELESAI** — `KARTU_STOK_AWAL` | `audit:data` kartu stok 0 |
| F10 | Pendapatan POS hanya diakui saat tutup shift (dan hanya tunai) | route checkout tidak menjurnal pendapatan | PPN & penjualan POS non-tunai tidak masuk GL | **SELESAI (kode)** — checkout kini Dr Kas/Bank + Dr Piutang / Cr Penjualan + Cr PPN; tutup shift tidak lagi mengakui pendapatan. **Data historis POS belum dibukukan** (lihat F16) | uji checkout: Dr 1-1010 6.216 / Cr 4-1000 5.600 / Cr 2-1100 616 |
| F11 | Tidak ada rekonsiliasi GL vs subledger | belum ada alatnya | selisih tidak terdeteksi | **SELESAI** — `/api/finance/recon-center` + `npm run recon:gl` | 8 cek, 5 OK |
| F12 | Deadlock & migrasi paralel berisiko | `withTx` tanpa retry; migrasi tanpa lock | transaksi gagal / migrasi ganda | **SELESAI** — retry 40P01/40001 + `pg_advisory_lock(948271)` | kode `src/lib/journal.js`, `src/index.js` |
| F13 | Tidak ada gerbang go-live | belum ada pre-flight | klaim siap tanpa bukti | **SELESAI** — `npm run verify:golive` (21 cek) | 16/21 lulus, 0 FAIL kritis |
| F14 | Penjualan `BJR-C75` di bawah HPP (−21,3%) | harga jual < harga beli | rugi tiap transaksi | **TERBUKA (P2)** — keputusan harga | `audit:data` JUAL_DI_BAWAH_HPP 3 |
| F15 | 2 referensi jurnal ganda | perbaikan berulang | laporan ganda | **TERBUKA (P2)** | `verify:golive` WARN |
| F16 | Invoice POS historis (68) belum berjurnal | pendapatan lama hanya lewat tutup shift | PPN GL kurang Rp 30,49 jt | **SELESAI** — batch `F16-POS-REVENUE`: 68 jurnal + 1 pembalik, PPN GL kini = PPN invoice | `npm run f16:dry` → A=68; `recon:gl` TAX OK · lihat `docs/F16-BACKFILL-REPORT.md` |
| F17 | GR/IR sisa Rp 1,43 jt | nilai 1 GRN berubah setelah dijurnal | kecil, tidak material | **TERBUKA (P2)** | recon GRIR |
| F18 | Akun demo masih aktif & `NODE_ENV=development` | belum go-live | risiko keamanan | **TERBUKA (P0 produksi)** | `verify:golive` WARN |

## 3. Status per pilar master prompt

| Pilar | Status | Bukti / catatan |
|---|---|---|
| §4.1 Pusat rekonsiliasi | **COMPLETE AND VERIFIED** | `recon-center` 8 cek + drilldown + CLI |
| §4.2 AP (3-way, aging, dsb.) | **PARTIALLY** — 3-way match & GR/IR ada; aging/payment scheduling belum | `GET /purchase/three-way` |
| §4.3 AR (aging, write-off, dsb.) | **PARTIALLY** — aging ada di laporan; write-off/dispute belum | `/reports/aging-ar` |
| §4.4 POS ke GL | **COMPLETE AND VERIFIED** | checkout menjurnal pendapatan+PPN; 68 invoice historis di-backfill; tutup shift tidak lagi mengakui pendapatan |
| §4.5 Laporan keuangan | **PARTIALLY** — TB & P&L ada; Neraca, Arus Kas, Perubahan Ekuitas belum | `/finance/trial-balance`, `/finance/profit-loss` |
| §4.6 Treasury | **NOT IMPLEMENTED** (kas/bank & setor ada, forecast belum) | — |
| §4.7 Profitabilitas | **PARTIALLY** — margin per produk; per pelanggan/sales/branch belum | `/reports/product-margin` |
| §5.1–5.3 Keamanan | **PARTIALLY** — JWT+MFA+lockout+rate limit+helmet+TLS; rotasi sesi/SSO belum | `verify:golive` |
| §5.4 Backup/DR | **PARTIALLY** — backup harian + skrip restore; off-site/PITR belum | `scripts/backup-db.sh` |
| §6 WMS (bin, putaway, picking) | **PARTIALLY** — `bin_locations` ada, alur putaway/pick belum | — |
| §7 Procurement intelligence | **PARTIALLY** — RFQ & perbandingan ada; scorecard/EOQ belum | `/purchase/rfqs` |
| §8 Baja (traceability, cutting, WIP, QC) | **PARTIALLY** — spesifikasi SNI, cutting order, remnant, catch-weight, weighbridge; MTC & WIP costing belum | `migrations/027`, `scale-routes` |
| §9 Sales & distribution | **PARTIALLY** — SO/DO/parsial belum, portal B2B belum | — |
| §10 CRM & kredit | **PARTIALLY** — hold, janji bayar, dunning; risk scoring belum | `/credit/*` |
| §11 Pajak | **PARTIALLY** — PPN 11% hardcode → perlu engine bertanggal; e-Faktur nomor ada | `/tax` |
| §12 Project cost | **PARTIALLY** — termin, RAB, surplus; progress billing & retensi belum | `/projects/*` |
| §13 Logistik & fleet | **PARTIALLY** — armada, trip, ODOL dasar, weighbridge; GPS & BBM belum | `/fleet/*` |
| §14 HR & payroll | **PARTIALLY** — absensi geofence, cuti, payroll + jurnal; PPh21 TER & BPJS belum | `/hr/*` |
| §15 QMS | **NOT IMPLEMENTED** | — |
| §16 DMS | **NOT IMPLEMENTED** (lampiran tersebar) | — |
| §17 Approval engine | **PARTIALLY** — matriks 1 level + delegasi; multi-tahap SLA belum | `/approvals` |
| §18 BI | **PARTIALLY** — dashboard KPI & tren; forecasting/ABC belum | `/dashboard/*` |
| §19 Multi-company | **NOT IMPLEMENTED** (tabel `companies` ada) | — |
| §20 Automation engine | **NOT IMPLEMENTED** (outbox notifikasi ada) | — |
| §21 AI assistant | **NOT IMPLEMENTED** | — |
| §22 Integration layer | **PARTIALLY** — webhook pembayaran belum; notifikasi outbox ada | — |
| §23 Data governance | **NOT IMPLEMENTED** | — |
| §24 Usability | **PARTIALLY** — search global, notifikasi, ekspor; import center belum | — |
| §25 Arsitektur & performa | **PARTIALLY** — transaksi, retry, advisory lock, pool; benchmark formal belum | `scripts/load-test.mjs` |
| §26 Testing | **PARTIALLY** — 40 test API/RBAC/guard; unit test kalkulasi & E2E belum | `npm test` |
| §27 Kriteria siap produksi | **BELUM** — 5 WARN di `verify:golive` (demo, NODE_ENV, CORS, ref ganda, GRN) | `verify:golive` |
| §28 Urutan implementasi | Phase 0–3 sebagian besar selesai; Phase 4–5 belum | §9.4 FITUR-LENGKAP |
| §29 Aturan eksekusi | **DIPATUHI** — semua perubahan lewat migrasi idempoten, `mutateStock`, `postJournal`, RBAC, audit | — |
| §30 Deliverables | Dokumen ini + FITUR-LENGKAP + PRODUCTION-CHECKLIST | — |

## 4. Laporan pengujian (ringkas)

| Kelompok | Jumlah | Hasil |
|---|---|---|
| Test API & RBAC (`tests/*.test.js`) | 41 | **40 lulus, 1 dilewati (opt-in)** |
| Uji langsung penjaga stok & harga | 3 skenario | 422 `INSUFFICIENT_STOCK`, `PRICE_OUTLIER_DETECTED`, `PRICE_BELOW_LIMIT` |
| Uji jembatan timbang & toleransi SNI | 5 skenario | ingest, bind, bind ganda, hold 422, drop-ship tanpa stok |
| Uji POS ke GL | 1 skenario | Dr Kas 6.216 / Cr Penjualan 5.600 / Cr PPN 616, TB seimbang |
| Rekonsiliasi keuangan | 8 cek | AR/AP/Persediaan OK; GRIR/CASH/JOURNALS P2; TAX P1 |
| Pre-flight go-live | 21 cek | 16 lulus, 0 FAIL kritis, 5 WARN |

## 5. Outstanding Issues Register (urut prioritas)

1. **F18 (P0 produksi)** — nonaktifkan akun demo, `NODE_ENV=production`, `ALLOWED_ORIGINS` domain asli, sertifikat TLS asli.
2. **F14 (P2)** — keputusan harga `BJR-C75`.
3. **F15/F17 (P2)** — bersihkan 2 referensi jurnal ganda, selisih GR/IR Rp 1,43 jt.
4. **Phase 4–5** — WMS penuh, procurement intelligence, QMS, DMS, BI lanjutan, multi-company, portal B2B, integrasi bank/Coretax/marketplace, AI assistant.

## 6. Perubahan besar (changelog ringkas)

| Tanggal | Perubahan |
|---|---|
| 30 Okt 2026 | Perbaikan data persediaan (opname, HPP, baris kembar) + `audit:data`, `fix:data` |
| 30 Okt 2026 | Remediasi buku besar (`repair-ledger`: harga invoice, jurnal invoice, kartu stok awal, kas awal, kapitalisasi) |
| 30 Okt 2026 | `mutateStock`, penjaga harga, GR/IR + PPV, COGS di DO/POS, retur/waste/konsinyasi, immutable ledger, jurnal pembalik |
| 30 Okt 2026 | Phase 2: catch-weight & toleransi SNI, weighbridge, drop-ship, FEFO |
| 30 Okt 2026 | Pusat rekonsiliasi + `recon:gl`, jurnal GRN/PINV historis, kas AR, POS revenue at checkout, retry deadlock, advisory lock, `verify:golive` |
| 30 Okt 2026 | **F16**: backfill 68 invoice POS (net Rp 322,6 jt · PPN Rp 35,5 jt) + 1 jurnal pembalik shift, tabel batch `data_backfill_*`, akun `2-1400`, reklas PPh 21 payroll ke `2-1210` |

---

*Aturan: jangan menandai fitur selesai tanpa menjalankan bukti di §1. Bila sebuah fitur belum
lengkap, tulis apa adanya di §3 dan §5.*
