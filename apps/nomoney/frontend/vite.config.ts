import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  return {
    base: '/nomoney/',
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/nomoney/api': {
          target: 'http://localhost:3000',
          rewrite: (path) => path.replace(/^\/nomoney/, '')
        }
      }
    },
    build: {
      outDir: '../backend/public',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('d3-') || id.includes('victory-vendor')) return 'chart-vendor';
            return undefined;
          }
        }
      }
    }
  };
});
