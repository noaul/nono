import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommand } from './deploy-compose.mjs';

const BACKUP_CLI = '/app/nono/packages/server/dist/cli/backup.js';
const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/;

export function parseBackupArgs(argv) {
  const command = argv[0];
  if (!['create', 'list', 'verify', 'delete'].includes(command)) {
    throw new Error('Usage: backup-compose <create|list|verify|delete> [--id BACKUP_ID] [--dir PATH]');
  }
  const options = { command, cwd: process.cwd(), backupId: '' };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dir') options.cwd = argv[++index];
    else if (argument === '--id') options.backupId = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (['verify', 'delete'].includes(command) && !BACKUP_ID_PATTERN.test(options.backupId || '')) {
    throw new Error('--id must be a valid backup identifier');
  }
  return options;
}

export function runBackupCompose({ command, cwd, backupId, run = runCommand }) {
  const backupArgs = [command, ...(['verify', 'delete'].includes(command) ? ['--id', backupId] : [])];
  return run('docker', [
    'compose', 'exec', '-T', 'app', 'node', BACKUP_CLI, ...backupArgs,
  ], { cwd });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runBackupCompose(parseBackupArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
