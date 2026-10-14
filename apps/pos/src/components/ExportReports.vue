<template>
  <div class="export-section">
    <h3 class="export-title">Export Laporan Wajib PRD</h3>
    
    <div class="export-grid">
      <!-- Row 1 -->
      <div class="export-item">
        <div class="export-label">Laporan Penjualan</div>
        <ExportButton
          :data="salesReport"
          fileName="Laporan_Penjualan"
          sheetName="Penjualan"
          buttonText="Excel"
          @toast="handleExportToast"
          @before-export="onBeforeExport"
          @after-export="onAfterExport"
        />
      </div>

      <div class="export-item">
        <div class="export-label">Laporan Pembelian</div>
        <ExportButton
          :data="purchaseReport"
          fileName="Laporan_Pembelian"
          sheetName="Pembelian"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>

      <div class="export-item">
        <div class="export-label">Kartu Stok</div>
        <ExportButton
          :data="stockReport"
          fileName="Kartu_Stok"
          sheetName="Stok"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>

      <div class="export-item">
        <div class="export-label">Aging Piutang & Hutang</div>
        <ExportButton
          :data="agingReport"
          fileName="Aging_Piutang_Hutang"
          sheetName="Aging"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>

      <!-- Row 2 -->
      <div class="export-item">
        <div class="export-label">Laba Rugi / Cabang</div>
        <ExportButton
          :data="profitLossReport"
          fileName="Laba_Rugi_Cabang"
          sheetName="P&L"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>

      <div class="export-item">
        <div class="export-label">Analisa Margin</div>
        <ExportButton
          :data="marginReport"
          fileName="Analisa_Margin"
          sheetName="Margin"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>

      <div class="export-item">
        <div class="export-label">Komisi Sales</div>
        <ExportButton
          :data="commissionReport"
          fileName="Komisi_Sales"
          sheetName="Komisi"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>

      <div class="export-item">
        <div class="export-label">Absensi & Payroll</div>
        <ExportButton
          :data="payrollReport"
          fileName="Absensi_Payroll"
          sheetName="Payroll"
          buttonText="Excel"
          @toast="handleExportToast"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import axios from 'axios';
import ExportButton from './ExportButton.vue';

const toast = inject('toast');
const token = ref(localStorage.getItem('token') || '');
const serverUrl = ref(localStorage.getItem('serverUrl') || 'http://localhost:4000');

// Sample data - in production, fetch from API
const salesReport = ref([
  { date: '2024-10-01', product: 'Semen PC 40kg', qty: 100, price: 55000, total: 5500000 },
  { date: '2024-10-01', product: 'Besi Beton 10mm', qty: 50, price: 15000, total: 750000 },
  { date: '2024-10-02', product: 'Keramik 60x60', qty: 20, price: 250000, total: 5000000 }
]);

const purchaseReport = ref([
  { date: '2024-10-01', supplier: 'PT Semen Indonesia', product: 'Semen PC 40kg', qty: 500, price: 45000, total: 22500000 },
  { date: '2024-10-01', supplier: 'PT Keramik Utama', product: 'Keramik 60x60', qty: 100, price: 200000, total: 20000000 }
]);

const stockReport = ref([
  { sku: 'SEM-001', product: 'Semen PC 40kg', warehouse: 'Gudang Pusat', onHand: 450, minStock: 100, status: 'OK' },
  { sku: 'BSI-001', product: 'Besi Beton 10mm', warehouse: 'Gudang Pusat', onHand: 35, minStock: 50, status: 'LOW' },
  { sku: 'KRM-001', product: 'Keramik 60x60', warehouse: 'Gudang Pusat', onHand: 80, minStock: 20, status: 'OK' }
]);

const agingReport = ref([
  { customer: 'Toko Sumber Rejeki', invoice: 'INV-001', amount: 5000000, daysOverdue: 5, status: 'OVERDUE' },
  { customer: 'PT Kontraktor Jaya', invoice: 'INV-002', amount: 10000000, daysOverdue: 0, status: 'DUE' }
]);

