import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('builds NoStar into the combined Nono image', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /AS nostar-deps/);
  assert.match(dockerfile, /AS nostar-build/);
  assert.match(dockerfile, /\/app\/nostar\/dist/);
  assert.match(dockerfile, /packages\/web\/dist\/nostar/);
  assert.doesNotMatch(dockerfile, /NOSTAR_INTERNAL_PORT/);
});

test('serves the NoStar SPA from the Nono Fastify process', () => {
  const app = fs.readFileSync('packages/server/src/app.ts', 'utf8');
  assert.match(app, /nostar\/index\.html/);
  assert.match(app, /request\.url\.startsWith\('\/nostar\/'\)/);
  assert.match(app, /reply\.redirect\('\/nostar\/'\)/);
});
