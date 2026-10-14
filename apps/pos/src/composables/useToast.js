import { ref, nextTick } from 'vue';

class ToastManager {
  constructor() {
    this.toasts = ref([]);
    this.nextId = 0;
  }

  show(message, options = {}) {
    const id = this.nextId++;
    const toast = {
      id,
      type: options.type || 'info',
      title: options.title || this.getDefaultTitle(options.type),
      message,
      duration: options.duration || 4000,
      position: options.position || 'bottom-right'
    };

    this.toasts.value.push(toast);

    if (toast.duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, toast.duration);
    }

    return id;
  }

  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success', title: options.title || '✓ Sukses' });
  }

  error(message, options = {}) {
    return this.show(message, { ...options, type: 'error', title: options.title || '✕ Error' });
  }

  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning', title: options.title || '⚠ Peringatan' });
  }

  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info', title: options.title || 'ℹ Informasi' });
  }

  remove(id) {
    this.toasts.value = this.toasts.value.filter(t => t.id !== id);
  }

  clear() {
    this.toasts.value = [];
  }

  getDefaultTitle(type) {
    const titles = {
      success: '✓ Sukses',
      error: '✕ Error',
      warning: '⚠ Peringatan',
      info: 'ℹ Informasi'
    };
    return titles[type] || 'Notifikasi';
  }
}

const toastManager = new ToastManager();

export default {
  install(app) {
    app.provide('toast', toastManager);
    app.config.globalProperties.$toast = toastManager;
  }
};

export { toastManager };
