import { expect, test } from '@playwright/test';

// Enough top-level folders that the notab strip overflows even on a slightly wider phone; the
// bug reproduced anywhere in the 320-430 CSS px range described in the report.
const categoryNames = [
  'Ardent', 'Acde', 'Tool', 'iEE', 'Local', 'Design', 'Reading', 'Media', 'Finance', 'Travel', 'Health', 'Gaming',
];

const navigationPayload = {
  code: 0,
  data: {
    site: {
      id: 1,
      userId: 1,
      name: 'Nono Mobile Notab Fixture',
      description: 'Deterministic browser fixture for the notab overflow regression',
      slug: 'admin',
      backgroundImage: null,
      backgroundColor: '#090a0f',
      fontColor: '#ffffff',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      settings: {},
    },
    folders: categoryNames.map((name, index) => ({
      id: index + 1,
      userId: 1,
      parentId: null,
      name,
      sortOrder: 100 - index,
      locked: false,
      links: [],
    })),
  },
  message: '',
};

test.beforeEach(async ({ page }) => {
  // A narrow phone viewport regardless of project, matching the 320-430 CSS px range from the bug
  // report — the overflow only reproduces once the strip is wider than the screen.
  await page.setViewportSize({ width: 360, height: 740 });
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

test('keeps the first notab tab fully visible at rest and reachable by swiping', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'notab' });
  await expect(nav).toBeVisible();
  await expect(page.getByTestId('category-tab-all')).toBeVisible();

  // Sanity check: the fixture actually overflows the 360px viewport, otherwise the rest of the
  // assertions would pass vacuously.
  const overflow = await nav.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflow).toBe(true);

  const rest = await nav.evaluate((el) => {
    const first = el.querySelector('[data-testid="category-tab-all"]') as HTMLElement;
    const containerRect = el.getBoundingClientRect();
    const firstRect = first.getBoundingClientRect();
    return { scrollLeft: el.scrollLeft, containerLeft: containerRect.left, firstLeft: firstRect.left, firstWidth: firstRect.width };
  });

  // At rest (scrollLeft 0) the first tab must start at or after the container's own left edge —
  // i.e. nothing is clipped off-screen to the left. Before the fix, `justify-content: center`
  // (without `safe`) centered the overflowing strip so the first tab's box started to the left of
  // the scrollport with no way to scroll further left to reach it.
  expect(rest.scrollLeft).toBe(0);
  expect(rest.firstLeft).toBeGreaterThanOrEqual(rest.containerLeft - 1);
  expect(rest.firstWidth).toBeGreaterThan(0);

  // The user must also be able to swipe all the way to the last tab and back to the first.
  const last = await nav.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    const shells = el.querySelectorAll('.notab-select');
    const lastTab = shells[shells.length - 1] as HTMLElement;
    const containerRect = el.getBoundingClientRect();
    const lastRect = lastTab.getBoundingClientRect();
    return { scrollLeft: el.scrollLeft, containerRight: containerRect.right, lastRight: lastRect.right };
  });
  expect(last.scrollLeft).toBeGreaterThan(0);
  expect(last.lastRight).toBeLessThanOrEqual(last.containerRight + 1);

  const backToStart = await nav.evaluate((el) => {
    el.scrollLeft = 0;
    const first = el.querySelector('[data-testid="category-tab-all"]') as HTMLElement;
    const containerRect = el.getBoundingClientRect();
    const firstRect = first.getBoundingClientRect();
    return { scrollLeft: el.scrollLeft, containerLeft: containerRect.left, firstLeft: firstRect.left };
  });
  expect(backToStart.scrollLeft).toBe(0);
  expect(backToStart.firstLeft).toBeGreaterThanOrEqual(backToStart.containerLeft - 1);
});
