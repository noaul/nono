import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
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


test('resolves backend-local production dependencies after runtime image copies', (t) => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const lock = JSON.parse(fs.readFileSync('apps/nomoney/package-lock.json', 'utf8'));
  const localDependencies = Object.entries(lock.packages)
    .filter(([location, entry]) => location.startsWith('backend/node_modules/') && !entry.dev)
    .map(([location]) => location);
  assert.ok(localDependencies.includes('backend/node_modules/nodemailer'), 'the production fixture includes the workspace-local mailer');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-runtime-layout-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, 'source');
  const runtime = path.join(temporary, 'runtime');
  fs.mkdirSync(path.join(source, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(runtime, 'nomoney/backend/dist'), { recursive: true });
  for (const location of localDependencies) {
    const directory = path.join(source, location);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ main: 'index.cjs' }));
    fs.writeFileSync(path.join(directory, 'index.cjs'), 'module.exports = {};');
  }
  for (const copy of dockerfile.matchAll(/^COPY --from=nomoney-runtime-deps \/app\/nomoney\/(\S+) \.\/(\S+)$/gm)) {
    fs.cpSync(path.join(source, copy[1]), path.join(runtime, copy[2]), { recursive: true });
  }
  const require = createRequire(path.join(runtime, 'nomoney/backend/dist/mailer.js'));
  for (const location of localDependencies) {
    const name = location.slice('backend/node_modules/'.length);
    assert.doesNotThrow(() => require.resolve(name), `${name} must be available to the deployed backend`);
  }
});
