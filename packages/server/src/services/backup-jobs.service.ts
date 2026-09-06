import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function httpError(statusCode: number, message: string) { return Object.assign(new Error(message), { statusCode }); }

// Wire contract: <creation epoch milliseconds>_<unique nonce>. Keep aligned with the browser client.
// Fixed independently of retention configuration so a restart/config change cannot revive old keys.
export const BACKUP_REQUEST_VALIDITY_MS = 24 * 60 * 60 * 1000;
// Accommodate ordinary device clock skew; expiration still uses the original timestamp.
export const BACKUP_REQUEST_FUTURE_SKEW_MS = 5 * 60 * 1000;
function requestTime(requestId: string): number {
  const match = /^(\d{1,16})_[A-Za-z0-9_-]{1,100}$/.exec(requestId);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : NaN;
}

/** One process owns the dataset. Nested adapter/legacy calls inherit the reservation. */
export class BackupOperationGate {
  private active = false;
  private context = new AsyncLocalStorage<boolean>();
  get busy() { return this.active; }
  async runExclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    if (this.active) throw httpError(409, 'A backup or restore operation is already in progress');
    this.active = true;
    try { return await this.context.run(true, work); }
    finally { this.active = false; }
  }
}

/** Bind methods to their original service; serialize the complete mutation, including retention. */
export function gateBackupService<T extends object>(service: T, gate: BackupOperationGate, methods: readonly (keyof T)[]): T {
  return new Proxy(service, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => methods.includes(key as keyof T)
        ? gate.runExclusive(() => value.apply(target, args))
        : value.apply(target, args);
    },
  });
}

export interface BackupJob {
  id: string;
  requestId: string;
  kind: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  createdAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
  downloadAvailable: boolean;
}
interface StoredJob extends BackupJob {
  userId: number;
  fingerprint: string;
  artifact?: { filename: string; contentType: string; size: number };
}
interface Submission { userId: number; requestId: string; kind: string; fingerprint: string }
export interface BackupJobService {
  submit(input: Submission, work: () => Promise<unknown>): BackupJob;
  get(id: string, userId: number): BackupJob;
  list(userId: number): BackupJob[];
  download(id: string, userId: number): { path: string; filename: string; contentType: string; size: number };
}

