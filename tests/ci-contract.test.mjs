import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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

test('runs every test suite inside the image build so a failing suite stops the deploy', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const suites = {
    'nono-test': /RUN npm test && touch \/tmp\/tests-passed/,
    'blog-test': /RUN pnpm test && touch \/tmp\/tests-passed/,
    'nomoney-test': /RUN npm test && touch \/tmp\/tests-passed/,
    'nostar-test': /RUN npm test -- --run && touch \/tmp\/tests-passed/,
    'repo-test': /RUN npm run test:gateway && touch \/tmp\/tests-passed/,
  };
  const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));

  for (const [stage, command] of Object.entries(suites)) {
    const body = dockerfile.slice(dockerfile.indexOf(`AS ${stage}`)).split(/\nFROM /)[0];
    assert.match(body, command, `${stage} runs its suite`);
    assert.match(runtime, new RegExp(`COPY --from=${stage} /tmp/tests-passed`), `runtime depends on ${stage}`);
  }
});

test('rotates container logs so they cannot fill the disk', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');

  assert.match(compose, /x-logging: &logging\n  driver: json-file\n  options:\n    max-size: 10m\n    max-file: "5"/);
  assert.equal(compose.match(/^    logging: \*logging$/gm)?.length, 2);
});
