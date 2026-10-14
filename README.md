# ERP Material Bangunan — PRD v1.1 Addendum

ERP terintegrasi untuk distributor & toko material (semen, besi beton, pasir, batu bata, keramik, cat, pipa). 

**Addendum v1.1 (Fitur Wajib Tambahan):**
- Konsinyasi (In & Out)
- Proyek & Tender
- Manajemen Susut, Pecah & Waste
- Landed Cost & Import
- Price List Bertingkat & Pricing Engine
- Retur & Klaim Berjenjang
- Manajemen Armada & Biaya Angkut
- Kontrol Piutang (Credit limit/Hold/Reminder)
- Poin Loyalty
- Aset Tetap & Maintenance
- Approval Mobile & e-Signature
- Kalkulator Material Customer
- Integrasi Marketplace
- Audit Trail & GRC

**Semua di satu folder** `C:\Users\jefri\Downloads\erptest` tanpa sub-folder `backend`/`frontend` terpisah.

---

## 1. Fitur PRD

| Modul PRD | Status |
|-----------|--------|
| 4.1 Dashboard & Analytics | ✅ KPI, tren 14 hari, top produk/customer, margin, notifikasi stok kritis/PO overdue/overdue |
| 4.2 Finance & Accounting | ✅ COA 9 akun, jurnal auto/manual, AR/AP aging, cash & bank 2 rekening, trial balance, L/R, PPN 11% |
| 4.3 Sales & CRM | ✅ SO approval diskon >10% → Direktur, cek stok real-time, limit kredit |
| 4.4 Purchase | ✅ PO bertingkat (<10jt Sup → 10-50jt Mgr → >50jt Direktur), GRN, 3-way match |
| 4.5 Inventory | ✅ Multi-gudang 4, multi-satuan SAK/TON/M3/BTG/DUS/KG/LTR, FIFO/AVG, kartu stok, transfer in-transit, reorder point, bin |
| 4.6 Logistics | ✅ DO partial, armada 3, IN_TRANSIT → DELIVERED, POD |
| 4.7 HR & Payroll | ✅ 8 karyawan, attendance, leave, payroll BPJS/PPh21 per periode |
| 4.8 POS | ✅ Scan barcode, CASH/TRANSFER/CARD/QRIS, <30 detik |
| 4.9 Reporting & BI | ✅ Sales/produk/customer, kartu stok, aging AR, margin, 8 laporan wajib, export |
| 4.10 Master & Admin | ✅ RBAC 7 role, audit_logs, multi-cabang/company |
| Workflow 5.1-5.4 | ✅ Sales→Cash, Procure→Pay, Inventory, Approval Matrix |

ERD 7.2: 31 tabel, index performa. UI 6.2: `Primary #1E40AF`, `Secondary #F59E0B`, Inter 14px, spacing 4px.

---

## 2. Struktur — Satu Folder Saja

```
C:\Users\jefri\Downloads\erptest\
├─ docker-compose.yml      # Postgres 16 + Redis 7 + backend (Express) + frontend (Nginx)
├─ Dockerfile              # backend — Node 20, npm install, node src/index.js
├─ Dockerfile.frontend     # frontend — Node build → Nginx
├─ Dockerfile.backend      # alias Dockerfile (dipakai compose service backend)
├─ package.json            # merged deps backend+frontend, type: module
├─ vite.config.js          # Vite + React
├─ tailwind.config.js
├─ postcss.config.js
├─ index.html              # entry Vite
├─ nginx.conf              # proxy /api/ → http://backend:4000
├─ .env                    # DATABASE_URL, JWT_SECRET, REDIS_URL, PORT
├─ .env.example
├─ migrations\
│  └─ 001_init.sql         # ERD + seed (31 tabel, 12 produk, 5 customer, 4 supplier, 8 karyawan)
└─ src\
   ├─ index.js             # Express entry, JWT, RBAC, seed password
   ├─ config\db.js
   ├─ middleware\auth.js
   ├─ utils\helpers.js
   ├─ lib\api.js           # axios
   ├─ store\auth.js        # zustand
   ├─ components\Layout.jsx
   ├─ pages\{Login,Dashboard,MasterProducts,MasterCustomers,MasterSuppliers,SalesOrders,SalesOrderForm,SalesInvoices,POS,PurchaseOrders,PurchaseReceipts,InventoryStocks,InventoryMovements,InventoryTransfers,FinanceCOA,FinanceJournals,FinanceARAP,Logistics,HR,CRM,Reports,Settings}.jsx
   ├─ modules\{auth,dashboard,master,sales,purchase,inventory,finance,logistics,hr,crm,reporting}\routes.js
   ├─ App.jsx
   ├─ main.jsx
   └─ index.css
```

