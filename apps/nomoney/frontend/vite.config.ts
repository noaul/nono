import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const product = mode === 'yumi' ? 'yumi' : 'nomoney';
  const productName = product === 'yumi' ? 'Yumi' : 'NoMoney';
  return {
    base: `/${product}/`,
    plugins: [
      react(),
      {
        name: 'product-html-branding',
        transformIndexHtml(html) {
          return html.replace(/NoMoney/g, productName);
        }
      }
    ],
    server: {
      proxy: {
        [`/${product}/api`]: {
          target: 'http://localhost:3000',
          rewrite: (path) => path.replace(new RegExp(`^/${product}`), '')
        }
      }
    },
    build: {
      outDir: product === 'yumi' ? '../backend/public-yumi' : '../backend/public',
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
