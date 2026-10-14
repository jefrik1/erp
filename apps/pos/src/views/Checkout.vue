<template>
  <div class="checkout-container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <h2>POS Checkout</h2>
        <span class="status" :class="isOnline ? 'online' : 'offline'">
          {{ isOnline ? '🟢 Online' : '🔴 Offline' }}
        </span>
      </div>
      <div class="header-right">
        <ExportButton 
          :data="dailySalesExport"
          fileName="Daily_Sales"
          sheetName="Penjualan"
          buttonText="Export"
          @toast="handleExportToast"
          @after-export="handleExportComplete"
        />
        <span class="cashier">Kasir: {{ currentUser?.username }}</span>
        <button @click="handleLogout" class="btn-logout">Logout</button>
        <button @click="handleReconciliation" class="btn-reconciliation">Tutup Kasir</button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main">
      <!-- Left: Product Search -->
      <div class="search-section">
        <div class="search-box">
          <input 
            v-model="searchQuery" 
            @keyup.enter="handleSearch"
            type="text" 
            placeholder="Cari produk / Scan barcode..."
            autofocus
          />
          <button @click="handleSearch" class="btn-search">🔍</button>
        </div>

        <div class="search-results">
          <div 
            v-for="product in searchResults" 
            :key="product.id"
            @click="selectProduct(product)"
            class="product-item"
          >
            <div class="product-name">{{ product.name_id }}</div>
            <div class="product-sku">{{ product.sku }}</div>
            <div class="product-price">
              Rp {{ formatPrice(product.price_per_kg || product.price_per_bar) }}
            </div>
            <div class="product-stock">Stok: {{ product.stock_qty }}</div>
          </div>
        </div>
      </div>

      <!-- Right: Cart & Checkout -->
      <div class="cart-section">
        <h3>Keranjang</h3>
        
        <div class="cart-items">
          <div 
            v-for="(item, idx) in cartItems" 
            :key="idx"
            class="cart-item"
          >
            <div class="cart-item-info">
              <div class="cart-item-name">{{ item.name }}</div>
              <div class="cart-item-sku">{{ item.sku }}</div>
            </div>
            
            <div class="cart-item-qty">
              <button @click="updateQty(idx, item.qty - 1)" class="btn-qty">-</button>
              <input 
                v-model.number="item.qty" 
                type="number" 
                class="qty-input"
                @change="updateQty(idx, item.qty)"
              />
              <button @click="updateQty(idx, item.qty + 1)" class="btn-qty">+</button>
              <select v-model="item.unit" class="unit-select">
                <option value="BTG">BTG</option>
                <option value="KG">KG</option>
                <option value="M">M</option>
              </select>
            </div>

            <div class="cart-item-price">
              Rp {{ formatPrice(item.subtotal) }}
            </div>

            <button @click="removeItem(idx)" class="btn-remove">✕</button>
          </div>
        </div>

        <!-- Totals -->
        <div class="cart-totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>Rp {{ formatPrice(subtotal) }}</span>
          </div>
          <div class="total-row">
            <span>Diskon:</span>
            <input v-model.number="discount" type="number" class="discount-input" />
          </div>
          <div class="total-row grand-total">
            <span>Total:</span>
            <span>Rp {{ formatPrice(total) }}</span>
          </div>
        </div>

        <!-- Payment -->
        <div class="payment-section">
          <div class="payment-group">
            <label>Metode Pembayaran</label>
            <select v-model="paymentMethod" class="payment-select">
              <option value="CASH">Tunai</option>
              <option value="CARD">Kartu</option>
              <option value="QRIS">QRIS</option>
            </select>
          </div>

          <div class="payment-group">
            <label>Jumlah Pembayaran</label>
            <input 
              v-model.number="paidAmount" 
              type="number" 
              class="paid-input"
              placeholder="0"
            />
          </div>

          <div class="change">
            <strong>Kembalian: Rp {{ formatPrice(change) }}</strong>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="action-buttons">
          <button @click="clearCart" class="btn-clear">Bersihkan</button>
          <button 
            @click="handleCheckout" 
            class="btn-checkout"
            :disabled="cartItems.length === 0 || !paidAmount"
          >
            Proses Pembayaran
          </button>
        </div>

        <!-- Receipt Preview -->
        <div v-if="lastReceipt" class="receipt-preview">
          <h4>Terakhir Terjual: {{ lastReceipt.transaction_number }}</h4>
          <small>{{ new Date(lastReceipt.created_at).toLocaleTimeString() }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import axios from 'axios';
import ExportButton from '../components/ExportButton.vue';

const currentUser = ref(JSON.parse(localStorage.getItem('user') || '{}'));
const serverUrl = ref(localStorage.getItem('serverUrl') || 'http://localhost:4000');
const token = ref(localStorage.getItem('token') || '');
const isOnline = ref(navigator.onLine);

// Inject notification services
const toast = inject('toast');
const modal = inject('modal');

const searchQuery = ref('');
const searchResults = ref([]);
const cartItems = ref([]);
const discount = ref(0);
const paymentMethod = ref('CASH');
const paidAmount = ref(0);
const lastReceipt = ref(null);

const dailySalesExport = computed(() => {
  return cartItems.value.map(item => ({
    SKU: item.sku,
    Produk: item.name,
    Qty: item.qty,
    Unit: item.unit,
    'Harga Satuan': formatPrice(item.price_per_unit),
    Subtotal: formatPrice(item.subtotal)
  }));
});

const handleExportToast = (data) => {
  if (data.type === 'success') {
    toast.success(data.message, { title: data.title });
  } else {
    toast.error(data.message, { title: data.title });
  }
};

const handleExportComplete = (result) => {
  if (!result.success) {
    console.error('Export failed:', result.error);
  }
};

window.addEventListener('online', () => { isOnline.value = true; });
window.addEventListener('offline', () => { isOnline.value = false; });

const subtotal = computed(() => {
  return cartItems.value.reduce((sum, item) => sum + (item.qty * item.price_per_unit), 0);
});

const total = computed(() => {
  return Math.max(0, subtotal.value - discount.value);
});

const change = computed(() => {
  return Math.max(0, paidAmount.value - total.value);
});

const formatPrice = (value) => {
  return (value || 0).toLocaleString('id-ID', { minimumFractionDigits: 0 });
};

const handleSearch = async () => {
  if (!searchQuery.value.trim()) {
    toast.info('Masukkan kata kunci pencarian', { title: 'Info' });
    return;
  }

  try {
    if (isOnline.value) {
      const response = await axios.get(`${serverUrl.value}/api/pos/product-lookup`, {
        params: { q: searchQuery.value },
        headers: { Authorization: `Bearer ${token.value}` }
      });
      searchResults.value = response.data;
      if (response.data.length === 0) {
        toast.warning(`Produk "${searchQuery.value}" tidak ditemukan`, { 
          title: 'Pencarian' 
        });
      }
    } else {
      searchResults.value = await window.api.productLookup(searchQuery.value);
      if (searchResults.value.length === 0) {
        toast.info('Tidak ada hasil di cache lokal', { title: 'Mode Offline' });
      }
    }
  } catch (e) {
    toast.error(e.message, { title: 'Pencarian Gagal' });
  }
};

const selectProduct = (product) => {
  // Cek apakah sudah ada di cart
  const existing = cartItems.value.find(it => it.product_id === product.id);
  
  if (existing) {
    existing.qty += 1;
  } else {
    cartItems.value.push({
      product_id: product.id,
      sku: product.sku,
      name: product.name_id,
      qty: 1,
      unit: 'BTG',
      price_per_unit: product.price_per_kg || product.price_per_bar || 0,
      subtotal: product.price_per_kg || product.price_per_bar || 0
    });
  }

  searchQuery.value = '';
  searchResults.value = [];

  // Add to local cart
  window.api.cartAdd(cartItems.value[cartItems.value.length - 1]);
};

const updateQty = (idx, newQty) => {
  if (newQty <= 0) {
    removeItem(idx);
  } else {
    cartItems.value[idx].qty = newQty;
    cartItems.value[idx].subtotal = newQty * cartItems.value[idx].price_per_unit;
  }
};

const removeItem = (idx) => {
  cartItems.value.splice(idx, 1);
};

const clearCart = async () => {
  if (cartItems.value.length === 0) {
    toast.info('Keranjang sudah kosong', { title: 'Keranjang' });
    return;
  }

  const confirm = await modal.confirm(
    `Hapus ${cartItems.value.length} item dari keranjang?`,
    {
      title: 'Bersihkan Keranjang',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      type: 'warning'
    }
  );

  if (confirm) {
    cartItems.value = [];
    window.api.cartClear();
    toast.success('Keranjang telah dikosongkan', { 
      title: 'Berhasil',
      duration: 2000 
    });
  }
};

const handleCheckout = async () => {
  if (total.value === 0 || !paidAmount.value) {
    toast.warning('Keranjang kosong atau jumlah pembayaran tidak valid', {
      title: 'Transaksi Gagal'
    });
    return;
  }

  try {
    const transaction = {
      items: cartItems.value,
      total: total.value,
      paid_amount: paidAmount.value,
      payment_method: paymentMethod.value,
      cashier_id: currentUser.value.id,
      register_id: 1
    };

    let result;

    if (isOnline.value) {
      // Send ke server
      const response = await axios.post(`${serverUrl.value}/api/pos/transaction`, transaction, {
        headers: { Authorization: `Bearer ${token.value}` }
      });
      result = response.data;
    } else {
      // Local save
      result = await window.api.checkout(transaction);
    }

    lastReceipt.value = result;
    cartItems.value = [];
    discount.value = 0;
    paidAmount.value = 0;
    searchQuery.value = '';

    // Print receipt
    printReceipt(result);

    // Success notification
    toast.success(`Transaksi ${result.transaction_number} berhasil diproses`, {
      title: '✓ Pembayaran Sukses',
      duration: 3000
    });
  } catch (e) {
    toast.error(e.response?.data?.error || e.message, {
      title: '✕ Transaksi Gagal',
      duration: 4000
    });
  }
};

const printReceipt = (receipt) => {
  const win = window.open('', '', 'width=400,height=600');
  win.document.write(`
    <html>
      <head><title>Receipt</title></head>
      <body style="font-family: monospace; font-size: 12px;">
        <h3 style="text-align: center;">TOKO MATERIAL UTAMA</h3>
        <hr/>
        <p>Nomor: ${receipt.transaction_number}</p>
        <p>Kasir: ${currentUser.value.username}</p>
        <p>Waktu: ${new Date().toLocaleString()}</p>
        <hr/>
        <table style="width: 100%;">
          <tr><td>Item</td><td>Qty</td><td>Harga</td></tr>
          ${receipt.items?.map(it => `
            <tr>
              <td>${it.sku}</td>
              <td>${it.qty}</td>
              <td>${it.price_per_unit}</td>
            </tr>
          `).join('')}
        </table>
        <hr/>
        <p style="text-align: right;"><strong>Total: Rp ${receipt.total}</strong></p>
        <p style="text-align: center; margin-top: 30px;">Terima Kasih!</p>
      </body>
    </html>
  `);
  win.print();
  win.close();
};

const handleReconciliation = async () => {
  const confirm = await modal.confirm(
    'Anda akan menutup sesi kasir dan melakukan rekonsiliasi kas.',
    {
      title: 'Tutup Kasir',
      confirmText: 'Lanjutkan',
      cancelText: 'Batal'
    }
  );

  if (confirm) {
    window.dispatchEvent(new Event('start-reconciliation'));
    toast.info('Navigasi ke halaman rekonsiliasi...', { title: 'Tutup Kasir', duration: 2000 });
  }
};

const handleLogout = async () => {
  const confirm = await modal.confirm(
    'Apakah Anda yakin ingin logout? Pastikan kas sudah direkonsiliasi.',
    {
      title: 'Logout',
      confirmText: 'Ya, Logout',
      cancelText: 'Batal',
      type: 'warning'
    }
  );

  if (confirm) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('logout'));
    toast.success('Logout berhasil', { title: 'Goodbye', duration: 2000 });
  }
};

