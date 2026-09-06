import { createHash, randomBytes } from 'node:crypto';
import type { Repository } from './repository.js';
import type { PublicFetchResult, SafeRequestOptions } from '../utils/safe-fetch.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';

// Order is restore order.
export const BACKUP_MODULES = ['nono', 'nodesk', 'nostar', 'nomoney', 'yumi'] as const;
export type BackupModule = (typeof BACKUP_MODULES)[number];

const CONFIG_KEY = 'backupCenterWebdav';
const BATCH_KIND = 'nono.webdav-backup-batch';
const BATCH_VERSION = 1;
const LOCAL_BUNDLE_KIND = 'nono.local-backup-bundle';
const LOCAL_MODULE_KIND = 'nono.local-module-backup';
const INDEX_PATH = '/nono/batches/index.json';
const BATCH_ID_PATTERN = /^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/;

export interface BackupModuleAdapter {
  module: BackupModule;
  extension: string;
  contentType: string;
  export(userId: number): Promise<Buffer>;
  validate(body: Buffer): Promise<void>;
  restore(userId: number, body: Buffer): Promise<void>;
}

export interface WebDavConfigInput {
  url: string;
  username: string;
  password?: string;
}

export interface WebDavConfigView {
  url: string;
  username: string;
  passwordConfigured: boolean;
  rootPath: '/nono/';
}

export interface BackupBatchModuleRecord {
  module: BackupModule;
  path: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  status: 'verified';
}

export interface BackupBatchManifest {
  kind: typeof BATCH_KIND;
  version: typeof BATCH_VERSION;
  id: string;
  scope: 'full' | 'module';
  createdAt: string;
  sourceCommit: string;
  modules: Partial<Record<BackupModule, BackupBatchModuleRecord>>;
}

interface StoredWebDavConfig {
  url: string;
  username: string;
  passwordEncrypted: string;
}

type SafeRequester = (url: string, options?: SafeRequestOptions) => Promise<PublicFetchResult>;

export interface BackupCenterService {
  getWebDavConfig(): Promise<WebDavConfigView>;
  saveWebDavConfig(input: WebDavConfigInput): Promise<WebDavConfigView>;
  testWebDavConnection(): Promise<{ ok: true; rootPath: '/nono/' }>;
  backupToWebDav(userId: number, modules?: readonly BackupModule[]): Promise<BackupBatchManifest>;
  listWebDavBatches(): Promise<BackupBatchManifest[]>;
  removeWebDavBatch(batchId: string): Promise<boolean>;
  restoreWebDavBatch(userId: number, batchId: string, modules?: readonly BackupModule[]): Promise<{ batchId: string; restored: BackupModule[] }>;
  createLocalBackup(userId: number, module: BackupModule | 'all'): Promise<{ filename: string; contentType: 'application/json'; body: Buffer }>;
  restoreLocalBackup(userId: number, module: BackupModule | 'all', body: Buffer): Promise<{ restored: BackupModule[] }>;
}

