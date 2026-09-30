import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { legacyOptions, migratePostgres18, parseMigratePostgresArgs, ROLLBACK_COMPOSE_FILE } from '../scripts/migrate-postgres-18.mjs';

const OLD_IMAGE_ID = `sha256:${'c'.repeat(64)}`;
const OLD_IMAGE = 'nono-app:rollback-cccccccccccc';
const NEW_IMAGE = 'nono-app:abcdef123456';
const SNAPSHOT = '20260930T120000Z';

function migrationFixture(t, {
  runningMajor = '16',
  configuredImage = 'postgres:18-alpine',
  targetVolume = '',
  postgresContainer = 'postgres-container',
  appContainer = 'app-container',
  pendingSql = '',
  fail = '',
} = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-pg18-test-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const migrations = [['001_initial', 'CREATE TABLE example(id INT);'], ...(pendingSql ? [['002_pending', pendingSql]] : [])];
  for (const [name, sql] of migrations) {
    const dir = path.join(cwd, 'packages/server/prisma/migrations', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'migration.sql'), sql);
  }
  const calls = [];
  let failed = false;
  const run = async (command, args, options = {}) => {
    const text = [command, ...args].join(' ');
    calls.push({ text, args, image: options.env?.NONO_APP_IMAGE, port: options.env?.PORT, legacy: Boolean(options.env?.COMPOSE_FILE) });
    if (fail && text.includes(fail) && !failed) { failed = true; throw new Error('injected ' + fail); }
    if (text === 'git rev-parse HEAD') return { stdout: 'abcdef1234567890\n' };
    if (text.includes('compose config --format json')) return { stdout: JSON.stringify({ services: { postgres: { image: configuredImage } } }) };
    if (text.includes('compose ps -a -q postgres')) return { stdout: postgresContainer };
    if (text.includes('compose ps -a -q app')) return { stdout: appContainer };
    if (text.includes('.Config.Env')) return { stdout: `PG_MAJOR=${runningMajor}\n` };
    if (text.includes('{{.Image}}')) return { stdout: OLD_IMAGE_ID };
    if (text.includes('volume ls')) return { stdout: targetVolume };
    if (text.includes('psql')) return { stdout: '[{"migration_name":"001_initial","finished_at":"2026-01-01","rolled_back_at":null}]' };
    if (text.includes('.create()')) return { stdout: `{"id":"${SNAPSHOT}"}` };
    return { stdout: '' };
  };
  const options = {
    cwd,
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    confirmation: 'postgres-18',
    run,
    accept: async (acceptOptions) => { calls.push({ text: 'accept', ...acceptOptions }); },
    fetchImpl: async () => ({ status: 503 }),
    wait: async () => {},
    acceptanceAttempts: 1,
    log: () => {},
  };
  const index = (predicate) => calls.findIndex(predicate);
  return { calls, options, index };
}

const postgresCall = (verb, legacy) => (call) => call.text.includes(`compose ${verb}`) && call.args.includes('postgres') && call.legacy === legacy;

test('the migration demands an explicit confirmation', () => {
  assert.throws(() => parseMigratePostgresArgs([]), /--confirm postgres-18/);
  assert.throws(() => parseMigratePostgresArgs(['--confirm', 'yes']), /--confirm postgres-18/);
  assert.equal(parseMigratePostgresArgs(['--confirm', 'postgres-18']).allowDestructiveMigrations, false);
});

test('legacy Compose options layer the PostgreSQL 16 rollback file', () => {
  const options = legacyOptions({ cwd: '/opt/nono', env: { NONO_APP_IMAGE: OLD_IMAGE } });
  assert.equal(options.env.COMPOSE_FILE, ['docker-compose.yml', ROLLBACK_COMPOSE_FILE].join(path.delimiter));
  assert.equal(options.env.NONO_APP_IMAGE, OLD_IMAGE);
});

for (const [name, fixture, message] of [
  ['Compose is not on PostgreSQL 18 yet', { configuredImage: 'postgres:16-alpine' }, /Compose must configure PostgreSQL 18/],
  ['PostgreSQL 18 already runs', { runningMajor: '18' }, /already running/],
  ['no database container exists', { postgresContainer: '' }, /Expected a PostgreSQL 16 container/],
  ['the target volume already exists', { targetVolume: 'nono_nono_pg18_data' }, /already exists/],
  ['no app image is running', { appContainer: '' }, /app image/],
  ['a destructive migration is pending', { pendingSql: 'DROP TABLE example;' }, /Destructive database migration blocked/],
]) {
  test(`preflight refuses without touching services: ${name}`, async (t) => {
    const { options, calls } = migrationFixture(t, fixture);
    await assert.rejects(migratePostgres18(options), message);
    assert.equal(calls.some((c) => /compose (build|stop|rm|up)/.test(c.text)), false);
  });
}

