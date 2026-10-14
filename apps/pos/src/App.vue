<template>
  <div id="app" class="pos-app">
    <component :is="currentView" />
    
    <!-- Toast Container -->
    <div class="toast-container">
      <transition-group name="toast-slide">
        <Toast
          v-for="toast in toasts"
          :key="toast.id"
          :type="toast.type"
          :title="toast.title"
          :message="toast.message"
          :duration="toast.duration"
          :position="toast.position"
          @close="removeToast(toast.id)"
        />
      </transition-group>
    </div>

    <!-- Modal Container -->
    <div class="modal-container">
      <transition-group name="modal-fade">
        <Modal
          v-for="modal in modals"
          :key="modal.id"
          :type="modal.type"
          :title="modal.title"
          :message="modal.message"
          :confirm-text="modal.confirmText"
          :cancel-text="modal.cancelText"
          :show-cancel="modal.showCancel"
          @confirm="() => modal.resolve(true)"
          @cancel="() => modal.resolve(false)"
        />
      </transition-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Login from './views/Login.vue';
import Checkout from './views/Checkout.vue';
import Reconciliation from './views/Reconciliation.vue';
import Toast from './components/Toast.vue';
import Modal from './components/Modal.vue';
import { toastManager } from './composables/useToast.js';
import { modalManager } from './composables/useModal.js';

const currentUser = ref(null);
const appState = ref('login'); // login, checkout, reconciliation
const toasts = toastManager.toasts;
const modals = modalManager.modals;

const currentView = computed(() => {
  if (!currentUser.value) return Login;
  if (appState.value === 'checkout') return Checkout;
  if (appState.value === 'reconciliation') return Reconciliation;
  return Login;
});

const removeToast = (id) => {
  toastManager.remove(id);
};

// Handle login
window.addEventListener('login', (e) => {
  currentUser.value = e.detail;
  appState.value = 'checkout';
});

// Handle logout
window.addEventListener('logout', () => {
  currentUser.value = null;
  appState.value = 'login';
});

// Handle reconciliation
window.addEventListener('start-reconciliation', () => {
  appState.value = 'reconciliation';
});
</script>

<style scoped>
.pos-app {
  width: 100vw;
  height: 100vh;
  font-family: Arial, sans-serif;
  background: #f5f5f5;
}
</style>