> Tidak ada `C:\Users\jefri\Downloads\erptest\backend\` atau `frontend\` lagi — semua sudah di-root. `src\` berisi **backend + frontend** bersama.

---

## 3. Prasyarat

- Windows 10/11, PowerShell 5+
- **Docker Desktop** (include Compose v2) — https://www.docker.com/products/docker-desktop/
- Port: `4000` API, `5174` Web, `5434` Postgres, `6380` Redis (dipilih agar tidak tabrakan dengan project lain di 5432/5173/6379)
- Tanpa Docker: Node.js 20+ dan PostgreSQL 16 + Redis 7

```powershell
node -v; docker --version; docker compose version
```

---

## 4. Setup Cepat (Docker — Direkomendasikan)

> Semua perintah dari `C:\Users\jefri\Downloads\erptest`

### 4.1 Siapkan Env (opsional)
```powershell
cd C:\Users\jefri\Downloads\erptest
Copy-Item .env.example .env -Force   # sudah ada default, edit jika perlu
# isi .env:
# DATABASE_URL=postgres://erp:erp_secret@postgres:5432/erp_db  # host=postgres di dalam compose
# JWT_SECRET=erp_jwt_super_secret_2024
# REDIS_URL=redis://redis:6379
# PORT=4000
```

### 4.2 Build & Jalankan
```powershell
docker compose up --build -d

# tunggu healthy ±15 detik
docker compose ps
docker logs erp_postgres --tail 20
docker logs erp_backend --tail 30
```

Sukses jika:
```
erp_postgres  Up (healthy)  0.0.0.0:5434->5432
erp_redis     Up            0.0.0.0:6380->6379
erp_backend   Up            0.0.0.0:4000->4000  ERP Backend running on 4000 / DB products count 12
erp_frontend  Up            0.0.0.0:5174->80
```

### 4.3 Buka Aplikasi
- **Web:** http://localhost:5174
- **API:** http://localhost:4000/api/health → `{"status":"ok"}`
- **Login API:** `POST http://localhost:4000/api/auth/login` body `{"username":"admin","password":"admin123"}`

### 4.4 Akun Seed
| Username | Password   | Role      |
|----------|------------|-----------|
| admin    | admin123   | direktur (full) |
| finance  | finance123 | finance |
| sales    | sales123   | sales |
| gudang   | gudang123  | warehouse |

### 4.5 Uji Cepat
```powershell
Invoke-RestMethod http://localhost:4000/api/health
$login = Invoke-RestMethod -Uri http://localhost:4000/api/auth/login -Method POST -Body (@{username="admin";password="admin123"}|ConvertTo-Json) -ContentType "application/json"
$token = $login.token
Invoke-RestMethod -Uri http://localhost:4000/api/dashboard/kpi -Headers @{Authorization="Bearer $token"}
# buat SO
$so = @{customer_id=2;discount=0;items=@(@{product_id=1;qty=2;unit_price=65000})}|ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri http://localhost:4000/api/sales/orders -Method POST -Headers @{Authorization="Bearer $token"} -Body $so -ContentType "application/json"
Invoke-WebRequest http://localhost:5174/ -UseBasicParsing | Select-Object StatusCode
```

### 4.6 Perintah Harian
```powershell
docker compose logs -f backend
docker compose ps
docker compose down              # stop tanpa hapus data
docker compose down -v           # stop + hapus data DB (reset seed)
docker compose up --build -d     # rebuild setelah ubah kode
```

---

## 5. Setup Tanpa Docker

