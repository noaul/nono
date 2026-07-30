import assert from 'node:assert/strict';
import test from 'node:test';
import { deployCompose, destructiveMigrationStatements, imageTagForCommit, parseDeployArgs } from '../scripts/deploy-compose.mjs';

test('builds immutable image tags from git commits', () => {
  assert.equal(imageTagForCommit('nono-app', '1234567890abcdef'), 'nono-app:1234567890ab');
});

test('parses deployment CLI options', () => {
  assert.deepEqual(parseDeployArgs(['--dir', '/opt/nono', '--base-url', 'http://127.0.0.1:8188', '--skip-pull']), {
    cwd: '/opt/nono',
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    skipPull: true,
    allowDestructiveMigrations: false,
  });
});

test('detects destructive SQL migration statements', () => {
  assert.deepEqual(destructiveMigrationStatements(`
    ALTER TABLE "ApiToken" ADD COLUMN "scopes" TEXT[];
    ALTER TABLE "User" DROP COLUMN "legacy";
    ALTER TABLE "User" RENAME COLUMN "name" TO "displayName";
    ALTER TABLE "User" DROP CONSTRAINT "User_email_key";
    ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
    TRUNCATE TABLE "AuditLog";
  `), [
    'ALTER TABLE "User" DROP COLUMN',
    'ALTER TABLE "User" RENAME COLUMN',
    'ALTER TABLE "User" DROP CONSTRAINT',
    'ALTER TABLE "User" SET NOT NULL',
    'TRUNCATE TABLE'
  ]);
});

test('creates a full safety backup before replacing a running app', async () => {
  const calls = [];
  const run = async (command, args) => {
    const joined = [command, ...args].join(' ');
    calls.push(joined);
    if (joined === 'git rev-parse HEAD') {
      return { stdout: calls.filter((call) => call === joined).length === 1
        ? '0123456789abcdef\n'
        : 'abcdef1234567890\n' };
    }
    if (joined === 'docker compose ps -q app') return { stdout: 'old-container\n' };
    if (joined.includes('{{.Image}}')) return { stdout: 'sha256:old-image\n' };
    if (joined.includes('{{.Config.Image}}')) return { stdout: 'nono-app:0123456789ab\n' };
    return { stdout: '' };
  };

  await deployCompose({
    cwd: '/opt/nono',
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    skipPull: true,
    run,
    accept: async () => ({ routes: [], nostarAssets: [] }),
    wait: async () => {},
    acceptanceAttempts: 1,
    log: () => {}
  });

  const backupIndex = calls.findIndex((call) => call.includes('backup.js create'));
  const replaceIndex = calls.findIndex((call) => call === 'docker compose up -d --no-deps app');
  assert.ok(backupIndex >= 0);
  assert.ok(backupIndex < replaceIndex);
});

test('restores the previous image when post-deploy acceptance fails', async () => {
  const calls = [];
  let acceptanceCalls = 0;
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, image: options.env?.NONO_APP_IMAGE });
    const joined = [command, ...args].join(' ');
    if (joined === 'git rev-parse HEAD') {
      const count = calls.filter((call) => [call.command, ...call.args].join(' ') === joined).length;
      return { stdout: count === 1 ? '0123456789abcdef\n' : 'abcdef1234567890\n' };
    }
    if (joined === 'docker compose ps -q app') return { stdout: 'old-container\n' };
    if (joined.includes('{{.Image}}')) return { stdout: 'sha256:old-image\n' };
    if (joined.includes('{{.Config.Image}}')) return { stdout: 'nono-app:0123456789ab\n' };
    return { stdout: '' };
  };

  const result = await deployCompose({
    cwd: '/opt/nono',
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    skipPull: false,
    run,
    accept: async () => {
      acceptanceCalls += 1;
      if (acceptanceCalls === 1) throw new Error('new image unhealthy');
      return { routes: [], nostarAssets: [] };
    },
    wait: async () => {},
    acceptanceAttempts: 1,
    log: () => {},
  });

  assert.equal(result.rolledBack, true);
  assert.equal(calls.some((call) => call.image === 'nono-app:abcdef123456'), true);
  assert.equal(calls.some((call) => call.args.includes('--force-recreate') && call.image === 'nono-app:0123456789ab'), true);
  assert.equal(acceptanceCalls, 2);
});
