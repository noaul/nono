import { expect, test, type Page } from '@playwright/test';

async function installSite(page: Page, mode: 'light' | 'dark' = 'light') {
  await page.unrouteAll({ behavior: 'wait' });
  await page.addInitScript(mode => {
    localStorage.setItem('nono:color-mode', mode);
    localStorage.setItem('nono:locale', 'zh');
  }, mode);
  let site = {
    id: 1, userId: 1, name: 'Appearance Test', description: 'Preview fixture', slug: 'admin',
    backgroundImage: null, backgroundColor: '#cbe9e4', fontColor: '#16343a',
    searchUrlTemplate: 'https://www.google.com/search?q={query}', localSearchFirst: true,
    settings: { appearance: { bookmarkTextColor: '#17383d', cardColor: '#f4fffe', cardOpacity: 58, pageTitleColor: '#16343a', folderGapX: 40, tabBlur: 7 } },
  };
  const folders = [
    { id: 1, userId: 1, parentId: null, name: '常用', sortOrder: 100, locked: false, links: [] },
    { id: 2, userId: 1, parentId: 1, name: '工具', sortOrder: 90, locked: false,
      links: [{ id: 10, folderId: 2, name: 'Vue 文档', url: 'https://vuejs.org', sortOrder: 100 }] },
  ];
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path === '/api/auth/session') data = { authenticated: true, setupRequired: false, user: { id: 1, username: 'admin', role: 'admin' } };
    if (path === '/api/navigation/admin') data = { site, folders, access: { required: false, unlocked: true } };
    if (path === '/api/admin/site' && route.request().method() === 'PUT') {
      site = { ...site, ...route.request().postDataJSON() }; data = site;
    }
    if (path.includes('notifications')) data = { items: [], unreadCount: 0 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data, message: '' }) });
  });
  await page.goto('/');
  await expect(page.getByTestId('public-folder-card-2')).toBeVisible();
  await page.getByTestId('portal-corner-link').click();
  await page.getByTestId('drawer-tab-texture').click();
  return () => site;
}

async function setControl(page: Page, key: string, value: string) {
  await page.locator(`[data-testid="control-${key}"] input`).evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('custom colours survive dark mode and a save followed by reload', async ({ page }) => {
  const site = await installSite(page, 'dark');
  await setControl(page, 'cardColor', '#ff0000');
  await setControl(page, 'cardOpacity', '20');
  await setControl(page, 'bookmarkTextColor', '#1122ee');
  await expect(page.locator('.large-links').first()).toHaveCSS('background-color', 'rgba(255, 0, 0, 0.2)');
  await expect(page.locator('.large-link').first()).toHaveCSS('color', 'rgba(17, 34, 238, 0.94)');
  await page.getByTestId('appearance-save').click();
  await expect(page.getByTestId('appearance-save')).toBeDisabled();
  expect(site().settings.appearance).toMatchObject({ cardColor: '#ff0000', cardOpacity: 20, folderGapX: 40, tabBlur: 7 });
  await page.reload();
  await expect(page.locator('.large-links').first()).toHaveCSS('background-color', 'rgba(255, 0, 0, 0.2)');
});

test('bookmark size and density changes affect the actual mobile and desktop page', async ({ page }) => {
  await installSite(page);
  await setControl(page, 'bookmarkTextSize', '18');
  await page.getByTestId('density-spacious').click();
  await expect(page.locator('.large-link > span:last-child').first()).toHaveCSS('font-size', '18px');
  await expect(page.locator('.large-links').first()).toHaveCSS('grid-auto-rows', '46px');
});

test('keeps a real homepage preview visible while editing and scrolling details', async ({ page }, testInfo) => {
  await installSite(page);
  const preview = page.getByTestId('appearance-live-preview');
  await expect(preview).toBeVisible();
  await expect(page.frameLocator('[data-testid="appearance-live-preview"]').locator('.large-links').first()).toBeInViewport();
  await setControl(page, 'cardColor', '#ff0000');
  await setControl(page, 'cardOpacity', '20');
  const frame = page.frameLocator('[data-testid="appearance-live-preview"]');
  await expect(frame.locator('.large-links').first()).toHaveCSS('background-color', 'rgba(255, 0, 0, 0.2)');
  await page.locator('.drawer-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(preview).toBeInViewport();
  expect(await frame.getByTestId('appearance-settings-drawer').count()).toBe(0);
  const path = testInfo.outputPath('appearance-preview.png');
  await page.screenshot({ path });
  await testInfo.attach('appearance-preview', { path, contentType: 'image/png' });
});


test('advanced details change the rendered page and the pinned preview', async ({ page }) => {
  await installSite(page);
  await page.getByTestId('appearance-advanced').check();
  for (const [key, value] of Object.entries({ searchRadius: '8', glassBorderWidth: '3', pageTitleSize: '42', folderGapX: '56', pagePaddingX: '64', notabTextColor: '#cc1122' })) {
    await setControl(page, key, value);
  }
  await page.getByTestId('notabOverflow-wrap').click();
  const frame = page.frameLocator('[data-testid="appearance-live-preview"]');
  for (const root of [page, frame]) {
    await expect(root.locator('.search-bar').first()).toHaveCSS('border-radius', '8px');
    await expect(root.locator('.large-links').first()).toHaveCSS('border-top-width', '3px');
    await expect(root.locator('.nav-header h1')).toHaveCSS('font-size', '42px');
    await expect(root.locator('.adaptive-folder-grid')).toHaveCSS('column-gap', '56px');
    await expect(root.locator('.folder-tabs')).toHaveCSS('flex-wrap', 'wrap');
    await expect(root.locator('.notab-select').first()).toHaveCSS('color', 'rgba(204, 17, 34, 0.76)');
  }
  const expectedPadding = page.viewportSize()!.width <= 640 ? '32px' : '48px';
  await expect(page.locator('.nav-content').first()).toHaveCSS('padding-left', expectedPadding);
  await expect(frame.locator('.nav-content').first()).toHaveCSS('padding-left', expectedPadding);
  await expect.poll(async () => frame.locator('body').evaluate(() => window.innerWidth)).toBe(page.viewportSize()!.width);
});

test('small and short screens keep preview and detail controls reachable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 320, height: 568 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await installSite(page);
    await expect(page.getByTestId('appearance-live-preview')).toBeInViewport();
    expect(await page.locator('.drawer-scroll').evaluate(el => el.clientHeight)).toBeGreaterThan(70);
    expect(await page.locator('.appearance-drawer').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByTestId('appearance-search').fill('圆角');
    await expect(page.getByTestId('control-searchRadius')).toBeVisible();
    await setControl(page, 'searchRadius', '8');
    const frame = page.frameLocator('[data-testid="appearance-live-preview"]');
    await expect(frame.locator('.search-bar')).toHaveCSS('border-radius', '8px');
    const path = testInfo.outputPath(`appearance-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path });
    await testInfo.attach(`appearance-${viewport.width}x${viewport.height}`, { path, contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});
