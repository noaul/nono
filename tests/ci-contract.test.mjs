import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('runs CI for pull requests and main-branch pushes', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\s*\n\s+branches:\s*\[main\]/);
});

test('provides one documented command for every independent lockfile', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const readme = fs.readFileSync('README.md', 'utf8');
  const bootstrap = packageJson.scripts['install:all'];

  assert.match(bootstrap, /^npm ci/);
  assert.match(bootstrap, /pnpm --dir apps\/blog install --frozen-lockfile/);
  assert.match(bootstrap, /npm --prefix apps\/nomoney ci/);
  assert.match(bootstrap, /npm --prefix apps\/nostar ci/);
  assert.match(readme, /npm run install:all/);
  assert.match(readme, /NoStar npm/);
});

test('delegates CI verification to the canonical repository command', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

  assert.match(workflow, /run:\s*npm run verify:all/);
});

test('runs the shared UI contract from the root gateway test command', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  assert.match(packageJson.scripts['test:gateway'], /tests\/ui-contract\.test\.mjs/);
});

test('documents one non-blocking lock for production mutations', () => {
  const documents = [
    'README.md',
    'README_EN.md',
    'docs/deployment/compose-verified-deploy.md',
    'docs/deployment/full-backup-restore.md',
  ].map((path) => fs.readFileSync(path, 'utf8'));
  const lock = String.raw`flock -n \/var\/lock\/nono-deploy\.lock`;

  for (const document of documents) {
    assert.doesNotMatch(document, /\/opt\/nono\/\.compose-operation\.lock/);
  }
  assert.match(documents[0], new RegExp(`${lock} npm run deploy:rollback`));
  assert.match(documents[0], new RegExp(`${lock} npm run backup:restore`));
  assert.match(documents[1], new RegExp(`${lock} npm run deploy:rollback`));
  assert.match(documents[1], new RegExp(`${lock} npm run backup:restore`));
  assert.match(documents[2], new RegExp(`${lock} npm run deploy:compose`));
  assert.match(documents[2], new RegExp(`${lock} node scripts/restore-compose\\.mjs`));
  assert.match(documents[2], new RegExp(`${lock} npm run deploy:rollback`));
  assert.match(documents[3], new RegExp(`${lock} npm run backup:restore`));
});

test('runs browser smoke tests from the unified verification command', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const verifyAll = packageJson.scripts['verify:all'];

  assert.match(verifyAll, /npm run test:e2e/);
  assert.ok(
    verifyAll.indexOf('npm run build:all') < verifyAll.indexOf('npm run test:e2e'),
    'the production assets required by server-backed E2E tests must be built first',
  );
});

test('pins the patched deepmerge dependency used by Prisma config', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

  assert.equal(packageJson.overrides['deepmerge-ts'], '8.0.1');
  assert.equal(packageLock.packages['node_modules/deepmerge-ts'].version, '8.0.1');
});
