# POS Notification & Export System

Dokumentasi lengkap untuk Toast, Modal, dan Excel Export dengan animasi.

## Installation

```bash
cd apps/pos
npm install
```

## Components

### 1. Toast Notifications

**File:** `src/components/Toast.vue`

Toast notifications dengan 4 tipe dan animasi smooth.

#### Tipe-tipe:
- `success` - Operasi berhasil (hijau)
- `error` - Operasi gagal (merah)
- `warning` - Peringatan (orange)
- `info` - Informasi umum (biru)

#### Penggunaan:

```vue
<script setup>
import { inject } from 'vue';

const toast = inject('toast');

// Success
toast.success('Transaksi berhasil diproses', {
  title: '✓ Sukses',
  duration: 3000
});

// Error
toast.error('Terjadi kesalahan', {
  title: '✕ Error',
  duration: 4000
});

// Warning
toast.warning('Stok menipis', {
  title: '⚠ Peringatan'
});

// Info
toast.info('Data sedang diproses', {
  title: 'ℹ Informasi'
});

// Custom position
toast.success('Berhasil', {
  position: 'top-right' // bottom-right, top-left, bottom-left
});
</script>
```

#### Animasi:
- **Enter:** Slide in dari kanan dengan opacity fade
- **Exit:** Slide out ke kanan dengan opacity fade
- **Icon:** Checkmark bounce, error shake, warning pulse
- **Progress bar:** Animasi durasi di bawah toast

---

### 2. Modal Alerts

**File:** `src/components/Modal.vue`

Modal dialog dengan animasi scale dan backdrop blur.

#### Penggunaan:

```vue
<script setup>
import { inject } from 'vue';

const modal = inject('modal');

// Simple confirm
const result = await modal.confirm('Apakah Anda yakin?');
// Returns: true (ok) atau false (cancel)

// Confirm dengan custom text
const result = await modal.confirm('Hapus item?', {
  confirmText: 'Hapus',
  cancelText: 'Batal'
});

// Success modal
const result = await modal.success('Transaksi berhasil!', {
  title: 'Sukses',
  confirmText: 'OK',
  showCancel: false
});

// Error modal
const result = await modal.error('Terjadi kesalahan', {
  title: 'Error',
  confirmText: 'Coba Lagi',
  cancelText: 'Batal'
});

// Warning modal
const result = await modal.warning('Operasi ini tidak bisa dibatalkan', {
  title: 'Peringatan',
  confirmText: 'Lanjutkan',
  cancelText: 'Batal'
});

// Info modal
const result = await modal.open('Ini adalah informasi penting', {
  title: 'Informasi',
  type: 'info',
  showCancel: false
});
</script>
```

#### Animasi:
- **Backdrop:** Fade in/out dengan blur effect
- **Modal:** Zoom in/out dengan scale transform
- **Icon:** Bounce (success), shake (error), pulse (warning)
- **Buttons:** Smooth hover dengan translateY
- **Spinner:** Rotate animation saat loading

#### States:
- **Idle:** Tombol siap diklik
- **Loading:** Spinner muncul saat proses
- **Success/Error:** Icon dengan animasi, tombol disabled

---

### 3. Excel Export Button

**File:** `src/components/ExportButton.vue`

Button yang otomatis handle Excel export dengan loading & result states.

#### Penggunaan:

```vue
<template>
  <ExportButton
    :data="tableData"
    fileName="Penjualan_Harian"
    sheetName="Laporan"
    buttonText="Export"
    :columns="customColumns"
    @toast="handleToast"
    @before-export="onBeforeExport"
    @after-export="onAfterExport"
  />
</template>

<script setup>
import ExportButton from '@/components/ExportButton.vue';
import { ref } from 'vue';

const tableData = ref([
  { sku: 'SEM-001', name: 'Semen PC 40kg', qty: 100, price: 55000 },
  { sku: 'BSI-001', name: 'Besi Beton 10mm', qty: 50, price: 15000 }
]);

// Optional: customize columns
const customColumns = [
  { key: 'sku', label: 'Kode Produk' },
  { key: 'name', label: 'Nama Produk' },
  { key: 'qty', label: 'Quantity' },
  { key: 'price', label: 'Harga' }
];

const handleToast = (data) => {
  // data.type: 'success' | 'error'
  // data.title: Judul notifikasi
  // data.message: Pesan notifikasi
  console.log('Export notification:', data);
};

const onBeforeExport = () => {
  console.log('Export started...');
};

const onAfterExport = (result) => {
  // result.success: true/false
  // result.fileName: nama file jika berhasil
  // result.error: pesan error jika gagal
  console.log('Export completed:', result);
};
</script>
```

#### Props:
- `data` (Array) - Data untuk di-export
- `fileName` (String) - Nama file tanpa extension (default: 'export')
- `sheetName` (String) - Nama sheet Excel (default: 'Data')
- `buttonText` (String) - Teks tombol (default: 'Excel')
- `columns` (Array) - Custom column mapping (opsional)

#### Events:
- `@toast` - Fired saat ada notifikasi
- `@before-export` - Fired sebelum export dimulai
- `@after-export` - Fired setelah export selesai

#### States:
1. **Idle** - Tombol normal, siap diklik
2. **Loading** - Progress bar animasi, spinner
3. **Processing** - Pulse animation di background
4. **Success** - Icon checkmark, pesan custom (auto-hide 3s)
5. **Error** - Icon error, pesan custom, dapat di-retry

#### Animasi:
- **Enter:** Slide from left
- **Progress:** Linear animation
- **Icon:** Checkmark bounce / Error shake
- **Background:** Pulse effect saat processing