test('snapshots PostgreSQL 16 with the old image, then restores it into PostgreSQL 18 with the new image', async (t) => {
  const { options, calls, index } = migrationFixture(t);
  const result = await migratePostgres18(options);
  assert.deepEqual(result, { previousImage: OLD_IMAGE, imageTag: NEW_IMAGE, safetyBackupId: SNAPSHOT, rolledBack: false });

  const build = index((c) => c.text.includes('compose build app'));
  const stopApp = index((c) => c.text.includes('compose stop app'));
  const create = index((c) => c.text.includes('.create()'));
  const stopOld = index(postgresCall('stop', true));
  const removeOld = index(postgresCall('rm -f', true));
  const startNew = index(postgresCall('up -d --wait', false));
  const restore = index((c) => c.text.includes(`backup.js restore --id ${SNAPSHOT}`));
  assert.ok(build < stopApp && stopApp < create && create < stopOld && stopOld < removeOld && removeOld < startNew && startNew < restore);

  assert.equal(calls[create].image, OLD_IMAGE);
  assert.equal(calls[create].legacy, true);
  assert.equal(calls[restore].image, NEW_IMAGE);
  assert.equal(calls[restore].legacy, false);
  assert.ok(calls[restore].args.includes('BACKUP_DIR=/app/backups/deployment-safety'));

  const accepted = calls.filter((c) => c.text === 'accept');
  assert.ok(accepted.some((c) => c.baseUrl !== options.baseUrl && c.headers?.['x-nono-maintenance-token']));
  assert.ok(accepted.some((c) => c.baseUrl === options.baseUrl && c.headers?.['x-nono-maintenance-token']));
  assert.equal(calls.some((c) => c.text.includes('volume rm')), false);
});

test('failed acceptance returns to PostgreSQL 16 and the old image', async (t) => {
  const { options, calls, index } = migrationFixture(t);
  const result = await migratePostgres18({ ...options, accept: async ({ headers }) => {
    if (headers) throw new Error('candidate failed');
  } });
  assert.equal(result.rolledBack, true);
  assert.match(result.migrationError, /candidate failed/);

  const removeNew = calls.findLastIndex(postgresCall('rm -f', false));
  const startOld = index(postgresCall('up -d --wait', true));
  const restoreOld = calls.findLastIndex((c) => c.text.includes(`backup.js restore --id ${SNAPSHOT}`));
  const clear = index((c) => c.text.includes('rmSync'));
  const oldApp = calls.findLastIndex((c) => c.text.includes('compose up') && c.args.includes('app'));
  assert.ok(removeNew > 0 && removeNew < startOld && startOld < restoreOld && restoreOld < clear && clear < oldApp);
  assert.equal(calls[restoreOld].image, OLD_IMAGE);
  assert.equal(calls[restoreOld].legacy, true);
  assert.equal(calls[oldApp].image, OLD_IMAGE);
  assert.equal(calls[oldApp].legacy, true);
  assert.equal(calls[oldApp].port, undefined);
});

for (const fail of ['compose stop app', '.create()', 'backup.js verify']) {
  test(`failure before the database switch restarts the old app untouched: ${fail}`, async (t) => {
    const { options, calls } = migrationFixture(t, { fail });
    const result = await migratePostgres18(options);
    assert.equal(result.rolledBack, true);
    assert.equal(calls.some((c) => /compose (stop|rm|up)/.test(c.text) && c.args.includes('postgres')), false);
    assert.equal(calls.some((c) => c.text.includes('backup.js restore')), false);
    const oldApp = calls.findLast((c) => c.text.includes('compose up') && c.args.includes('app'));
    assert.equal(oldApp.image, OLD_IMAGE);
    assert.equal(oldApp.legacy, true);
  });
}

for (const fail of ['compose stop postgres', 'compose rm -f postgres']) {
  test(`failure during the database switch restarts PostgreSQL 16 before the old app: ${fail}`, async (t) => {
    const { options, calls } = migrationFixture(t, { fail });
    const result = await migratePostgres18(options);
    assert.equal(result.rolledBack, true);
    const startOld = calls.findLastIndex(postgresCall('up -d --wait', true));
    const oldApp = calls.findLastIndex((c) => c.text.includes('compose up') && c.args.includes('app'));
    assert.ok(startOld >= 0 && startOld < oldApp, 'the old database must be healthy before the old app restarts');
    assert.equal(calls.some((c) => c.text.includes('backup.js restore')), false);
  });
}

test('uncertain ingress release never rolls back accepted data', async (t) => {
  const { options, calls } = migrationFixture(t, { fail: 'unlinkSync' });
  await assert.rejects(migratePostgres18(options), /release uncertain/);
  assert.equal(calls.filter((c) => c.text.includes('backup.js restore')).length, 1);
  assert.equal(calls.some((c) => c.legacy && c.text.includes('compose up')), false);
});

test('rollback errors preserve both causes', async (t) => {
  const { options } = migrationFixture(t);
  const run = options.run;
  await assert.rejects(migratePostgres18({
    ...options,
    run: async (command, args, settings) => {
      if (settings?.env?.COMPOSE_FILE && args.includes('--wait')) throw new Error('old database failed');
      return run(command, args, settings);
    },
    accept: async () => { throw new Error('candidate failed'); },
  }), /candidate failed.*rollback failed.*old database failed/);
});

test('Compose runs PostgreSQL 18 on its own volume and keeps the 16 volume out of reach of down -v', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const rollback = fs.readFileSync(ROLLBACK_COMPOSE_FILE, 'utf8');
  assert.match(compose, /image: postgres:18-alpine/);
  assert.match(compose, /- nono_pg18_data:\/var\/lib\/postgresql\n/);
  assert.doesNotMatch(compose, /^  nono_pg_data:/m);
  assert.match(rollback, /image: postgres:16-alpine/);
  assert.match(rollback, /volumes: !override\n\s+- nono_pg_data:\/var\/lib\/postgresql\/data/);
  assert.match(fs.readFileSync('package.json', 'utf8'), /"deploy:postgres-18": "node scripts\/migrate-postgres-18\.mjs"/);
});
