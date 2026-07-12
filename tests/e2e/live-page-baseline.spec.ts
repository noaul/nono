import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const authToken = process.env.E2E_AUTH_TOKEN || '';
const liveEnabled = process.env.E2E_LIVE === '1' && Boolean(authToken);
const captureDir = process.env.E2E_CAPTURE_DIR || '';

test.describe('live RN page baseline', () => {
  test.skip(!liveEnabled, 'Set E2E_LIVE and E2E_AUTH_TOKEN to run live page acceptance.');
  test.use({ extraHTTPHeaders: { authorization: `Bearer ${authToken}` } });

  for (const route of ['/admin/folders', '/admin/links', '/blog']) {
    test(`${route} renders without horizontal overflow`, async ({ page }, testInfo) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load');

      if (route === '/blog') {
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByTestId('portal-corner-link')).toBeVisible();
      } else if (route === '/admin/folders') {
        await expect(page.getByTestId('start-folder-sort')).toBeVisible();
        await expect(page.getByText('正在加载文件夹')).toBeHidden();
      } else {
        await expect(page.locator('.folder-pill').first()).toBeVisible();
        await expect(page.getByText('正在加载书签')).toBeHidden();
      }

      const metrics = await readPageMetrics(page);
      expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

      const routeName = route.replaceAll('/', '-').replace(/^-/, '');
      const filename = `day1-live-${routeName}-${testInfo.project.name}.png`;
      await capture(page, testInfo, filename);
      const payload = { route, project: testInfo.project.name, viewport: page.viewportSize(), ...metrics };
      console.info(`LIVE_PAGE_METRICS ${JSON.stringify(payload)}`);
      await testInfo.attach(`${routeName}-metrics.json`, {
        body: JSON.stringify(payload, null, 2),
        contentType: 'application/json',
      });
    });
  }
});

async function readPageMetrics(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const firstContentfulPaint = performance
      .getEntriesByType('paint')
      .find((entry) => entry.name === 'first-contentful-paint')?.startTime;
    return {
      domContentLoadedMs: round(navigation?.domContentLoadedEventEnd ?? 0),
      loadEventMs: round(navigation?.loadEventEnd ?? 0),
      firstContentfulPaintMs: round(firstContentfulPaint ?? 0),
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
}

async function capture(page: Page, testInfo: TestInfo, filename: string) {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(filename, { body: screenshot, contentType: 'image/png' });
  if (!captureDir) return;
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(path.join(captureDir, filename), screenshot);
}
