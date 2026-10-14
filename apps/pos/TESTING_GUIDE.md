# POS App - Setup & Testing Guide

## Prerequisites
- Backend running: `http://localhost:4000`
- Node.js 18+
- npm

## Setup

### 1. Install Dependencies
```bash
cd apps/pos
npm install
```

### 2. Start Development
```bash
# Terminal 1: Start Vite dev server (for Vue hot reload)
npm run dev

# Terminal 2 (in apps/pos): Start Electron
npm start
```

Electron akan launch dengan Vite dev server di http://localhost:5173

### 3. Login
- Username: `admin`
- Password: `admin123`
- Register ID: `1`

---

## Testing Checklist

### ✓ Toast Notifications (Premium Style)

**Test 1: Success Toast**
1. Login ke app
2. Search produk dengan keyword valid (misal: "semen")
3. Harus muncul toast hijau dengan:
   - ✓ Icon success dalam background
   - ✓ Gradient background (hijau)
   - ✓ Shadow effect
   - ✓ Auto-hide setelah 3 detik
   - ✓ Smooth slide-in animation

**Test 2: Warning Toast**
1. Click "Search" tanpa input keyword
2. Harus muncul toast orange dengan:
   - ⚠ Icon warning
   - ✓ Gradient background (orange)
   - ✓ Message: "Masukkan kata kunci pencarian"
   - ✓ Auto-hide 4 detik

**Test 3: Error Toast**
1. Logout (confirm)
2. Try login dengan password salah
3. Harus muncul toast merah dengan:
   - ✕ Icon error
   - ✓ Gradient background (merah)
   - ✓ Shake animation pada icon
   - ✓ Message error

**Test 4: Info Toast**
1. Clear cart (bersih)
2. Klik "Clear" lagi
3. Harus muncul toast biru:
   - ℹ Icon info
   - ✓ Message: "Keranjang sudah kosong"

---

### ✓ Modal Dialogs (Premium Style)

**Test 1: Confirm Dialog - Clear Cart**
1. Add produk ke cart (misal 2-3 item)
2. Click "Bersihkan" button
3. Harus muncul modal dengan:
   - ✓ Large icon (80px) dengan gradient background
   - ✓ Title: "Bersihkan Keranjang"
   - ✓ Message: "Hapus 2 item dari keranjang?"
   - ✓ 2 tombol: "Hapus" dan "Batal"
   - ✓ Smooth zoom-in animation
   - ✓ Backdrop blur effect
4. Click "Hapus" → modal disappear, cart cleared, toast muncul

**Test 2: Confirm Dialog - Logout**
1. Click "Logout" button
2. Modal warning popup:
   - ✓ Orange icon background
   - ✓ Title: "Logout"
   - ✓ Message: "Apakah Anda yakin..."
   - ✓ Loading spinner saat proses confirm
3. Click "Ya, Logout" → app kembali ke login screen

**Test 3: Modal Close**
1. Open any modal
2. Click backdrop (luar modal) → modal close
3. Click "Batal" button → modal close

---

### ✓ Excel Export Button

**Test 1: Export Daily Sales**
1. Add produk ke cart (misal: 2x Semen, 1x Keramik)
2. Di header kanan ada tombol "Export"
3. Click "Export" → lihat state changes:
   - Button: "Preparing..." dengan spinner
   - Progress bar di bawah button
   - Loading state ~2 detik
4. After loading:
   - Button: "Generating Excel..." (biru gradient)
   - Pulse animation di background
5. After processing:
   - Button: "✓ Downloaded successfully" (hijau)
   - File auto-download: `Daily_Sales_YYYY-MM-DD.xlsx`
   - Toast sukses muncul: "✓ File berhasil diunduh"
6. After 3 detik:
   - Button kembali ke "Export" (idle state)

**Test 2: Export dengan data**
1. Check file yang didownload:
   - Sheet name: "Penjualan"
   - Columns: SKU, Produk, Qty, Unit, Harga Satuan, Subtotal
   - Data sesuai dengan cart items

**Test 3: Export Error Handling** (jika ada error)
1. Modal akan show error toast
2. Button berubah merah dengan icon ✕
3. Text: "[error message] (Retry)"
4. Click button untuk retry

---

### ✓ Product Search Integration

**Test 1: Search dengan Toast**
1. Input "besi" di search box
2. Press Enter atau click search icon
3. Harus muncul:
   - ✓ Toast info (biru) jika hasil kosong
   - ✓ Product list jika ada hasil
   - ✓ Smooth list render

