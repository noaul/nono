import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Extraction runs against a real DOM in the page, so it is tested against one too.
    environment: 'jsdom',
  },
});
