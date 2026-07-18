import path from 'node:path';
import { createBackupServiceFromEnv } from '../services/backup.service.js';

interface BackupCliOptions {
  command: 'create' | 'list' | 'verify' | 'restore' | 'delete';
  id: string;
}

export function parseBackupCliArgs(argv: string[]): BackupCliOptions {
  const command = argv[0] as BackupCliOptions['command'];
  if (!['create', 'list', 'verify', 'restore', 'delete'].includes(command)) {
    throw new Error('Usage: backup <create|list|verify|restore|delete> [--id BACKUP_ID]');
  }
  let id = '';
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--id') id = argv[++index] || '';
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (['verify', 'restore', 'delete'].includes(command) && !id) throw new Error('--id is required');
  return { command, id };
}

export async function runBackupCli(options: BackupCliOptions) {
  const nodeskContentDir = process.env.NODESK_CONTENT_DIR || path.resolve(process.cwd(), '../../../apps/blog');
  const service = createBackupServiceFromEnv(nodeskContentDir);
  if (options.command === 'create') return service.create();
  if (options.command === 'list') return { backups: await service.list() };
  if (options.command === 'verify') return service.verify(options.id);
  if (options.command === 'restore') return service.restore(options.id);
  await service.remove(options.id);
  return { ok: true, id: options.id };
}

runBackupCli(parseBackupCliArgs(process.argv.slice(2)))
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
