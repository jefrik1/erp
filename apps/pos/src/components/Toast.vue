<template>
  <transition name="toast-slide">
    <div v-if="visible" class="toast" :class="[type, position]">
      <div class="toast-icon">
        <span v-if="type === 'success'" class="icon-success">✓</span>
        <span v-else-if="type === 'error'" class="icon-error">✕</span>
        <span v-else-if="type === 'warning'" class="icon-warning">⚠</span>
        <span v-else class="icon-info">ℹ</span>
      </div>
      <div class="toast-content">
        <div class="toast-title">{{ title }}</div>
        <div class="toast-message">{{ message }}</div>
      </div>
      <button @click="close" class="toast-close">×</button>
      <div class="toast-progress" :style="{ animationDuration: `${duration}ms` }"></div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  type: { type: String, default: 'info' }, // success, error, warning, info
  title: String,
  message: { type: String, required: true },
  duration: { type: Number, default: 4000 },
  position: { type: String, default: 'bottom-right' }
});

const emit = defineEmits(['close']);

const visible = ref(true);
let timeoutId = null;

const close = () => {
  visible.value = false;
  emit('close');
};

onMounted(() => {
  timeoutId = setTimeout(close, props.duration);
});

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId);
});
</script>

<style scoped>
.toast {
  position: fixed;
  padding: 18px 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  background: white;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  min-width: 300px;
  max-width: 500px;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  overflow: hidden;
}

/* Positions */
.toast.bottom-right {
  bottom: 24px;
  right: 24px;
}

.toast.bottom-left {
  bottom: 24px;
  left: 24px;
}

.toast.top-right {
  top: 24px;
  right: 24px;
}

.toast.top-left {
  top: 24px;
  left: 24px;
}

/* Types dengan gradient premium */
.toast.success {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 12px 40px rgba(16, 185, 129, 0.25);
}

.toast.error {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border-color: rgba(239, 68, 68, 0.3);
  box-shadow: 0 12px 40px rgba(239, 68, 68, 0.25);
}

.toast.warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 12px 40px rgba(245, 158, 11, 0.25);
}

.toast.info {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 12px 40px rgba(59, 130, 246, 0.25);
}

.toast-icon {
  font-size: 28px;
  font-weight: bold;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
}

.icon-success { animation: checkmark 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
.icon-error { animation: shake 0.6s ease-out; }
.icon-warning { animation: pulse 0.6s ease-out; }

.toast-content {
  flex: 1;
}

.toast-title {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 4px;
  opacity: 0.98;
}

.toast-message {
  font-size: 14px;
  opacity: 0.92;
  line-height: 1.5;
  font-weight: 500;
}

.toast-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 24px;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.toast-close:hover {
  opacity: 1;
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.6);
  animation: progress linear forwards;
}

/* Animations */
.toast-slide-enter-active {
  animation: slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-slide-leave-active {
  animation: slideOutRight 0.4s cubic-bezier(0.36, 0, 0.66, -0.56);
}

@keyframes slideInRight {
  from {
    transform: translateX(400px) rotateY(90deg);
    opacity: 0;
  }
  to {
    transform: translateX(0) rotateY(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0) rotateY(0);
    opacity: 1;
  }
  to {
    transform: translateX(400px) rotateY(90deg);
    opacity: 0;
  }
}

@keyframes checkmark {
  0% {
    transform: scale(0) rotate(-45deg);
  }
  50% {
    transform: scale(1.3) rotate(10deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-8px) rotate(-2deg); }
  75% { transform: translateX(8px) rotate(2deg); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

@keyframes progress {
  from { width: 100%; }
  to { width: 0%; }
}
</style>
