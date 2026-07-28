import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptDeployment } from '../scripts/accept-deployment.mjs';

test('checks all public routes and recursively verifies NoStar lazy chunks', async () => {
  const baseUrl = 'http://127.0.0.1:8188';
  const responses = new Map([
    [`${baseUrl}/readyz`, response('{"ok":true}', 'application/json')],
    [`${baseUrl}/`, response('<main>Nono</main>', 'text/html')],
    [`${baseUrl}/nodesk`, response('<main>Nodesk</main>', 'text/html')],
    [`${baseUrl}/nomoney/api/readyz`, response('{"ok":true}', 'application/json')],
    [`${baseUrl}/nostar/`, response('<script type="module" src="/nostar/assets/index-test.js"></script>', 'text/html')],
    [`${baseUrl}/nostar/assets/index-test.js`, response('import("./RepositoriesView-test.js")', 'text/javascript')],
    [`${baseUrl}/nostar/assets/RepositoriesView-test.js`, response('import("./ReadmeModal-test.js"); import("./RepositoryEditModal-test.js")', 'text/javascript')],
    [`${baseUrl}/nostar/assets/ReadmeModal-test.js`, response('export default {}', 'text/javascript')],
    [`${baseUrl}/nostar/assets/RepositoryEditModal-test.js`, response('export default {}', 'text/javascript')],
  ]);
  const requested = [];

  const result = await acceptDeployment({
    baseUrl,
    fetchImpl: async (url) => {
      const key = String(url);
      requested.push(key);
      return responses.get(key) || response('missing', 'text/plain', 404);
    },
    log: () => {},
  });

  assert.equal(result.routes.length, 5);
  assert.equal(result.nostarAssets.some((url) => url.includes('ReadmeModal-test.js')), true);
  assert.equal(result.nostarAssets.some((url) => url.includes('RepositoryEditModal-test.js')), true);
  assert.equal(requested.includes(`${baseUrl}/nostar/assets/RepositoriesView-test.js`), true);
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
