<template>
  <div class="export-button-wrapper">
    <!-- Button State: Idle -->
    <button 
      v-if="state === 'idle'"
      @click="startExport"
      class="btn-export idle"
      :disabled="!data || data.length === 0"
    >
      <span class="icon">📊</span>
      <span class="text">{{ buttonText }}</span>
    </button>

    <!-- Button State: Loading -->
    <button v-else-if="state === 'loading'" class="btn-export loading" disabled>
      <span class="spinner"></span>
      <span class="text">Preparing...</span>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
    </button>

    <!-- Button State: Processing -->
    <button v-else-if="state === 'processing'" class="btn-export processing" disabled>
      <span class="processor"></span>
      <span class="text">Generating Excel...</span>
    </button>

    <!-- Button State: Success -->
    <button v-else-if="state === 'success'" class="btn-export success" disabled>
      <span class="icon-success">✓</span>
      <span class="text">{{ successMessage }}</span>
    </button>

    <!-- Button State: Error -->
    <button v-else-if="state === 'error'" @click="resetState" class="btn-export error">
      <span class="icon-error">✕</span>
      <span class="text">{{ errorMessage }} (Retry)</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue';
import * as XLSX from 'xlsx';

const props = defineProps({
  data: Array,
  fileName: { type: String, default: 'export' },
  sheetName: { type: String, default: 'Data' },
  buttonText: { type: String, default: 'Excel' },
  columns: Array // optional: customize columns
});

const emit = defineEmits(['toast', 'before-export', 'after-export']);

const state = ref('idle'); // idle, loading, processing, success, error
const progress = ref(0);
const successMessage = ref('Downloaded successfully');
const errorMessage = ref('Export failed');

let progressInterval = null;
let timeoutId = null;

const simulateProgress = () => {
  progressInterval = setInterval(() => {
    progress.value += Math.random() * 30;
    if (progress.value > 90) progress.value = 90;
  }, 300);
};

const startExport = async () => {
  try {
    emit('before-export');
    
    state.value = 'loading';
    progress.value = 0;
    simulateProgress();

    // Prepare data
    await new Promise(r => setTimeout(r, 500));

    state.value = 'processing';
    progress.value = 100;
    
    // Create workbook
    await new Promise(r => setTimeout(r, 800));

    const workbook = XLSX.utils.book_new();
    
    // Use custom columns if provided
    let exportData = props.data;
    if (props.columns) {
      exportData = props.data.map(row => {
        const obj = {};
        props.columns.forEach(col => {
          obj[col.label] = row[col.key];
        });
        return obj;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const columnWidths = [];
    Object.keys(exportData[0] || {}).forEach((key, idx) => {
      columnWidths[idx] = { wch: Math.min(key.length + 2, 50) };
    });
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, props.sheetName);

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const finalFileName = `${props.fileName}_${timestamp}.xlsx`;

    // Download
    await new Promise(r => setTimeout(r, 300));
    XLSX.writeFile(workbook, finalFileName);

    // Success state
    state.value = 'success';
    successMessage.value = `✓ ${finalFileName} berhasil diunduh`;

    emit('toast', {
      type: 'success',
      title: 'Export Berhasil',
      message: `File ${finalFileName} telah diunduh`
    });

    emit('after-export', { success: true, fileName: finalFileName });

    // Reset after 3 seconds
    timeoutId = setTimeout(resetState, 3000);

  } catch (error) {
    state.value = 'error';
    errorMessage.value = error.message || 'Terjadi kesalahan saat export';
    
    emit('toast', {
      type: 'error',
      title: 'Export Gagal',
      message: errorMessage.value
    });

    emit('after-export', { success: false, error: error.message });
  } finally {
    if (progressInterval) clearInterval(progressInterval);
  }
};

const resetState = () => {
  state.value = 'idle';
  progress.value = 0;
};

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval);
  if (timeoutId) clearTimeout(timeoutId);
});

defineExpose({ startExport, resetState });
</script>

<style scoped>
.export-button-wrapper {
  display: inline-block;
}

.btn-export {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-width: 140px;
  justify-content: center;
  font-size: 14px;
  position: relative;
  overflow: hidden;
}

/* Idle State */
.btn-export.idle {
  background: white;
  border: 2px solid #333;
  color: #333;
}

.btn-export.idle:hover:not(:disabled) {
  background: #f5f5f5;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

/* Loading State */
.btn-export.loading {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  position: relative;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  transition: width 0.3s ease;
}

/* Processing State */
.btn-export.processing {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  animation: pulse-bg 1.5s ease-in-out infinite;
}

.processor {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin-fast 0.6s linear infinite;
}

/* Success State */
.btn-export.success {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
  animation: slideSuccess 0.5s ease-out;
}

.icon-success {
  display: inline-block;
  font-size: 18px;
  animation: checkmark 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Error State */
.btn-export.error {
  background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
  color: white;
}

.btn-export.error:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(244, 67, 54, 0.3);
}

.icon-error {
  display: inline-block;
  font-size: 18px;
  animation: shake 0.5s ease-out;
}

.text {
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.btn-export:disabled {
  opacity: 0.9;
  cursor: not-allowed;
}

/* Animations */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes spin-fast {
  to { transform: rotate(360deg); }
}

@keyframes pulse-bg {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(102, 126, 234, 0);
  }
}

@keyframes slideSuccess {
  0% {
    transform: translateX(-20px);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes checkmark {
  0% {
    transform: scale(0) rotate(-45deg);
  }
  50% {
    transform: scale(1.2) rotate(10deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8px); }
  75% { transform: translateX(8px); }
}
</style>
