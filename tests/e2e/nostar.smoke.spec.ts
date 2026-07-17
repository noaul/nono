import { expect, test, type Page, type Route } from '@playwright/test';

const nostarBaseURL = process.env.PLAYWRIGHT_NOSTAR_BASE_URL || 'http://127.0.0.1:4174';

const repository = {
  id: 1,
  name: 'e2e-repo',
  full_name: 'owner/e2e-repo',
  description: 'A NoStar browser test repository',
  html_url: 'https://github.com/owner/e2e-repo',
  stargazers_count: 10,
  forks_count: 1,
  forks: 1,
  language: 'TypeScript',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  pushed_at: '2026-01-03T00:00:00.000Z',
  starred_at: '2026-01-04T00:00:00.000Z',
  owner: { login: 'owner', avatar_url: '' },
  owner_login: 'owner',
  owner_avatar_url: '',
  topics: ['test'],
  default_branch: 'main',
};

const githubUser = {
  id: 101,
  login: 'nostar-e2e',
  name: 'NoStar E2E',
  avatar_url: '',
  html_url: 'https://github.com/nostar-e2e',
};

test.describe('NoStar browser flows', () => {
  test('redirects an unauthenticated Nono session to login', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nostar:nono-user-id', '1'));
    await page.route('**/api/auth/session', async (route) => json(route, {
      data: { authenticated: false, setupRequired: false, user: null },
    }));
    await page.route('**/login?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<main>Login redirect captured</main>' });
    });

    await page.goto(`${nostarBaseURL}/nostar/`);

    await expect(page).toHaveURL(/\/login\?next=%2Fnostar%2F$/);
  });

  test('logs in, navigates views, and opens repository dialogs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'The full dialog flow is covered on desktop Chromium.');

    await installAuthenticatedMocks(page);
    const backendReady = page.waitForResponse((response) =>
      response.url().includes('/api/nostar/settings') && response.request().method() === 'GET',
    );

    await page.goto(`${nostarBaseURL}/nostar/`);
    await backendReady;
    await expect(page.getByRole('heading', { name: 'NoStar', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '连接GitHub' })).toBeVisible();

    await page.locator('input[type="password"]').fill('ghp_nostar_e2e_token');
    await page.getByRole('button', { name: '连接到GitHub' }).click();

    await expect(page.getByRole('button', { name: '仓库' })).toBeVisible();
    const card = page.getByRole('button', { name: /owner\/e2e-repo/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText('A NoStar browser test repository');

    await page.getByRole('button', { name: 'Gist' }).click();
    await expect(page.getByRole('heading', { name: 'Gist', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '仓库' }).click();
    await expect(card).toBeVisible();

    await page.getByTitle('编辑仓库信息').click();
    await expect(page.getByRole('heading', { name: '编辑仓库信息' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '编辑仓库信息' })).toBeHidden();

    await card.click();
    await expect(page.getByRole('heading', { name: 'owner/e2e-repo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'NoStar E2E README' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'owner/e2e-repo' })).toBeHidden();
  });
});

async function installAuthenticatedMocks(page: Page) {
  await page.addInitScript(() => localStorage.setItem('nostar:nono-user-id', '1'));
  await page.route('**/api/auth/session', async (route) => json(route, {
    data: { authenticated: true, setupRequired: false, user: { id: 1 } },
  }));
  await page.route('https://api.github.com/user', async (route) => json(route, githubUser));
  await page.route('**/api/nostar/**', handleNoStarApi);
}

async function handleNoStarApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/api\/nostar/, '');

  if (request.method() === 'PUT' || request.method() === 'DELETE') {
    return json(route, {});
  }
  if (path === '/health') {
    return json(route, { status: 'ok', version: 'e2e', timestamp: new Date(0).toISOString() });
  }
  if (path === '/settings') {
    return json(route, { github_token_status: 'ok' });
  }
  if (path === '/repositories') {
    return json(route, { repositories: [repository], total: 1 });
  }
  if (path === '/releases') {
    return json(route, { releases: [], total: 0 });
  }
  if (path === '/configs/ai' || path === '/configs/webdav' || path === '/configs/embedding') {
    return json(route, []);
  }
  if (path === '/configs/vector-search') {
    return json(route, {
      enabled: false,
      workerUrl: '',
      authToken: '',
      embeddingConfigId: '',
      indexMode: 'readme',
      readmeMaxChars: 6000,
    });
  }
  if (path === '/proxy/github/user') {
    return json(route, githubUser);
  }
  if (path === '/proxy/github/repos/owner/e2e-repo/readme') {
    const content = Buffer.from('# NoStar E2E README\n\n```ts\nconst ready = true;\n```').toString('base64');
    return json(route, { encoding: 'base64', content });
  }
  if (path === '/proxy/github/repos/owner/e2e-repo/git/trees/main') {
    return json(route, { tree: [{ path: 'README.md', type: 'blob', size: 64 }], truncated: false });
  }
  if (path === '/proxy/github/repos/owner/e2e-repo') {
    return json(route, repository);
  }
  if (path === '/proxy/github/repos/owner/e2e-repo/contents') {
    return json(route, [{ path: 'README.md', name: 'README.md', type: 'file', size: 64 }]);
  }

  return json(route, {});
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
