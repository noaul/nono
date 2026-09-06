import assert from 'node:assert/strict';
import test from 'node:test';

const modulePath = '../scripts/restore-compose.mjs';

for (const recovery of [false, true]) {
  test(`public startup retries connection refusal during ${recovery ? 'safety recovery' : 'target restore'}`, async () => {
    const { restoreCompose } = await import(modulePath);
    const commands = [];
    let probes = 0;
    const waits = [];
    const result = await restoreCompose({
      cwd: '/opt/nono', baseUrl: 'http://127.0.0.1:8188',
      backupId: '20260718T140000Z', confirmation: '20260718T140000Z',
      run: async (command, args) => {
        const joined = [command, ...args].join(' ');
        commands.push(joined);
        if (joined.includes('compose ps')) return { stdout: 'container-id' };
        if (joined.includes('{{.Image}}')) return { stdout: 'sha256:old-image' };
        if (joined.includes('.create()')) return { stdout: '{"id":"20260718T135500Z"}' };
        if (recovery && joined.includes('backup.js restore --id 20260718T140000Z')) throw new Error('target restore failed');
        return { stdout: '' };
      },
      accept: async () => {}, wait: async (ms) => { waits.push(ms); },
      acceptanceAttempts: 3, log: () => {},
      fetchImpl: async (url) => {
        if (url.port === '18188') return { status: 503 };
        probes += 1;
        if (probes === 1) throw new TypeError('fetch failed: ECONNREFUSED');
        return { status: 503 };
      },
    });
    assert.equal(result.rolledBack, recovery);
    assert.equal(probes, 2);
    assert.deepEqual(waits, [5000]);
    assert.equal(commands.filter((command) => command.includes('backup.js restore --id 20260718T135500Z')).length, recovery ? 1 : 0);
    assert.match(commands.at(-1), /unlinkSync/);
  });
}

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

test('stops writers before creating and verifying the offline safety backup', async () => {
  const { restoreCompose } = await import(modulePath);
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], image: options.env?.NONO_APP_IMAGE });
    const joined = [command, ...args].join(' ');
    if (joined.includes('compose ps')) return { stdout: 'container-id\n', stderr: '' };
    if (joined.includes('{{.Image}}')) return { stdout: 'sha256:abcdef123456\n', stderr: '' };
    if (joined.includes('{{.Config.Image}}')) return { stdout: 'nono-app:mutable\n', stderr: '' };
    if (joined.includes('.create()')) return { stdout: '{"id":"20260718T135500Z"}\n', stderr: '' };
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
    fetchImpl: async () => ({ status: 503 }),
  });

  assert.equal(result.rolledBack, false);
  assert.equal(result.safetyBackupId, '20260718T135500Z');
  const commands = calls.map((call) => [call.command, ...call.args].join(' '));
  assert.ok(commands.findIndex((command) => command.includes('.create()')) > commands.findIndex((command) => command === 'docker compose stop app'));
  assert.ok(commands.findIndex((command) => command.includes('backup.js verify --id 20260718T135500Z')) > commands.findIndex((command) => command.includes('.create()')));
  assert.ok(commands.some((command) => command.includes('backup.js restore --id 20260718T140000Z')));
  assert.ok(commands.some((command) => command === 'docker compose up -d --no-deps --force-recreate app'));
  assert.ok(calls.some((call) => call.image === 'sha256:abcdef123456' && call.args.includes('run')));
});

test('restores the safety backup when target restoration fails', async () => {
  const { restoreCompose } = await import(modulePath);
  const calls = [];
  const run = async (command, args, options = {}) => {
    const joined = [command, ...args].join(' ');
    calls.push({ joined, image: options.env?.NONO_APP_IMAGE });
    if (joined.includes('compose ps')) return { stdout: 'container-id\n', stderr: '' };
    if (joined.includes('{{.Image}}')) return { stdout: 'sha256:abcdef123456\n', stderr: '' };
    if (joined.includes('{{.Config.Image}}')) return { stdout: 'nono-app:mutable\n', stderr: '' };
    if (joined.includes('.create()')) return { stdout: '{"id":"20260718T135500Z"}\n', stderr: '' };
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
    fetchImpl: async () => ({ status: 503 }),
  });

  assert.equal(result.rolledBack, true);
  assert.match(result.restoreError, /target restore failed/);
  assert.ok(calls.some((call) => call.joined.includes('backup.js restore --id 20260718T135500Z')));
  assert.ok(calls.some((call) => call.joined === 'docker compose up -d --no-deps --force-recreate app'));
});
