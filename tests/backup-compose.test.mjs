import assert from 'node:assert/strict';
import test from 'node:test';

const modulePath = '../scripts/backup-compose.mjs';

test('parses create, verify and drill backup commands', async () => {
  const { parseBackupArgs } = await import(modulePath);
  assert.deepEqual(parseBackupArgs(['create', '--dir', '/opt/nono']), {
    command: 'create',
    cwd: '/opt/nono',
    backupId: '',
  });
  assert.deepEqual(parseBackupArgs(['verify', '--id', '20260718T140000Z']), {
    command: 'verify',
    cwd: process.cwd(),
    backupId: '20260718T140000Z',
  });
  assert.deepEqual(parseBackupArgs(['drill', '--id', '20260718T140000Z']), {
    command: 'drill',
    cwd: process.cwd(),
    backupId: '20260718T140000Z',
  });
  assert.throws(() => parseBackupArgs(['verify']), /--id/);
  assert.throws(() => parseBackupArgs(['drill']), /--id/);
});

test('executes the backup CLI inside the running app container', async () => {
  const { runBackupCompose } = await import(modulePath);
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: '{"id":"20260718T140000Z"}\n', stderr: '' };
  };

  await runBackupCompose({ command: 'create', cwd: '/opt/nono', backupId: '', run });

  assert.deepEqual(calls[0].args, [
    'compose', 'exec', '-T', 'app', 'node',
    '/app/nono/packages/server/dist/cli/backup.js', 'create',
  ]);
  assert.equal(calls[0].options.cwd, '/opt/nono');
});
