import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

// PWA: daftar service worker hanya pada build produksi (dev tetap tanpa cache).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[pwa] service worker gagal didaftarkan:', e.message);
    });
  });
}
