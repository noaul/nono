import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const captureDir = process.env.E2E_CAPTURE_DIR || '';
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
  await page.route(/\/api\/admin\/notifications(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { items: [], unreadCount: 0, generatedAt: new Date().toISOString() }, message: '' }),
    });
  });
  await page.route('**/api/admin/audit/settings', async (route) => {
    const retentionDays = route.request().method() === 'PUT'
      ? JSON.parse(route.request().postData() || '{}').retentionDays
      : 180;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { id: 1, retentionDays, createdAt: '', updatedAt: '' }, message: '' }),
    });
  });
  await page.route(/\/api\/admin\/audit\?.*$/, async (route) => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      actorUserId: 1,
      actorUsername: index === 6 ? 'member' : 'admin',
      actorRole: index === 6 ? 'user' : 'admin',
      action: index === 1 ? 'delete' : index === 2 ? 'bulk_move' : 'update',
      resourceType: index === 1 ? 'backup' : index === 2 ? 'folder' : 'bookmark',
      resourceId: String(index + 10),
      resourceLabel: index === 1 ? '20260718T100000Z' : index === 2 ? '研究资料' : `文档资源 ${index + 1}`,
      result: index === 1 ? 'failure' : 'success',
      statusCode: index === 1 ? 500 : 200,
      ipAddress: '203.0.113.9',
      userAgent: 'Chrome 140 on Windows',
      details: index === 1
        ? { backupId: '20260718T100000Z', error: 'Internal server error' }
        : { before: { name: `旧名称 ${index + 1}` }, after: { name: `文档资源 ${index + 1}` } },
      createdAt: new Date(Date.UTC(2026, 6, 18, 10, index)).toISOString(),
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { items, total: 128, page: 1, pageSize: 50 }, message: '' }),
    });
  });
});

test('renders responsive audit logs without breaking the admin workspace', async ({ page }, testInfo) => {
  await page.goto('/admin/audit');

  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.locator('.page-title h1')).toHaveText('操作审计');
  await expect(page.locator('[data-testid^="audit-row-"]')).toHaveCount(8);
  await page.locator('[data-testid="audit-expand-1"]').click();
  await expect(page.locator('[data-testid="audit-details-1"]')).toContainText('旧名称 1');

  const viewportHasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(viewportHasNoOverflow).toBe(true);

  const workspaceBox = await page.locator('.audit-workspace').boundingBox();
  const viewport = page.viewportSize();
  expect(workspaceBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(workspaceBox!.x).toBeGreaterThanOrEqual(0);
  expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(viewport!.width + 1);

  const filterActionsBox = await page.locator('.audit-filter-actions').boundingBox();
  expect(filterActionsBox).not.toBeNull();
  expect(filterActionsBox!.x + filterActionsBox!.width).toBeLessThanOrEqual(workspaceBox!.x + workspaceBox!.width + 1);

  const headerButtonBoxes = await page.locator('.admin-page-actions button').evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  }));
  expect(Math.max(...headerButtonBoxes.map((box) => box.top)) - Math.min(...headerButtonBoxes.map((box) => box.top))).toBeLessThanOrEqual(2);

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.locator('.audit-result').first()).toBeInViewport();
    await expect(page.locator('.audit-row time').first()).toBeInViewport();
  }

  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ fullPage: true, path: path.join(captureDir, `admin-audit-${testInfo.project.name}.png`) });
  }
});
