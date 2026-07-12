import { expect, test } from '@playwright/test';

const navigationPayload = {
  code: 0,
  data: {
    site: {
      id: 1,
      userId: 1,
      name: 'Nono Baseline',
      description: 'Deterministic browser smoke fixture',
      slug: 'admin',
      backgroundImage: null,
      backgroundColor: '#090a0f',
      fontColor: '#ffffff',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      settings: {},
    },
    folders: [
      {
        id: 1,
        userId: 1,
        parentId: null,
        name: 'Baseline Folder',
        sortOrder: 100,
        locked: false,
        links: [],
      },
    ],
  },
  message: '',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/navigation/admin', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(navigationPayload) });
  });
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { authenticated: false, setupRequired: false, user: null }, message: '' }),
    });
  });
});

test('renders the public navigation shell without overflow and records timing', async ({ page }, testInfo) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '登录 Nono' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nono Baseline' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '文件夹' })).toBeVisible();
  await expect(page.getByTestId('public-folder-card-1')).toBeVisible();

  const viewport = page.viewportSize();
  const baseline = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const firstContentfulPaint = performance
      .getEntriesByType('paint')
      .find((entry) => entry.name === 'first-contentful-paint')?.startTime;

    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadEventMs: navigation?.loadEventEnd ?? null,
      firstContentfulPaintMs: firstContentfulPaint ?? null,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(baseline.domContentLoadedMs).not.toBeNull();
  expect(baseline.domContentLoadedMs ?? 0).toBeLessThan(10_000);
  expect(baseline.documentScrollWidth).toBeLessThanOrEqual(baseline.viewportWidth + 1);
  expect(baseline.bodyScrollWidth).toBeLessThanOrEqual(baseline.viewportWidth + 1);

  const result = { project: testInfo.project.name, viewport, ...baseline };
  console.info(`UI_BASELINE ${JSON.stringify(result)}`);
  await testInfo.attach('ui-performance-baseline.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
});
