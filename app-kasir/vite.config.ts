import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ command, mode }) => {
  const envDir = path.resolve(__dirname, '..');
  const tunnelHost = command === 'serve' && loadEnv(mode, envDir, 'DEV_TUNNEL_HOST').DEV_TUNNEL_HOST?.trim();

  return {
    // Muat file .env terpusat dari root repo (kasir-warung-kopi/.env)
    envDir,
    // Disajikan di https://<domain>/kasir/ sebagai service Vercel terpisah (lihat ../vercel.json).
    // Vercel meneruskan path asli (/kasir/...) ke service, jadi file build ditaruh di dist/kasir/.
    base: '/kasir/',
    build: {
      outDir: 'dist/kasir',
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: tunnelHost ? [tunnelHost] : [],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
