import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('serves the public navigation payload by username', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/allsiteandlinks/admin`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.code, 0);
    assert.equal(payload.data.site_info.name, 'Nono');
    assert.ok(Array.isArray(payload.data.folder_with_links));
    assert.ok(payload.data.folder_with_links.length >= 4);
    assert.ok(payload.data.folder_with_links[0].links.length >= 3);
  });
});

test('returns 404 JSON for unknown users', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/allsiteandlinks/missing-user`);
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.code, 404);
    assert.match(payload.msg, /not found/i);
  });
});

test('serves the single page app shell', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>Nono/);
    assert.match(html, /id="app"/);
  });
});
