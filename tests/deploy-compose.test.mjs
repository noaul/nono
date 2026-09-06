import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deployCompose, destructiveMigrationStatements, imageTagForCommit, parseDeployArgs } from '../scripts/deploy-compose.mjs';
import { snapshot } from '../scripts/compose-safety.mjs';

export function deploymentFixture(t, { initial = false, fail = '', state = '[{"migration_name":"001_initial","finished_at":"2026-01-01","rolled_back_at":null}]' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-deploy-test-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  for (const [name, sql] of [['001_initial', 'CREATE TABLE example(id INT);'], ['002_retire', 'DROP TABLE example;']]) {
    const dir = path.join(cwd, 'packages/server/prisma/migrations', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'migration.sql'), sql);
  }
  const calls = [];
  let head = '0123456789abcdef';
  let failed = false;
  const run = async (command, args, options = {}) => {
    const text = [command, ...args].join(' ');
    calls.push({ text, args, image: options.env?.NONO_APP_IMAGE, port: options.env?.PORT });
    if (fail && text.includes(fail) && !failed) { failed = true; throw new Error('injected ' + fail); }
    if (text === 'git rev-parse HEAD') return { stdout: head };
    if (text.includes('git pull')) { head = 'abcdef1234567890'; return { stdout: '' }; }
    if (text.includes('compose ps')) return { stdout: initial ? '' : 'existing-container' };
    if (text.includes('{{.Image}}')) return { stdout: 'sha256:old-immutable' };
    if (text.includes('{{.Config.Image}}')) return { stdout: 'nono-app:mutable' };
    if (text.includes('psql')) return { stdout: state };
    if (text.includes('.create()')) return { stdout: '{"id":"20260905T120000Z"}' };
    return { stdout: '' };
  };
  return { calls, options: { cwd, baseUrl: 'http://127.0.0.1:8188', imageRepository: 'nono-app', skipPull: false, allowDestructiveMigrations: true, run, accept: async (options) => { calls.push({ text: 'accept', ...options }); }, fetchImpl: async () => ({ status: 503 }), wait: async () => {}, acceptanceAttempts: 1, log: () => {} } };
}

test('commit tags and CLI approval remain explicit', () => {
  assert.equal(imageTagForCommit('nono-app', '1234567890abcdef'), 'nono-app:1234567890ab');
  assert.equal(parseDeployArgs(['--skip-pull']).allowDestructiveMigrations, false);
  assert.equal(parseDeployArgs(['--allow-destructive-migrations']).allowDestructiveMigrations, true);
  assert.deepEqual(destructiveMigrationStatements('DROP TABLE example; DELETE FROM other;'), ['DROP TABLE', 'DELETE FROM']);
});

test('pending destructive migration stays blocked after pull changes HEAD and on skip-pull retry', async (t) => {
  const { options, calls } = deploymentFixture(t);
  for (const skipPull of [false, false, true]) {
    await assert.rejects(deployCompose({ ...options, skipPull, allowDestructiveMigrations: false }), /Destructive database migration blocked/);
  }
  assert.equal(calls.filter((c) => c.text.includes('psql')).length, 3);
  assert.equal(calls.some((c) => c.text.includes('compose build') || c.text.includes('compose stop')), false);
});

for (const state of ['', 'not json', '[]', '[{"migration_name":"001_initial","finished_at":null,"rolled_back_at":null}]']) {
  test('existing database fails closed for unavailable or failed migration state: ' + state, async (t) => {
    const { options, calls } = deploymentFixture(t, { state });
    await assert.rejects(deployCompose(options), /migration/i);
    assert.equal(calls.some((c) => c.text.includes('compose build')), false);
  });
}

test('fresh install does not demand a nonexistent rollback snapshot', async (t) => {
  const { options, calls } = deploymentFixture(t, { initial: true });
  const result = await deployCompose({ ...options, allowDestructiveMigrations: false });
  assert.equal(result.rolledBack, false);
  assert.equal(calls.some((c) => c.text.includes('.create()')), false);
});

