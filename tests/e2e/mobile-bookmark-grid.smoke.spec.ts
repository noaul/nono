import { expect, test } from '@playwright/test';

// A folder with enough bookmarks to fill more than one row, so the column count is directly
// observable from each cell's bounding box. Labels run 7-8 Chinese characters, matching the
// "mostly visible before truncation" contract for a 320-430 CSS px phone.
const bookmarkNames = [
  '摄影爱好者社区', '产品设计灵感库', '前端框架文档站', '影视资源分享区',
  '开源项目集合站', '技术博客聚合器', '在线图片编辑器', '云端笔记同步盘',
  '编程语言学习课', '独立开发者论坛',
];

const navigationPayload = {
  code: 0,
  data: {
    site: {
      id: 1,
      userId: 1,
      name: 'Nono Mobile Grid Fixture',
      description: 'Deterministic browser fixture for the mobile bookmark grid regression',
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
        name: 'Mobile Grid Notab',
        sortOrder: 100,
        locked: false,
        links: [],
      },
      {
        id: 2,
        userId: 1,
        parentId: 1,
        name: 'Mobile Grid Folder',
        sortOrder: 100,
        locked: false,
        links: bookmarkNames.map((name, index) => ({
          id: index + 1,
          folderId: 2,
          name,
          url: `https://example.com/${index + 1}`,
          description: '',
          icon: null,
          sortOrder: 100 - index,
        })),
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

for (const width of [320, 360, 390, 430]) {
  test(`keeps a three-column bookmark grid without page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const card = page.getByTestId('public-folder-card-2');
    await expect(card).toBeVisible();

    const cellLefts = await card.evaluate((el) => {
      const cells = [...el.querySelectorAll('.bookmark-cell')] as HTMLElement[];
      return cells.slice(0, 6).map((cell) => Math.round(cell.getBoundingClientRect().left));
    });
    // Three columns means the first three cells sit at three distinct x-positions, and the 4th
    // cell (start of row two) realigns with the 1st column.
    const distinctColumns = new Set(cellLefts.slice(0, 3)).size;
    expect(distinctColumns).toBe(3);
    expect(cellLefts[3]).toBe(cellLefts[0]);

    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);

    // The label stays fully inside its cell (no horizontal overflow) even at the narrowest width.
    const firstLink = card.locator('.large-link').first();
    const fits = await firstLink.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
  });
}

test('keeps the notab strip rounded on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'notab' });
  await expect(nav).toBeVisible();
  const borderRadius = await nav.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(parseFloat(borderRadius)).toBeGreaterThan(0);
});
