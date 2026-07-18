import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';
import { runCommand, waitForAcceptance } from './deploy-compose.mjs';

const BACKUP_CLI = '/app/nono/packages/server/dist/cli/backup.js';
const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/;

export function parseRestoreArgs(argv) {
  const options = {
    cwd: process.cwd(),
    baseUrl: 'http://127.0.0.1:8188',
    backupId: '',
    confirmation: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dir') options.cwd = argv[++index];
    else if (argument === '--base-url') options.baseUrl = argv[++index];
    else if (argument === '--id') options.backupId = argv[++index];
    else if (argument === '--confirm') options.confirmation = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  validateConfirmation(options.backupId, options.confirmation);
  return options;
}

export async function restoreCompose({
  cwd,
  baseUrl,
  backupId,
  confirmation,
  run = runCommand,
  accept = acceptDeployment,
  wait = sleep,
  acceptanceAttempts = 24,
  log = console.log,
}) {
  validateConfirmation(backupId, confirmation);
  const commandOptions = { cwd };
  const image = await inspectCurrentImage(run, commandOptions);
  if (!image) throw new Error('The running app image could not be determined');
  const composeOptions = { ...commandOptions, env: { ...process.env, NONO_APP_IMAGE: image } };

  await runBackupInContainer(run, ['exec', '-T', 'app'], ['verify', '--id', backupId], composeOptions);
  const safetyOutput = await runBackupInContainer(run, ['exec', '-T', 'app'], ['create'], { ...composeOptions, capture: true });
  const safetyBackupId = parseBackupOutput(safetyOutput.stdout).id;
  if (!BACKUP_ID_PATTERN.test(safetyBackupId)) throw new Error('Safety backup did not return a valid identifier');
  log(`safety backup created: ${safetyBackupId}`);

  let appStopped = false;
  try {
    await run('docker', ['compose', 'stop', 'app'], composeOptions);
    appStopped = true;
    await runBackupInContainer(run, ['run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'app'], ['restore', '--id', backupId], composeOptions);
    await run('docker', ['compose', 'start', 'app'], composeOptions);
    appStopped = false;
    await waitForAcceptance({ baseUrl, accept, wait, attempts: acceptanceAttempts, log });
    return { backupId, safetyBackupId, image, rolledBack: false };
  } catch (restoreFailure) {
    log(`restore failed; rolling data back to ${safetyBackupId}`);
    try {
      if (!appStopped) await run('docker', ['compose', 'stop', 'app'], composeOptions);
      await runBackupInContainer(run, ['run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'app'], ['restore', '--id', safetyBackupId], composeOptions);
      await run('docker', ['compose', 'start', 'app'], composeOptions);
      await waitForAcceptance({ baseUrl, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
      return {
        backupId,
        safetyBackupId,
        image,
        rolledBack: true,
        restoreError: errorText(restoreFailure),
      };
    } catch (rollbackFailure) {
      throw new Error(`Restore failed (${errorText(restoreFailure)}) and safety rollback failed (${errorText(rollbackFailure)})`);
    }
  }
}

async function runBackupInContainer(run, composePrefix, backupArgs, options) {
  return run('docker', ['compose', ...composePrefix, ...(composePrefix[0] === 'exec' ? ['node', BACKUP_CLI] : [BACKUP_CLI]), ...backupArgs], options);
}

async function inspectCurrentImage(run, commandOptions) {
  const containerId = (await run('docker', ['compose', 'ps', '-q', 'app'], { ...commandOptions, capture: true })).stdout.trim();
  if (!containerId) return '';
  return (await run('docker', ['inspect', '--format', '{{.Config.Image}}', containerId], { ...commandOptions, capture: true })).stdout.trim();
}

function parseBackupOutput(output) {
  const line = String(output).trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error('Backup command returned no output');
  try {
    return JSON.parse(line);
  } catch {
    throw new Error('Backup command returned invalid JSON');
  }
}

function validateConfirmation(backupId, confirmation) {
  if (!BACKUP_ID_PATTERN.test(backupId || '')) throw new Error('--id must be a valid backup identifier');
  if (!confirmation) throw new Error('--confirm is required');
  if (confirmation !== backupId) throw new Error('--confirm does not match --id');
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  restoreCompose(parseRestoreArgs(process.argv.slice(2)))
    .then((result) => {
      if (result.rolledBack) {
        console.error(`restore rolled back to ${result.safetyBackupId}: ${result.restoreError}`);
        process.exitCode = 1;
      } else {
        console.log(`backup ${result.backupId} restored and accepted`);
      }
    })
    .catch((error) => {
      console.error(errorText(error));
      process.exitCode = 1;
    });
}
