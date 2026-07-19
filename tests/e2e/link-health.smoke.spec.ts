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

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { authenticated: true, setupRequired: false, user }, message: '' }),
    });
  });
  await page.route('**/api/admin/folders', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [{ id: 1, userId: 1, parentId: null, name: 'Tools', sortOrder: 100 }], message: '' }),
    });
  });
  await page.route('**/api/admin/notifications?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { items: [], unreadCount: 0, generatedAt: '2026-07-18T08:00:00.000Z' }, message: '' }),
    });
  });
  await page.route(/\/api\/admin\/links(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: [{
          id: 10,
          folderId: 1,
          name: 'Moved docs',
          url: 'http://old.example/docs',
          sortOrder: 100,
          healthStatus: 'redirected',
          healthStatusCode: 200,
          healthFinalUrl: 'https://new.example/docs',
          healthCheckedAt: '2026-07-18T08:00:00.000Z',
        }],
        message: '',
      }),
    });
  });
});

test('renders persisted health in the bookmark table without viewport overflow', async ({ page }, testInfo) => {
  await page.goto('/admin/links');

  await expect(page.getByRole('heading', { name: '健康检查' })).toHaveCount(0);
  await expect(page.getByTestId('check-link-health')).toBeVisible();
  await expect(page.getByTestId('link-health-10')).toContainText('重定向');
  await expect(page.locator('.admin-table-head')).toContainText('notab');
  await expect(page.locator('.admin-table-head')).toContainText('状态');
  await expect(page.locator('.chatgpt-admin-shell')).toBeVisible();
  await expect(page.locator('.workbench-sidebar')).toHaveCSS('background-color', 'rgb(249, 249, 249)');

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  if ((page.viewportSize()?.width || 0) <= 720) {
    const rowColumns = await page.getByTestId('link-row-10').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(rowColumns).toBe(1);
  }

  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ fullPage: true, path: path.join(captureDir, `admin-links-${testInfo.project.name}.png`) });
  }
});
