import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // SQL.js startup and persisted migration fixtures are CPU and disk intensive.
    maxWorkers: 4,
    include: ['src/**/*.test.ts']
  }
});
