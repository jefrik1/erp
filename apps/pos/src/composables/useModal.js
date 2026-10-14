import { ref } from 'vue';

class ModalManager {
  constructor() {
    this.modals = ref([]);
    this.nextId = 0;
  }

  open(message, options = {}) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      const modal = {
        id,
        type: options.type || 'info',
        title: options.title || this.getDefaultTitle(options.type),
        message,
        confirmText: options.confirmText || 'OK',
        cancelText: options.cancelText || 'Cancel',
        showCancel: options.showCancel !== false,
        resolve: (value) => {
          this.remove(id);
          resolve(value);
        }
      };

      this.modals.value.push(modal);
    });
  }

  success(message, options = {}) {
    return this.open(message, { ...options, type: 'success', title: options.title || 'Sukses' });
  }

  error(message, options = {}) {
    return this.open(message, { ...options, type: 'error', title: options.title || 'Error' });
  }

  warning(message, options = {}) {
    return this.open(message, { ...options, type: 'warning', title: options.title || 'Peringatan' });
  }

  confirm(message, options = {}) {
    return this.open(message, { 
      ...options, 
      type: 'info',
      title: options.title || 'Konfirmasi',
      showCancel: true,
      confirmText: options.confirmText || 'Ya',
      cancelText: options.cancelText || 'Batal'
    });
  }

  remove(id) {
    this.modals.value = this.modals.value.filter(m => m.id !== id);
  }

  getDefaultTitle(type) {
    const titles = {
      success: '✓ Sukses',
      error: '✕ Error',
      warning: '⚠ Peringatan',
      info: 'ℹ Informasi'
    };
    return titles[type] || 'Dialog';
  }
}

const modalManager = new ModalManager();

export default {
  install(app) {
    app.provide('modal', modalManager);
    app.config.globalProperties.$modal = modalManager;
  }
};

export { modalManager };
