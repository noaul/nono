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
  await page.route('**/api/admin/notifications?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { items: [], unreadCount: 0, generatedAt: '2026-07-18T08:00:00.000Z' }, message: '' }),
    });
  });
});

test('renders bookmark transfer under automation in the neutral admin shell', async ({ page }) => {
  await page.goto('/admin/automation');

  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.locator('.bookmark-transfer-panel h2')).toHaveText('书签导入导出');
  await expect(page.getByTestId('preview-bookmarks')).toBeVisible();
  await expect(page.locator('a[href="/admin/automation"]')).toHaveCount(1);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});
