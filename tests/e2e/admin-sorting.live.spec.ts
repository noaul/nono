import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const authToken = process.env.E2E_AUTH_TOKEN || '';
const fixturePrefix = process.env.E2E_FIXTURE_PREFIX || '';
const liveEnabled = process.env.E2E_LIVE === '1' && Boolean(authToken && fixturePrefix);
const captureDir = process.env.E2E_CAPTURE_DIR || '';
const dragSteps = Math.max(1, Number.parseInt(process.env.E2E_DRAG_STEPS || '12', 10) || 12);

test.describe('live admin sorting acceptance', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(!liveEnabled, 'Set E2E_LIVE, E2E_AUTH_TOKEN, and E2E_FIXTURE_PREFIX to run live acceptance.');
  test.use({ extraHTTPHeaders: { authorization: `Bearer ${authToken}` } });

  test('persists one folder reorder request with 100 folders', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop pointer acceptance only.');

    await page.goto('/admin/folders');
    await expect(page.getByTestId('start-folder-sort')).toBeVisible();

    const rows = page.locator('[data-testid^="folder-row-"]');
    await expect(rows).toHaveCount(100);
    await capture(page, testInfo, 'day1-live-admin-folders-before.png');

    await page.getByTestId('start-folder-sort').click();
    const result = await dragFirstBelowSecond(page, rows, '/api/admin/folders/reorder');

    await page.getByTestId('save-folder-sort').click();
    const saveResult = await result.saveCompleted;
    expect(saveResult.requestCount).toBe(1);
    expect(saveResult.status).toBe(200);

    await page.waitForTimeout(20_000);
    await page.reload();
    await expect(page.locator('[data-testid^="folder-row-"]')).toHaveCount(100);
    await expectPersistedOrder(page.locator('[data-testid^="folder-row-"]'), result.afterIds);
    await capture(page, testInfo, 'day1-live-admin-folders-after.png');

    await attachMetrics(testInfo, 'folders-100', {
      itemCount: 100,
      firstDisplacementMs: result.firstDisplacementMs,
      dragEndToDomStableMs: result.dragEndToDomStableMs,
      saveRequestMs: saveResult.durationMs,
      reorderRequestCount: saveResult.requestCount,
      dragSteps,
      protocolMoveToHandleMs: result.protocolMoveToHandleMs,
      protocolPointerDownMs: result.protocolPointerDownMs,
      protocolMoveAcrossRowMs: result.protocolMoveAcrossRowMs,
      longTaskCount: result.longTaskCount,
      longTaskDurationMs: result.longTaskDurationMs,
    });
  });

  test('persists one link reorder request with 200 links', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop pointer acceptance only.');

    await page.goto('/admin/links');
    const fixtureFolder = page.locator('.folder-pill').filter({ hasText: `${fixturePrefix}-F001` });
    await expect(fixtureFolder).toHaveCount(1);
    await fixtureFolder.click();

    const rows = page.locator('[data-testid^="link-row-"]');
    await expect(rows).toHaveCount(200);
    await capture(page, testInfo, 'day1-live-admin-links-before.png');

    await page.getByTestId('start-link-sort').click();
    const result = await dragFirstBelowSecond(page, rows, '/api/admin/links/reorder');

    await page.getByTestId('save-link-sort').click();
    const saveResult = await result.saveCompleted;
    expect(saveResult.requestCount).toBe(1);
    expect(saveResult.status).toBe(200);

    await page.waitForTimeout(20_000);
    await page.reload();
    const reloadedFixtureFolder = page.locator('.folder-pill').filter({ hasText: `${fixturePrefix}-F001` });
    await expect(reloadedFixtureFolder).toHaveCount(1);
    await reloadedFixtureFolder.click();
    await expect(page.locator('[data-testid^="link-row-"]')).toHaveCount(200);
    await expectPersistedOrder(page.locator('[data-testid^="link-row-"]'), result.afterIds);
    await capture(page, testInfo, 'day1-live-admin-links-after.png');

    await attachMetrics(testInfo, 'links-200', {
      itemCount: 200,
      firstDisplacementMs: result.firstDisplacementMs,
      dragEndToDomStableMs: result.dragEndToDomStableMs,
      saveRequestMs: saveResult.durationMs,
      reorderRequestCount: saveResult.requestCount,
      dragSteps,
      protocolMoveToHandleMs: result.protocolMoveToHandleMs,
      protocolPointerDownMs: result.protocolPointerDownMs,
      protocolMoveAcrossRowMs: result.protocolMoveAcrossRowMs,
      longTaskCount: result.longTaskCount,
      longTaskDurationMs: result.longTaskDurationMs,
    });
  });
});

