import { expect, test, type Page, type Route } from '@playwright/test';

const clipperBaseURL = process.env.PLAYWRIGHT_CLIPPER_BASE_URL || 'http://127.0.0.1:4175';

const clip = {
  id: 1,
  url: 'https://example.com/article',
  canonicalUrl: 'https://example.com/article',
  title: '剪藏模块设计',
  author: 'Writer',
  siteName: 'Example',
  domain: 'example.com',
  description: null,
  excerpt: '这是一段剪藏正文摘要。',
  wordCount: 420,
  favicon: null,
  image: null,
  publishedAt: null,
  status: 'unread',
  starred: false,
  extractor: 'defuddle',
  contentTruncated: false,
  contentVersion: 1,
  linkId: null,
  clippedAt: '2026-08-15T00:00:00.000Z',
};

const detail = {
  ...clip,
  contentHtml: '<p>这是完整的剪藏正文，用于验证阅读器渲染。</p>',
  contentMd: '这是完整的剪藏正文，用于验证阅读器渲染。',
  tags: [],
  highlights: [],
};

const json = (route: Route, data: unknown) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 0, data, message: '' }),
});

async function stubApi(page: Page) {
  // Playwright gives precedence to the most recently registered handler, so the general list
  // pattern is registered first and the specific detail route last.
  await page.route('**/api/clipper/clips**', (route) => {
    if (route.request().method() !== 'GET') return json(route, clip);
    return json(route, { items: [clip], total: 1, limit: 30, offset: 0 });
  });
  await page.route('**/api/clipper/clips/1', (route) => json(route, detail));
  await page.route('**/api/clipper/search**', (route) => json(route, {
    items: [clip], query: '剪藏', limit: 30, offset: 0,
  }));
  await page.route('**/api/clipper/tags**', (route) => json(route, []));
}

test.describe('Clipper', () => {
  test('lists clips and opens the reader', async ({ page }) => {
    await stubApi(page);
    await page.goto(`${clipperBaseURL}/clipper/`);

    await expect(page.getByText('剪藏模块设计')).toBeVisible();
    await expect(page.getByText('这是一段剪藏正文摘要。')).toBeVisible();

    await page.getByText('剪藏模块设计').click();

    const frame = page.locator('iframe.clip-article-frame');
    await expect(frame).toBeVisible();
    // The reader must never be able to execute what it renders.
    await expect(frame).toHaveAttribute('sandbox', /allow-same-origin/);
    const sandbox = await frame.getAttribute('sandbox');
    expect(sandbox).not.toContain('allow-scripts');
    await expect(frame.contentFrame().getByText('这是完整的剪藏正文')).toBeVisible();
  });

  test('searches Chinese text', async ({ page }) => {
    await stubApi(page);
    await page.goto(`${clipperBaseURL}/clipper/`);

    await page.getByRole('button', { name: '搜索' }).click();
    await page.getByLabel('搜索剪藏').fill('剪藏');
    await page.getByLabel('搜索剪藏').press('Enter');

    await expect(page.getByText('剪藏模块设计')).toBeVisible();
  });

  test('redirects to login when the session has expired', async ({ page }) => {
    await page.route('**/api/clipper/**', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 401, message: 'Authentication required' }),
    }));

    await page.goto(`${clipperBaseURL}/clipper/`);

    await expect(page).toHaveURL(/\/login\?next=%2Fclipper%2F/);
  });

  test('renders without a horizontal scrollbar on desktop and mobile', async ({ page }) => {
    await stubApi(page);
    await page.goto(`${clipperBaseURL}/clipper/`);
    await expect(page.getByText('剪藏模块设计')).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
