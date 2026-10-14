<template>
  <div class="login-container">
    <div class="login-card">
      <h1>POS Material Toko</h1>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>Username Kasir</label>
          <input v-model="username" type="text" placeholder="Masukkan username" autofocus />
        </div>
        
        <div class="form-group">
          <label>Password</label>
          <input v-model="password" type="password" placeholder="Masukkan password" />
        </div>

        <div class="form-group">
          <label>Server URL (optional)</label>
          <input v-model="serverUrl" type="text" placeholder="http://localhost:4000" />
        </div>

        <button type="submit" class="btn-login" :disabled="loading">
          {{ loading ? 'Logging in...' : 'Masuk' }}
        </button>
        
        <div v-if="error" class="error-msg">{{ error }}</div>
      </form>

      <div class="info">
        <p><strong>Demo:</strong> admin / admin123</p>
        <p><strong>Mode:</strong> {{ isOnline ? '🟢 Online' : '🔴 Offline' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const username = ref('admin');
const password = ref('admin123');
const serverUrl = ref('http://localhost:4000');
const loading = ref(false);
const error = ref('');
const isOnline = ref(navigator.onLine);

window.addEventListener('online', () => { isOnline.value = true; });
window.addEventListener('offline', () => { isOnline.value = false; });

const handleLogin = async () => {
  loading.value = true;
  error.value = '';

  try {
    // Try login ke server
    const response = await axios.post(`${serverUrl.value}/api/auth/login`, {
      username: username.value,
      password: password.value
    });

    const { token, user } = response.data;
    
    // Store token & user di localStorage
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('serverUrl', serverUrl.value);

    // Emit login event
    window.dispatchEvent(new CustomEvent('login', { detail: user }));
  } catch (e) {
    // Offline mode: accept any password (for demo)
    if (!isOnline.value) {
      const user = { id: 1, username: username.value };
      localStorage.setItem('user', JSON.stringify(user));
      window.dispatchEvent(new CustomEvent('login', { detail: user }));
    } else {
      error.value = e.response?.data?.error || 'Login gagal';
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  width: 350px;
}

.login-card h1 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
  font-size: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: bold;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.btn-login {
  width: 100%;
  padding: 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 10px;
}

.btn-login:hover:not(:disabled) {
  background: #5568d3;
}

.btn-login:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  color: #d32f2f;
  background: #ffebee;
  padding: 10px;
  border-radius: 4px;
  margin-top: 15px;
  font-size: 14px;
}

.info {
  margin-top: 30px;
  font-size: 12px;
  color: #999;
  border-top: 1px solid #eee;
  padding-top: 15px;
}

.info p {
  margin: 5px 0;
}
</style>
