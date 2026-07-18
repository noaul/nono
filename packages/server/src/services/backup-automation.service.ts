import type { BackupRecord, BackupService } from './backup.service.js';
import type { BackupAutomationRecord, BackupCadence, Repository } from './repository.js';

export interface BackupAutomationSettings {
  enabled: boolean;
  cadence: BackupCadence;
  hour: number;
  weekday: number;
  retentionDays: number;
  maxBackups: number;
}

export interface BackupAutomationSnapshot {
  settings: BackupAutomationSettings;
  status: {
    lastScheduledFor: string | null;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  };
}

export interface BackupAutomationService {
  get(): Promise<BackupAutomationSnapshot>;
  update(settings: BackupAutomationSettings): Promise<BackupAutomationSnapshot>;
  runDue(current?: Date): Promise<BackupAutomationRunResult>;
  runNow(current?: Date): Promise<BackupAutomationSuccess>;
}

export type BackupAutomationRunResult =
  | { ran: false; reason: 'disabled' | 'already-run' }
  | BackupAutomationSuccess;

export interface BackupAutomationSuccess {
  ran: true;
  backup: BackupRecord;
  removed: number;
}

export function createBackupAutomationService(options: {
  repo: Pick<Repository, 'getBackupAutomation' | 'updateBackupAutomation'>;
  backupService: BackupService;
  now?: () => Date;
  timeZone?: string;
}): BackupAutomationService {
  const now = options.now || (() => new Date());
  const timeZone = options.timeZone || process.env.TZ || 'Asia/Shanghai';
  let running = false;

  async function execute(record: BackupAutomationRecord, scheduledFor: string | null, current: Date) {
    if (running) throw httpError(409, 'A backup is already running');
    running = true;
    try {
      await options.repo.updateBackupAutomation({
        lastScheduledFor: scheduledFor,
        lastStartedAt: current,
        lastCompletedAt: null,
        lastError: null,
      });
      try {
        const backup = await options.backupService.create();
        const removed = await enforceRetention(options.backupService, backup, record, current);
        const completedAt = now();
        await options.repo.updateBackupAutomation({
          lastCompletedAt: completedAt,
          lastSuccessAt: completedAt,
          lastError: null,
        });
        return { ran: true as const, backup, removed };
      } catch (error) {
        const completedAt = now();
        await options.repo.updateBackupAutomation({
          lastCompletedAt: completedAt,
          lastFailureAt: completedAt,
          lastError: errorMessage(error),
        });
        throw error;
      }
    } finally {
      running = false;
    }
  }

  return {
    async get() {
      return snapshot(await options.repo.getBackupAutomation());
    },
    async update(settings) {
      return snapshot(await options.repo.updateBackupAutomation(settings));
    },
    async runDue(current = now()) {
      const record = await options.repo.getBackupAutomation();
      if (!record.enabled) return { ran: false, reason: 'disabled' };
      const scheduledFor = scheduleWindowKey(record, current, timeZone);
      if (record.lastScheduledFor === scheduledFor) return { ran: false, reason: 'already-run' };
      return execute(record, scheduledFor, current);
    },
    async runNow(current = now()) {
      const record = await options.repo.getBackupAutomation();
      const scheduledFor = record.enabled ? scheduleWindowKey(record, current, timeZone) : record.lastScheduledFor || null;
      return execute(record, scheduledFor, current);
    },
  };
}

async function enforceRetention(
  service: Pick<BackupService, 'list' | 'remove'>,
  created: BackupRecord,
  settings: Pick<BackupAutomationRecord, 'retentionDays' | 'maxBackups'>,
  current: Date,
) {
  const records = (await service.list()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const cutoff = current.getTime() - settings.retentionDays * 86_400_000;
  const removals = records.filter((record, index) => (
    record.id !== created.id
    && (index >= settings.maxBackups || new Date(record.createdAt).getTime() < cutoff)
  ));
  for (const record of removals) await service.remove(record.id);
  return removals.length;
}

export function scheduleWindowKey(settings: Pick<BackupAutomationSettings, 'cadence' | 'hour' | 'weekday'>, current: Date, timeZone: string) {
  const parts = localParts(current, timeZone);
  let daysBack = parts.hour >= settings.hour ? 0 : 1;
  if (settings.cadence === 'weekly') {
    daysBack = (parts.weekday - settings.weekday + 7) % 7;
    if (daysBack === 0 && parts.hour < settings.hour) daysBack = 7;
  }
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysBack));
  const date = `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
  return `${settings.cadence}:${date}@${pad(settings.hour)}`;
}

function localParts(current: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(formatter.formatToParts(current).map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, weekday };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim().slice(0, 500) || 'Backup failed';
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function snapshot(record: BackupAutomationRecord): BackupAutomationSnapshot {
  return {
    settings: {
      enabled: record.enabled,
      cadence: record.cadence,
      hour: record.hour,
      weekday: record.weekday,
      retentionDays: record.retentionDays,
      maxBackups: record.maxBackups,
    },
    status: {
      lastScheduledFor: record.lastScheduledFor || null,
      lastStartedAt: iso(record.lastStartedAt),
      lastCompletedAt: iso(record.lastCompletedAt),
      lastSuccessAt: iso(record.lastSuccessAt),
      lastFailureAt: iso(record.lastFailureAt),
      lastError: record.lastError || null,
    },
  };
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}
