import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](@vue[\\/]|vue[\\/]|vue-router[\\/]|pinia[\\/]|@vue[\\/]devtools)/.test(id)) {
            return 'vendor-vue';
          }
          if (id.includes('node_modules/@simplewebauthn')) return 'vendor-webauthn';
          if (id.includes('node_modules/sortablejs')) return 'vendor-sortable';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
