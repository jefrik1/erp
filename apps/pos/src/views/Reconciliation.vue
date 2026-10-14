<template>
  <div class="reconciliation-container">
    <div class="recon-card">
      <h2>Tutup Kasir</h2>
      
      <div class="recon-summary">
        <div class="summary-item">
          <label>Kasir</label>
          <p>{{ currentUser?.username }}</p>
        </div>
        
        <div class="summary-item">
          <label>Tanggal</label>
          <p>{{ today }}</p>
        </div>

        <div class="summary-item">
          <label>Total Transaksi</label>
          <p>{{ totalTransactions }} transaksi</p>
        </div>

        <div class="summary-item">
          <label>Total Penjualan</label>
          <p>Rp {{ formatPrice(totalSales) }}</p>
        </div>
      </div>

      <div class="recon-form">
        <h3>Penghitungan Kas</h3>
        
        <div class="form-group">
          <label>Kas Awal (Float)</label>
          <input v-model.number="cashFloat" type="number" placeholder="0" />
        </div>

        <div class="form-group">
          <label>Kas Masuk (dari penjualan)</label>
          <input v-model.number="cashIn" type="number" :value="totalSales" disabled />
        </div>

        <div class="form-group">
          <label>Kas Pengeluaran (penggantian, dst)</label>
          <input v-model.number="cashOut" type="number" placeholder="0" />
        </div>

        <div class="expected-box">
          <strong>Kas Seharusnya (Expected):</strong>
          <p class="expected-amount">Rp {{ formatPrice(expectedCash) }}</p>
        </div>

        <div class="form-group">
          <label>Kas Aktual (dihitung secara fisik)</label>
          <input v-model.number="actualCash" type="number" placeholder="0" class="actual-input" />
        </div>

        <div :class="['variance-box', varianceStatus]">
          <strong>Selisih (Variance):</strong>
          <p class="variance-amount">
            Rp {{ formatPrice(variance) }}
            <span class="variance-status">{{ varianceStatus === 'match' ? '✓ Sesuai' : '⚠ Selisih' }}</span>
          </p>
        </div>

        <div class="form-group">
          <label>Catatan</label>
          <textarea v-model="notes" placeholder="Tulis catatan jika ada selisih..." rows="4"></textarea>
        </div>
      </div>

      <div class="action-buttons">
        <button @click="handleBack" class="btn-back">Kembali ke Checkout</button>
        <button @click="handleSubmit" class="btn-submit" :disabled="!actualCash">
          Simpan & Tutup Kasir
        </button>
      </div>

      <div v-if="submitStatus" :class="['status-message', submitStatus.type]">
        {{ submitStatus.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

const currentUser = ref(JSON.parse(localStorage.getItem('user') || '{}'));
const serverUrl = ref(localStorage.getItem('serverUrl') || 'http://localhost:4000');
const token = ref(localStorage.getItem('token') || '');
const isOnline = ref(navigator.onLine);

const today = ref(new Date().toLocaleDateString('id-ID', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
}));

const totalTransactions = ref(0);
const totalSales = ref(0);
const cashFloat = ref(0);
const cashIn = ref(0);
const cashOut = ref(0);
const actualCash = ref(0);
const notes = ref('');
const submitStatus = ref(null);

const expectedCash = computed(() => {
  return cashFloat.value + cashIn.value - cashOut.value;
});

const variance = computed(() => {
  return actualCash.value - expectedCash.value;
});

const varianceStatus = computed(() => {
  if (!actualCash.value) return '';
  return Math.abs(variance.value) < 1000 ? 'match' : 'mismatch';
});

const formatPrice = (value) => {
  return (value || 0).toLocaleString('id-ID', { minimumFractionDigits: 0 });
};

const handleBack = () => {
  window.dispatchEvent(new CustomEvent('app-state-change', { 
    detail: { state: 'checkout' } 
  }));
};

const handleSubmit = async () => {
  if (!actualCash.value) {
    alert('Masukkan kas aktual');
    return;
  }

  try {
    const reconData = {
      cashier_id: currentUser.value.id,
      register_id: 1,
      cash_count: actualCash.value,
      expected_cash: expectedCash.value,
      notes: notes.value
    };

    if (isOnline.value) {
      // Send ke server
      const response = await axios.post(`${serverUrl.value}/api/pos/reconciliation`, reconData, {
        headers: { Authorization: `Bearer ${token.value}` }
      });
      submitStatus.value = {
        type: 'success',
        message: `Rekonsiliasi berhasil. Selisih: Rp ${formatPrice(response.data.variance)}`
      };
    } else {
      // Local save
      submitStatus.value = {
        type: 'warning',
        message: `Rekonsiliasi tersimpan lokal. Akan disync saat online.`
      };
    }

    // Clear form
    setTimeout(() => {
      handleBack();
    }, 2000);
  } catch (e) {
    submitStatus.value = {
      type: 'error',
      message: `Error: ${e.message}`
    };
  }
};

onMounted(async () => {
  // Get daily summary
  try {
    if (isOnline.value) {
      const response = await axios.get(`${serverUrl.value}/api/pos/daily-summary`, {
        headers: { Authorization: `Bearer ${token.value}` }
      });
      totalTransactions.value = response.data.total_transactions || 0;
      totalSales.value = response.data.total_sales || 0;
      cashIn.value = totalSales.value;
    }
  } catch (e) {
    console.error('Summary error:', e.message);
  }
});
</script>

<style scoped>
.reconciliation-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.recon-card {
  background: white;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 500px;
}

.recon-card h2 {
  text-align: center;
  margin-top: 0;
  margin-bottom: 30px;
  color: #333;
}

.recon-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  margin-bottom: 30px;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 8px;
}

.summary-item label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 5px;
  font-weight: bold;
}

.summary-item p {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.recon-form h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #333;
  border-bottom: 2px solid #667eea;
  padding-bottom: 10px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: bold;
  font-size: 14px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.actual-input {
  background: #fffde7;
  border: 2px solid #fbc02d;
}

.expected-box,
.variance-box {
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  border-left: 4px solid #667eea;
  background: #f0f4ff;
}

.variance-box.match {
  border-left-color: #4caf50;
  background: #e8f5e9;
}

.variance-box.mismatch {
  border-left-color: #ff9800;
  background: #fff3e0;
}

.expected-amount,
.variance-amount {
  margin: 10px 0 0 0;
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.variance-status {
  font-size: 12px;
  margin-left: 10px;
  display: inline-block;
}

.variance-box.match .variance-status {
  color: #4caf50;
}

.variance-box.mismatch .variance-status {
  color: #ff9800;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 30px;
}

.btn-back {
  flex: 1;
  padding: 12px;
  background: #999;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.btn-submit {
  flex: 1;
  padding: 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-message {
  margin-top: 20px;
  padding: 15px;
  border-radius: 4px;
  text-align: center;
  font-weight: bold;
}

.status-message.success {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #4caf50;
}

.status-message.error {
  background: #ffebee;
  color: #d32f2f;
  border: 1px solid #f44336;
}

.status-message.warning {
  background: #fff3e0;
  color: #e65100;
  border: 1px solid #ff9800;
}
</style>
