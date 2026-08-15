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
  assert.match(dockerfile, /apk add --no-cache[^\n]*tzdata/);
});

test('persists NoMoney data and requires its session secret', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  assert.match(compose, /NOMONEY_INTERNAL_PORT:\s*2030/);
  assert.match(compose, /NOMONEY_DATA_DIR:\s*\/app\/nomoney-data/);
  assert.match(compose, /NOMONEY_JWT_SECRET:/);
  assert.match(compose, /NOMONEY_INTERNAL_TOKEN:/);
  assert.match(compose, /NONO_PUBLIC_URL:\s*\$\{NONO_PUBLIC_URL:\?NONO_PUBLIC_URL is required\}/);
  assert.match(compose, /NOMONEY_COOKIE_SECURE:\s*\$\{NOMONEY_COOKIE_SECURE:-true\}/);
  assert.match(compose, /nomoney_data:\/app\/nomoney-data/);
  assert.match(compose, /^\s*nomoney_data:\s*$/m);
  assert.match(compose, /wget -qO- http:\/\/127\.0\.0\.1:3000\/readyz/);
});

test('binds the application to loopback by default', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const exampleEnv = fs.readFileSync('.env.example', 'utf8');
  assert.match(compose, /\$\{PORT:-127\.0\.0\.1:3000\}:3000/);
  assert.match(exampleEnv, /^PORT=127\.0\.0\.1:3000$/m);
  assert.match(exampleEnv, /^NOMONEY_COOKIE_SECURE=true$/m);
  assert.match(exampleEnv, /^TZ=Asia\/Shanghai$/m);
});

test('defaults application and PostgreSQL containers to Shanghai time', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  assert.match(compose, /postgres:[\s\S]*TZ:\s*\$\{TZ:-Asia\/Shanghai\}/);
  assert.match(compose, /PGTZ:\s*\$\{TZ:-Asia\/Shanghai\}/);
  assert.match(compose, /app:[\s\S]*TZ:\s*\$\{TZ:-Asia\/Shanghai\}/);
});

test('runs both NoMoney backend and frontend tests from the repository quality gate', () => {
  const packageJson = JSON.parse(fs.readFileSync('apps/nomoney/package.json', 'utf8'));
  assert.match(packageJson.scripts.test, /npm run test -w backend/);
  assert.match(packageJson.scripts.test, /npm run test -w frontend/);
});