const profitLossReport = ref([
  { category: 'Penjualan', amount: 50000000 },
  { category: 'COGS', amount: 30000000 },
  { category: 'Laba Kotor', amount: 20000000 },
  { category: 'Biaya Operasional', amount: 8000000 },
  { category: 'Laba Bersih', amount: 12000000 }
]);

const marginReport = ref([
  { product: 'Semen PC 40kg', price: 55000, cost: 45000, margin: 10000, marginPct: '18.2%' },
  { product: 'Besi Beton 10mm', price: 15000, cost: 10000, margin: 5000, marginPct: '33.3%' },
  { product: 'Keramik 60x60', price: 250000, cost: 200000, margin: 50000, marginPct: '20.0%' }
]);

const commissionReport = ref([
  { salesperson: 'Budi Santoso', sales: 50000000, commissionRate: 0.05, commission: 2500000 },
  { salesperson: 'Siti Nurhaliza', sales: 45000000, commissionRate: 0.05, commission: 2250000 },
  { salesperson: 'Agus Wijaya', sales: 35000000, commissionRate: 0.05, commission: 1750000 }
]);

const payrollReport = ref([
  { employee: 'Budi Santoso', basicSalary: 5000000, allowance: 1000000, deduction: 500000, netSalary: 5500000 },
  { employee: 'Siti Nurhaliza', basicSalary: 4500000, allowance: 800000, deduction: 400000, netSalary: 4900000 },
  { employee: 'Agus Wijaya', basicSalary: 4000000, allowance: 700000, deduction: 350000, netSalary: 4350000 }
]);

const handleExportToast = (data) => {
  if (data.type === 'success') {
    toast.success(data.message, {
      title: data.title,
      duration: 3000
    });
  } else {
    toast.error(data.message, {
      title: data.title,
      duration: 4000
    });
  }
};

const onBeforeExport = () => {
  console.log('Export preparation started...');
};

const onAfterExport = (result) => {
  if (result.success) {
    console.log('Export completed:', result.fileName);
  } else {
    console.error('Export failed:', result.error);
  }
};

onMounted(() => {
  // Optional: Fetch reports from API
  // fetchReports();
});

// Optional: Uncomment to fetch from server
/*
const fetchReports = async () => {
  try {
    const [sales, purchase, stock, aging, pl, margin, commission, payroll] = await Promise.all([
      axios.get(`${serverUrl.value}/api/reports/sales`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/reports/purchase`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/inventory/stock-card`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/reports/aging`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/reports/profit-loss`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/reports/margin-analysis`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/crm/commissions`, { headers: { Authorization: `Bearer ${token.value}` } }),
      axios.get(`${serverUrl.value}/api/hr/payroll`, { headers: { Authorization: `Bearer ${token.value}` } })
    ]);

    salesReport.value = sales.data;
    purchaseReport.value = purchase.data;
    stockReport.value = stock.data;
    agingReport.value = aging.data;
    profitLossReport.value = pl.data;
    marginReport.value = margin.data;
    commissionReport.value = commission.data;
    payrollReport.value = payroll.data;
  } catch (e) {
    toast.error('Gagal memuat laporan: ' + e.message, { title: 'Error' });
  }
};
*/
</script>

<style scoped>
.export-section {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 32px;
  border-radius: 16px;
  margin-top: 24px;
}

.export-title {
  color: white;
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 24px 0;
  letter-spacing: -0.5px;
}

.export-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.export-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.export-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
}

.export-label {
  color: white;
  font-weight: 700;
  font-size: 15px;
  flex: 1;
  letter-spacing: -0.3px;
}

@media (max-width: 768px) {
  .export-section {
    padding: 20px;
  }

  .export-grid {
    grid-template-columns: 1fr;
  }

  .export-item {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .export-label {
    width: 100%;
  }
}
</style>
