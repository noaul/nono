import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('packages NoMoney in the combined image', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /AS nomoney-deps/);
  assert.match(dockerfile, /AS nomoney-build/);
  assert.match(dockerfile, /AS nomoney-runtime-deps/);
  assert.match(dockerfile, /\/app\/nomoney\/backend\/dist/);
  assert.match(dockerfile, /\/app\/nomoney\/backend\/public/);
});

test('persists NoMoney data and requires its session secret', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  assert.match(compose, /NOMONEY_INTERNAL_PORT:\s*2030/);
  assert.match(compose, /NOMONEY_DATA_DIR:\s*\/app\/nomoney-data/);
  assert.match(compose, /NOMONEY_JWT_SECRET:/);
  assert.match(compose, /NOMONEY_COOKIE_SECURE:\s*\$\{NOMONEY_COOKIE_SECURE:-true\}/);
  assert.match(compose, /nomoney_data:\/app\/nomoney-data/);
  assert.match(compose, /^\s*nomoney_data:\s*$/m);
});

test('binds the application to loopback by default', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const exampleEnv = fs.readFileSync('.env.example', 'utf8');
  assert.match(compose, /\$\{APP_BIND_ADDRESS:-127\.0\.0\.1\}:\$\{PORT:-3000\}:3000/);
  assert.match(exampleEnv, /^APP_BIND_ADDRESS=127\.0\.0\.1$/m);
  assert.match(exampleEnv, /^NOMONEY_COOKIE_SECURE=true$/m);
});
