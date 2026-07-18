import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const user = {
  id: 1,
  username: 'admin',
  email: 'admin@nono.test',
  displayName: 'Admin',
  role: 'admin',
};
const captureDir = process.env.E2E_CAPTURE_DIR || '';

test('configures automatic backups without desktop or mobile overflow', async ({ page }, testInfo) => {
  let savedPolicy: Record<string, unknown> | null = null;
  let automation = {
    settings: { enabled: false, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 14 },
    status: {
      lastScheduledFor: null,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSuccessAt: '2026-07-18T08:00:00.000Z',
      lastFailureAt: null,
      lastError: null,
    },
  };
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { authenticated: true, setupRequired: false, user }, message: '' }),
    });
  });
  await page.route(/\/api\/admin\/notifications(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { items: [], unreadCount: 0, generatedAt: '2026-07-18T08:00:00.000Z' }, message: '' }),
    });
  });
  await page.route('**/api/admin/backups/automation', async (route) => {
    if (route.request().method() === 'PUT') {
      savedPolicy = route.request().postDataJSON();
      automation = { ...automation, settings: savedPolicy as typeof automation.settings };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: automation, message: '' }),
    });
  });
  await page.route('**/api/admin/backups', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          backups: [{
            id: '20260718T080000Z',
            filename: 'nono-backup-20260718T080000Z.tar.gz',
            createdAt: '2026-07-18T08:00:00.000Z',
            sourceCommit: '20dce63571e7',
            size: 209714721,
            sha256: 'a'.repeat(64),
            status: 'verified',
            components: ['postgres', 'nodesk', 'nomoney'],
          }],
        },
        message: '',
      }),
    });
  });

  await page.goto('/admin/backups');
  await expect(page.getByRole('heading', { name: '自动备份' })).toBeVisible();
  await page.getByTestId('backup-automation-enabled').check();
  await page.getByTestId('backup-cadence').selectOption('weekly');
  await page.getByTestId('backup-weekday').selectOption('1');
  await page.getByTestId('backup-hour').fill('4');
  await page.getByTestId('backup-retention-days').fill('45');
  await page.getByTestId('backup-max-count').fill('10');
  await page.getByTestId('save-backup-automation').click();

  await expect(page.getByText('自动备份策略已保存')).toBeVisible();
  expect(savedPolicy).toMatchObject({
    enabled: true,
    cadence: 'weekly',
    hour: 4,
    weekday: 1,
    retentionDays: 45,
    maxBackups: 10,
  });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ fullPage: true, path: path.join(captureDir, `admin-backup-automation-${testInfo.project.name}.png`) });
  }
});
