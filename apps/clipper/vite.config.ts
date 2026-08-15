import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served by the Nono server from packages/web/dist/clipper, mounted at /clipper/.
  base: '/clipper/',
  plugins: [react()],
  build: {
    manifest: true,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 4175,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
});
