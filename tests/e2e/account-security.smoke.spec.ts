import { expect, test } from '@playwright/test';

const user = {
  id: 1,
  username: 'admin',
  email: 'admin@nono.test',
  displayName: 'Admin',
  role: 'admin',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { authenticated: true, setupRequired: false, user }, message: '' }),
    });
  });
  await page.route('**/api/admin/account/security', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          passkeys: [
            {
              id: 'credential-1',
              name: 'Windows Hello',
              deviceType: 'multiDevice',
              backedUp: true,
              lastUsedAt: '2026-07-18T02:00:00.000Z',
              createdAt: '2026-07-18T01:00:00.000Z',
            },
          ],
          sessions: [
            {
              id: 'session-1',
              current: true,
              userAgent: 'Chrome on Windows',
              ipAddress: '203.0.113.8',
              lastSeenAt: '2026-07-18T02:00:00.000Z',
              expiresAt: '2026-08-01T02:00:00.000Z',
              createdAt: '2026-07-18T01:30:00.000Z',
            },
          ],
        },
        message: '',
      }),
    });
  });
});

test('renders account security controls without viewport overflow', async ({ page }) => {
  await page.goto('/admin/account');

  await expect(page.getByRole('main').getByRole('heading', { name: '账户设置' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '通行密钥' })).toBeVisible();
  await expect(page.getByText('Windows Hello')).toBeVisible();
  await expect(page.getByText('Chrome on Windows')).toBeVisible();
  await expect(page.getByText('当前设备')).toBeVisible();
  await expect(page.getByTestId('add-passkey')).toBeDisabled();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});