export function createBackupCenterService(options: {
  repo: Pick<Repository, 'getConfig' | 'updateConfig'>;
  encryptionKey: string;
  sourceCommit?: string;
  adapters: Record<BackupModule, BackupModuleAdapter>;
  request: SafeRequester;
  now?: () => Date;
  allowPrivateHosts?: string[];
}): BackupCenterService {
  const now = options.now || (() => new Date());
  const sourceCommit = options.sourceCommit || 'unknown';

  async function storedConfig(): Promise<StoredWebDavConfig | null> {
    const config = await options.repo.getConfig();
    const value = config.settings?.[CONFIG_KEY];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.url !== 'string' || typeof record.username !== 'string' || typeof record.passwordEncrypted !== 'string') return null;
    return { url: record.url, username: record.username, passwordEncrypted: record.passwordEncrypted };
  }

  async function requiredConfig() {
    const stored = await storedConfig();
    if (!stored?.url || !stored.passwordEncrypted) throw httpError(400, 'WebDAV connection is not configured');
    return {
      ...stored,
      password: decryptSecret(stored.passwordEncrypted, options.encryptionKey),
    };
  }

  async function webDavRequest(
    config: StoredWebDavConfig & { password: string },
    path: string,
    method: string,
    body?: Buffer,
    contentType?: string,
  ) {
    const response = await options.request(webDavUrl(config.url, path), {
      method,
      body,
      headers: {
        authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
        ...(contentType ? { 'content-type': contentType } : {}),
      },
      maxBytes: method === 'GET' ? 256 * 1024 * 1024 : 1024 * 1024,
      timeoutMs: 60_000,
      maxRedirects: 0,
      allowPrivateHosts: options.allowPrivateHosts,
    });
    return response;
  }

  async function ensureCollection(config: StoredWebDavConfig & { password: string }, path: string) {
    const response = await webDavRequest(config, path, 'MKCOL');
    if (![200, 201, 204, 405].includes(response.statusCode)) {
      throw httpError(502, `WebDAV could not create ${path} (HTTP ${response.statusCode})`);
    }
  }

  async function ensureModuleCollections(config: StoredWebDavConfig & { password: string }, modules: readonly BackupModule[]) {
    await ensureCollection(config, '/nono/');
    await ensureCollection(config, '/nono/batches/');
    for (const module of modules) await ensureCollection(config, `/nono/${module}/`);
  }

  async function put(config: StoredWebDavConfig & { password: string }, path: string, body: Buffer, contentType: string) {
    const response = await webDavRequest(config, path, 'PUT', body, contentType);
    if (![200, 201, 204].includes(response.statusCode)) throw httpError(502, `WebDAV upload failed for ${path} (HTTP ${response.statusCode})`);
  }

  async function get(config: StoredWebDavConfig & { password: string }, path: string, notFound: 'empty' | 'error' = 'error') {
    const response = await webDavRequest(config, path, 'GET');
    if (response.statusCode === 404 && notFound === 'empty') return null;
    if (response.statusCode !== 200) throw httpError(response.statusCode === 404 ? 404 : 502, `WebDAV download failed for ${path} (HTTP ${response.statusCode})`);
    return response.body;
  }

  async function readIndex(config: StoredWebDavConfig & { password: string }) {
    const body = await get(config, INDEX_PATH, 'empty');
    if (!body) return [];
    const parsed = parseJson(body, 'WebDAV history index');
    if (!Array.isArray(parsed)) throw httpError(409, 'WebDAV history index is invalid');
    return parsed.map(parseManifest).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function writeIndex(config: StoredWebDavConfig & { password: string }, batches: BackupBatchManifest[]) {
    await put(config, INDEX_PATH, Buffer.from(JSON.stringify(batches.slice(0, 200), null, 2)), 'application/json');
  }

  async function loadManifest(config: StoredWebDavConfig & { password: string }, id: string) {
    assertBatchId(id);
    const body = await get(config, `/nono/batches/${id}.json`);
    const manifest = parseManifest(parseJson(body!, 'WebDAV batch manifest'));
    if (manifest.id !== id) throw httpError(409, 'WebDAV batch manifest identifier mismatch');
    return manifest;
  }

  async function cleanupUploads(config: StoredWebDavConfig & { password: string }, paths: readonly string[]) {
    for (const path of [...paths].reverse()) {
      try {
        await webDavRequest(config, path, 'DELETE');
      } catch {
        // Cleanup is best-effort; preserve the original backup error.
      }
    }
  }

  async function restoreBodies(userId: number, modules: BackupModule[], bodies: Map<BackupModule, Buffer>) {
    for (const module of modules) await options.adapters[module].validate(bodies.get(module)!);
    const safety = new Map<BackupModule, Buffer>();
    for (const module of modules) {
      const snapshot = await options.adapters[module].export(userId);
      await options.adapters[module].validate(snapshot);
      safety.set(module, snapshot);
    }

    const changed: BackupModule[] = [];
    try {
      for (const module of modules) {
        changed.push(module);
        await options.adapters[module].restore(userId, bodies.get(module)!);
      }
    } catch (restoreError) {
      const rollbackErrors: string[] = [];
      for (const module of [...changed].reverse()) {
        try {
          await options.adapters[module].restore(userId, safety.get(module)!);
        } catch (error) {
          rollbackErrors.push(`${module}: ${errorText(error)}`);
        }
      }
      if (rollbackErrors.length) throw httpError(500, `Restore failed (${errorText(restoreError)}); rollback failed (${rollbackErrors.join('; ')})`);
      throw restoreError;
    }
    return modules;
  }

  return {
    async getWebDavConfig() {
      const config = await storedConfig();
      return configView(config);
    },

    async saveWebDavConfig(input) {
      const current = await storedConfig();
      const url = normalizeWebDavUrl(input.url);
      const username = input.username.trim();
      const password = input.password?.trim() || '';
      const passwordEncrypted = password ? encryptSecret(password, options.encryptionKey) : current?.passwordEncrypted || '';
      if (!username) throw httpError(400, 'WebDAV username is required');
      if (!passwordEncrypted) throw httpError(400, 'WebDAV password is required');
      const appConfig = await options.repo.getConfig();
      await options.repo.updateConfig({
        settings: {
          ...appConfig.settings,
          [CONFIG_KEY]: { url, username, passwordEncrypted },
        },
      });
      return configView({ url, username, passwordEncrypted });
    },

    async testWebDavConnection() {
      const config = await requiredConfig();
      await ensureCollection(config, '/nono/');
      await ensureCollection(config, '/nono/batches/');
      return { ok: true, rootPath: '/nono/' };
    },

    async backupToWebDav(userId, requestedModules = BACKUP_MODULES) {
      const modules = normalizeModules(requestedModules);
      const config = await requiredConfig();
      await ensureModuleCollections(config, modules);
      const createdAt = now().toISOString();
      const id = uniqueBatchId(formatBatchId(new Date(createdAt)));
      const records: Partial<Record<BackupModule, BackupBatchModuleRecord>> = {};
      const uploadedPaths: string[] = [];

      try {
        for (const module of modules) {
          const adapter = options.adapters[module];
          const body = await adapter.export(userId);
          await adapter.validate(body);
          const filename = `${module}-${id}.${adapter.extension}`;
          const path = `/nono/${module}/${filename}`;
          uploadedPaths.push(path);
          await put(config, path, body, adapter.contentType);
          records[module] = {
            module,
            path,
            filename,
            contentType: adapter.contentType,
            size: body.length,
            sha256: sha256(body),
            status: 'verified',
          };
        }

        const manifest: BackupBatchManifest = {
          kind: BATCH_KIND,
          version: BATCH_VERSION,
          id,
          scope: modules.length === BACKUP_MODULES.length ? 'full' : 'module',
          createdAt,
          sourceCommit,
          modules: records,
        };
        const manifestPath = `/nono/batches/${id}.json`;
        uploadedPaths.push(manifestPath);
        await put(config, manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
        const index = await readIndex(config);
        await writeIndex(config, [manifest, ...index.filter((batch) => batch.id !== id)]);
        return manifest;
      } catch (error) {
        await cleanupUploads(config, uploadedPaths);
        throw error;
      }
    },

    async listWebDavBatches() {
      return readIndex(await requiredConfig());
    },

    async removeWebDavBatch(batchId) {
      const config = await requiredConfig();
      const manifest = await loadManifest(config, batchId);
      for (const record of Object.values(manifest.modules)) {
        if (!record) continue;
        const response = await webDavRequest(config, record.path, 'DELETE');
        if (![200, 204, 404].includes(response.statusCode)) throw httpError(502, `WebDAV delete failed for ${record.path}`);
      }
      const manifestResponse = await webDavRequest(config, `/nono/batches/${batchId}.json`, 'DELETE');
      if (![200, 204, 404].includes(manifestResponse.statusCode)) throw httpError(502, 'WebDAV batch manifest could not be deleted');
      await writeIndex(config, (await readIndex(config)).filter((batch) => batch.id !== batchId));
      return true;
    },

    async restoreWebDavBatch(userId, batchId, requestedModules) {
      const config = await requiredConfig();
      const manifest = await loadManifest(config, batchId);
      const available = BACKUP_MODULES.filter((module) => Boolean(manifest.modules[module]));
      const modules = normalizeModules(requestedModules?.length ? requestedModules : available);
      const bodies = new Map<BackupModule, Buffer>();

      for (const module of modules) {
        const record = manifest.modules[module];
        if (!record) throw httpError(400, `Batch does not contain ${module}`);
        const body = await get(config, record.path);
        if (!body || body.length !== record.size || sha256(body) !== record.sha256) throw httpError(409, `${module} backup checksum mismatch`);
        await options.adapters[module].validate(body);
        bodies.set(module, body);
      }

      await restoreBodies(userId, modules, bodies);
      return { batchId, restored: modules };
    },

    async createLocalBackup(userId, requestedModule) {
      const modules = requestedModule === 'all' ? [...BACKUP_MODULES] : normalizeModules([requestedModule]);
      const createdAt = now().toISOString();
      const id = formatBatchId(new Date(createdAt));
      const artifacts: Record<string, unknown> = {};
      for (const module of modules) {
        const adapter = options.adapters[module];
        const body = await adapter.export(userId);
        await adapter.validate(body);
        artifacts[module] = {
          module,
          encoding: 'base64',
          contentType: adapter.contentType,
          extension: adapter.extension,
          size: body.length,
          sha256: sha256(body),
          body: body.toString('base64'),
        };
      }
      const document = requestedModule === 'all'
        ? { kind: LOCAL_BUNDLE_KIND, version: 1, id, createdAt, sourceCommit, modules: artifacts }
        : { kind: LOCAL_MODULE_KIND, version: 1, id, createdAt, sourceCommit, module: requestedModule, artifact: artifacts[requestedModule] };
      return {
        filename: requestedModule === 'all' ? `nono-local-backup-${id}.json` : `${requestedModule}-local-backup-${id}.json`,
        contentType: 'application/json' as const,
        body: Buffer.from(JSON.stringify(document, null, 2)),
      };
    },

    async restoreLocalBackup(userId, requestedModule, body) {
      const parsed = parseJson(body, 'Local backup');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw httpError(400, 'Local backup is invalid');
      const document = parsed as Record<string, unknown>;
      const artifacts = new Map<BackupModule, Buffer>();

      if (requestedModule === 'all') {
        if (document.kind !== LOCAL_BUNDLE_KIND || document.version !== 1 || !document.modules || typeof document.modules !== 'object' || Array.isArray(document.modules)) {
          throw httpError(400, 'Selected restore type does not match the local backup bundle');
        }
        for (const module of BACKUP_MODULES) {
          const artifact = (document.modules as Record<string, unknown>)[module];
          if (artifact) artifacts.set(module, parseLocalArtifact(artifact, module));
        }
        if (artifacts.size !== BACKUP_MODULES.length) throw httpError(400, 'Local full-site backup must contain all backup modules');
      } else {
        if (document.kind !== LOCAL_MODULE_KIND || document.version !== 1 || document.module !== requestedModule) {
          throw httpError(400, 'Selected module does not match the local backup artifact');
        }
        artifacts.set(requestedModule, parseLocalArtifact(document.artifact, requestedModule));
      }

      const modules = BACKUP_MODULES.filter((module) => artifacts.has(module));
      if (!modules.length) throw httpError(400, 'Local backup does not contain any modules');
      await restoreBodies(userId, modules, artifacts);
      return { restored: modules };
    },
  };
}

function configView(config: StoredWebDavConfig | null): WebDavConfigView {
  return {
    url: config?.url || '',
    username: config?.username || '',
    passwordConfigured: Boolean(config?.passwordEncrypted),
    rootPath: '/nono/',
  };
}

function normalizeWebDavUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw httpError(400, 'WebDAV URL is invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw httpError(400, 'WebDAV URL is invalid');
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

function webDavUrl(baseValue: string, fixedPath: string) {
  const base = new URL(baseValue.endsWith('/') ? baseValue : `${baseValue}/`);
  const prefix = base.pathname.replace(/\/+$/, '');
  const suffix = fixedPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  base.pathname = `${prefix}/${suffix}${fixedPath.endsWith('/') ? '/' : ''}`;
  return base.toString();
}

function normalizeModules(input: readonly BackupModule[]) {
  const modules = [...new Set(input)];
  if (!modules.length || modules.some((module) => !BACKUP_MODULES.includes(module))) throw httpError(400, 'At least one valid backup module is required');
  return BACKUP_MODULES.filter((module) => modules.includes(module));
}

function parseManifest(value: unknown): BackupBatchManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(409, 'WebDAV batch manifest is invalid');
  const record = value as Partial<BackupBatchManifest>;
  if (record.kind !== BATCH_KIND || record.version !== BATCH_VERSION || !record.id || !BATCH_ID_PATTERN.test(record.id) || !record.createdAt || !record.modules) {
    throw httpError(409, 'WebDAV batch manifest is invalid');
  }
  const modules: Partial<Record<BackupModule, BackupBatchModuleRecord>> = {};
  for (const module of BACKUP_MODULES) {
    const item = record.modules[module];
    if (!item) continue;
    const filename = item.filename;
    const expectedFilenamePrefix = `${module}-${record.id}.`;
    const expectedPath = `/nono/${module}/${filename}`;
    if (item.module !== module || typeof filename !== 'string' || !filename.startsWith(expectedFilenamePrefix) || filename.includes('/') || filename.includes('\\') || item.path !== expectedPath || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw httpError(409, `WebDAV ${module} manifest entry is invalid`);
    }
    modules[module] = item;
  }
  return { ...record, modules } as BackupBatchManifest;
}

function parseJson(body: Buffer, label: string): unknown {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw httpError(409, `${label} is invalid`);
  }
}

function parseLocalArtifact(value: unknown, module: BackupModule) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, `${module} local backup artifact is invalid`);
  const artifact = value as Record<string, unknown>;
  if (artifact.module !== module || artifact.encoding !== 'base64' || typeof artifact.body !== 'string' || typeof artifact.sha256 !== 'string' || typeof artifact.size !== 'number') {
    throw httpError(400, `${module} local backup artifact is invalid`);
  }
  const body = Buffer.from(artifact.body, 'base64');
  if (body.length !== artifact.size || sha256(body) !== artifact.sha256) throw httpError(409, `${module} local backup checksum mismatch`);
  return body;
}

function assertBatchId(id: string) {
  if (!BATCH_ID_PATTERN.test(id)) throw httpError(400, 'Invalid backup batch identifier');
}

function formatBatchId(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256(body: Buffer) {
  return createHash('sha256').update(body).digest('hex');
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export function uniqueBatchId(base: string) {
  assertBatchId(base);
  return `${base}-${randomBytes(3).toString('hex')}`;
}
