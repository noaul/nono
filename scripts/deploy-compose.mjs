import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';
import { inspectImage, backup, snapshot, safetyContext, assertMaintenance } from './compose-safety.mjs';

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
  fetchImpl = fetch,
}) {
  const commandOptions = { cwd };
  const previousCommit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  const previousImage = await inspectImage(run, commandOptions);

  if (!skipPull) await run('git', ['pull', '--ff-only', 'origin', 'main'], commandOptions);
  const currentCommit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  await enforceMigrationGate({
    cwd,
    previousCommit,
    currentCommit,
    allowDestructiveMigrations,
    run,
    log,
    existing: Boolean(previousImage)
  });
  const imageTag = imageTagForCommit(imageRepository, currentCommit);
  const context = safetyContext({ cwd, baseUrl, run, image: imageTag, commit: currentCommit });
  const old = safetyContext({ cwd, baseUrl, run, image: previousImage || imageTag, commit: previousCommit });

  log(`deploying ${previousCommit.slice(0, 12)} -> ${currentCommit.slice(0, 12)} as ${imageTag}`);
  await run('docker', ['compose', 'build', 'app'], context.publicOptions);
  await run('docker', ['compose', 'up', '-d', 'postgres'], context.publicOptions);
  let safetyBackupId = '';
  let dataMayHaveChanged = false;
  let releaseStarted = false;
  try {
    await context.stop();
    if (previousImage) {
      safetyBackupId = await snapshot(run, old.publicOptions);
      log(`verified offline safety backup: ${safetyBackupId}`);
    }
    await context.file(false, old.publicOptions);
    dataMayHaveChanged = true;
    await context.start(context.offlineOptions);
    await waitForAcceptance({ baseUrl: context.candidateUrl, headers: context.headers, accept, wait, attempts: acceptanceAttempts, log });
    await assertMaintenance(context.candidateUrl, fetchImpl);
    await context.start(context.publicOptions);
    await assertMaintenance(baseUrl, fetchImpl, { wait, attempts: acceptanceAttempts });
    await waitForAcceptance({ baseUrl, headers: context.headers, accept, wait, attempts: acceptanceAttempts, log });
    releaseStarted = true;
    await context.file(true);
    return { previousCommit, currentCommit, imageTag, safetyBackupId, rolledBack: false };
  } catch (deploymentError) {
    if (releaseStarted) throw new Error(`Ingress release uncertain; accepted data was NOT rolled back: ${errorText(deploymentError)}`);
    try {
      await context.stop();
      if (!previousImage) throw new Error('No previous image is available; application left stopped');
      if (dataMayHaveChanged) await backup(run, old.publicOptions, ['restore', '--id', safetyBackupId], true);
      // Historical images do not implement maintenance. Accept offline first;
      // public rebind is the final commit point, with no later data rollback.
      await run('docker', ['compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'app', '-e', "require('node:fs').rmSync('/app/backups/.deployment-maintenance.json',{force:true})"], old.publicOptions);
      await old.start(old.offlineOptions);
      await waitForAcceptance({ baseUrl: old.candidateUrl, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
      await old.start(old.publicOptions);
    } catch (rollbackError) {
      try { await context.stop(); } catch (stopError) {
        throw new Error(`Deployment failed (${errorText(deploymentError)}) and rollback failed (${errorText(rollbackError)}); writer shutdown also failed (${errorText(stopError)})`);
      }
      throw new Error(`Deployment failed (${errorText(deploymentError)}) and rollback failed (${errorText(rollbackError)})`);
    }
    return {
      previousCommit,
      currentCommit,
      imageTag,
      rolledBack: true,
      rollbackImage: previousImage,
      safetyBackupId,
      deploymentError: errorText(deploymentError),
    };
  }
}

async function enforceMigrationGate({ cwd, existing, allowDestructiveMigrations, run, log }) {
  const database = (await run('docker', ['compose', 'ps', '-a', '-q', 'postgres'], { cwd, capture: true })).stdout.trim();
  if (!existing && database) throw new Error('Existing database requires a previous immutable app image for rollback');
  if (!existing && !database) {
    const volumes = await run('docker', ['volume', 'ls', '--filter', 'label=com.docker.compose.volume=nono_pg_data', '--format', '{{.Name}}'], { cwd, capture: true });
    if (volumes.stdout.trim()) throw new Error('Existing database volume found without a database container; restore its Compose container before deployment');
    return;
  }
  let rows;
  try {
    const result = await run('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"', 'sh', 'SELECT COALESCE(json_agg(t), \'[]\'::json) FROM (SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations") t'], { cwd, capture: true });
    rows = JSON.parse(result.stdout);
    if (!Array.isArray(rows) || !rows.length || rows.some((row) => typeof row.migration_name !== 'string' || (!row.finished_at && !row.rolled_back_at))) throw new Error('missing or unfinished migration records');
  } catch (error) { throw new Error(`Cannot determine database migration state: ${errorText(error)}`); }
  const applied = new Set(rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  const migrationRoot = path.resolve(cwd, 'packages/server/prisma/migrations');
  const findings = [];
  for (const directory of fs.readdirSync(migrationRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (applied.has(directory.name)) continue;
    const absolutePath = path.join(migrationRoot, directory.name, 'migration.sql');
    const relativePath = path.relative(cwd, absolutePath);
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

export async function waitForAcceptance({ baseUrl, headers, accept, wait, attempts, log }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await accept({ baseUrl, headers, log });
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
