import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

async function createTempDataFile() {
  const dir = await mkdtemp(join(tmpdir(), 'nono-test-'));
  return {
    dir,
    filePath: join(dir, 'nono.json'),
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function withServer(run) {
  const data = await createTempDataFile();
  const server = await createServer({ dataFile: data.filePath, sessionSecret: 'test-session-secret' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`, data.filePath);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await data.cleanup();
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json();
  return { response, payload };
}

async function bootstrapAdmin(baseUrl) {
  const init = await requestJson(baseUrl, '/api/admin/setup', {
    method: 'POST',
    body: JSON.stringify({
      username: 'admin',
      displayName: 'Nono Admin',
      password: 'correct horse battery staple',
    }),
  });
  const cookie = init.response.headers.get('set-cookie').split(';')[0];
  return { cookie, payload: init.payload };
}

test('creates durable default state and serves the public navigation payload by username', async () => {
  await withServer(async (baseUrl, dataFile) => {
    const { response, payload } = await requestJson(baseUrl, '/api/v1/allsiteandlinks/admin');
    const stored = JSON.parse(await readFile(dataFile, 'utf8'));

    assert.equal(response.status, 200);
    assert.equal(payload.code, 0);
    assert.equal(payload.data.site_info.name, 'Nono');
    assert.equal(payload.data.site_info.search_engine, 'google');
    assert.equal(payload.data.site_info.search_url_template, 'https://www.google.com/search?q={query}');
    assert.ok(Array.isArray(payload.data.folder_with_links));
    assert.ok(payload.data.folder_with_links.length >= 4);
    assert.ok(payload.data.folder_with_links[0].links.length >= 3);
    assert.equal(stored.version, 1);
    assert.equal(stored.site.name, 'Nono');
  });
});

test('returns 404 JSON for unknown users', async () => {
  await withServer(async (baseUrl) => {
    const { response, payload } = await requestJson(baseUrl, '/api/v1/allsiteandlinks/missing-user');

    assert.equal(response.status, 404);
    assert.equal(payload.code, 404);
    assert.match(payload.msg, /not found/i);
  });
});

test('serves the single page app shell with Google search copy', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>Nono/);
    assert.match(html, /id="app"/);
    assert.match(html, /Google/);
  });
});

test('serves the admin console shell', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Nono 控制台/);
    assert.match(html, /admin\.js/);
  });
});

test('protects admin APIs and supports setup, session, logout, and login', async () => {
  await withServer(async (baseUrl) => {
    const denied = await requestJson(baseUrl, '/api/admin/state');
    assert.equal(denied.response.status, 401);

    const { cookie } = await bootstrapAdmin(baseUrl);
    const session = await requestJson(baseUrl, '/api/admin/session', { headers: { cookie } });
    assert.equal(session.response.status, 200);
    assert.equal(session.payload.authenticated, true);
    assert.equal(session.payload.user.username, 'admin');

    const logout = await requestJson(baseUrl, '/api/admin/logout', {
      method: 'POST',
      headers: { cookie },
      body: '{}',
    });
    assert.equal(logout.response.status, 200);

    const login = await requestJson(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple' }),
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.payload.user.displayName, 'Nono Admin');
    assert.match(login.response.headers.get('set-cookie'), /nono_session=/);
  });
});

test('updates site, folders, and links through the admin API', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await bootstrapAdmin(baseUrl);

    const site = await requestJson(baseUrl, '/api/admin/site', {
      method: 'PUT',
      headers: { cookie },
      body: JSON.stringify({
        name: 'My Nono',
        description: 'Personal navigation',
        backgroundMode: 'color',
        backgroundColor: '#102030',
        fontColor: '#ffffff',
        searchEngine: 'google',
        searchUrlTemplate: 'https://www.google.com/search?q={query}',
        localSearchFirst: true,
        publishUrl: 'http://127.0.0.1:3001/',
      }),
    });
    assert.equal(site.response.status, 200);
    assert.equal(site.payload.site.name, 'My Nono');

    const folder = await requestJson(baseUrl, '/api/admin/folders', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({ name: 'Docs', icon: 'book', description: 'References' }),
    });
    assert.equal(folder.response.status, 201);

    const link = await requestJson(baseUrl, '/api/admin/links', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        folderId: folder.payload.folder.id,
        name: 'Example',
        url: 'https://example.com/',
        icon: 'link',
        description: 'Example site',
      }),
    });
    assert.equal(link.response.status, 201);

    const publicData = await requestJson(baseUrl, '/api/v1/allsiteandlinks/admin');
    const docs = publicData.payload.data.folder_with_links.find((item) => item.name === 'Docs');
    assert.ok(docs);
    assert.equal(docs.links[0].name, 'Example');
  });
});

test('imports and exports Netscape browser bookmarks HTML', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await bootstrapAdmin(baseUrl);
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1710000000">Research</H3>
  <DL><p>
    <DT><A HREF="https://example.com/" ADD_DATE="1710000001" ICON_URI="https://example.com/favicon.ico">Example &amp; Docs</A>
    <DT><H3>Nested</H3>
    <DL><p>
      <DT><A HREF="https://nested.example/">Nested Link</A>
    </DL><p>
  </DL><p>
</DL><p>`;

    const imported = await requestJson(baseUrl, '/api/admin/bookmarks/import', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({ html }),
    });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.payload.summary.addedFolders, 2);
    assert.equal(imported.payload.summary.addedLinks, 2);

    const exported = await fetch(`${baseUrl}/api/admin/bookmarks/export`, { headers: { cookie } });
    const exportedHtml = await exported.text();
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-disposition'), /nono-bookmarks\.html/);
    assert.match(exportedHtml, /NETSCAPE-Bookmark-file-1/);
    assert.match(exportedHtml, /Example &amp; Docs/);
    assert.match(exportedHtml, /https:\/\/nested\.example\//);
  });
});
