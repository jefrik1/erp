import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.PORT || env.VITE_BACKEND_PORT || '4000'
  const target = `http://localhost:${backendPort}`
  const proxy = { '/api': { target, changeOrigin: true } }
  return {
    plugins: [react()],
    server: { host: '0.0.0.0', port: 5173, allowedHosts: true, proxy },
    // preview dipakai untuk verifikasi build produksi (npm run preview)
    preview: { host: '0.0.0.0', port: 4173, allowedHosts: true, proxy },
  }
})
