import type {
  AuditConfigRecord,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRecord,
  Repository,
} from './repository.js';

export interface AuditLogService {
  record(input: Omit<AuditLogRecord, 'id' | 'createdAt' | 'details'> & { details?: unknown }): Promise<AuditLogRecord>;
  list(query: AuditLogQuery): Promise<AuditLogPage>;
  getSettings(): Promise<AuditConfigRecord>;
  updateSettings(input: { retentionDays: number }): Promise<AuditConfigRecord & { removed: number }>;
  prune(): Promise<number>;
}

const SENSITIVE_KEY = /(authorization|cookie|credential|password|passcode|secret|token|api.?key|private.?key|encryption.?key|hash)/i;
const MAX_DETAIL_CHARACTERS = 12_000;
const MAX_DETAIL_NODES = 300;

export function createAuditLogService(repo: Repository, now = () => new Date()): AuditLogService {
  let lastPrunedAt = 0;

  async function prune() {
    const settings = await repo.getAuditConfig();
    const cutoff = new Date(now().getTime() - settings.retentionDays * 24 * 60 * 60 * 1000);
    lastPrunedAt = now().getTime();
    return repo.deleteAuditLogsBefore(cutoff);
  }

  return {
    async record(input) {
      const details = sanitizeAuditDetails(input.details);
      const record = await repo.createAuditLog({ ...input, details });
      if (now().getTime() - lastPrunedAt >= 24 * 60 * 60 * 1000) await prune();
      return record;
    },
    list(query) {
      return repo.listAuditLogs(query);
    },
    getSettings() {
      return repo.getAuditConfig();
    },
    async updateSettings(input) {
      const settings = await repo.updateAuditConfig({ retentionDays: input.retentionDays });
      const removed = await prune();
      return { ...settings, removed };
    },
    prune,
  };
}

export function sanitizeAuditDetails(value: unknown): Record<string, unknown> {
  const budget = { remaining: MAX_DETAIL_CHARACTERS, nodes: MAX_DETAIL_NODES };
  const sanitized = sanitizeValue(value ?? {}, 0, budget);
  return isPlainObject(sanitized) ? sanitized : { value: sanitized };
}

function sanitizeValue(value: unknown, depth: number, budget: { remaining: number; nodes: number }): unknown {
  if (budget.remaining <= 0 || budget.nodes <= 0) return '[omitted]';
  budget.nodes -= 1;
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    budget.remaining -= 8;
    return value ?? null;
  }
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const sanitized = value.length > 500 ? `[omitted: ${value.length} characters]` : redactUrlSecrets(value);
    budget.remaining -= sanitized.length;
    return sanitized;
  }
  if (depth >= 5) return '[max depth]';
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1, budget));
  }
  if (!isPlainObject(value)) return String(value);

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 40)) {
    if (SENSITIVE_KEY.test(key)) continue;
    budget.remaining -= key.length;
    output[key] = sanitizeValue(entry, depth + 1, budget);
    if (budget.remaining <= 0) break;
  }
  return output;
}

function redactUrlSecrets(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
