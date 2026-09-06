import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptDeployment } from '../scripts/accept-deployment.mjs';

test('checks all public routes and recursively verifies NoStar lazy chunks', async () => {
  const baseUrl = 'http://127.0.0.1:8188';
  const responses = new Map([
    [`${baseUrl}/readyz`, response('{"ok":true}', 'application/json')],
    [`${baseUrl}/`, response('<main>Nono</main>', 'text/html')],
    [`${baseUrl}/nodesk`, response('<main>Nodesk</main>', 'text/html')],
    [`${baseUrl}/nodesk/images/nodesk-ambient-wallpaper.png`, pngResponse()],
    [`${baseUrl}/nomoney/api/readyz`, response('{"ok":true}', 'application/json')],
    [`${baseUrl}/yumi/api/readyz`, response('{"ok":true}', 'application/json')],
    [`${baseUrl}/yumi/`, response('<main>Yumi</main>', 'text/html')],
    [`${baseUrl}/nostar/`, response('<script type="module" src="/nostar/assets/index-test.js"></script>', 'text/html')],
    [`${baseUrl}/nostar/assets/index-test.js`, response('import("./RepositoriesView-test.js")', 'text/javascript')],
    [`${baseUrl}/nostar/assets/RepositoriesView-test.js`, response('import("./ReadmeModal-test.js"); import("./RepositoryEditModal-test.js")', 'text/javascript')],
    [`${baseUrl}/nostar/assets/ReadmeModal-test.js`, response('export default {}', 'text/javascript')],
    [`${baseUrl}/nostar/assets/RepositoryEditModal-test.js`, response('export default {}', 'text/javascript')],
  ]);
  const requested = [];

  const result = await acceptDeployment({
    baseUrl,
    headers: { 'x-nono-maintenance-token': 'test-token' },
    fetchImpl: async (url, options) => {
      assert.equal(options.headers['x-nono-maintenance-token'], 'test-token');
      const key = String(url);
      requested.push(key);
      return responses.get(key) || response('missing', 'text/plain', 404);
    },
    log: () => {},
  });

  assert.equal(result.routes.length, 7);
  assert.deepEqual(result.assets, [{ path: '/nodesk/images/nodesk-ambient-wallpaper.png', status: 200 }]);
  assert.equal(result.nostarAssets.some((url) => url.includes('ReadmeModal-test.js')), true);
  assert.equal(result.nostarAssets.some((url) => url.includes('RepositoryEditModal-test.js')), true);
  assert.equal(requested.includes(`${baseUrl}/nostar/assets/RepositoriesView-test.js`), true);
  assert.equal(requested.some((url) => url.includes('/clipper/')), false);
});

test('fails acceptance when the Nodesk wallpaper is not an image', async () => {
  await assert.rejects(
    () => acceptDeployment({
      baseUrl: 'http://127.0.0.1:8188',
      fetchImpl: async (url) => {
        const pathname = new URL(String(url)).pathname;
        if (pathname === '/nodesk/images/nodesk-ambient-wallpaper.png') return response('not an image', 'text/html');
        if (pathname === '/nostar/') return response('<script type="module" src="/nostar/assets/index-test.js"></script>', 'text/html');
        if (pathname === '/nostar/assets/index-test.js') {
          return response('import("./RepositoriesView-test.js")', 'text/javascript');
        }
        if (pathname === '/nostar/assets/RepositoriesView-test.js') {
          return response('import("./ReadmeModal-test.js"); import("./RepositoryEditModal-test.js")', 'text/javascript');
        }
        return response('export default {}', 'text/javascript');
      },
      log: () => {},
    }),
    /nodesk-ambient-wallpaper\.png returned unexpected content type text\/html/,
  );
});

test('fails acceptance when the Nodesk wallpaper is missing', async () => {
  await assert.rejects(
    () => acceptDeployment({
      baseUrl: 'http://127.0.0.1:8188',
      fetchImpl: async (url) => {
        const pathname = new URL(String(url)).pathname;
        if (pathname === '/nodesk/images/nodesk-ambient-wallpaper.png') return response('missing', 'text/html', 404);
        return response('ok');
      },
      log: () => {},
    }),
    /nodesk-ambient-wallpaper\.png returned HTTP 404/,
  );
});

test('fails acceptance when the Nodesk wallpaper is not a valid PNG', async () => {
  await assert.rejects(
    () => acceptDeployment({
      baseUrl: 'http://127.0.0.1:8188',
      fetchImpl: async (url) => {
        const pathname = new URL(String(url)).pathname;
        if (pathname === '/nodesk/images/nodesk-ambient-wallpaper.png') return response('truncated', 'image/png');
        return response('ok');
      },
      log: () => {},
    }),
    /nodesk-ambient-wallpaper\.png did not contain a valid PNG signature/,
  );
});

test('fails acceptance when a required route is unavailable', async () => {
  await assert.rejects(
    () => acceptDeployment({
      baseUrl: 'http://127.0.0.1:8188',
      fetchImpl: async (url) => response(String(url).endsWith('/readyz') ? 'down' : 'ok', 'text/plain', String(url).endsWith('/readyz') ? 503 : 200),
      log: () => {},
    }),
    /readyz returned HTTP 503/,
  );
});

function response(body, contentType = 'text/plain', status = 200) {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

function pngResponse() {
  return response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png');
}
