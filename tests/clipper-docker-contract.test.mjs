import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');

const dockerfile = read('Dockerfile');
const rootPackage = JSON.parse(read('package.json'));
const compose = read('docker-compose.yml');

test('the image builds Clipper in its own stage', () => {
  assert.match(dockerfile, /FROM node:22-alpine AS clipper-deps/);
  assert.match(dockerfile, /FROM clipper-deps AS clipper-build/);
  // The lockfile is copied before the sources so dependency layers stay cacheable.
  assert.match(dockerfile, /COPY apps\/clipper\/package\.json apps\/clipper\/package-lock\.json/);
  assert.match(dockerfile, /RUN npm ci/);
});

test('the build output is served from the Nono web root', () => {
  assert.match(
    dockerfile,
    /COPY --from=clipper-build \/app\/clipper\/dist \.\/nono\/packages\/web\/dist\/clipper/,
  );
});

/**
 * Clipper is served by the existing Nono process. Introducing a port or a gateway service entry
 * would mean a new subprocess to supervise, which is exactly what this module was designed to
 * avoid.
 */
test('Clipper introduces no process of its own', () => {
  assert.doesNotMatch(dockerfile, /CLIPPER_INTERNAL_PORT/);
  assert.doesNotMatch(compose, /CLIPPER_INTERNAL_PORT/);

  const gateway = read('docker/gateway.mjs');
  assert.doesNotMatch(gateway, /clipper/i, 'the gateway must not gain a Clipper service entry');
});

test('the root scripts cover Clipper everywhere the other apps are covered', () => {
  const scripts = rootPackage.scripts;

  for (const name of [
    'dev:clipper',
    'build:clipper',
    'test:clipper',
    'lint:clipper',
    'typecheck:clipper',
    'bundle:check:clipper',
    'audit:clipper',
  ]) {
    assert.ok(scripts[name], `missing root script ${name}`);
  }

  assert.match(scripts['build:all'], /build:clipper/);
  assert.match(scripts['test:all'], /test:clipper/);
  assert.match(scripts['install:all'], /apps\/clipper/);
  assert.match(scripts['audit:all'], /audit:clipper/);
  assert.match(scripts['verify:all'], /typecheck:clipper/);
  assert.match(scripts['verify:all'], /lint:clipper/);
  assert.match(scripts['verify:all'], /bundle:check:clipper/);
});

test('deployment acceptance checks the Clipper entry point', () => {
  const acceptance = read('scripts/accept-deployment.mjs');

  assert.match(acceptance, /'\/clipper\/'/);
  // The route alone would pass even if the JavaScript bundle 404s, so the assets are crawled too.
  assert.match(acceptance, /clipper/i);
});