test('build then stop all writers then create and verify snapshot using immutable old image', async (t) => {
  const { options, calls } = deploymentFixture(t);
  const result = await deployCompose(options);
  const index = (fragment) => calls.findIndex((c) => c.text.includes(fragment));
  assert.ok(index('compose build app') < index('compose stop app'));
  assert.ok(index('compose stop app') < index('.create()'));
  assert.ok(index('.create()') < index('backup.js verify --id 20260905T120000Z'));
  const backup = calls[index('.create()')];
  assert.ok(backup.args.includes('run') && backup.args.includes('--entrypoint'));
  assert.equal(backup.image, 'sha256:old-immutable');
  assert.equal(result.safetyBackupId, '20260905T120000Z');
  const accepted = calls.filter((c) => c.text === 'accept');
  assert.ok(accepted.some((c) => c.baseUrl !== options.baseUrl && c.headers?.['x-nono-maintenance-token']));
  assert.ok(accepted.some((c) => c.baseUrl === options.baseUrl && c.headers?.['x-nono-maintenance-token']));
});

for (const fail of ['compose stop app', '.create()', 'backup.js verify', 'writeFileSync', 'compose up -d --no-deps --force-recreate app']) {
  test('post-stop failure recovers old app safely: ' + fail, async (t) => {
    const { options, calls } = deploymentFixture(t, { fail });
    const result = await deployCompose(options);
    assert.equal(result.rolledBack, true);
    assert.match(result.deploymentError, /injected/);
    const restart = calls.findLast((c) => c.text.includes('compose up') && c.args.includes('app'));
    assert.equal(restart.image, 'sha256:old-immutable');
    if (fail.includes('backup.js') || fail === '.create()' || fail === 'compose stop app') {
      assert.equal(calls.some((c) => c.text.includes('backup.js restore')), false);
    }
  });
}

test('failed acceptance restores verified snapshot before reopening old app', async (t) => {
  const { options, calls } = deploymentFixture(t);
  let attempts = 0;
  const result = await deployCompose({ ...options, accept: async ({ headers }) => {
    if (headers) { attempts += 1; throw new Error('candidate failed'); }
  } });
  assert.equal(result.rolledBack, true);
  assert.equal(attempts, 1);
  const restore = calls.findIndex((c) => c.text.includes('backup.js restore'));
  const oldStart = calls.findLastIndex((c) => c.text.includes('compose up') && c.image === 'sha256:old-immutable');
  assert.ok(restore > 0 && oldStart > restore);
});

test('uncertain ingress release never rolls back accepted data', async (t) => {
  const { options, calls } = deploymentFixture(t, { fail: 'unlinkSync' });
  await assert.rejects(deployCompose(options), /release.*uncertain|uncertain.*release/i);
  assert.equal(calls.some((c) => c.text.includes('backup.js restore')), false);
});

test('rollback errors preserve both causes and leave writers stopped', async (t) => {
  const { options, calls } = deploymentFixture(t);
  const run = options.run;
  await assert.rejects(deployCompose({ ...options, run: async (...args) => {
    if (args[1].includes('restore')) throw new Error('snapshot restore failed');
    return run(...args);
  }, accept: async () => { throw new Error('candidate failed'); } }), /candidate failed.*rollback failed.*snapshot restore failed/i);
  assert.equal(calls.some((c) => c.text.includes('compose up') && c.image === 'sha256:old-immutable'), false);
});

test('existing database volume without containers is not mistaken for fresh install', async (t) => {
  const { options } = deploymentFixture(t, { initial: true });
  const run = options.run;
  await assert.rejects(deployCompose({ ...options, run: async (command, args, settings) => {
    if (args.includes('volume')) return { stdout: 'nono_nono_pg_data' };
    return run(command, args, settings);
  } }), /existing.*database|database.*existing/i);
});

