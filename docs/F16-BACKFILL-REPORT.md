# F16 — Backfill Pendapatan & PPN Invoice POS Historis

**Status: COMPLETE AND VERIFIED (dengan 1 pengecualian data yang terdokumentasi)**

| Atribut | Nilai |
|---|---|
| Batch | `F16-POS-REVENUE` v1 · `data_backfill_batches#1` · status `DONE` |
| Eksekusi | 30 Okt 2026 · `approved_by: user:jefri (instruksi F16)` · `executed_by: user:1` |
| Invoice | 68 (semua `INV-POS-*`), 0 dibatalkan/void |
| Jurnal dibuat | 68 `POS_SALE` + 1 `SHIFT_REVERSAL` |
| Gagal | 0 |

## 1. Audit (Phase 0)

| Tabel | Peran | Kolom kunci |
|---|---|---|
| `invoices` | dokumen POS (`INV-POS-*`) | `subtotal, discount, tax, total, paid_amount, invoice_date` |
| `invoice_details` | baris produk | `product_id, qty, unit_price` |
| `payments` | pembayaran per invoice | `method, amount, bank_account_id` (NULL untuk POS) |
| `pos_cashier_shifts` | shift kasir | `login_time, logout_time, opening_cash, closing_cash` |
| `journal_entries` / `journal_details` | buku besar | `reference_type, reference_id, reversal_of` |
| `cash_movements` / `bank_accounts` | kas & rekening | `direction, amount, reference_type` |
| `data_backfill_batches` / `_items` | jejak batch (baru, migrasi 027) | status per invoice |

**Alur lama:** POS invoice → `payments` (tanpa jurnal) → tutup shift → `creditCash` (Dr Kas Tunai / Cr Penjualan) **hanya untuk penjualan tunai**, tanpa PPN dan tanpa jejak per invoice.

**Bukti selisih sebelum backfill:** GL Penjualan Rp 318.654.700 = penjualan non-POS Rp 318.071.600 + Rp 583.100 jurnal shift. GL PPN Rp 39.987.876 = PPN non-POS Rp 34.987.876 + Rp 5.000.000 jurnal gaji (salah akun). PPN POS Rp 35.488.420 **tidak ada sama sekali** → selisih P1 Rp 30.488.420 (angka register "Rp 30,5 jt" = PPN POS dikurangi Rp 5 jt jurnal gaji yang salah akun).

## 2. Klasifikasi (Phase 1)

| Kelas | Jumlah | Keterangan |
|---|---|---|
| A — sudah terjurnal | 0 | tidak ada jurnal `POS_SALE` sebelum backfill |
| B — pendapatan ada, PPN hilang | 0 | pendapatan shift bukan per-invoice |
| C — PPN ada, pendapatan hilang | 0 | — |
| D — keduanya hilang | **68** | diposting |
| E — sebagian | 0 | — |
| F — tidak valid | 0 | tidak ada invoice void/batal |

## 3. Desain akuntansi (Phase 3)

Per invoice (semua lewat `postJournal`, satu transaksi per invoice):

```
Dr 1-1010 Kas Tunai        (pembayaran metode CASH)
Dr 1-1020 Bank             (TRANSFER / QRIS / CARD)
Dr 1-1100 Piutang          (sisa tagihan, bila ada)
   Cr 4-1000 Penjualan     (subtotal − diskon)
   Cr 2-1100 Hutang PPN    (PPN 11% sesuai nilai invoice)
   Cr 2-1400 Uang Muka Pelanggan (hanya bila pembayaran > total)
```

Jurnal pembalik (hanya bila jurnal shift terbukti menduplikasi invoice):

```
Dr 4-1000 Penjualan  ·  Cr 1-1010 Kas Tunai     (reversal_of = jurnal shift)
```

Sisi kas/bank: setiap `payments` POS dicatat ke `cash_movements` (`reference_type='PAYMENT'`, `source='POS_BACKFILL'`) dan menambah `bank_accounts.balance` — CASH → Kas Tunai (id 233), non-tunai → BCA (id 231, asumsi karena `payments.bank_account_id` NULL untuk semua POS). Pembayaran tunai pada shift yang sudah menyetor kas (creditCash) dilewati agar tidak dobel.

