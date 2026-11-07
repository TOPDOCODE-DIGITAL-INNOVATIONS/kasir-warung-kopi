import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { consumeSyncLinkFromUrl } from './lib/storage';
import './index.css';

// Link kasir dari dashboard (…/kasir/#token=…): hubungkan perangkat ini ke cabang sebelum app tampil.
consumeSyncLinkFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Minta browser tidak menghapus data kasir (localStorage) saat ruang disk menipis.
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((ok) => (ok ? true : navigator.storage.persist())).catch(() => {});
}

// Service worker hanya di build produksi; di mode dev akan menyajikan file lama dari cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
