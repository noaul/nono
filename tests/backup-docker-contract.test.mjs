import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const compose = fs.readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
const deploy = fs.readFileSync(new URL('../scripts/deploy-compose.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('packages database verification tools in the single application image', () => {
  assert.match(dockerfile, /apk add --no-cache[^\n]*postgresql16-client[^\n]*sqlite/);
  assert.match(dockerfile, /packages\/server\/dist/);
});

test('persists full backups outside the application lifecycle', () => {
  assert.match(compose, /BACKUP_DIR:\s*\/app\/backups/);
  assert.match(compose, /TZ:\s*\$\{TZ:-Asia\/Shanghai\}/);
  assert.match(compose, /nono_backups:\/app\/backups/);
  assert.match(compose, /\n\s*nono_backups:\s*\n/);
});

test('records the immutable deployment commit and exposes guarded backup commands', () => {
  assert.match(compose, /NONO_BUILD_COMMIT:\s*\$\{NONO_BUILD_COMMIT:-unknown\}/);
  assert.match(deploy, /NONO_BUILD_COMMIT:\s*currentCommit/);
  assert.equal(packageJson.scripts['backup:create'], 'node scripts/backup-compose.mjs create');
  assert.equal(packageJson.scripts['backup:list'], 'node scripts/backup-compose.mjs list');
  assert.equal(packageJson.scripts['backup:verify'], 'node scripts/backup-compose.mjs verify');
  assert.equal(packageJson.scripts['backup:drill'], 'node scripts/backup-compose.mjs drill');
  assert.equal(packageJson.scripts['backup:restore'], 'node scripts/restore-compose.mjs');
});
