import { expect, test } from '@playwright/test';

test.skip(process.env.E2E_LIVE !== '1', 'The integrated NoDesk route is available in the unified deployment.');

test('renders the NoDesk workbench', async ({ page }) => {

  await page.goto('/nodesk', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('main')).toBeVisible();

  await expect(page.locator('.ambient-brand')).toBeVisible();
  await expect(page.locator('.ambient-wallpaper')).toBeVisible();
});
