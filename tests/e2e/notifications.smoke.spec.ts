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
  let read = false;
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { authenticated: true, setupRequired: false, user }, message: '' }),
    });
  });
  await page.route(/\/api\/admin\/notifications(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname.endsWith('/mark-all-read')) {
      read = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { updated: 2 }, message: '' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          generatedAt: '2026-07-18T08:00:00.000Z',
          unreadCount: read ? 0 : 2,
          items: [
            {
              key: 'links:abc',
              source: 'links',
              severity: 'critical',
              title: 'Nono 文档访问异常',
              description: 'HTTP 503',
              href: '/admin/links',
              occurredAt: '2026-07-18T07:00:00.000Z',
              dueAt: null,
              read,
            },
            {
              key: 'nomoney:def',
              source: 'nomoney',
              severity: 'warning',
              title: '域名 noaul.com 2 天后到期',
              description: '到期日期 2026-07-20',
              href: '/nomoney/domains',
              occurredAt: '2026-07-20T23:59:00',
              dueAt: '2026-07-20T23:59:00',
              read,
            },
          ],
        },
        message: '',
      }),
    });
  });
});

test('renders and updates the unified notification center without viewport overflow', async ({ page }, testInfo) => {
  await page.goto('/admin/notifications');

  await expect(page.locator('.chatgpt-admin-shell')).toBeVisible();
  await expect(page.locator('.notification-row')).toHaveCount(2);
  await expect(page.getByText('Nono 文档访问异常')).toBeVisible();
  await expect(page.getByText('域名 noaul.com 2 天后到期')).toBeVisible();
  await expect(page.getByTestId('notification-unread-count')).toHaveText('2');
  await expect(page.locator('.notification-badge')).toHaveText('2');

  await page.getByRole('button', { name: '通知' }).click();
  await expect(page.locator('.notification-popover .notification-preview-item')).toHaveCount(2);
  await page.getByRole('button', { name: '通知' }).click();

  await page.getByTestId('mark-all-notifications-read').click();
  await expect(page.getByTestId('notification-unread-count')).toHaveText('0');
  await expect(page.locator('.notification-row.is-unread')).toHaveCount(0);
  await expect(page.locator('.notification-badge')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ fullPage: true, path: path.join(captureDir, `admin-notifications-${testInfo.project.name}.png`) });
  }
});
