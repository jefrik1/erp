# STATUS.generated.md

> **Dihasilkan otomatis** oleh `npm run status:report` — jangan diedit tangan.
> Waktu: 2026-10-30 20:54:01 WIB · commit: `3e35fcb`

## Ringkasan gerbang

| Gerbang | Hasil |
|---|---|
| `npm test` | LULUS · pass 40 · fail 0 (1484 ms) |
| `npm run audit:data` | LULUS · P1 = 0 |
| `npm run recon:gl` | LULUS · P1 0 · P2 3 |
| `npm run verify:golive` | LULUS · 16/21 lulus · 0 FAIL · 5 WARN |
| `verify:golive --profile=production` | GAGAL · 5 FAIL · 0 WARN |

**Verdict go-live:** BELUM SIAP (profil produksi)

## Rekonsiliasi keuangan

| Cek | Status | GL | Subledger | Selisih |
|---|---|---:|---:|---:|
| Piutang Usaha (1-1100) vs sisa tagihan invoice | OK | 270.746.236 | 270.746.236 | 0 |
| Hutang Usaha (2-1000) vs invoice pemasok − pembayaran | OK | -3.075.600 | -3.075.600 | 0 |
| GR/IR (2-1150) vs nilai barang diterima − invoice pemasok | P2 | 3.005.000 | 1.575.000 | 0 |
| Persediaan (1-1200) vs nilai stok fisik | OK | 20.000.344.583,7 | 20.000.344.583,7 | 0 |
| Kas & Bank (1-1000/1010/1020) vs saldo rekening | P2 | 1.613.867.460 | 1.613.567.460 | 0 |
| Hutang PPN (2-1100) vs PPN keluaran invoice | OK | 70.476.296 | 70.476.296 | 0 |
| Integritas jurnal (tanpa baris / tidak balance / duplikat) | P2 | 0 | 0 | 0 |
| Jurnal menunjuk dokumen yang tidak ada | OK | 0 | 0 | 0 |

## Item yang belum lulus

- **FAIL (produksi)** NODE_ENV=production — development
- **FAIL (produksi)** ALLOWED_ORIGINS diisi — kosong
- **FAIL (produksi)** Tidak ada akun demo aktif — 6 akun demo masih aktif
- **FAIL (produksi)** Tidak ada referensi jurnal ganda — 2 pasang
- **FAIL (produksi)** Semua GRN sudah berjurnal — 2 GRN

## Rekonsiliasi P2 terbuka

- GR/IR (2-1150) vs nilai barang diterima − invoice pemasok — selisih 0 (10 GRN senilai Rp 1.014.425.000, baru 9 GRN yang punya jurnal.)
- Kas & Bank (1-1000/1010/1020) vs saldo rekening — selisih 0
- Integritas jurnal (tanpa baris / tidak balance / duplikat) — selisih 0

## Cara mereproduksi

```bash
npm run status:report
```
