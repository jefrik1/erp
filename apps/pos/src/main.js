import { createApp } from 'vue';
import App from './App.vue';
import ToastPlugin from './composables/useToast.js';
import ModalPlugin from './composables/useModal.js';

const app = createApp(App);

app.use(ToastPlugin);
app.use(ModalPlugin);

app.mount('#app');