onMounted(async () => {
  // Load saved cart from local
  const saved = await window.api.cartList();
  cartItems.value = saved;
});
</script>

<style scoped>
.checkout-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.header {
  background: #333;
  color: white;
  padding: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.status {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.status.online {
  background: #4caf50;
}

.status.offline {
  background: #f44336;
}

.main {
  display: flex;
  flex: 1;
  gap: 15px;
  padding: 15px;
  overflow: hidden;
}

.search-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.search-box {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.search-box input {
  flex: 1;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-box input:focus {
  outline: none;
  border-color: #667eea;
}

.btn-search {
  padding: 10px 15px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.search-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  overflow-y: auto;
  flex: 1;
}

.product-item {
  background: #f9f9f9;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #e0e0e0;
  transition: all 0.2s;
}

.product-item:hover {
  background: #e8f5e9;
  border-color: #4caf50;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.product-name {
  font-weight: bold;
  font-size: 12px;
  margin-bottom: 5px;
}

.product-sku {
  font-size: 10px;
  color: #999;
  margin-bottom: 5px;
}

.product-price {
  color: #4caf50;
  font-weight: bold;
  margin-bottom: 5px;
}

.product-stock {
  font-size: 10px;
  color: #666;
}

.cart-section {
  width: 350px;
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}

.cart-section h3 {
  margin-top: 0;
  margin-bottom: 15px;
}

.cart-items {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 15px;
  border-bottom: 1px solid #eee;
  padding-bottom: 15px;
}

.cart-item {
  display: grid;
  grid-template-columns: 1fr 150px 80px 30px;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 4px;
}

.cart-item-info {
  font-size: 12px;
}

.cart-item-name {
  font-weight: bold;
  margin-bottom: 3px;
}

.cart-item-sku {
  color: #999;
  font-size: 10px;
}

.cart-item-qty {
  display: flex;
  gap: 5px;
  align-items: center;
}

.btn-qty {
  width: 25px;
  height: 25px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
  font-weight: bold;
}

.qty-input {
  width: 40px;
  padding: 5px;
  text-align: center;
  border: 1px solid #ddd;
  border-radius: 3px;
}

.unit-select {
  padding: 3px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 10px;
}

.cart-item-price {
  text-align: right;
  font-weight: bold;
  font-size: 12px;
}

.btn-remove {
  width: 25px;
  height: 25px;
  padding: 0;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.cart-totals {
  margin-bottom: 15px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #f0f0f0;
}

.grand-total {
  border-top: 2px solid #333;
  border-bottom: 2px solid #333;
  font-size: 16px;
  font-weight: bold;
  padding: 10px 0;
  margin: 10px 0;
}

.discount-input {
  width: 80px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 3px;
  text-align: right;
}

.payment-section {
  margin-bottom: 15px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 4px;
}

.payment-group {
  margin-bottom: 10px;
}

.payment-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: bold;
}

.payment-select, .paid-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 12px;
  box-sizing: border-box;
}

.change {
  text-align: center;
  padding: 8px;
  background: #e8f5e9;
  border-radius: 3px;
  color: #2e7d32;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.btn-clear {
  flex: 1;
  padding: 10px;
  background: #999;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.btn-checkout {
  flex: 1;
  padding: 10px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
}

.btn-checkout:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-logout, .btn-reconciliation {
  padding: 8px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-logout {
  background: #f44336;
  color: white;
}

.btn-reconciliation {
  background: #ff9800;
  color: white;
}

.receipt-preview {
  padding: 8px;
  background: #fffde7;
  border-radius: 3px;
  border-left: 3px solid #fbc02d;
  font-size: 11px;
}

.receipt-preview h4 {
  margin: 0 0 5px 0;
}

.receipt-preview small {
  color: #999;
}
</style>
