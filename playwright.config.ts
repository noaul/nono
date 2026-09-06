import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const nostarBaseURL = process.env.PLAYWRIGHT_NOSTAR_BASE_URL || 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: path.join(os.tmpdir(), 'nono-playwright-test-results'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'line',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w packages/web -- --host 127.0.0.1',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix apps/nostar run dev -- --host 127.0.0.1 --port 4174',
      url: `${nostarBaseURL}/nostar/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
