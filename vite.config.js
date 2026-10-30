import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.PORT || env.VITE_BACKEND_PORT || '4000'
  const target = `http://localhost:${backendPort}`
  const proxy = { '/api': { target, changeOrigin: true } }
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    // preview dipakai untuk verifikasi build produksi (npm run preview)
    preview: { port: 4173, proxy },
  }
})
