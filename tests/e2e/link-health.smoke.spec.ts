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
  await page.route('**/api/admin/folders', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [{ id: 1, userId: 1, parentId: null, name: 'Tools', sortOrder: 100 }], message: '' }),
    });
  });
  await page.route(/\/api\/admin\/links\/health-repair(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          repaired: 1,
          skipped: 0,
          links: [{
            id: 10,
            folderId: 1,
            name: 'Moved docs',
            url: 'https://new.example/docs',
            sortOrder: 100,
            healthStatus: 'ok',
            healthStatusCode: 200,
            healthFinalUrl: null,
            healthCheckedAt: '2026-07-18T08:00:00.000Z',
          }],
        },
        message: '',
      }),
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

test('renders persisted health and repairs redirects without viewport overflow', async ({ page }) => {
  await page.goto('/admin/links');

  await expect(page.getByRole('heading', { name: '健康检查' })).toBeVisible();
  await expect(page.getByText('重定向 1', { exact: true })).toBeVisible();
  await page.getByTestId('repair-link-redirects').click();
  await expect(page.getByRole('heading', { name: '修复重定向链接' })).toBeVisible();
  const repairResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/links/health-repair');
  await page.getByTestId('confirm-accept').click();
  expect((await repairResponse).status()).toBe(200);
  await expect(page.getByTestId('link-row-10')).toContainText('https://new.example/docs');

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});
