import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BACKUP_KIND = 'nono.full-backup';
const BACKUP_VERSION = 1;
const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/;

export interface BackupComponentRecord {
  filename: string;
  sha256: string;
  size: number;
}

export interface BackupRecord {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  id: string;
  filename: string;
  createdAt: string;
  sourceCommit: string;
  size: number;
  sha256: string;
  status: 'verified';
  components: Array<'postgres' | 'nodesk' | 'nomoney'>;
  componentRecords: Record<'postgres' | 'nodesk' | 'nomoney', BackupComponentRecord>;
}

export interface BackupDownload {
  path: string;
  filename: string;
  size: number;
}

export interface BackupService {
  list(): Promise<BackupRecord[]>;
  create(): Promise<BackupRecord>;
  verify(id: string): Promise<BackupRecord>;
  drill(id: string): Promise<BackupRecord>;
  restore(id: string): Promise<BackupRecord>;
  resolveDownload(id: string): Promise<BackupDownload>;
  remove(id: string): Promise<boolean>;
}

export type BackupCommandRunner = (
  command: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export interface BackupServiceOptions {
  backupDir: string;
  nodeskContentDir: string;
  nomoneyDataDir: string;
  databaseUrl: string;
  sourceCommit?: string;
  now?: () => Date;
  run?: BackupCommandRunner;
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  return new FileBackupService({
    ...options,
    sourceCommit: options.sourceCommit || 'unknown',
    now: options.now || (() => new Date()),
    run: options.run || runBackupCommand,
  });
}

export function createBackupServiceFromEnv(nodeskContentDir: string) {
  return createBackupService({
    backupDir: process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'),
    nodeskContentDir,
    nomoneyDataDir: process.env.NOMONEY_DATA_DIR || path.resolve(process.cwd(), '../nomoney-data'),
    databaseUrl: process.env.DATABASE_URL || '',
    sourceCommit: process.env.NONO_BUILD_COMMIT || 'unknown',
  });
}

class FileBackupService implements BackupService {
  private creating = false;

  constructor(private readonly options: Required<Pick<BackupServiceOptions, 'backupDir' | 'nodeskContentDir' | 'nomoneyDataDir' | 'databaseUrl' | 'sourceCommit' | 'now' | 'run'>>) {}

  async list() {
    await fs.promises.mkdir(this.options.backupDir, { recursive: true });
    const entries = await fs.promises.readdir(this.options.backupDir, { withFileTypes: true });
    const records: BackupRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const record = await readRecord(path.join(this.options.backupDir, entry.name));
        const archive = path.join(this.options.backupDir, record.filename);
        const stat = await fs.promises.stat(archive);
        if (stat.isFile() && stat.size === record.size) records.push(record);
      } catch {
        // Invalid or incomplete manifests are deliberately hidden from the UI.
      }
    }
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async create() {
    if (this.creating) throw httpError(409, 'A backup is already running');
    this.creating = true;
    const createdAt = this.options.now().toISOString();
    await fs.promises.mkdir(this.options.backupDir, { recursive: true });
    const id = await this.availableId(formatBackupId(new Date(createdAt)));
    const filename = `nono-backup-${id}.tar.gz`;
    const archivePath = path.join(this.options.backupDir, filename);
    const temporaryArchive = `${archivePath}.tmp`;
    const workspace = path.join(this.options.backupDir, `.tmp-${id}-${process.pid}`);

    try {
      validateSourcePaths(this.options);
      const postgresEnv = postgresEnvironment(this.options.databaseUrl);
      await fs.promises.mkdir(workspace, { recursive: true });
      const postgresPath = path.join(workspace, 'postgres.dump');
      const nodeskPath = path.join(workspace, 'nodesk.tar.gz');
      const nomoneyPath = path.join(workspace, 'nomoney.db');

      await this.options.run('pg_dump', [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        `--file=${postgresPath}`,
      ], { env: { ...process.env, ...postgresEnv } });
      await this.options.run('pg_restore', ['--list', postgresPath], { env: { ...process.env, ...postgresEnv } });
      await this.options.run('tar', ['-czf', nodeskPath, '-C', this.options.nodeskContentDir, '.']);
      await copyVerifiedSqlite(this.options.nomoneyDataDir, nomoneyPath, this.options.run);

      const componentRecords = {
        postgres: await componentRecord(postgresPath),
        nodesk: await componentRecord(nodeskPath),
        nomoney: await componentRecord(nomoneyPath),
      };
      const innerManifest = {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        id,
        createdAt,
        sourceCommit: this.options.sourceCommit,
        components: componentRecords,
      };
      await writeJsonAtomic(path.join(workspace, 'manifest.json'), innerManifest);
      await this.options.run('tar', ['-czf', temporaryArchive, '-C', workspace, '.']);
      await fs.promises.rename(temporaryArchive, archivePath);
      const artifact = await fileFingerprint(archivePath);
      const record: BackupRecord = {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        id,
        filename,
        createdAt,
        sourceCommit: this.options.sourceCommit,
        size: artifact.size,
        sha256: artifact.sha256,
        status: 'verified',
        components: ['postgres', 'nodesk', 'nomoney'],
        componentRecords,
      };
      await writeJsonAtomic(this.recordPath(id), record);
      return record;
    } catch (error) {
      await Promise.allSettled([
        fs.promises.rm(temporaryArchive, { force: true }),
        fs.promises.rm(archivePath, { force: true }),
        fs.promises.rm(this.recordPath(id), { force: true }),
      ]);
      throw error;
    } finally {
      this.creating = false;
      await removeBackupDirectory(workspace);
    }
  }

  async resolveDownload(id: string) {
    assertBackupId(id);
    const record = await this.loadRecord(id);
    const archivePath = path.join(this.options.backupDir, record.filename);
    const artifact = await fileFingerprint(archivePath).catch(() => null);
    if (!artifact || artifact.size !== record.size || artifact.sha256 !== record.sha256) {
      throw httpError(409, 'Backup checksum mismatch');
    }
    return { path: archivePath, filename: record.filename, size: record.size };
  }

  async verify(id: string) {
    return this.withVerifiedWorkspace(id, async (record) => record);
  }

  async drill(id: string) {
    return this.withVerifiedWorkspace(id, async (record, workspace) => {
      const postgresEnv = postgresEnvironment(this.options.databaseUrl);
      const database = `nono_drill_${id.replace(/[^0-9a-z]/gi, '').toLowerCase()}_${randomBytes(3).toString('hex')}`.slice(0, 63);
      await this.options.run('createdb', ['--template=template0', database], { env: { ...process.env, ...postgresEnv } });
      try {
        await this.options.run('pg_restore', [
          '--exit-on-error',
          '--no-owner',
          '--no-acl',
          `--dbname=${database}`,
          path.join(workspace, 'postgres.dump'),
        ], { env: { ...process.env, ...postgresEnv } });

        const nodeskArchive = path.join(workspace, 'nodesk.tar.gz');
        const nodeskTarget = path.join(workspace, 'nodesk-drill');
        const listing = await this.options.run('tar', ['-tzf', nodeskArchive]);
        validateTarEntries(listing.stdout);
        await fs.promises.mkdir(nodeskTarget, { recursive: true });
        await this.options.run('tar', ['-xzf', nodeskArchive, '-C', nodeskTarget]);
      } finally {
        await this.options.run('dropdb', ['--if-exists', database], { env: { ...process.env, ...postgresEnv } });
      }
      return record;
    });
  }

  async restore(id: string) {
    return this.withVerifiedWorkspace(id, async (record, workspace) => {
      const postgresEnv = postgresEnvironment(this.options.databaseUrl);
      await this.options.run('pg_restore', [
        '--clean',
        '--if-exists',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        `--dbname=${postgresEnv.PGDATABASE}`,
        path.join(workspace, 'postgres.dump'),
      ], { env: { ...process.env, ...postgresEnv } });

      await removeBackupDirectory(this.options.nodeskContentDir);
      await fs.promises.mkdir(this.options.nodeskContentDir, { recursive: true });
      const nodeskArchive = path.join(workspace, 'nodesk.tar.gz');
      const nodeskListing = await this.options.run('tar', ['-tzf', nodeskArchive]);
      validateTarEntries(nodeskListing.stdout);
      await this.options.run('tar', ['-xzf', nodeskArchive, '-C', this.options.nodeskContentDir]);

      await fs.promises.mkdir(this.options.nomoneyDataDir, { recursive: true });
      await replaceFile(path.join(workspace, 'nomoney.db'), path.join(this.options.nomoneyDataDir, 'app.db'));
      return record;
    });
  }

  async remove(id: string) {
    assertBackupId(id);
    const record = await this.loadRecord(id);
    await Promise.all([
      fs.promises.rm(path.join(this.options.backupDir, record.filename), { force: true }),
      fs.promises.rm(this.recordPath(id), { force: true }),
    ]);
    return true;
  }

  private async loadRecord(id: string) {
    try {
      return await readRecord(this.recordPath(id));
    } catch {
      throw httpError(404, 'Backup not found');
    }
  }

  private recordPath(id: string) {
    return path.join(this.options.backupDir, `nono-backup-${id}.json`);
  }

  private async availableId(base: string) {
    if (!fs.existsSync(this.recordPath(base)) && !fs.existsSync(path.join(this.options.backupDir, `nono-backup-${base}.tar.gz`))) return base;
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  private async withVerifiedWorkspace<T>(id: string, action: (record: BackupRecord, workspace: string) => Promise<T>) {
    const download = await this.resolveDownload(id);
    const record = await this.loadRecord(id);
    const workspace = path.join(this.options.backupDir, `.verify-${id}-${process.pid}-${randomBytes(3).toString('hex')}`);
    await fs.promises.mkdir(workspace, { recursive: true });
    try {
      const listing = await this.options.run('tar', ['-tzf', download.path]);
      validateTarEntries(listing.stdout, new Set(['manifest.json', 'postgres.dump', 'nodesk.tar.gz', 'nomoney.db']));
      await this.options.run('tar', ['-xzf', download.path, '-C', workspace]);
      const manifest = await readInnerManifest(path.join(workspace, 'manifest.json'), id);
      const componentNames = ['postgres', 'nodesk', 'nomoney'] as const;
      for (const name of componentNames) {
        const component = manifest.components[name];
        const expectedFilename = name === 'postgres' ? 'postgres.dump' : name === 'nodesk' ? 'nodesk.tar.gz' : 'nomoney.db';
        if (component.filename !== expectedFilename || record.componentRecords[name]?.sha256 !== component.sha256) {
          throw httpError(409, `${name} component manifest mismatch`);
        }
        const actual = await fileFingerprint(path.join(workspace, expectedFilename)).catch(() => null);
        if (!actual || actual.size !== component.size || actual.sha256 !== component.sha256) {
          throw httpError(409, `${name} component checksum mismatch`);
        }
      }

      const postgresEnv = postgresEnvironment(this.options.databaseUrl);
      await this.options.run('pg_restore', ['--list', path.join(workspace, 'postgres.dump')], { env: { ...process.env, ...postgresEnv } });
      const sqlite = await this.options.run('sqlite3', [path.join(workspace, 'nomoney.db'), 'PRAGMA integrity_check;']);
      if (sqlite.stdout.trim() !== 'ok') throw httpError(409, 'NoMoney SQLite integrity check failed');
      return await action(record, workspace);
    } finally {
      await removeBackupDirectory(workspace);
    }
  }
}

export async function removeBackupDirectory(
  target: string,
  remove: (target: string, options: { recursive: boolean; force: boolean; maxRetries: number; retryDelay: number }) => Promise<void> = fs.promises.rm,
) {
  await remove(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function copyVerifiedSqlite(nomoneyDataDir: string, destination: string, run: BackupCommandRunner) {
  const source = path.join(nomoneyDataDir, 'app.db');
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.promises.copyFile(source, destination);
      const result = await run('sqlite3', [destination, 'PRAGMA integrity_check;']);
      if (result.stdout.trim() !== 'ok') throw new Error('NoMoney SQLite integrity check failed');
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Unable to create a consistent NoMoney snapshot');
}

function validateSourcePaths(options: BackupServiceOptions) {
  if (!options.databaseUrl) throw httpError(503, 'DATABASE_URL is not configured');
  if (!fs.existsSync(options.nodeskContentDir)) throw httpError(503, 'Nodesk content directory is unavailable');
  if (!fs.existsSync(path.join(options.nomoneyDataDir, 'app.db'))) throw httpError(503, 'NoMoney database is unavailable');
}

function postgresEnvironment(databaseUrl: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw httpError(503, 'DATABASE_URL is invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw httpError(503, 'DATABASE_URL is invalid');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !url.username || !database) throw httpError(503, 'DATABASE_URL is incomplete');
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
}

async function componentRecord(filePath: string): Promise<BackupComponentRecord> {
  const fingerprint = await fileFingerprint(filePath);
  return { filename: path.basename(filePath), ...fingerprint };
}

async function fileFingerprint(filePath: string) {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  const stat = await fs.promises.stat(filePath);
  return { size: stat.size, sha256: hash.digest('hex') };
}

async function readRecord(filePath: string): Promise<BackupRecord> {
  const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as BackupRecord;
  if (parsed.kind !== BACKUP_KIND || parsed.version !== BACKUP_VERSION) throw new Error('Unsupported backup manifest');
  assertBackupId(parsed.id);
  if (parsed.filename !== `nono-backup-${parsed.id}.tar.gz`) throw new Error('Invalid backup filename');
  if (!/^[a-f0-9]{64}$/.test(parsed.sha256) || !Number.isSafeInteger(parsed.size) || parsed.size < 1) throw new Error('Invalid backup fingerprint');
  return parsed;
}

async function readInnerManifest(filePath: string, expectedId: string) {
  const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as {
    kind?: string;
    version?: number;
    id?: string;
    components?: Partial<Record<'postgres' | 'nodesk' | 'nomoney', BackupComponentRecord>>;
  };
  if (parsed.kind !== BACKUP_KIND || parsed.version !== BACKUP_VERSION || parsed.id !== expectedId) {
    throw httpError(409, 'Backup manifest mismatch');
  }
  if (!parsed.components?.postgres || !parsed.components.nodesk || !parsed.components.nomoney) {
    throw httpError(409, 'Backup component manifest is incomplete');
  }
  return parsed as {
    kind: typeof BACKUP_KIND;
    version: typeof BACKUP_VERSION;
    id: string;
    components: Record<'postgres' | 'nodesk' | 'nomoney', BackupComponentRecord>;
  };
}

function validateTarEntries(output: string, allowed?: Set<string>) {
  const entries = output.split(/\r?\n/).map((entry) => entry.trim().replace(/^\.\//, '')).filter(Boolean);
  if (!entries.length) throw httpError(409, 'Backup archive is empty');
  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) {
      throw httpError(409, 'Backup archive contains an unsafe path');
    }
    if (allowed && !allowed.has(normalized)) throw httpError(409, 'Backup archive contains an unexpected file');
  }
}

async function replaceFile(source: string, destination: string) {
  const temporary = `${destination}.${process.pid}.restore.tmp`;
  await fs.promises.copyFile(source, temporary);
  try {
    await fs.promises.rename(temporary, destination);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    await fs.promises.rm(destination, { force: true });
    await fs.promises.rename(temporary, destination);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(temporary, filePath);
}

function formatBackupId(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function assertBackupId(id: string) {
  if (!BACKUP_ID_PATTERN.test(id)) throw httpError(400, 'Invalid backup identifier');
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export async function runBackupCommand(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}
