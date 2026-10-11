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

test('renders bookmark transfer as a content tab and redirects the old automation URL', async ({ page }) => {
  await page.route('**/api/admin/trash?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { items: [], total: 0, nextCursor: null }, message: '' }) });
  });
  await page.goto('/admin/automation');
  await expect(page).toHaveURL(/\/admin\/import$/);

  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.locator('.bookmark-transfer-panel h2')).toHaveText('书签导入导出');
  await expect(page.getByTestId('preview-bookmarks')).toBeVisible();
  const contentNavigation = page.getByRole('navigation', { name: '内容管理', exact: true });
  const importTab = contentNavigation.getByRole('link', { name: '导入导出', exact: true });
  const trashTab = contentNavigation.getByRole('link', { name: '回收站', exact: true });
  await expect(contentNavigation.getByRole('link')).toHaveCount(4);
  await expect(importTab).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('a[href="/admin/automation"]')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await trashTab.click();
  await expect(page).toHaveURL(/\/admin\/trash$/);
  await expect(trashTab).toHaveAttribute('aria-current', 'page');
  await expect(importTab).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('preview-bookmarks')).toBeHidden();
  await importTab.click();
  await expect(page).toHaveURL(/\/admin\/import$/);
  await expect(importTab).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.bookmark-transfer-panel h2')).toHaveText('书签导入导出');
  await expect(page.getByTestId('preview-bookmarks')).toBeVisible();
});