---

## Integration di App.vue

Semua components sudah auto-registered di App.vue:

```vue
<template>
  <div id="app">
    <component :is="currentView" />
    
    <!-- Toast Container (otomatis) -->
    <div class="toast-container">
      <transition-group name="toast-slide">
        <Toast v-for="toast in toasts" :key="toast.id" v-bind="toast" />
      </transition-group>
    </div>

    <!-- Modal Container (otomatis) -->
    <div class="modal-container">
      <transition-group name="modal-fade">
        <Modal v-for="modal in modals" :key="modal.id" v-bind="modal" />
      </transition-group>
    </div>
  </div>
</template>
```

---

## Usage Examples di Checkout.vue

### Example 1: Product Search

```javascript
const handleSearch = async () => {
  if (!searchQuery.value.trim()) {
    toast.info('Masukkan kata kunci pencarian');
    return;
  }

  try {
    const response = await axios.get(url);
    searchResults.value = response.data;
    
    if (response.data.length === 0) {
      toast.warning(`Produk "${searchQuery.value}" tidak ditemukan`);
    }
  } catch (e) {
    toast.error(e.message, { title: 'Pencarian Gagal' });
  }
};
```

### Example 2: Checkout

```javascript
const handleCheckout = async () => {
  try {
    const response = await axios.post(url, transaction);
    
    // Success
    toast.success(`Transaksi ${response.data.transaction_number} berhasil`, {
      title: '✓ Pembayaran Sukses',
      duration: 3000
    });
    
    // Clear cart
    cartItems.value = [];
  } catch (e) {
    // Error
    toast.error(e.message, {
      title: '✕ Transaksi Gagal',
      duration: 4000
    });
  }
};
```

### Example 3: Confirmation Dialogs

```javascript
const handleLogout = async () => {
  const confirmed = await modal.confirm(
    'Apakah Anda yakin ingin logout?',
    {
      title: 'Logout',
      confirmText: 'Ya, Logout',
      cancelText: 'Batal',
      type: 'warning'
    }
  );

  if (confirmed) {
    localStorage.clear();
    window.dispatchEvent(new Event('logout'));
    toast.success('Logout berhasil', { duration: 2000 });
  }
};
```

### Example 4: Excel Export

```vue
<template>
  <ExportButton
    :data="dailySalesExport"
    fileName="Daily_Sales"
    sheetName="Penjualan"
    buttonText="Export"
    @toast="handleExportToast"
  />
</template>

<script>
const dailySalesExport = computed(() => {
  return cartItems.value.map(item => ({
    SKU: item.sku,
    Produk: item.name,
    Qty: item.qty,
    Unit: item.unit,
    'Harga Satuan': item.price_per_unit,
    Subtotal: item.qty * item.price_per_unit
  }));
});

const handleExportToast = (data) => {
  if (data.type === 'success') {
    toast.success(data.message, { title: data.title });
  } else {
    toast.error(data.message, { title: data.title });
  }
};
</script>
```

---

## Customization

### Toast Colors

Edit `src/components/Toast.vue`:

```vue
.toast.success {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
}

.toast.error {
  background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
}

.toast.warning {
  background: linear-gradient(135deg, #ff9800 0%, #e68900 100%);
}

.toast.info {
  background: linear-gradient(135deg, #2196f3 0%, #0b7dda 100%);
}
```

### Modal Animations

Edit `src/components/Modal.vue` - ubah durasi di:

```vue
@keyframes zoomIn {
  from { transform: scale(0.7); /* ubah ke 0.5 atau 0.9 */ }
}
```

### Export Button Loading Duration

Edit `src/components/ExportButton.vue`:

```javascript
// Ubah delay (dalam ms)
await new Promise(r => setTimeout(r, 500)); // Persiapan
await new Promise(r => setTimeout(r, 800)); // Processing
```

---

## Performance Tips

1. **Toast cleanup** - Auto-clear setelah duration
2. **Modal disposal** - Auto-remove setelah action
3. **Excel export** - Batch processing untuk data besar
4. **Animation** - GPU-accelerated transforms (scale, translateX)

---

## Browser Support

- Chrome/Edge: ✓ Full support
- Firefox: ✓ Full support
- Safari: ✓ Full support
- IE11: ✗ Not supported (backdrop-filter)

---

## Troubleshooting

### Toast tidak muncul?
1. Pastikan `useToast` sudah di-inject: `const toast = inject('toast')`
2. Pastikan main.js sudah register plugin: `app.use(ToastPlugin)`
3. Check console untuk error

### Modal loading forever?
1. Pastikan event resolution di handle: `await modal.confirm(...)`
2. Check backend response time
3. Verify token validity

### Export gagal?
1. Pastikan data ada: `:data="array_dengan_data"`
2. Check browser console untuk CORS errors
3. Verify xlsx library terinstall: `npm list xlsx`

---

## File Structure

```
apps/pos/src/
├── components/
│   ├── Toast.vue          # Toast notification component
│   ├── Modal.vue          # Modal dialog component
│   └── ExportButton.vue   # Excel export button
├── composables/
│   ├── useToast.js        # Toast service provider
│   └── useModal.js        # Modal service provider
├── views/
│   └── Checkout.vue       # Updated dengan semua features
├── App.vue                # Container dengan toast + modal
└── main.js                # Register plugins
```

---

## Next Steps

1. ✓ Components created
2. ✓ Services registered
3. ✓ Checkout.vue updated
4. **TODO:** Test di Electron app
5. **TODO:** Add barcode scanner integration
6. **TODO:** Add thermal printer support