## 4. Hasil eksekusi (Phase 6)

| Metrik | Nilai |
|---|---:|
| Total invoice (68) | Rp 358.110.420 |
| Dasar pengenaan pajak (net) | Rp 322.622.000 |
| PPN keluaran | Rp 35.488.420 |
| Settlement (kas + bank + piutang) | Rp 358.399.020 |
| Kelebihan bayar → uang muka pelanggan | Rp 288.600 |
| Jurnal pembalik shift | 1 · Rp 88.800 |

**Setelah eksekusi** (`npm run recon:gl`): PPN GL **Rp 70.476.296 = PPN invoice Rp 70.476.296 (OK)**; Penjualan GL Rp 641.187.900; neraca saldo **D = K = Rp 27.561.583.680,46**; GL Persediaan tetap = nilai stok Rp 20.000.344.583,70; AP OK.

## 5. Idempotensi & konkurensi (Phase 4)

- Unique index `ux_journal_pos_sale_invoice` (satu jurnal `POS_SALE` per invoice) — eksekusi ulang tidak menambah jurnal.
- `ux_backfill_item` per (batch, entity) + cek `cash_movements` per `payment.id`.
- Pembalik shift dijaga `reversal_of` (satu pembalik per jurnal asal).
- Satu transaksi per invoice → kegagalan sebagian tercatat `FAILED` di `data_backfill_items`, tidak menandai batch selesai.
- Eksekusi ulang setelah sukses: dry-run melaporkan **A = 68, D = 0, pembalik = 0** (terbukti idempoten).

## 6. Pengecualian yang tidak diotomatiskan (Phase 8)

| # | Temuan | Nilai | Rekomendasi |
|---|---|---:|---|
| X1 | 3 jurnal tutup shift mengakui pendapatan **tanpa invoice pendukung** (JE #39, #42, #44) | Rp 494.300 | Keputusan manajemen: pembalik jurnal (pendapatan tidak berdokumen) atau terbitkan invoice susulan. Tidak dibalik otomatis karena kas fisik benar-benar ada di laci saat tutup shift |
| X2 | `INV-POS-1790920329216` dibayar **dua kali** (CASH Rp 288.600 + TRANSFER Rp 288.600 untuk total Rp 288.600) | Rp 288.600 | Refund/void pembayaran ganda; kelebihan sudah dicatat sebagai Uang Muka Pelanggan (2-1400) |
| X3 | Selisih AR GL vs subledger setelah backfill | Rp 288.600 | Berasal dari X2 (pembayaran ganda); hilang setelah refund/void |
| X4 | Selisih kas GL vs master rekening | Rp 300.000 | Kas awal tunai (sudah ada sebelum F16) |
| X5 | GR/IR sisa | Rp 1.430.000 | 1 GRN bernilai berubah setelah dijurnal |
| X6 | Jurnal gaji #47 mengkredit `2-1100` untuk PPh 21 | Rp 5.000.000 | **Diperbaiki**: reklas `RECLASS` ke `2-1210 Hutang PPh 21`; `hr/routes.js` kini memakai `2-1210` |

## 7. Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `migrations/027_data_backfill_ledger.sql` | tabel batch/items + unique index jurnal POS |
| `migrations/028_customer_overpayment_account.sql` | akun `2-1400 Uang Muka Pelanggan` |
| `src/lib/journal.js` | dukungan `reversalOf` / `reversalReason`; retry deadlock `withTx` |
| `src/modules/finance/recon-center-routes.js` | cek AR mencakup invoice POS |
| `src/modules/hr/routes.js` | PPh 21 → `2-1210` (bukan `2-1100`) |
| `scripts/f16-pos-backfill.mjs` | orkestrator dry-run/apply + laporan |
| `package.json` | `f16:dry`, `f16:apply` |

## 8. Cara verifikasi ulang

```bash
npm run f16:dry      # harus: A=68, D=0, pembalik=0  (idempoten)
npm run recon:gl     # PPN & AR/AP/Persediaan sejajar subledger
npm run verify:golive
npm test
```

> Catatan kejujuran: F16 **tidak** menandai seluruh sistem bebas selisih. Lima pos P2 di §6 tetap terbuka
> dan terdaftar; tidak ada angka yang dipaksakan agar laporan tampak seimbang.
