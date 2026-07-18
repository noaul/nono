import assert from 'node:assert/strict';
import test from 'node:test';

const modulePath = '../scripts/restore-compose.mjs';

test('parses an explicitly confirmed restore request', async () => {
  const { parseRestoreArgs } = await import(modulePath);
  assert.deepEqual(parseRestoreArgs([
    '--dir', '/opt/nono',
    '--base-url', 'http://127.0.0.1:8188',
    '--id', '20260718T140000Z',
    '--confirm', '20260718T140000Z',
  ]), {
    cwd: '/opt/nono',
    baseUrl: 'http://127.0.0.1:8188',
    backupId: '20260718T140000Z',
    confirmation: '20260718T140000Z',
  });
  assert.throws(() => parseRestoreArgs(['--id', '20260718T140000Z']), /--confirm/);
  assert.throws(() => parseRestoreArgs(['--id', '20260718T140000Z', '--confirm', 'different']), /does not match/);
});

test('creates a safety backup before stopping and restoring the app', async () => {
  const { restoreCompose } = await import(modulePath);
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], image: options.env?.NONO_APP_IMAGE });
    const joined = [command, ...args].join(' ');
    if (joined === 'docker compose ps -q app') return { stdout: 'container-id\n', stderr: '' };
    if (joined.includes('{{.Config.Image}}')) return { stdout: 'nono-app:abcdef123456\n', stderr: '' };
    if (joined.includes('backup.js create')) return { stdout: '{"id":"20260718T135500Z"}\n', stderr: '' };
    return { stdout: '', stderr: '' };
  };

  const result = await restoreCompose({
    cwd: '/opt/nono',
    baseUrl: 'http://127.0.0.1:8188',
    backupId: '20260718T140000Z',
    confirmation: '20260718T140000Z',
    run,
    accept: async () => ({ routes: [], nostarAssets: [] }),
    wait: async () => {},
    acceptanceAttempts: 1,
    log: () => {},
  });

  assert.equal(result.rolledBack, false);
  assert.equal(result.safetyBackupId, '20260718T135500Z');
  const commands = calls.map((call) => [call.command, ...call.args].join(' '));
  assert.ok(commands.findIndex((command) => command.includes('backup.js create')) < commands.findIndex((command) => command === 'docker compose stop app'));
  assert.ok(commands.some((command) => command.includes('backup.js restore --id 20260718T140000Z')));
  assert.ok(commands.some((command) => command === 'docker compose start app'));
  assert.ok(calls.some((call) => call.image === 'nono-app:abcdef123456' && call.args.includes('run')));
});

test('restores the safety backup when target restoration fails', async () => {
  const { restoreCompose } = await import(modulePath);
  const calls = [];
  const run = async (command, args, options = {}) => {
    const joined = [command, ...args].join(' ');
    calls.push({ joined, image: options.env?.NONO_APP_IMAGE });
    if (joined === 'docker compose ps -q app') return { stdout: 'container-id\n', stderr: '' };
    if (joined.includes('{{.Config.Image}}')) return { stdout: 'nono-app:abcdef123456\n', stderr: '' };
    if (joined.includes('backup.js create')) return { stdout: '{"id":"20260718T135500Z"}\n', stderr: '' };
    if (joined.includes('backup.js restore --id 20260718T140000Z')) throw new Error('target restore failed');
    return { stdout: '', stderr: '' };
  };

  const result = await restoreCompose({
    cwd: '/opt/nono',
    baseUrl: 'http://127.0.0.1:8188',
    backupId: '20260718T140000Z',
    confirmation: '20260718T140000Z',
    run,
    accept: async () => ({ routes: [], nostarAssets: [] }),
    wait: async () => {},
    acceptanceAttempts: 1,
    log: () => {},
  });

  assert.equal(result.rolledBack, true);
  assert.match(result.restoreError, /target restore failed/);
  assert.ok(calls.some((call) => call.joined.includes('backup.js restore --id 20260718T135500Z')));
  assert.ok(calls.some((call) => call.joined === 'docker compose start app'));
});
