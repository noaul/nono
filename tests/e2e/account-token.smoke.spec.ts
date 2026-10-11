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

test('creates an API token from Account without desktop or mobile overflow', async ({ page }, testInfo) => {
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
      body: JSON.stringify({ code: 0, data: { items: [], unreadCount: 0, generatedAt: '2026-08-14T08:00:00.000Z' }, message: '' }),
    });
  });
  await page.route('**/api/admin/account/security', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { passkeys: [], sessions: [{ id: 'current', current: true, userAgent: 'Chrome', ipAddress: '127.0.0.1', lastSeenAt: '2026-08-14T08:00:00.000Z' }] }, message: '' }),
    });
  });
  await page.route('**/api/admin/site', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { guestAccessEnabled: false, guestAccessPasswordSet: false }, message: '' }),
    });
  });
  await page.route('**/api/admin/tokens', async (route) => {
    const data = route.request().method() === 'POST'
      ? { id: 7, name: 'Chrome extension', token: 'nono_once_secret', scopes: ['bookmarks:read', 'bookmarks:write', 'ai:analyze'], expiresAt: null, createdAt: '2026-08-14T08:00:00.000Z' }
      : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data, message: '' }) });
  });

  await page.goto('/admin/account#api-tokens');
  const accessTab = page.getByRole('tab', { name: '访问与集成', exact: true });
  const securityTab = page.getByRole('tab', { name: '登录与安全', exact: true });
  await expect(accessTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('account-access-card')).toBeVisible();
  await expect(page.getByTestId('login-devices-section')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'API Token', exact: true })).toBeVisible();
  await page.getByTestId('create-api-token').click();
  await expect(page.getByTestId('created-api-token-modal')).toContainText('nono_once_secret');

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ fullPage: true, path: path.join(captureDir, `admin-account-token-${testInfo.project.name}.png`) });
  }

  await page.getByTestId('created-api-token-modal').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByTestId('created-api-token-modal')).toBeHidden();
  await securityTab.click();
  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(securityTab).toHaveAttribute('aria-selected', 'true');
  await expect(accessTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('account-access-card')).toBeHidden();
  await expect(page.getByTestId('login-devices-section')).toBeVisible();
  await expect(page.getByTestId('login-devices-section')).toContainText('Chrome');
  await accessTab.click();
  await expect(page).toHaveURL(/\/admin\/account#access$/);
  await expect(accessTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'API Token', exact: true })).toBeVisible();
  await expect(page.getByTestId('login-devices-section')).toBeHidden();
});
