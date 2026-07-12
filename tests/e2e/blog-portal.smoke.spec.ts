import { expect, test } from '@playwright/test';

test.skip(process.env.E2E_LIVE !== '1', 'The integrated Blog route is available in the unified deployment.');

test('renders the blog portal and links back to the Nono root', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  expect(baseURL).toBeTruthy();

  await page.goto('/blog', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('main')).toBeVisible();

  const portalShortcut = page.getByTestId('portal-corner-link');
  await expect(portalShortcut).toBeVisible();
  await expect(portalShortcut).toHaveAttribute('href', new URL('/', baseURL as string).toString());
});