test('migration SQL is passed intact as a positional shell argument', async (t) => {
  const { options, calls } = deploymentFixture(t);
  await deployCompose(options);
  const query = calls.find((call) => call.text.includes('psql'));
  assert.match(query.args.at(-1), /COALESCE\(json_agg\(t\), '\[\]'::json\)/);
  assert.match(query.args.at(-3), /"\$1"/);
});

test('rollback removes maintenance while stopped before accepting old gateway offline', async (t) => {
  const { options, calls } = deploymentFixture(t, { fail: 'compose up -d --no-deps --force-recreate app' });
  await deployCompose(options);
  const clear = calls.findIndex((call) => call.text.includes('rmSync'));
  const oldStart = calls.findIndex((call) => call.text.includes('compose up') && call.image === 'sha256:old-immutable');
  assert.ok(clear > 0 && clear < oldStart);
});

test('existing postgres without an old app image refuses an unprotected upgrade', async (t) => {
  const { options } = deploymentFixture(t, { initial: true });
  const run = options.run;
  await assert.rejects(deployCompose({ ...options, run: async (command, args, settings) => {
    if (args.includes('ps') && args.includes('postgres')) return { stdout: 'database-container' };
    return run(command, args, settings);
  } }), /previous.*image|old.*image/i);
});

test('applied destructive migrations do not need renewed approval', async (t) => {
  const { options } = deploymentFixture(t, { state: '[{"migration_name":"001_initial","finished_at":"2026-01-01","rolled_back_at":null},{"migration_name":"002_retire","finished_at":"2026-01-02","rolled_back_at":null}]' });
  assert.equal((await deployCompose({ ...options, allowDestructiveMigrations: false })).rolledBack, false);
});

test('missing maintenance gate fails offline before candidate public binding', async (t) => {
  const { options, calls } = deploymentFixture(t);
  const result = await deployCompose({ ...options, fetchImpl: async () => ({ status: 200 }) });
  assert.equal(result.rolledBack, true);
  const candidateStarts = calls.filter((call) => call.text.includes('compose up') && call.image?.startsWith('nono-app:') && call.args.includes('app'));
  assert.equal(candidateStarts.length, 1);
  assert.equal(candidateStarts[0].port, '127.0.0.1:18188');
});

for (const outcome of ['ready', 'unprotected', 'unreachable']) {
  test(`public startup maintenance polling: ${outcome}`, async (t) => {
    const { options, calls } = deploymentFixture(t);
    let probes = 0;
    const waits = [];
    const result = await deployCompose({ ...options, acceptanceAttempts: 3,
      wait: async (ms) => { waits.push(ms); },
      fetchImpl: async (url) => {
        if (url.origin !== options.baseUrl) return { status: 503 };
        probes += 1;
        if (outcome === 'unreachable' || (outcome === 'ready' && probes === 1)) throw new TypeError('fetch failed: ECONNREFUSED');
        return { status: outcome === 'unprotected' ? 200 : 503 };
      },
    });
    assert.equal(result.rolledBack, outcome !== 'ready');
    assert.equal(probes, outcome === 'ready' ? 2 : outcome === 'unreachable' ? 3 : 1);
    assert.equal(waits.length, outcome === 'ready' ? 1 : outcome === 'unreachable' ? 2 : 0);
    assert.equal(calls.some((call) => call.text.includes('backup.js restore')), outcome !== 'ready');
  });
}

test('safety snapshot bypasses CLI retention so pre-upgrade backups cannot be pruned', async () => {
  const calls = [];
  await snapshot(async (command, args) => {
    calls.push(args);
    return { stdout: '{"id":"20260905T120000Z"}' };
  }, {});
  assert.equal(calls[0].includes('/app/nono/packages/server/dist/cli/backup.js'), false);
  assert.ok(calls[0].includes('-e'));
  assert.match(calls[0].at(-1), /createBackupServiceFromEnv/);
  assert.ok(calls[0].includes('BACKUP_DIR=/app/backups/deployment-safety'));
  assert.ok(calls[1].includes('BACKUP_DIR=/app/backups/deployment-safety'));
});
