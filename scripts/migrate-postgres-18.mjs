import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';
import {
  POSTGRES_VOLUME,
  enforceMigrationGate,
  imageTagForCommit,
  postgresMajors,
  runCli,
  runCommand,
  waitForAcceptance,
} from './deploy-compose.mjs';
import { inspectImage, backup, snapshot, safetyContext, assertMaintenance } from './compose-safety.mjs';

export const SOURCE_MAJOR = 16;
export const TARGET_MAJOR = 18;
export const CONFIRMATION = 'postgres-18';
export const ROLLBACK_COMPOSE_FILE = 'docker/postgres16-rollback.compose.yml';

export function parseMigratePostgresArgs(argv) {
  const options = {
    cwd: process.cwd(),
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    allowDestructiveMigrations: false,
    confirmation: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dir') options.cwd = argv[++index];
    else if (argument === '--base-url') options.baseUrl = argv[++index];
    else if (argument === '--image-repository') options.imageRepository = argv[++index];
    else if (argument === '--allow-destructive-migrations') options.allowDestructiveMigrations = true;
    else if (argument === '--confirm') options.confirmation = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  validateConfirmation(options.confirmation);
  return options;
}

// Layers the rollback file over docker-compose.yml so Compose reattaches the
// untouched PostgreSQL 16 volume without editing the checked-out files.
export function legacyOptions(options) {
  return { ...options, env: { ...options.env, COMPOSE_FILE: ['docker-compose.yml', ROLLBACK_COMPOSE_FILE].join(path.delimiter) } };
}

export async function migratePostgres18({
  cwd,
  baseUrl,
  imageRepository,
  allowDestructiveMigrations = false,
  confirmation,
  run = runCommand,
  accept = acceptDeployment,
  wait = sleep,
  acceptanceAttempts = 24,
  log = console.log,
  fetchImpl = fetch,
}) {
  validateConfirmation(confirmation);
  const commandOptions = { cwd };
  const { configured, running } = await postgresMajors(run, cwd);
  if (configured !== TARGET_MAJOR) throw new Error(`Compose must configure PostgreSQL ${TARGET_MAJOR}; pull the upgrade first (found ${configured || 'unknown'})`);
  if (running === TARGET_MAJOR) throw new Error(`PostgreSQL ${TARGET_MAJOR} is already running; nothing to migrate`);
  if (running !== SOURCE_MAJOR) throw new Error(`Expected a PostgreSQL ${SOURCE_MAJOR} container, found ${running || 'none'}`);
  await run('docker', ['compose', 'config', '--quiet'], legacyOptions(commandOptions));
  const target = await run('docker', ['volume', 'ls', '--filter', `label=com.docker.compose.volume=${POSTGRES_VOLUME}`, '--format', '{{.Name}}'], { ...commandOptions, capture: true });
  if (target.stdout.trim()) throw new Error(`Volume ${target.stdout.trim()} already exists; inspect and remove it before migrating`);
  const previousImage = await inspectImage(run, commandOptions, imageRepository);
  if (!previousImage) throw new Error('The running app image could not be determined');
  await enforceMigrationGate({ cwd, existing: true, allowDestructiveMigrations, run, log });

  const commit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  const imageTag = imageTagForCommit(imageRepository, commit);
  const context = safetyContext({ cwd, baseUrl, run, image: imageTag, commit });
  const old = safetyContext({ cwd, baseUrl, run, image: previousImage });
  const oldPublic = legacyOptions(old.publicOptions);

  log(`migrating PostgreSQL ${SOURCE_MAJOR} -> ${TARGET_MAJOR} with ${imageTag}`);
  await run('docker', ['compose', 'build', 'app'], context.publicOptions);
  let safetyBackupId = '';
  let switched = false;
  let dataMayHaveChanged = false;
  let releaseStarted = false;
  try {
    await old.stop(oldPublic);
    safetyBackupId = await snapshot(run, oldPublic);
    log(`verified offline safety backup: ${safetyBackupId}`);
    await context.file(false, oldPublic);
    // A failed stop or remove may already have taken the old database offline.
    // Enter database recovery before either command can change its state.
    switched = true;
    await run('docker', ['compose', 'stop', 'postgres'], oldPublic);
    await run('docker', ['compose', 'rm', '-f', 'postgres'], oldPublic);
    await run('docker', ['compose', 'up', '-d', '--wait', 'postgres'], context.publicOptions);
    dataMayHaveChanged = true;
    await backup(run, context.publicOptions, ['restore', '--id', safetyBackupId], true);
    await context.start(context.offlineOptions);
    await waitForAcceptance({ baseUrl: context.candidateUrl, headers: context.headers, accept, wait, attempts: acceptanceAttempts, log });
    await assertMaintenance(context.candidateUrl, fetchImpl);
    await context.start(context.publicOptions);
    await assertMaintenance(baseUrl, fetchImpl, { wait, attempts: acceptanceAttempts });
    await waitForAcceptance({ baseUrl, headers: context.headers, accept, wait, attempts: acceptanceAttempts, log });
    releaseStarted = true;
    await context.file(true);
    return { previousImage, imageTag, safetyBackupId, rolledBack: false };
  } catch (migrationError) {
    if (releaseStarted) throw new Error(`Ingress release uncertain; accepted data was NOT rolled back: ${errorText(migrationError)}`);
    log(`migration failed; returning to PostgreSQL ${SOURCE_MAJOR} and ${previousImage}`);
    try {
      await context.stop();
      if (switched) {
        await run('docker', ['compose', 'stop', 'postgres'], context.publicOptions);
        await run('docker', ['compose', 'rm', '-f', 'postgres'], context.publicOptions);
        await run('docker', ['compose', 'up', '-d', '--wait', 'postgres'], oldPublic);
      }
      // The candidate may have migrated the SQLite and NoDesk volumes; the
      // PostgreSQL 16 volume itself was never written after the snapshot.
      if (dataMayHaveChanged) await backup(run, oldPublic, ['restore', '--id', safetyBackupId], true);
      await run('docker', ['compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'app', '-e', "require('node:fs').rmSync('/app/backups/.deployment-maintenance.json',{force:true})"], oldPublic);
      await old.start(legacyOptions(old.offlineOptions));
      await waitForAcceptance({ baseUrl: old.candidateUrl, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
      await old.start(oldPublic);
    } catch (rollbackError) {
      try { await context.stop(); } catch (stopError) {
        throw new Error(`Migration failed (${errorText(migrationError)}) and rollback failed (${errorText(rollbackError)}); writer shutdown also failed (${errorText(stopError)})`);
      }
      throw new Error(`Migration failed (${errorText(migrationError)}) and rollback failed (${errorText(rollbackError)})`);
    }
    return {
      previousImage,
      imageTag,
      safetyBackupId,
      rolledBack: true,
      migrationError: errorText(migrationError),
    };
  }
}

function validateConfirmation(confirmation) {
  if (confirmation !== CONFIRMATION) throw new Error(`--confirm ${CONFIRMATION} is required`);
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(
    () => migratePostgres18(parseMigratePostgresArgs(process.argv.slice(2))),
    { onSuccess: (result) => {
      if (result.rolledBack) {
        console.error(`migration rolled back to PostgreSQL ${SOURCE_MAJOR} and ${result.previousImage}: ${result.migrationError}`);
        return 1;
      }
      console.log(`PostgreSQL ${TARGET_MAJOR} accepted with ${result.imageTag}; the PostgreSQL ${SOURCE_MAJOR} volume is retained`);
      return 0;
    } },
  );
}