**Test 2: Select Product**
1. Search dan dapat hasil
2. Click produk → add to cart
3. Produk muncul di keranjang
4. Toast sukses (optional)

---

### ✓ Checkout Flow

**Test 1: Complete Checkout**
1. Add 2-3 produk
2. Set jumlah pembayaran
3. Click "Proses Pembayaran"
4. Harus muncul:
   - ✓ Loading spinner
   - ✓ Success toast: "Transaksi [TXN-xxx] berhasil diproses"
   - ✓ Receipt window popup
   - ✓ Cart cleared

**Test 2: Checkout Error**
1. Set total = 0 atau paid_amount = 0
2. Click checkout
3. Toast warning: "Keranjang kosong atau jumlah pembayaran tidak valid"

---

### ✓ Reconciliation Flow

**Test 1: Close Cashier**
1. Click "Tutup Kasir" button
2. Modal confirm popup:
   - ✓ Type: "info" atau "warning"
   - ✓ Message: "Anda akan menutup sesi kasir..."
3. Click "Lanjutkan" → navigate ke reconciliation screen
4. Toast: "Navigasi ke halaman rekonsiliasi..."

---

## Troubleshooting

### Problem: No notifications muncul
**Solution:**
1. Check browser console untuk errors
2. Verify main.js sudah install plugins
3. Verify App.vue sudah import Toast/Modal components
4. Restart dev server: `npm run dev`

### Problem: Export button tidak responsive
**Solution:**
1. Check ExportButton component sudah import
2. Verify `:data="dailySalesExport"` tidak kosong
3. Check console untuk errors saat click

### Problem: Backend error socket hang up
**Solution:**
1. Backend running? `docker compose ps`
2. Restart backend: `docker compose restart backend`
3. Check axios calls target `http://localhost:4000` (bukan localhost:5173)

### Problem: Modal/Toast tidak muncul tapi tidak error
**Solution:**
1. Check `toastManager.toasts` dan `modalManager.modals` populated
2. Verify ref sync dengan component
3. Check CSS tidak hidden element

---

## Expected Visual Behavior

### Toast
- **Success:** Green gradient, checkmark bounces, slide-in 0.4s, auto-hide 3s
- **Error:** Red gradient, shake icon, slide-in 0.4s, auto-hide 4s
- **Warning:** Orange gradient, pulse icon, slide-in 0.4s, auto-hide 4s
- **Info:** Blue gradient, no icon animation, slide-in 0.4s, auto-hide 4s

### Modal
- **Backdrop:** Dark with blur, fade-in 0.3s
- **Icon:** Large (80px), gradient background, bounce/shake/pulse animation
- **Buttons:** Hover lift effect (translateY -3px), shadow enhancement
- **Overall:** Zoom-in 0.5s with 3D rotateX effect

### Export Button
- **Idle:** White background, border, normal cursor
- **Loading:** Blue gradient, progress bar, spinner
- **Processing:** Blue gradient, pulse background
- **Success:** Green gradient, checkmark icon, 3s auto-hide
- **Error:** Red gradient, error icon, retry text

---

## File Structure
```
apps/pos/
├── src/
│   ├── components/
│   │   ├── Toast.vue           ✓ Premium notifications
│   │   ├── Modal.vue           ✓ Premium dialogs
│   │   ├── ExportButton.vue    ✓ Excel export with states
│   │   └── ExportReports.vue   (NOT USED - skip for POS)
│   ├── composables/
│   │   ├── useToast.js         ✓ Toast service
│   │   └── useModal.js         ✓ Modal service
│   ├── views/
│   │   └── Checkout.vue        ✓ Updated with notifications
│   ├── App.vue                 ✓ Toast/Modal containers
│   └── main.js                 ✓ Plugins registered
└── vite.config.js              ✓ Config OK
```

---

## Notes

- Jangan export large datasets (>10MB) - Excel mungkin slow
- Toast auto-cleanup setelah timeout
- Modal block interaction ke background (backdrop click close)
- All animations GPU-accelerated (transform, opacity only)
- Dark theme compatible dengan Electron

---

## Next Steps After Testing

1. ✓ Confirm notifications working
2. ✓ Confirm export working
3. Barcode scanner integration (Phase 1)
4. Thermal printer support (Phase 1)
5. Multi-register sync (Phase 2)
