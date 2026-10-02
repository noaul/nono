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

  test('batch preview, Lists import, appearance and README work on desktop and mobile', async ({ page }, testInfo) => {
    await installAuthenticatedMocks(page);
    let starWrites = 0;
    await page.route('**/api/nostar/proxy/github/user/starred/**', async route => {starWrites++; await json(route, {});});
    await page.goto(`${nostarBaseURL}/nostar/`);
    await expect(page.getByRole('heading', {name:'连接GitHub'})).toBeVisible();
    await page.locator('input[type="password"]').fill('ghp_nostar_e2e_token');
    await page.getByRole('button', {name:'连接到GitHub'}).click();
    const card = page.getByRole('button', {name:/owner\/e2e-repo/});
    await expect(card).toBeVisible();
    await page.getByRole('button', {name:'批量 Star',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'批量 Star'});
    await dialog.getByRole('textbox',{name:'粘贴仓库'}).fill('https://github.com/owner/e2e-repo');
    await dialog.getByRole('button',{name:'预览仓库'}).click();
    await expect(dialog.getByText('已在本地 Star 仓库中')).toBeVisible();
    expect(starWrites).toBe(0);
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    if(testInfo.project.name === 'mobile-chromium') {
      await card.locator('summary').click();
      await card.getByRole('button',{name:'编辑与分类'}).focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('heading',{name:'编辑仓库信息'})).toBeVisible();
      await expect(page.getByRole('heading',{name:'owner/e2e-repo',exact:true})).toBeHidden();
      await page.keyboard.press('Escape');
      await card.locator('summary').click();
    }
    await card.click();
    await expect(page.getByText('Keep this note')).toBeVisible();
    await expect(page.locator('.katex').first()).toBeVisible();
    await expect(page.locator('.markdown-diagram-output svg')).toBeVisible();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'GitHub Lists',exact:true}).click();
    await page.getByRole('button',{name:'刷新 GitHub Lists'}).click();
    await page.getByLabel('Import Browser List').check();
    await page.getByRole('button',{name:'导入所选列表'}).click();
    await expect(page.getByText('已导入所选列表。')).toBeVisible();
    await page.getByLabel('列表分类').selectOption('github-list-LIST_BROWSER');
    const localMembers = page.getByRole('heading',{name:'编辑导入的分类成员'}).locator('..');
    await localMembers.getByLabel('owner/e2e-repo',{exact:true}).uncheck();
    await localMembers.getByRole('button',{name:'保存本地成员'}).click();
    await expect(localMembers.getByText('本地成员已保存。请重新预览 GitHub 推送。')).toBeVisible();
    await localMembers.getByLabel('owner/e2e-repo',{exact:true}).check();
    await localMembers.getByRole('button',{name:'保存本地成员'}).click();

    await page.getByRole('tab',{name:'外观',exact:true}).click();
    await page.getByLabel('字号').selectOption('large');
    await page.getByLabel('减少动画').check();
    await page.getByLabel('描述',{exact:true}).uncheck();
    await expect(page.locator('html')).toHaveAttribute('data-nostar-font','large');
    await expect(page.locator('html')).toHaveAttribute('data-nostar-reduced-motion','true');
    await page.getByRole('button',{name:'仓库',exact:true}).click();
    await expect(card.getByText('A NoStar browser test repository')).toBeHidden();
    await page.getByText('Browser List',{exact:true}).click();
    await expect(card).toBeVisible();
    expect(starWrites).toBe(0);
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
  if (path === '/proxy/github/graphql') {
    const body = request.postDataJSON();
    return json(route, {data: body.query.includes('viewer { lists')
      ? {viewer:{lists:{nodes:[{id:'LIST_BROWSER',name:'Browser List',description:'',isPrivate:true}],pageInfo:{hasNextPage:false,endCursor:null}}},rateLimit:{remaining:4000,cost:1,resetAt:'2026-10-01T00:00:00Z'}}
      : {node:{items:{nodes:[{__typename:'Repository',id:'REPO_BROWSER',nameWithOwner:'owner/e2e-repo'}],pageInfo:{hasNextPage:false,endCursor:null}}}}});
  }
  if (path === '/proxy/github/user') {
    return json(route, githubUser);
  }
  if (path === '/proxy/github/repos/owner/e2e-repo/readme') {
    const content = Buffer.from('# NoStar E2E README\n\n> [!NOTE]\n> Keep this note\n\nInline $x^2$.\n\n```mermaid\ngraph TD; Start-->End\n```\n\n```ts\nconst ready = true;\n```').toString('base64');
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