async function dragFirstBelowSecond(page: Page, rows: Locator, endpoint: string) {
  const beforeIds = await rowIds(rows);
  expect(beforeIds.length).toBeGreaterThanOrEqual(2);

  const firstRow = rows.nth(0);
  const secondRow = rows.nth(1);
  const firstHandle = firstRow.locator('.drag-handle');
  await firstHandle.scrollIntoViewIfNeeded();
  await expect(firstHandle).toBeVisible();

  const source = await firstHandle.boundingBox();
  const target = await secondRow.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();

  let requestCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === endpoint) requestCount += 1;
  });

  await page.evaluate(() => {
    const diagnostics = window as typeof window & { __nonoDragLongTasks?: PerformanceEntry[] };
    diagnostics.__nonoDragLongTasks = [];
    new PerformanceObserver((list) => diagnostics.__nonoDragLongTasks?.push(...list.getEntries()))
      .observe({ type: 'longtask' });
  });
  const displacement = page.evaluate(
    ({ selector, originalIds }) =>
      new Promise<{ displacedAt: number; pointerDownAt: number }>((resolve) => {
        const root = document.querySelector(selector);
        if (!root) {
          resolve({ displacedAt: performance.now(), pointerDownAt: 0 });
          return;
        }
        let pointerDownAt = 0;
        root.addEventListener('pointerdown', () => {
          pointerDownAt = performance.now();
        }, { capture: true, once: true });
        const observer = new MutationObserver(() => {
          const ids = [...root.querySelectorAll<HTMLElement>('[data-id]')].map((row) => row.dataset.id);
          if (ids.join(',') !== originalIds.join(',')) {
            observer.disconnect();
            resolve({ displacedAt: performance.now(), pointerDownAt });
          }
        });
        observer.observe(root, { childList: true });
      }),
    { selector: '.sortable-list', originalIds: beforeIds },
  );

  const protocolStartedAt = performance.now();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  const pointerAtHandleAt = performance.now();
  await page.mouse.down();
  const pointerDownAt = performance.now();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height + Math.min(12, target!.height / 3),
    { steps: dragSteps },
  );
  const pointerAcrossRowAt = performance.now();
  const displacementTiming = await displacement;
  await page.mouse.up();
  const dragEndedAt = await page.evaluate(() => performance.now());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const stabilizedAt = await page.evaluate(() => performance.now());

  const afterIds = await rowIds(rows);
  const longTasks = await page.evaluate(() => {
    const diagnostics = window as typeof window & { __nonoDragLongTasks?: PerformanceEntry[] };
    return (diagnostics.__nonoDragLongTasks || []).map((entry) => entry.duration);
  });
  expect(displacementTiming.pointerDownAt).toBeGreaterThan(0);
  expect(afterIds[0]).toBe(beforeIds[1]);
  expect(afterIds[1]).toBe(beforeIds[0]);
  expect(requestCount).toBe(0);

  const saveCompleted = waitForSingleSave(page, endpoint, () => requestCount);
  return {
    afterIds,
    firstDisplacementMs: round(displacementTiming.displacedAt - displacementTiming.pointerDownAt),
    protocolMoveToHandleMs: round(pointerAtHandleAt - protocolStartedAt),
    protocolPointerDownMs: round(pointerDownAt - pointerAtHandleAt),
    protocolMoveAcrossRowMs: round(pointerAcrossRowAt - pointerDownAt),
    longTaskCount: longTasks.length,
    longTaskDurationMs: round(longTasks.reduce((total, duration) => total + duration, 0)),
    dragEndToDomStableMs: round(stabilizedAt - dragEndedAt),
    saveCompleted,
  };
}

async function waitForSingleSave(page: Page, endpoint: string, requestCount: () => number) {
  const startedAt = Date.now();
  const response = await page.waitForResponse(
    (candidate) => candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === endpoint,
  );
  return {
    durationMs: Date.now() - startedAt,
    requestCount: requestCount(),
    status: response.status(),
  };
}

async function expectPersistedOrder(rows: Locator, expectedIds: string[]) {
  await expect
    .poll(async () => (await rowIds(rows)).slice(0, 2))
    .toEqual(expectedIds.slice(0, 2));
}

async function rowIds(rows: Locator) {
  return rows.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.id || ''));
}

async function capture(page: Page, testInfo: TestInfo, filename: string) {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(filename, { body: screenshot, contentType: 'image/png' });
  if (!captureDir) return;
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(path.join(captureDir, filename), screenshot);
}

async function attachMetrics(testInfo: TestInfo, scenario: string, metrics: Record<string, number>) {
  const payload = { scenario, project: testInfo.project.name, ...metrics };
  console.info(`LIVE_SORT_METRICS ${JSON.stringify(payload)}`);
  await testInfo.attach(`${scenario}-metrics.json`, {
    body: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
  });
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
