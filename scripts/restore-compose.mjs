import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';
import { runCommand, waitForAcceptance } from './deploy-compose.mjs';
import { inspectImage, backup, snapshot, safetyContext, assertMaintenance } from './compose-safety.mjs';

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
  fetchImpl = fetch,
}) {
  validateConfirmation(backupId, confirmation);
  const commandOptions = { cwd };
  const image = await inspectImage(run, commandOptions);
  if (!image) throw new Error('The running app image could not be determined');
  const context = safetyContext({ cwd, baseUrl, run, image });
  const composeOptions = context.publicOptions;
  await backup(run, composeOptions, ['verify', '--id', backupId]);
  let safetyBackupId = '';
  let dataMayHaveChanged = false;
  let releaseStarted = false;
  try {
    await context.stop();
    safetyBackupId = await snapshot(run, composeOptions);
    log(`verified offline safety backup: ${safetyBackupId}`);
    await context.file(false);
    dataMayHaveChanged = true;
    await backup(run, composeOptions, ['restore', '--id', backupId]);
    await context.start(context.offlineOptions);
    await waitForAcceptance({ baseUrl: context.candidateUrl, headers: context.headers, accept, wait, attempts: acceptanceAttempts, log });
    await assertMaintenance(context.candidateUrl, fetchImpl);
    await context.start(composeOptions);
    await assertMaintenance(baseUrl, fetchImpl, { wait, attempts: acceptanceAttempts });
    await waitForAcceptance({ baseUrl, headers: context.headers, accept, wait, attempts: acceptanceAttempts, log });
    releaseStarted = true;
    await context.file(true);
    return { backupId, safetyBackupId, image, rolledBack: false };
  } catch (restoreFailure) {
    if (releaseStarted) throw new Error(`Ingress release uncertain; accepted data was NOT rolled back: ${errorText(restoreFailure)}`);
    log(`restore failed; rolling data back to ${safetyBackupId}`);
    try {
      await context.stop();
      if (dataMayHaveChanged) await backup(run, composeOptions, ['restore', '--id', safetyBackupId], true);
      await context.file(false);
      await context.start(context.offlineOptions);
      await waitForAcceptance({ baseUrl: context.candidateUrl, headers: context.headers, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
      await assertMaintenance(context.candidateUrl, fetchImpl);
      await context.start(composeOptions);
      await assertMaintenance(baseUrl, fetchImpl, { wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)) });
      await waitForAcceptance({ baseUrl, headers: context.headers, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
      releaseStarted = true;
      await context.file(true);
      return {
        backupId,
        safetyBackupId,
        image,
        rolledBack: true,
        restoreError: errorText(restoreFailure),
      };
    } catch (rollbackFailure) {
      if (releaseStarted) throw new Error(`Restore failed (${errorText(restoreFailure)}); rollback ingress release uncertain (${errorText(rollbackFailure)}); data retained`);
      try { await context.stop(); } catch (stopError) {
        throw new Error(`Restore failed (${errorText(restoreFailure)}) and safety rollback failed (${errorText(rollbackFailure)}); writer shutdown also failed (${errorText(stopError)})`);
      }
      throw new Error(`Restore failed (${errorText(restoreFailure)}) and safety rollback failed (${errorText(rollbackFailure)})`);
    }
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
