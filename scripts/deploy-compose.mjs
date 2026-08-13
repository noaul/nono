import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';

const BACKUP_CLI = '/app/nono/packages/server/dist/cli/backup.js';
const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/;

export function imageTagForCommit(repository, commit) {
  const normalized = String(commit).trim().replace(/[^a-fA-F0-9]/g, '');
  if (normalized.length < 12) throw new Error('Git commit must contain at least 12 hexadecimal characters');
  return `${repository}:${normalized.slice(0, 12).toLowerCase()}`;
}

export function destructiveMigrationStatements(sql) {
  const cleaned = stripSqlCommentsAndStrings(String(sql));
  const findings = [];
  for (const statement of cleaned.split(';').map((item) => item.trim()).filter(Boolean)) {
    const compact = statement.replace(/\s+/g, ' ');
    const dropColumn = compact.match(/^ALTER TABLE ("[^"]+"|[\w.]+).*\bDROP COLUMN\b/i);
    if (dropColumn) findings.push(`ALTER TABLE ${dropColumn[1]} DROP COLUMN`);
    else if (/^ALTER\s+TABLE\b.*\bRENAME\s+COLUMN\b/i.test(compact)) findings.push(`ALTER TABLE ${tableName(compact)} RENAME COLUMN`);
    else if (/^ALTER\s+TABLE\b.*\bDROP\s+CONSTRAINT\b/i.test(compact)) findings.push(`ALTER TABLE ${tableName(compact)} DROP CONSTRAINT`);
    else if (/^ALTER\s+TABLE\b.*\bSET\s+NOT\s+NULL\b/i.test(compact)) findings.push(`ALTER TABLE ${tableName(compact)} SET NOT NULL`);
    else if (/^ALTER\s+TABLE\b.*\bRENAME\s+TO\b/i.test(compact)) findings.push(`ALTER TABLE ${tableName(compact)} RENAME TABLE`);
    else if (/^DROP\s+TABLE\b/i.test(compact)) findings.push('DROP TABLE');
    else if (/^DROP\s+INDEX\b/i.test(compact)) findings.push('DROP INDEX');
    else if (/^UPDATE\s+("[^"]+"|[\w.]+)\s+SET\b/i.test(compact)) findings.push('UPDATE DATA');
    else if (/^TRUNCATE(?:\s+TABLE)?\b/i.test(compact)) findings.push('TRUNCATE TABLE');
    else if (/^DELETE\s+FROM\b/i.test(compact)) findings.push('DELETE FROM');
    else if (/^ALTER\s+TABLE\b.*\bALTER(?:\s+COLUMN)?\b.*\bTYPE\b/i.test(compact)) findings.push('ALTER COLUMN TYPE');
    else if (/^DROP\s+(?:SCHEMA|TYPE|DATABASE)\b/i.test(compact)) findings.push('DROP DATABASE OBJECT');
  }
  return findings;
}

function tableName(statement) {
  return statement.match(/^ALTER\s+TABLE\s+("[^"]+"|[\w.]+)/i)?.[1] || '<unknown>';
}

export function parseDeployArgs(argv) {
  const options = {
    cwd: process.cwd(),
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    skipPull: false,
    allowDestructiveMigrations: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dir') options.cwd = argv[++index];
    else if (argument === '--base-url') options.baseUrl = argv[++index];
    else if (argument === '--image-repository') options.imageRepository = argv[++index];
    else if (argument === '--skip-pull') options.skipPull = true;
    else if (argument === '--allow-destructive-migrations') options.allowDestructiveMigrations = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function deployCompose({
  cwd,
  baseUrl,
  imageRepository,
  skipPull,
  allowDestructiveMigrations = false,
  run = runCommand,
  accept = acceptDeployment,
  wait = sleep,
  acceptanceAttempts = 24,
  log = console.log,
}) {
  const commandOptions = { cwd };
  const previousCommit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  const previousImage = await inspectCurrentImage(run, commandOptions);

  if (!skipPull) await run('git', ['pull', '--ff-only', 'origin', 'main'], commandOptions);
  const currentCommit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  await enforceMigrationGate({
    cwd,
    previousCommit,
    currentCommit,
    allowDestructiveMigrations,
    run,
    log
  });
  const imageTag = imageTagForCommit(imageRepository, currentCommit);
  const deployEnv = { ...process.env, NONO_APP_IMAGE: imageTag, NONO_BUILD_COMMIT: currentCommit };

  log(`deploying ${previousCommit.slice(0, 12)} -> ${currentCommit.slice(0, 12)} as ${imageTag}`);
  await run('docker', ['compose', 'up', '-d', 'postgres'], { ...commandOptions, env: deployEnv });
  let safetyBackupId = '';
  if (previousImage.id) {
    const backup = await run('docker', [
      'compose', 'exec', '-T', 'app', 'node',
      BACKUP_CLI, 'create'
    ], { ...commandOptions, env: deployEnv, capture: true });
    safetyBackupId = parseBackupId(backup.stdout);
    log(`safety backup created: ${safetyBackupId}`);
  } else {
    log('initial deployment detected; no existing application data to back up');
  }
  await run('docker', ['compose', 'build', 'app'], { ...commandOptions, env: deployEnv });
  await run('docker', ['compose', 'up', '-d', '--no-deps', 'app'], { ...commandOptions, env: deployEnv });

  try {
    await waitForAcceptance({ baseUrl, accept, wait, attempts: acceptanceAttempts, log });
    return { previousCommit, currentCommit, imageTag, rolledBack: false };
  } catch (deploymentError) {
    if (!previousImage.reference) {
      throw new Error(`Deployment acceptance failed and no previous image is available: ${errorText(deploymentError)}`);
    }

    log(`deployment acceptance failed; restoring data ${safetyBackupId} and image ${previousImage.reference}`);
    const rollbackEnv = { ...process.env, NONO_APP_IMAGE: previousImage.reference, NONO_BUILD_COMMIT: previousCommit };
    await run('docker', ['compose', 'stop', 'app'], { ...commandOptions, env: rollbackEnv });
    if (safetyBackupId) {
      await run('docker', [
        'compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'app',
        BACKUP_CLI, 'restore', '--id', safetyBackupId,
      ], { ...commandOptions, env: rollbackEnv });
    }
    await run('docker', ['compose', 'up', '-d', '--no-deps', '--force-recreate', 'app'], { ...commandOptions, env: rollbackEnv });
    try {
      await waitForAcceptance({ baseUrl, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
    } catch (rollbackError) {
      throw new Error(`Deployment failed (${errorText(deploymentError)}) and rollback failed (${errorText(rollbackError)})`);
    }
    return {
      previousCommit,
      currentCommit,
      imageTag,
      rolledBack: true,
      rollbackImage: previousImage.reference,
      safetyBackupId,
      deploymentError: errorText(deploymentError),
    };
  }
}

function parseBackupId(output) {
  const line = String(output).trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error('Safety backup did not return an identifier');
  let id;
  try {
    id = JSON.parse(line).id;
  } catch {
    throw new Error('Safety backup returned invalid JSON');
  }
  if (!BACKUP_ID_PATTERN.test(id || '')) throw new Error('Safety backup returned an invalid identifier');
  return id;
}

async function enforceMigrationGate({ cwd, previousCommit, currentCommit, allowDestructiveMigrations, run, log }) {
  if (previousCommit === currentCommit) return;
  const result = await run('git', [
    'diff', '--name-only', `${previousCommit}..${currentCommit}`, '--',
    'packages/server/prisma/migrations/*/migration.sql'
  ], { cwd, capture: true });
  const migrationRoot = path.resolve(cwd, 'packages/server/prisma/migrations');
  const findings = [];
  for (const relativePath of result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const absolutePath = path.resolve(cwd, relativePath);
    if (!absolutePath.startsWith(`${migrationRoot}${path.sep}`) || path.basename(absolutePath) !== 'migration.sql') {
      throw new Error(`Unexpected migration path: ${relativePath}`);
    }
    for (const statement of destructiveMigrationStatements(fs.readFileSync(absolutePath, 'utf8'))) {
      findings.push(`${relativePath}: ${statement}`);
    }
  }
  if (!findings.length) return;
  if (!allowDestructiveMigrations) {
    throw new Error(`Destructive database migration blocked:\n${findings.join('\n')}\nReview it and rerun with --allow-destructive-migrations only after a rollback plan is ready.`);
  }
  log(`destructive migration override accepted:\n${findings.join('\n')}`);
}

function stripSqlCommentsAndStrings(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

export async function waitForAcceptance({ baseUrl, accept, wait, attempts, log }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await accept({ baseUrl, log });
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      log(`acceptance attempt ${attempt}/${attempts} failed: ${errorText(error)}`);
      await wait(5000);
    }
  }
  throw lastError || new Error('Deployment acceptance failed');
}

export async function runCommand(command, args, { cwd = process.cwd(), env = process.env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function inspectCurrentImage(run, commandOptions) {
  try {
    const containerId = (await run('docker', ['compose', 'ps', '-q', 'app'], { ...commandOptions, capture: true })).stdout.trim();
    if (!containerId) return { id: '', reference: '' };
    const [idResult, referenceResult] = await Promise.all([
      run('docker', ['inspect', '--format', '{{.Image}}', containerId], { ...commandOptions, capture: true }),
      run('docker', ['inspect', '--format', '{{.Config.Image}}', containerId], { ...commandOptions, capture: true }),
    ]);
    return { id: idResult.stdout.trim(), reference: referenceResult.stdout.trim() };
  } catch {
    return { id: '', reference: '' };
  }
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  deployCompose(parseDeployArgs(process.argv.slice(2)))
    .then((result) => {
      if (result.rolledBack) {
        console.error(`deployment rolled back to ${result.rollbackImage}: ${result.deploymentError}`);
        process.exitCode = 1;
      } else {
        console.log(`deployment accepted at ${result.currentCommit.slice(0, 12)} (${result.imageTag})`);
      }
    })
    .catch((error) => {
      console.error(errorText(error));
      process.exitCode = 1;
    });
}
