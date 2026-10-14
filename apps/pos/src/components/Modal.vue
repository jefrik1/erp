<template>
  <transition name="modal-backdrop">
    <div v-if="isOpen" class="modal-overlay" @click="handleBackdropClick">
      <transition name="modal-scale">
        <div class="modal-container" @click.stop>
          <!-- Icon -->
          <div class="modal-icon" :class="type">
            <span v-if="type === 'success'" class="icon">✓</span>
            <span v-else-if="type === 'error'" class="icon">✕</span>
            <span v-else-if="type === 'warning'" class="icon">⚠</span>
            <span v-else class="icon">ℹ</span>
          </div>

          <!-- Content -->
          <h2 class="modal-title">{{ title }}</h2>
          <p class="modal-message">{{ message }}</p>

          <!-- Actions -->
          <div class="modal-actions">
            <button 
              v-if="showCancel"
              @click="handleCancel" 
              class="btn-cancel"
              :disabled="isLoading"
            >
              {{ cancelText }}
            </button>
            <button 
              @click="handleConfirm" 
              class="btn-confirm"
              :class="type"
              :disabled="isLoading"
            >
              <span v-if="!isLoading" class="btn-text">{{ confirmText }}</span>
              <span v-else class="btn-spinner"></span>
            </button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue';

const isOpen = ref(false);
const type = ref('info'); // success, error, warning, info
const title = ref('');
const message = ref('');
const confirmText = ref('Confirm');
const cancelText = ref('Cancel');
const showCancel = ref(true);
const isLoading = ref(false);

let resolvePromise = null;

const open = (msg, opts = {}) => {
  return new Promise((resolve) => {
    type.value = opts.type || 'info';
    title.value = opts.title || 'Alert';
    message.value = msg;
    confirmText.value = opts.confirmText || 'OK';
    cancelText.value = opts.cancelText || 'Cancel';
    showCancel.value = opts.showCancel !== false;
    isLoading.value = false;
    resolvePromise = resolve;
    isOpen.value = true;
  });
};

const handleConfirm = async () => {
  isLoading.value = true;
  // Simulate action
  await new Promise(r => setTimeout(r, 600));
  isOpen.value = false;
  if (resolvePromise) resolvePromise(true);
};

const handleCancel = () => {
  isOpen.value = false;
  if (resolvePromise) resolvePromise(false);
};

const handleBackdropClick = () => {
  if (showCancel.value) handleCancel();
};

defineExpose({ open, isOpen });
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7));
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  backdrop-filter: blur(8px);
}

.modal-container {
  background: white;
  padding: 48px 40px;
  border-radius: 20px;
  max-width: 450px;
  width: 90%;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
  text-align: center;
  position: relative;
}

.modal-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42px;
  font-weight: bold;
  animation: iconBounce 0.7s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.modal-icon.success {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 12px 32px rgba(16, 185, 129, 0.3);
}

.modal-icon.error {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  box-shadow: 0 12px 32px rgba(239, 68, 68, 0.3);
  animation: iconShake 0.7s;
}

.modal-icon.warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  box-shadow: 0 12px 32px rgba(245, 158, 11, 0.3);
  animation: iconPulse 0.7s;
}

.modal-icon.info {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 12px 32px rgba(59, 130, 246, 0.3);
}

.modal-title {
  font-size: 24px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0 0 16px 0;
  animation: slideDown 0.6s ease-out;
  letter-spacing: -0.5px;
}

.modal-message {
  font-size: 16px;
  color: #555;
  margin: 0 0 36px 0;
  line-height: 1.7;
  animation: slideUp 0.6s ease-out 0.1s both;
  font-weight: 500;
}

.modal-actions {
  display: flex;
  gap: 14px;
  justify-content: center;
  animation: slideUp 0.6s ease-out 0.2s both;
}

.btn-cancel,
.btn-confirm {
  padding: 14px 32px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-width: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  letter-spacing: -0.3px;
}

.btn-cancel {
  background: #f3f4f6;
  color: #374151;
  border: 2px solid #e5e7eb;
}

.btn-cancel:hover:not(:disabled) {
  background: #e5e7eb;
  border-color: #d1d5db;
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.btn-confirm {
  color: white;
  position: relative;
  font-weight: 700;
}

.btn-confirm.success {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.25);
}

.btn-confirm.error {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.25);
}

.btn-confirm.warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.25);
}

.btn-confirm.info {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25);
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
}

.btn-confirm:disabled,
.btn-cancel:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-text {
  display: inline-block;
}

.btn-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Transitions */
.modal-backdrop-enter-active {
  animation: fadeIn 0.3s ease;
}

.modal-backdrop-leave-active {
  animation: fadeOut 0.3s ease;
}

.modal-scale-enter-active {
  animation: zoomIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-scale-leave-active {
  animation: zoomOut 0.3s ease;
}

/* Keyframes */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes zoomIn {
  from {
    opacity: 0;
    transform: scale(0.6) rotateX(-20deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotateX(0deg);
  }
}

@keyframes zoomOut {
  from {
    opacity: 1;
    transform: scale(1) rotateX(0deg);
  }
  to {
    opacity: 0;
    transform: scale(0.6) rotateX(-20deg);
  }
}

@keyframes iconBounce {
  0% {
    transform: scale(0) rotate(-45deg);
  }
  50% {
    transform: scale(1.25) rotate(15deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

@keyframes iconShake {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-5deg) scale(1.05); }
  75% { transform: rotate(5deg) scale(1.05); }
}

@keyframes iconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