```powershell
# 1. DB manual
psql -U postgres -c "CREATE USER erp WITH PASSWORD 'erp_secret';"
psql -U postgres -c "CREATE DATABASE erp_db OWNER erp;"
psql -U erp -d erp_db -f migrations\001_init.sql

# 2. Backend + Frontend (satu package.json)
npm install
# .env: DATABASE_URL=postgres://erp:erp_secret@localhost:5432/erp_db (atau 5434 jika docker postgres masih jalan)
npm run dev:backend   # API http://localhost:4000
# terminal baru:
npm run dev           # Vite http://localhost:5173
```

Scripts: `npm start` (backend prod), `npm run dev:backend` (--watch), `npm run dev` (vite), `npm run build` (vite build).

---

## 6. Konfigurasi

**`.env`** (backend):
```
DATABASE_URL=postgres://erp:erp_secret@postgres:5432/erp_db
JWT_SECRET=erp_jwt_super_secret_2024
JWT_REFRESH_SECRET=erp_refresh_secret_2024
REDIS_URL=redis://redis:6379
PORT=4000
```
Frontend pakai `VITE_API_URL` (default `/api` via nginx proxy).

Ganti port di `docker-compose.yml` jika tabrakan:
```yaml
services:
  postgres: { ports: ["5434:5432"] }
  backend:  { ports: ["4000:4000"] }
  frontend: { ports: ["5174:80"] }
```

---

## 7. Workflow Bisnis

**Sales→Cash:** `sales` buat SO → diskon >10% PENDING butuh `admin` approve → Logistik buat DO (IN_TRANSIT) → stok berkurang → Invoice auto-jurnal → Bayar (PARTIAL/PAID).

**Procure→Pay:** Buat PO → >50jt PENDING butuh Direktur → Approve → GRN Terima Barang → stok bertambah, PO RECEIVED, kartu stok IN.

**Inventory:** Stok kritis → notifikasi → auto-PR, Transfer antar-gudang → IN_TRANSIT → Received.

**Finance:** COA → Jurnal manual (debit=kredit wajib), AR/AP aging bucket Current/1-30/31-60/>60, Trial Balance, L/R.

---

## 8. API Ringkas

Base `http://localhost:4000/api` — semua butuh `Authorization: Bearer <token>` kecuali `/auth/login` & `/health`.

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | /auth/login | Login |
| GET | /dashboard/kpi, /dashboard/sales-trend, /dashboard/top-products | KPI & chart |
| GET | /master/products, /master/customers, /master/suppliers | Master + stok |
| POST | /master/products | Tambah produk |
| GET/POST | /sales/orders | List/buat SO |
| POST | /sales/orders/:id/approve | Approve |
| POST | /sales/deliveries | Buat DO |
| GET/POST | /sales/invoices, POST /sales/invoices/:id/pay | Invoice & bayar |
| POST | /sales/pos | POS |
| GET/POST | /purchase/orders, POST /purchase/receipts | PO & GRN |
| GET | /inventory/stocks, /inventory/movements | Stok & kartu stok |
| POST | /inventory/transfers | Transfer |
| GET | /finance/coa, /finance/journals, /finance/ar, /finance/cash, /finance/trial-balance | Finance |
| GET | /logistics/deliveries, /logistics/vehicles | Logistik |
| GET | /hr/employees, /hr/payrolls | HR |
| GET | /crm/leads | CRM |
| GET | /reports/sales, /reports/aging-ar, /reports/margin | Reporting |

---

## 9. Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `database files are incompatible` | `docker compose down -v` lalu `up --build -d` (volume recreate, image sekarang `postgres:16-alpine`) |
| `port is already allocated` | Compose pakai `5434/5174/6380` agar tidak tabrakan. Cek `docker ps --format "{{.Names}} {{.Ports}}"` |
| `npm error ECONNRESET` | Ulangi `docker compose up --build -d` |
| `401 Unauthorized` | Token 8 jam, login ulang |
| Frontend blank | `docker logs erp_backend` & `erp_frontend`, pastikan backend healthy dulu |

---

## 10. Backup

```powershell
docker exec erp_postgres pg_dump -U erp erp_db > backup.sql
psql -U erp -d erp_db < backup.sql
```

Semua dijalankan dari **satu folder** `C:\Users\jefri\Downloads\erptest`.
