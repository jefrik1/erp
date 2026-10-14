# BuildERP — Dokumentasi Lengkap

> Bahan Bangunan • Next.js 15 + React 19 + Prisma + ExcelJS + Tailwind 4 • Bahasa UI: Indonesia

Dokumen ini memetakan **setiap file dan setiap part/section di dalamnya** ke fungsinya — contoh: _"part ini untuk Aging Piutang"_ atau _"part ini untuk Grafik Penjualan"_ — sehingga developer baru langsung tahu harus edit di mana.

---

## Daftar Isi
1. [Ringkasan & Stack](#1-ringkasan--stack)
2. [Struktur Folder](#2-struktur-folder)
3. [lib — Inti Bisnis](#3-lib--inti-bisnis)
4. [app — Routing & Layout](#4-app--routing--layout)
5. [components — Design System](#5-components--design-system)
6. [app/features — 7 Fitur Utama (Part-by-Part)](#6-appfeatures--7-fitur-utama-part-by-part)
7. [Alur Data End-to-End](#7-alur-data-end-to-end)
8. [Cara Menambah/Mengubah Fitur](#8-cara-menambahmengubah-fitur)

---

## 1. Ringkasan & Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 15.4.5 App Router |
| UI | React 19, Tailwind CSS 4, Phosphor Icons |
| State | React Context (`lib/store.tsx`) — single source of truth |
| DB | PostgreSQL + Prisma ORM (`prisma/schema.prisma`) |
| Export | ExcelJS (client-side, 6 workbook) |
| Font | Geist Sans + Geist Mono (Google Fonts) |
| Bahasa | `id` — Rupiah `Intl.NumberFormat("id-ID")` |

**Sifat penting:** Semua fitur `app/features/*` adalah `"use client"` dan mengakses data lewat `useStore()` — tidak ada prop drilling.

---

## 2. Struktur Folder

```
erptest/
├─ app/
│  ├─ layout.tsx          # Root HTML + metadata + grain overlay
│  ├─ page.tsx            # App controller (StoreProvider → Shell → Features)
│  ├─ globals.css         # Tailwind + Geist + scrollbar + reveal animation
│  ├─ api/products/route.ts  # GET /api/products (Prisma fallback → lib/data)
│  └─ features/           # 7 modul fitur (lihat §6)
│     ├─ dashboard.tsx    # KPI + grafik + ledger
│     ├─ produk.tsx       # Master produk & stok
│     ├─ penjualan.tsx    # POS & Sales Orders
│     ├─ pembelian.tsx    # Purchase Orders
│     ├─ pelanggan.tsx    # Customers & kontrol kredit
│     ├─ pengiriman.tsx   # Delivery Orders & timbangan
│     ├─ invoice.tsx      # Faktur & PPN 11%
│     └─ overlays.tsx     # Semua modal/dialog
├─ components/
│  ├─ shell.tsx           # Sidebar + Header + Mobile nav
│  ├─ ui.tsx              # Primitives: Card, Badge, Button, TableShell, KpiCard
│  └─ charts.tsx          # AreaChart, BarChart, MiniBars, Donut (SVG murni)
├─ lib/
│  ├─ store.tsx           # Global Context + derived state
│  ├─ data.ts             # Seed / mock DB (10 produk, 5 customer, ledger, SO/PO/DO/INV)
│  ├─ types.ts            # Type domain (Tier, Product, Customer, SO, PO, DO, Invoice)
│  ├─ utils.ts            # cn, rupiah, fmt
│  ├─ engine.ts           # calcPpn, creditCheck, getAutoSellPrice, getBuyPrice
│  ├─ excel.ts            # 6 export ExcelJS
│  └─ prisma.ts           # Prisma singleton
└─ prisma/
   ├─ schema.prisma       # 15 models relational
   └─ seed.ts             # Seed via Prisma
```

---

## 3. lib — Inti Bisnis

### 3.1 `lib/store.tsx` — Global Store (Context)
**Peran:** Satu-satunya penyimpanan state aplikasi. Semua fitur `useStore()` ke sini.

| State | Tipe | Fungsi |
|---|---|---|
| `active` / `setActive` | `NavKey` | Tab aktif: dashboard/produk/pembelian/pelanggan/penjualan/pengiriman/invoice |
| `q` / `setQ` | `string` | Global search — filter SKU/nama/SO/DO/customer di semua tab |
| `products`, `customers`, `soList`, `doList`, `poList`, `invList` | `useState` | Entity mutable — diubah via `setX` |
| `ledger`, `warehouses`, `bins`, `suppliers`, `calcStock` | `const` dari `lib/data` | Read-only (tidak pakai useState) |
| `range` / `setRange` | `RangeKey` | Rentang dashboard: 7HARI/14HARI/30HARI/60HARI/90HARI/YTD |
| `toast` / `showToast` | `string\|null` | Notifikasi auto-hilang 2200ms |
| `custFilter`, `prodCat`, `soStatus`, `poStatus` | `string` | Filter per fitur |
| `newSO`, `newPO`, `addCust` | object | Form POS / PO / tambah pelanggan |
| `weigh {tare:8450,gross:14200}`, `reading` | object/bool | Timbangan digital |
| `overrideOpen`, `pin`, `addProdOpen`, `addCustOpen`, `detailSO`, `detailPO`, `editProd` | bool/object | Kontrol modal (Overlays) |

**Derived (useMemo):**
- `filteredProducts` — filter `q` + `prodCat`
- `filteredCustomers` — filter `custFilter` + `q`
- `filteredSO` — filter `soStatus` + `q`
- `filteredPO` — filter `poStatus` + `q`
- `blockedCustomers` — `creditCheck(c,0,0).blocked`
- `lowStockCount` — `calcStock(p.id) <= minStock`
- `pendingPO` — `status==="Ordered"`
- `overdueInv` — `status==="Overdue"`

### 3.2 `lib/data.ts` — Seed / Mock DB
Data statis yang mensimulasikan PostgreSQL:

| Export | Isi | Catatan |
|---|---|---|
| `warehouses` | `GUD-01 Gudang Pusat Cibitung` | Satu gudang aktif (semua stok terpusat) |
| `bins` | 6 bin: RAK-A1-SEM, RAK-A2-CAT, AREA-PASIR-02, RAK-C4-BESI, RAK-C5-HOLLOW, RAK-C6-WF | Semua `wh1` |
| `suppliers` | 3: Krakatau Steel, Gunung Garuda, Baja Mandiri | |
| `products` | 10 produk: SEM-3R-50, PASIR-COR-M3, BESI-12-SNI, BESI-10, HOLLOW-40, WF-150, WRM-M8, SENG-GEL, CAT-DLX, BATA-MRH | Tiap produk punya `units[]` (factor ke base) + `prices[]` per Tier |
| `customers` | 5 customer: Retail/Proyek/Reseller/Tukang, dengan `creditLimit`, `balance`, `overdueDays`, `isBlocked` | |
| `ledger` | 5 entri StockLedger (PO masuk +, SO keluar -) | Sumber `calcStock()` |
| `salesOrders` | SO-2409-011 Approved, SO-2409-012 Draft | |
| `purchaseOrders` | PO-2026-001 Received, PO-2026-002 Ordered | |
| `deliveryOrders` | DO-2409-011 In Transit (tare/gross/netto), DO-2409-012 Scheduled | |
| `invoices` | INV-2409-011 Unpaid (12jt), INV-2409-008 Overdue (49.9jt) | |
| `calcStock(productId)` | `ledger.filter(productId).reduce(+qty)` | Hitung stok basis |
| `getAutoPrice` | Cari harga tier eksak → fallback | Versi sederhana (tanpa konversi factor) |

### 3.3 `lib/types.ts` — Domain Types
```
Tier = "Retail"|"Tukang"|"Reseller"|"Proyek"
Unit {id, name, factor, isBase, barcode?}
ProductPrice {unitId, tier, price}
Product {id, sku, name, category, isDimension, dimensionUnit?, minStock, buyPrice, units[], prices[]}
Warehouse {id, code, name, address}
Bin {id, warehouseId, code}
LedgerEntry {id, productId, unitId, warehouseId, binId, qty, refType, refId, createdAt}
Customer {id, code, name, type:Tier, phone, npwp, creditLimit, balance, terms, isBlocked, blockedReason?, overdueDays}
Supplier {id, code, name, phone, address}
SOStatus = "Draft"|"Approved"|"Partial"|"Completed"|"Cancelled"
SOItem {productId, unitId, qty, price, subtotal}
SalesOrder {id, soNumber, customerId, salesperson, date, status, items[], total}
POStatus = "Draft"|"Ordered"|"Received"|"Cancelled"
POItem {productId, unitId, qty, price, subtotal}
PurchaseOrder {id, poNumber, supplierId, date, status, items[], total, warehouseId}
DOStatus = "Scheduled"|"Loading"|"In Transit"|"Delivered"
DeliveryOrder {id, doNumber, soId, driver, vehicle, status, tare?, gross?, netto?}
Invoice {id, invNumber, soId, customerId, dpp, dppLain, ppn, total, status:"Unpaid"|"Paid"|"Overdue", dueDate}
```

### 3.4 `lib/utils.ts` — Formatting
- `cn(...classes)` — `twMerge(clsx())` untuk merge Tailwind aman.
- `rupiah(n)` — `Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR"})` → `Rp 12.000.000`.
- `fmt(n)` — `Intl.NumberFormat("id-ID")` → `12.000` (angka biasa).

### 3.5 `lib/engine.ts` — Business Rules (Pure, tanpa side-effect)
| Fungsi | Input → Output | Aturan Bisnis |
|---|---|---|
| `calcPpn(hargaJual)` | `number` → `{dpp, dppLain, ppn, total, efektif:"11%"}` | PMK terbaru: `dppLain=round(11/12*harga)`, `ppn=round(0.12*dppLain)`, `total=harga+ppn` — efektif 11% |
| `creditCheck(customer, newTxn, pendingSO)` | `Customer, number, number` → `{totalRisk, overLimit, overdueBlock, blocked, remaining}` | `totalRisk=balance+newTxn+pendingSO`, `overLimit=totalRisk>creditLimit`, `overdueBlock=overdueDays>7`, `blocked=(overLimit\|\|overdueBlock)\|\|isBlocked` |
| `getAutoSellPrice(product, unitId, tier)` | `Product, string, Tier` → `number` | Cari tier eksak → konversi factor `tierAny.price * (toFactor/fromFactor)` → fallback `buyPrice*factor` |
| `getBuyPrice(product, unitId)` | `Product, string` → `number` | `round(buyPrice * unit.factor)` |

### 3.6 `lib/excel.ts` — Export Excel (Client-side ExcelJS)
Semua export: header tinta (`FF0A0A0F`), garis `FFE4E4E7`, zebra `FFF8FAFC`, Rupiah akuntansi `_("Rp"* #,##0_);`, landscape A4, frozen pane, footer BuildERP + tanggal + GUD-01.

| Fungsi | Sheet | Kolom | File |
|---|---|---|---|
| `exportStokExcel({products, calcStock})` | STOK (tab hijau) | SKU, Nama, Kategori, Stok Base, Satuan Base, Harga Beli, Min Stok, Status, Selisih | `STOK-GUD01-YYYY-MM-DD.xlsx` |
| `exportSalesExcel({soList, customers})` | SALES (tinta) | SO Number, Tanggal, Pelanggan, Kode, Tipe, Total, Status | `SALES-ORDERS-....xlsx` |
| `exportPOExcel({poList, suppliers})` | PURCHASE (biru) | PO Number, Tanggal, Supplier, Kode, Gudang, Total, Status | `PURCHASE-ORDERS-....xlsx` |
| `exportDOExcel({doList, soList})` | DELIVERY (amber) | DO Number, SO Number, Supir, Kendaraan, Netto, Status | `DELIVERY-ORDERS-....xlsx` |
| `exportDJPExcel({invList, customers})` | E-FAKTUR DJP (merah) | INV, SO, Pelanggan, DPP, DPP Lain 11/12, PPN 12%, Total, Status, Jatuh Tempo | `EFAKTUR-DJP-....xlsx` |
| `exportDetailSOExcel({so, customers, products})` | SO-.... | No, Produk, SKU, Qty, Satuan, Harga, Subtotal | `${soNumber}.xlsx` |

### 3.7 `lib/prisma.ts`
Singleton `PrismaClient` — `try require("@prisma/client")` + cache `globalThis.prisma` di dev. Return `null` jika belum generate.

---

## 4. app — Routing & Layout

### `app/layout.tsx` — Root Layout
- `metadata = {title:"BuildERP — Bahan Bangunan", description:"ERP bahan bangunan..."}`.
- `RootLayout({children})` → `<html lang="id"><body class="bg-[#F8FAFC] text-[#334155]">` + `<div class="grain">` (texture) + `{children}` + import `globals.css`.

### `app/page.tsx` — App Controller
```
Page() → StoreProvider → AppInner()
AppInner():
  notifs[] = [
    blockedCustomers → "PELANGGAN TERBLOKIR" (KELOLA KREDIT → setActive("pelanggan")),
    lowStockCount    → "SKU STOK KRITIS" (LIHAT STOK → produk),
    pendingPO        → "PO MENUNGGU TERIMA" (KELOLA PO → pembelian),
    overdueInv       → "FAKTUR OVERDUE" (BUKA INVOICE → invoice)
  ]
  → Shell(active, setActive, q, setQ, notifCount, notifs)
     → toast (fixed bottom-6 right-6)
     → {active==="dashboard" && <DashboardFeature/>}  // 7 kondisional
     → <Overlays/>  // selalu mount
```

### `app/globals.css` — Global Styles
- `@import "tailwindcss"` + `Geist`/`Geist Mono` dari Google Fonts.
- Scrollbar thin `#E2E8F0`, `html/body bg-[#F8FAFC]`.
- `.grain` — fixed overlay `radial-gradient` + SVG `fractalNoise baseFrequency 0.88`.
- `.reveal` — `opacity 0, translateY 12px, 600ms cubic-bezier(0.16,1,0.3,1)` → `.in` trigger via IntersectionObserver.
- `overflow-x: clip` + `img/svg/table max-width 100%` — cegah slider horizontal.
- `text-balance` / `text-pretty`.

### `app/api/products/route.ts`
```ts
GET() → try prisma.product.findMany({include:{units,prices}}) catch → import("@/lib/data").products → NextResponse.json(products)
```

---

## 5. components — Design System

### 5.1 `components/shell.tsx` — App Shell
| Bagian | File | Deskripsi |
|---|---|---|
| **Tipe** | `NavKey` | `"dashboard"\|"produk"\|"pembelian"\|"pelanggan"\|"penjualan"\|"pengiriman"\|"invoice"` |
| **Nav config** | `nav[]` | 7 item: Dashboard(House), Produk(Package), Pembelian(ShoppingBag), Pelanggan(Users), Penjualan(ShoppingCart), Pengiriman(Truck), Invoice(Receipt) |
| **Aside** | `w-[280px] lg:flex sticky` | Logo `BuildERP REV 2.6` + nav buttons (`active → bg-[#334155] text-white`) + Integrasi `Scale Agent Online` + `DJP e-Faktur PJAP` + footer user `Sinta W. Finance Manager` |
| **Header** | `h-[64px] sticky top-0 backdrop-blur` | Search (MagnifyingGlass + Hapus/`/` kbd) + `GUD-01 Gudang Pusat` badge + Bell (`notifCount` bubble + dropdown 360px) + date/time live `Intl.DateTimeFormat id-ID` per detik + hamburger (mobile 2-col grid, sticky `top-[64px]`) |
| **Main** | `flex-1 min-w-0 w-full max-w-none px-4 lg:px-6 xl:px-8` | Render `{children}` — full-width tanpa `max-w-[1400px]` agar tidak ada slider |

### 5.2 `components/ui.tsx` — Primitives
| Komponen | Props | Penjelasan |
|---|---|---|
| `Card` | `className, children` | `bg-white border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden min-w-0` |
| `TableShell` | `toolbar, children, foot` | Container rounded `border` + `toolbar` + `overflow-hidden` (tanpa `overflow-x-auto` — cegah slider). Desktop `hidden md:block` table + mobile `md:hidden` card stack di tiap feature. |
| `TableToolbar` | `icon, title, subtitle, meta, actions` | `px-5 py-4 bg-[#F8FAFC] border-b` — bubble icon `size-9 rounded-[12px]` + title + subtitle + meta badge + actions |
| `Badge` | `tone` | `emerald/amber/red/zinc/blue` — `rounded-full text-xs uppercase border` |
| `Button` | `variant` | `primary bg-[#334155]`, `ghost transparent`, `outline bg-white border` — `active:scale-[0.98]` |
| `IslandButton` | `icon` | Pill dark dengan slot icon |
| `Input` / `Select` | `props` | `h-9 px-3 rounded-[6px] border focus:border-[#334155]` |
| `Label` | `children` | `text-xs font-semibold tracking-wide uppercase` |
| `Eyebrow` | `children` | `rounded-full bg-[#F1F5F9] border text-xs uppercase` |
| `KpiCard` | `label, value, sub, accent, action` | Label + dot, `value text-[22px] font-bold tabular-nums break-all`, `sub`, progress `accent`, slot `action` — dipakai di Dashboard |

### 5.3 `components/charts.tsx` — SVG Charts (tanpa library eksternal)
| Komponen | Props | Part di Dashboard |
|---|---|---|
| `AreaChart` | `data:{label,value}[], color` | **PART: Grafik Penjualan** — Tren penjualan per `range`. `w=640 h=180` viewBox, grid 3 baris `JT`, area `opacity 0.06`, line `1.5px`, hover `onMouseMove` scaling + tooltip `rupiah(hoverVal)` |
| `BarChart` | `data:{label,value}[], color` | **PART: Bar Horizontal** — Kategori produk, Top produk, Piutang, Aging. Bar `h-2 rounded-full` + label `w-[108px]` + nilai `(value/1000)k` |
| `MiniBars` | `data:number[], color` | **PART: Mini Sparkline** — Di KpiCard SKU. `h-[44px]` bars, last bar warna `color`, sisanya `#E2E8F0` |
| `Donut` | `data:{label,value,color}[], size=120` | **PART: Donut Kategori** — Hitung per `category`, arcs `A r r`, center `${count} KAT`, legend + `%` |

---

## 6. app/features — 7 Fitur Utama (Part-by-Part)

### 6.1 `dashboard.tsx` — Dashboard (Pusat Kendali)
**Export:** `DashboardFeature()` — `useStore()` + `useRef` + `IntersectionObserver .reveal`

| Part / Section | Kode | Fungsi |
|---|---|---|
| **PART: Hero — Ringkasan Operasional** | `section` pertama `Eyebrow GUD-01` + `h1 Ringkasan operasional` + `notifs` warning + CTA `POS`/`Buat PO` | Intro dashboard — tampilkan alert terblokir jika ada |
| **PART: Kartu Rentang Waktu** | `div rounded-[16px] bg-[#F1F5F9]` sebelah hero | Select `range` (7HARI→YTD) + 3 stat: Hari ini / Rata-rata / Total SO + tombol Excel sales |
| **PART: Data — pools** | `trendData useMemo` pools per `range` | Sumber grafik: 7HARI 7 poin, 14HARI sin synthetic, 30HARI W1-W4, 60HARI Jul-Sep, 90HARI Jun-Sep, YTD Jan-Sep |
| **PART: POS Preview** | `soQty, selectedCustomer/Product, autoSellPrice, soTotalPreview` | Hitung preview SO → `poolsOverride[akhir] += soTotalPreview*0.35` (grafik ikut live) |
| **PART: 4 KPI Grid (2×2)** | `section auto-rows-fr md:grid-cols-2` | **KPI 1:** `KpiCard Total SKU` + MiniBars + Lihat stok/Excel. **KPI 2:** Piutang berjalan `rupiah(sum balance)` + BarChart aging. **KPI 3:** PO pembelian `poList.length` + progress. **KPI 4:** PPN 11% dark card `0F172A` |
| **PART: Grafik Penjualan** | `Card AreaChart poolsOverride` | AreaChart tren + 3 stat Hari ini/Rata-rata/Total SO di bawahnya |
| **PART: Kategori & Top Produk** | `Card Donut catDonut` + `Card BarChart topProducts` | Donut kategori + 2 stat Stok kritis/Gudang aktif + Top 5 produk penjualan |
| **PART: Aging Piutang** | `Card` 3 item `Lancar / 1-7 hari / >7 hari` + `rupiah(value)` + Detail → pelanggan | Ringkasan piutang per bucket |
| **PART: Ledger Stok Terbaru — GUD-01** | `TableShell` dual: desktop `<table>` + mobile `div stack` | Kolom: Waktu (dot emerald/rose), Produk (SKU badge + nama), Gudang/Bin pill, Qty base (pill emerald `+` / rose `-`), Ref Badge. Tombol Excel stok. |

**Aksi:** `exportStokExcel`, `exportSalesExcel` → `lib/excel.ts`

### 6.2 `produk.tsx` — Produk & Stok Master
| Part | Kode | Fungsi |
|---|---|---|
| **PART: Header** | `h1 Stok presisi per meter.` + search + `prodCat` select + Excel + Tambah | Filter & aksi master |
| **PART: BarChart Stok per Produk** | `BarChart filteredProducts.slice(0,6) sku vs calcStock` | Visual stok basis |
| **PART: Kartu Produk (loop)** | `filteredProducts.map → Card` | SKU mono badge + `isDimension? blue:zinc` + `category` + nama + `Beli/Jual/Min` + stok `fmt(stock)` (merah jika `<=minStock`) + Edit/Hapus + 3 grid: Konversi (factor), Harga bertingkat (tier/unit), Lokasi rak (bins 0-3 + Lihat rak) |
| **PART: Empty** | `Tidak ada produk` | Jika filter kosong |
| **PART: Sidebar — Gudang Aktif** | `Card` warehouses `GUD-01` + Export Excel | Info gudang |
| **PART: Ekspor Rapi** | `Card` img excel | Penjelasan export |

### 6.3 `penjualan.tsx` — POS / Sales Orders
| Part | Kode | Fungsi |
|---|---|---|
| **PART: Helper** | `dlTxt(name,content)` | Download txt (cetak SO) — Blob → anchor |
| **PART: Tren Penjualan** | `trend useMemo` 7 poin statis → `AreaChart` | Grafik tren di atas tabel |
| **PART: Logika POS** | `selectedCustomer → selectedProduct → selectedUnit → autoSellPrice → soQty → soSubtotal → pendingSO → creditCheck` | Inti POS: harga otomatis per tier + validasi kredit |
| **PART: Tabel Sales Orders** | `TableShell` dual desktop/mobile | Kolom: SO (dot + soNumber + date), Pelanggan (nama + code/type), Sales, Total `rupiah`, Status Badge, Aksi Eye/Print/Trash. Empty `Belum ada SO`. |
| **PART: Form POS** | `Card p-6 lg:p-8` — Grid Pelanggan/Produk/Satuan/Qty + 3 metric (Harga otomatis, Qty basis, Subtotal dark) + banner kredit `blocked? FDEBEC Lock : EDF3EC CheckCircle` + `Minta override` / `Siap terbitkan DO` + `Terbitkan SO dan DO` (buat `so{soNumber,customerId,Approved}` + `do{doNumber,soId,Scheduled}`) + Reset qty | Input qty saja — harga jalan otomatis |

### 6.4 `pembelian.tsx` — Purchase Orders (PO → Stok)
| Part | Kode | Fungsi |
|---|---|---|
| **PART: Header** | `h1 Baja datang meteran. Stok otomatis.` + `poStatus` select + Export PO | Filter PO |
| **PART: Logika PO** | `poProduct, poUnit, autoBuyPrice=getBuyPrice, poQty, poSubtotal` | Harga beli otomatis per satuan |
| **PART: Tabel Purchase Orders** | `TableShell` dual | Kolom: PO, Supplier (avatar + code), Gudang `◈ GUD-01`, Total `rupiah`, Status, Aksi Eye/Terima(Ordered→Received)/Trash/Print. GUD-01 hidden di tablet. |
| **PART: BarChart per Supplier** | `BarChart suppliers.map sum total/1000` | Nilai pembelian per supplier |
| **PART: Form Buat PO** | Supplier + Gudang terkunci `[GUD-01]` + Produk (filter Besi & Baja) + Satuan + Qty + Harga beli display + subtotal dark + `Buat PO` (buat `po{Ordered}`) + contoh meteran (1m=6542, 18m, 10 Lonjor=120m ledger) | Qty saja — harga otomatis |

### 6.5 `pelanggan.tsx` — Customers & Kontrol Kredit
| Part | Kode | Fungsi |
|---|---|---|
| **PART: Aging Piutang (atas)** | `piutangAging useMemo` 3 bucket `Lancar/1-7/>7` sum `balance` by `overdueDays` | Data untuk BarChart & Sisa |
| **PART: Header** | `h1 Kredit yang tegas.` + `custFilter` + search + Tambah | Filter pelanggan |
| **PART: Banner Terblokir** | `if blockedCustomers>0` red `FDEBEC` | Alert jika ada terblokir |
| **PART: Tabel Daftar Pelanggan** | `TableShell` dual: desktop 7-col + mobile card stack | Kolom: Pelanggan (avatar initials + code/phone + blockedReason), Tipe/Badge + NET/overdue, Limit `rupiah`, Piutang, Sisa (chip rose/amber/emerald by `sisa`), Status `BLOCKED Lock / Over limit / Approved`, Aksi Eye/Blokir toggle/Trash. Row `!bg-rose-50` jika blocked. |
| **PART: Aging BarChart** | `Card BarChart piutangAging` | Visual aging |
| **PART: Aturan Kredit** | `Card` `Total Risiko = Saldo+TransaksiBaru+SO Belum Invoice` + `Over limit AUTO BLOCK` + `Overdue>7 HARD BLOCK DO` | Penjelasan rules kredit |

### 6.6 `pengiriman.tsx` — Delivery & Weighbridge (Timbangan)
| Part | Kode | Fungsi |
|---|---|---|
| **PART: Header** | `h1 Surat jalan presisi. Timbangan bicara.` + `Scale Agent Online RS232` + Export DO | Intro DO |
| **PART: Helper** | `doReadScale()` | Simulasi RS232: jitter `±80kg`, update `weigh`, toast |
| **PART: Tabel Delivery Orders** | `TableShell` dual | Kolom: DO (dot + doNumber), SO pill, Supir/Kendaraan, Netto pill `fmt+kg` dark, Status `Delivered/In Transit/Loading/Scheduled`, Aksi Next (cycle status) + Printer. |
| **PART: Integrasi Timbangan Digital** | `Card lg:col-7` — 3 gauge Tare/Gross/Netto `gross-tare` + Timbang tare/gross + `WebSocket connected` + Simpan ke DO-2409-011 + Cetak | Weighbridge — Netto otomatis |
| **PART: Proof of Delivery** | `Card lg:col-5` — file input hidden + img POD + Upload POD / Tanda tangan + Tandai delivered | POD foto & signature |

### 6.7 `invoice.tsx` — Invoices & Pajak PPN
| Part | Kode | Fungsi |
|---|---|---|
| **PART: Aging Piutang vs Tertagih** | `aging useMemo` Unpaid/Overdue/Paid(18.2jt) → `BarChart` | Data aging faktur |
| **PART: Header** | `h1 Piutang terkendali. Faktur rapi.` + Export DJP + Kirim PJAP QR | Aksi invoice |
| **PART: Card Aging** | `Card` BarChart aging + img + penjelasan Bayar → Paid | Visual aging invoice |
| **PART: Card PPN 11% Efektif** | Grid `Harga jual 10jt / DPP LN 9.166jt / PPN 1.1jt` + `Total 11.1jt` dark + Download e-Faktur | Infografis PPN — `calcPpn` |
| **PART: Tabel Faktur Penjualan** | `TableShell` dual | Kolom: Invoice (invNumber + Jt dueDate), Pelanggan, DPP, DPP Lain, PPN (amber pill), Total bold, Status, Aksi Bayar(→Paid)/Printer. Mobile 3-stat grid per invoice. |

### 6.8 `overlays.tsx` — Modals Hub (Semua Dialog)
| Part | Trigger | Isi |
|---|---|---|
| **PART: SO Detail** | `detailSO` | Overlay `bg-[#334155]/30 blur` 560px — header soNumber/date/status + X + items `p.name qty*price→subtotal` + total dark + Export Excel + Cetak |
| **PART: PO Detail** | `detailPO` | 520px — items + total dark + Tutup |
| **PART: Add/Edit Product** | `addProdOpen && editProd` | Label Edit/Tambah + fields SKU, Kategori, Nama, buyPrice, minStock → `handleAddProduct` upsert `setProducts` |
| **PART: Add Customer** | `addCustOpen` | Nama, Telepon, Tipe, Limit → `handleAddCustomer` buat `c{code:C-TYP-###, terms 30/14/7}` prepend |
| **PART: Override Finance** | `overrideOpen` | Lock icon + `selectedCustomer.name` + PIN 6-digit `tracking-[0.2em] mono` + Alasan audit + Approve `pin.length===6` → buat SO `Kasir-01 (override)` + DO Scheduled |

---

## 7. Alur Data End-to-End

```
lib/data.ts (seed) + lib/types.ts + lib/engine.ts
        │
        ▼
lib/store.tsx ───── StoreProvider ───── useStore()
        │                                   │
        ├── app/page.tsx ──► Shell (nav, search, notifs)
        │                    │
        │                    └─► Features (7) ──► lib/utils (rupiah/fmt)
        │                                          lib/engine (creditCheck, pricing)
        │                                          lib/excel (export)
        │
        └── app/api/products/route.ts ──► lib/prisma.ts (try Prisma, fallback data.ts)
```

**Siklus Mutasi — Contoh POS:**
1. User pilih `Pelanggan Proyek` + `Besi 12mm Meter` + `qty 24` → `autoSellPrice = getAutoSellPrice(...) = 6542`.
2. `subtotal=24*6542`, `pendingSO=sum Approved SO customer`, `creditCheck → blocked? false` → hijau `Siap terbitkan DO`.
3. Click `Terbitkan SO dan DO` → `setSoList([so,…])` + `setDoList([do,…])` → tabel update + Dashboard `poolsOverride` bump + toast.
4. `Pengiriman` muncul DO `Scheduled` → Next → `Delivered`; timbangan Tare/Gross → Netto `gross-tare` simpan ke DO.
5. `Invoice` `Unpaid→Paid` via `setInvList` → Aging BarChart re-render.
6. Search `q` global — `Shell` input `onSearch→setQ` filter `filteredProducts/SO/Customers/PO` bersamaan.

---

## 8. Cara Menambah/Mengubah Fitur

| Tugas | File yang Diedit |
|---|---|
| Tambah kolom tabel | Feature `*.tsx` — ubah `TableShell` thead + tbody + mobile stack |
| Tambah KPI baru | `dashboard.tsx` — tambah `KpiCard` di grid `md:grid-cols-2` |
| Ubah aturan kredit | `lib/engine.ts` → `creditCheck` + `lib/store.tsx` → `blockedCustomers` |
| Ubah rumus PPN | `lib/engine.ts` → `calcPpn` + `invoice.tsx` → Card PPN + `lib/excel.ts` → DJP |
| Tambah export Excel | `lib/excel.ts` — duplikasi `setupSheetBase` + `downloadWorkbook` |
| Tambah produk/customer | `lib/data.ts` seed atau via modal `overlays.tsx` → `handleAddProduct/Customer` |
| Ubah warna/border | `components/ui.tsx` — `Card`, `Badge`, `Button`, `TableShell` + `app/globals.css` |
| Tambah route baru | `components/shell.tsx` → `NavKey` + `nav[]` + `app/page.tsx` → kondisional render + buat `app/features/namabaru.tsx` |

---

## Lampiran — Path Absolut

```
C:\Users\jefri\Downloads\erptest\lib\store.tsx
C:\Users\jefri\Downloads\erptest\lib\data.ts
C:\Users\jefri\Downloads\erptest\lib\types.ts
C:\Users\jefri\Downloads\erptest\lib\utils.ts
C:\Users\jefri\Downloads\erptest\lib\engine.ts
C:\Users\jefri\Downloads\erptest\lib\excel.ts
C:\Users\jefri\Downloads\erptest\lib\prisma.ts
C:\Users\jefri\Downloads\erptest\app\layout.tsx
C:\Users\jefri\Downloads\erptest\app\page.tsx
C:\Users\jefri\Downloads\erptest\app\globals.css
C:\Users\jefri\Downloads\erptest\app\api\products\route.ts
C:\Users\jefri\Downloads\erptest\components\shell.tsx
C:\Users\jefri\Downloads\erptest\components\ui.tsx
C:\Users\jefri\Downloads\erptest\components\charts.tsx
C:\Users\jefri\Downloads\erptest\app\features\dashboard.tsx
C:\Users\jefri\Downloads\erptest\app\features\produk.tsx
C:\Users\jefri\Downloads\erptest\app\features\penjualan.tsx
C:\Users\jefri\Downloads\erptest\app\features\pembelian.tsx
C:\Users\jefri\Downloads\erptest\app\features\pelanggan.tsx
C:\Users\jefri\Downloads\erptest\app\features\pengiriman.tsx
C:\Users\jefri\Downloads\erptest\app\features\invoice.tsx
C:\Users\jefri\Downloads\erptest\app\features\overlays.tsx
C:\Users\jefri\Downloads\erptest\prisma\schema.prisma
C:\Users\jefri\Downloads\erptest\prisma\seed.ts
```

> **Tips baca:** Cari komentar `PART:` di tiap feature — setiap section sudah diberi label sesuai tabel §6. Untuk perubahan visual global, mulai dari `components/ui.tsx` + `app/globals.css`; untuk logika bisnis, mulai dari `lib/engine.ts` + `lib/store.tsx`.
