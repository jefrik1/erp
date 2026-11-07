import axios from 'axios';

function resolveBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) {
      // Akses perangkat jarak jauh / tablet / LAN / VPN: gunakan '/api' relatif
      return '/api';
    }
  }
  return envUrl || '/api';
}

const api = axios.create({ baseURL: resolveBaseUrl() });
api.interceptors.request.use(c=>{
  const t=localStorage.getItem('token');
  if(t) c.headers.Authorization='Bearer '+t;
  return c;
});
api.interceptors.response.use(r=>r, e=>{
  if(e.response?.status===401){ localStorage.removeItem('token'); location.href='/login'; }
  return Promise.reject(e);
});
export default api;