/** Persist only bounded metadata and expiring disk artifacts, never backup Buffers in job records. */
export async function createBackupJobService(options: {
  directory: string;
  gate?: BackupOperationGate;
  maxRecords?: number;
  maxArtifactBytes?: number;
  retentionMs?: number;
  now?: () => number;
}): Promise<BackupJobService> {
  const gate = options.gate || new BackupOperationGate();
  const records = new Map<string, StoredJob>();
  const now = options.now || Date.now;
  const maxRecords = Math.max(1, options.maxRecords ?? 100);
  const maxBytes = Math.max(0, options.maxArtifactBytes ?? 512 * 1024 * 1024);
  const retention = options.retentionMs ?? 24 * 60 * 60 * 1000;
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const metadataPath = (id: string) => join(options.directory, `${id}.json`);
  const artifactPath = (id: string) => join(options.directory, `${id}.artifact`);
  function durableWrite(path: string, body: string | Buffer) {
    const temporary = `${path}.tmp`;
    const fd = openSync(temporary, 'w', 0o600);
    try { writeFileSync(fd, body); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, path);
    const parent = openSync(options.directory, 'r');
    try { fsyncSync(parent); } finally { closeSync(parent); }
  }
  function persist(job: StoredJob) { durableWrite(metadataPath(job.id), JSON.stringify(job)); }
  function removeFile(path: string) { if (existsSync(path)) unlinkSync(path); }
  function publicJob(job: StoredJob): BackupJob {
    const { userId: _userId, fingerprint: _fingerprint, artifact: _artifact, ...view } = job;
    return structuredClone(view);
  }
  function terminal(job: StoredJob) { return !['queued', 'running'].includes(job.status); }
  function prune() {
    const oldest = [...records.values()].filter(terminal).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const job of oldest) {
      // Metadata also owns deduplication: never evict a still-valid key, even under capacity pressure.
      if (now() - requestTime(job.requestId) < BACKUP_REQUEST_VALIDITY_MS || now() - Date.parse(job.finishedAt || job.createdAt) <= retention) continue;
      removeFile(artifactPath(job.id)); removeFile(metadataPath(job.id)); records.delete(job.id);
    }
  }
  function owned(id: string, userId: number) {
    prune();
    const job = records.get(id);
    if (!job || job.userId !== userId) throw httpError(404, 'Backup job not found or expired');
    return job;
  }
  for (const name of readdirSync(options.directory)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    // Fail startup closed on corrupt durable state; never silently forget a potentially destructive job.
    const job = JSON.parse(readFileSync(join(options.directory, name), 'utf8')) as StoredJob;
    if (`${job.id}.json` !== name || !Number.isSafeInteger(job.userId) || !job.requestId) throw new Error('Invalid backup job metadata');
    if (!terminal(job)) {
      job.status = 'interrupted';
      job.error = 'Process interrupted. Restore may be partially applied; inspect safety snapshots before any manual retry.';
      job.finishedAt = new Date(now()).toISOString();
      persist(job);
    }
    records.set(job.id, job);
  }
  prune();
  // A crash between artifact write and metadata write may leave an orphan. No recovery snapshots live here.
  for (const name of readdirSync(options.directory)) {
    if (/^[a-f0-9-]{36}\.(?:artifact|json\.tmp|artifact\.tmp)$/.test(name)) {
      const id = name.slice(0, 36);
      if (name.endsWith('.tmp') || !records.get(id)?.artifact) removeFile(join(options.directory, name));
    }
  }
  return {
    submit(input, work) {
      const issuedAt = requestTime(input.requestId);
      if (!Number.isFinite(issuedAt) || issuedAt - now() > BACKUP_REQUEST_FUTURE_SKEW_MS) throw httpError(400, 'A valid timestamped idempotency request identifier is required');
      if (now() - issuedAt >= BACKUP_REQUEST_VALIDITY_MS) throw httpError(410, 'Request identifier expired; outcome unknown. Check job history before any manual retry.');
      prune();
      const existing = [...records.values()].find(job => job.userId === input.userId && job.requestId === input.requestId);
      if (existing) {
        if (existing.kind !== input.kind || existing.fingerprint !== input.fingerprint) throw httpError(409, 'Request identifier was already used with different input');
        return publicJob(existing);
      }
      if (gate.busy) throw httpError(409, 'A backup or restore operation is already in progress');
      if (records.size >= maxRecords) throw httpError(429, 'Backup job capacity reached; check job history and wait for retry protection to expire');
      const job: StoredJob = { ...input, id: randomUUID(), status: 'queued', createdAt: new Date(now()).toISOString(), downloadAvailable: false };
      persist(job);
      records.set(job.id, job);
      // runExclusive reserves synchronously; the operation itself starts after the 202 response can be sent.
      void gate.runExclusive(async () => {
        await new Promise<void>(resolve => setImmediate(resolve));
        try {
          job.status = 'running'; persist(job);
          const result = await work();
          if (result && typeof result === 'object' && 'body' in result && Buffer.isBuffer(result.body)) {
            const artifact = result as { body: Buffer; filename: string; contentType: string };
            if (artifact.body.length > maxBytes) throw new Error('Backup exceeds local artifact storage limit; use WebDAV');
            let retained = [...records.values()].reduce((total, item) => total + (item.artifact?.size || 0), 0);
            for (const old of records.values()) {
              if (retained + artifact.body.length <= maxBytes) break;
              if (!old.artifact || !terminal(old)) continue;
              retained -= old.artifact.size; removeFile(artifactPath(old.id));
              delete old.artifact; old.downloadAvailable = false; persist(old);
            }
            durableWrite(artifactPath(job.id), artifact.body);
            job.artifact = { filename: artifact.filename, contentType: artifact.contentType, size: artifact.body.length };
            job.downloadAvailable = true;
          } else {
            if (JSON.stringify(result ?? null).length > 64 * 1024) throw new Error('Backup job result exceeds metadata limit');
            job.result = result;
          }
          job.status = 'completed';
        } catch (error) {
          job.status = 'failed';
          job.error = (error instanceof Error ? error.message : String(error)).slice(0, 2048);
        }
        job.finishedAt = new Date(now()).toISOString();
        persist(job);
      }).catch(error => {
        job.status = 'failed'; job.error = `Cannot persist job outcome: ${String(error).slice(0, 1024)}`;
        // The last durable running record will become interrupted on restart, never successful.
      });
      return publicJob(job);
    },
    get(id, userId) { return publicJob(owned(id, userId)); },
    list(userId) { prune(); return [...records.values()].filter(job => job.userId === userId).reverse().map(publicJob); },
    download(id, userId) {
      const job = owned(id, userId);
      if (job.status !== 'completed') throw httpError(409, 'Backup job has not completed');
      if (!job.artifact || !job.downloadAvailable) throw httpError(410, 'Backup download expired or unavailable');
      const path = artifactPath(job.id);
      if (!existsSync(path) || statSync(path).size !== job.artifact.size) throw httpError(410, 'Backup download unavailable');
      return { path, ...job.artifact };
    },
  };
}
