# POS Lokal — Setup & Run Guide

## Struktur

```
/apps/pos/
├── main.js           # Electron main process
├── preload.js        # IPC bridge (secure)
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.js       # Vue app entry
    ├── App.vue
    └── views/
        ├── Login.vue
        ├── Checkout.vue
        └── Reconciliation.vue
```

## Architecture

**Offline-First:**
- Local SQLite database (`~/.config/erp-pos/pos.db`)
- Electron app (desktop, fast, no browser needed)
- Works without internet
- Auto-sync when online

**Data Flow:**
```
Barcode Scanner → Electron App → SQLite (local)
                                    ↓
                            Print Receipt
                                    ↓
                        [When Online] Sync to Server
```

## Installation

### Prerequisites
- Node.js 18+
- npm

### Steps

1. **Install dependencies**
```bash
cd apps/pos
npm install
```

2. **Development (with hot reload)**
```bash
# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2: Start Electron app
npm start
```

Electron akan load dari `http://localhost:5173` (Vite dev server).

3. **Production Build**
```bash
npm run build
npm start
```

Electron akan load dari `dist/index.html` (built assets).

## Workflow Kasir

### 1. Login
- Input username/password
- Server verify (if online) atau accept any (offline)
- Cache token di localStorage

### 2. Checkout
- **Scan barcode** atau search produk
- Produk muncul di grid, click untuk add ke cart
- Adjust qty/unit dengan +/- buttons
- Lihat subtotal di cart
- Input diskon (optional)
- Pilih metode pembayaran (Tunai/Kartu/QRIS)
- Input jumlah pembayaran
- Click "Proses Pembayaran"
- Receipt auto-print
- Cart cleared, ready untuk transaksi berikutnya

### 3. Tutup Kasir (EOD)
- Click "Tutup Kasir" di header
- Sistem show expected cash (float + penjualan - pengeluaran)
- Input cash count (dihitung fisik)
- Sistem kalkulasi selisih
- Add notes jika ada variance
- Submit → sync ke server (if online)

## Fitur Offline

**Tersimpan lokal:**
- ✓ Semua transaksi
- ✓ Cart items
- ✓ Product cache

**Auto-sync saat online:**
- ✓ Send unsync transactions
- ✓ Pull latest product prices
- ✓ Pull latest promotions

**Manual sync:**
```javascript
// Di console (DevTools)
window.api.sync('http://localhost:4000', 'TOKEN_HERE')
```

## Integrasi Hardware

### Barcode Scanner
- Plug USB scanner
- Scanner biasanya kirim ke active input (sudah auto-focus search box)
- Data dikirim seperti keyboard typing

### Thermal Printer
- Detect printer via Windows Print Spooler
- Use Electron's `webContents.print()` untuk send ke printer
- Receipt format: plain text, 80mm width

### Scale (untuk material eceran)
- Serial connection via USB
- Parse weight dari serial stream
- Auto-update qty field

### Card Reader
- Via payment gateway API (e.g., Verifone, Ingenico)
- Offline mode: store & forward (process saat online)

## Configuration

**Local settings (POS Settings table):**
```sql
SELECT * FROM pos_settings WHERE register_id = 1;
```

Edit via backend API atau direct DB:
- Store name
- Receipt header/footer
- Currency (IDR)
- Theme (LIGHT/DARK)
- Language (ID/EN)

## Troubleshooting

### 1. SQLite not found error
```
npm install sqlite3@5.1.6
```

### 2. Electron blank screen
- Check console (DevTools)
- Verify Vite server running on 5173
- Check main.js preload path

### 3. IPC not working
- Verify preload.js at correct path in main.js
- Check contextIsolation: true dan nodeIntegration: false

### 4. Sync gagal
- Check backend running (`docker compose ps`)
- Verify token valid
- Check network connection

### 5. Receipt tidak print
- Verify printer installed di Windows
- Test print dari Notepad dulu
- Check receipt HTML format valid

## API Endpoints (Backend)

Semua require auth header: `Authorization: Bearer TOKEN`

### Product Lookup
```
GET /api/pos/product-lookup?q=besi
```

### Checkout
```
POST /api/pos/transaction
{
  items: [{product_id, qty, unit, price_per_unit}],
  total, paid_amount, payment_method, cashier_id, register_id
}
```

### Get Receipt
```
GET /api/pos/transaction/:id
```

### Reconciliation
```
POST /api/pos/reconciliation
{
  cashier_id, register_id, cash_count, expected_cash
}
```

### Daily Summary
```
GET /api/pos/daily-summary
```

## Database Schema

**Local (SQLite)**
- `products` — cache from server
- `cart_items` — current checkout
- `transactions` — offline checkout buffer

**Server (PostgreSQL)**
- `pos_transactions` — synced transactions
- `pos_transaction_items` — line items
- `pos_reconciliation` — EOD reconciliation
- `pos_members` — loyalty
- `pos_promotions` — promo
- `pos_stock_locations` — per-aisle inventory

## Next Phase (Phase 1)

- [ ] Barcode scanner integration
- [ ] Thermal printer support
- [ ] Member loyalty scanning
- [ ] Promotion engine
- [ ] Real-time sync indicator
- [ ] Multi-register coordination
- [ ] Payment gateway integration

## Notes

- **Offline first** = nggak perlu internet untuk jualan
- **Auto-sync** = transaksi otomatis upload saat online
- **Lightweight** = SQLite lokal < 10MB
- **Fast** = no network latency, instant response
- **Simple** = kasir cuma perlu buka app & scan
