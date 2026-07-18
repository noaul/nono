import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupAutomationService } from '../src/services/backup-automation.service.js';
import { MemoryRepository } from '../src/services/repository.js';

function backup(id: string, createdAt: string) {
  return {
    id,
    filename: `nono-backup-${id}.tar.gz`,
    createdAt,
    sourceCommit: 'abcdef123456',
    size: 100,
    sha256: 'a'.repeat(64),
    status: 'verified' as const,
    components: ['postgres', 'nodesk', 'nomoney'] as const,
    componentRecords: {} as any,
  };
}

describe('backup automation service', () => {
  let repo: MemoryRepository;
  let records: ReturnType<typeof backup>[];
  let backupService: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  const now = new Date('2026-07-18T04:30:00.000+08:00');

  beforeEach(() => {
    repo = new MemoryRepository(false);
    records = [
      backup('20260717T200000Z', '2026-07-17T20:00:00.000Z'),
      backup('20260716T200000Z', '2026-07-16T20:00:00.000Z'),
      backup('20260715T200000Z', '2026-07-15T20:00:00.000Z'),
      backup('20260601T200000Z', '2026-06-01T20:00:00.000Z'),
    ];
    backupService = {
      list: vi.fn(async () => [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))),
      create: vi.fn(async () => {
        const created = backup('20260717T203000Z', now.toISOString());
        records.push(created);
        return created;
      }),
      remove: vi.fn(async (id: string) => {
        records = records.filter((item) => item.id !== id);
        return true;
      }),
    };
  });

  function service() {
    return createBackupAutomationService({
      repo,
      backupService: backupService as any,
      now: () => now,
      timeZone: 'Asia/Shanghai',
    });
  }

  it('runs one daily backup per schedule window and enforces both retention limits', async () => {
    await repo.updateBackupAutomation({
      enabled: true,
      cadence: 'daily',
      hour: 3,
      retentionDays: 30,
      maxBackups: 3,
    });
    const automation = service();

    const first = await automation.runDue();
    const second = await automation.runDue();

    expect(first).toMatchObject({ ran: true, removed: 2 });
    expect(second).toEqual({ ran: false, reason: 'already-run' });
    expect(backupService.create).toHaveBeenCalledOnce();
    expect(backupService.remove.mock.calls.flat()).toEqual(expect.arrayContaining(['20260715T200000Z', '20260601T200000Z']));
    expect((await automation.get()).status).toMatchObject({
      lastScheduledFor: 'daily:2026-07-18@03',
      lastSuccessAt: now.toISOString(),
      lastFailureAt: null,
      lastError: null,
    });
  });

  it('uses the latest weekly window and skips disabled policies', async () => {
    const automation = service();
    await expect(automation.runDue()).resolves.toEqual({ ran: false, reason: 'disabled' });

    await repo.updateBackupAutomation({
      enabled: true,
      cadence: 'weekly',
      weekday: 1,
      hour: 4,
      lastScheduledFor: 'weekly:2026-07-13@04',
    });
    await expect(automation.runDue()).resolves.toEqual({ ran: false, reason: 'already-run' });
    expect(backupService.create).not.toHaveBeenCalled();
  });

  it('records a failed scheduled run without retrying the same window every minute', async () => {
    await repo.updateBackupAutomation({ enabled: true, cadence: 'daily', hour: 3 });
    backupService.create.mockRejectedValueOnce(new Error('pg_dump failed\nconnection unavailable'));
    const automation = service();

    await expect(automation.runDue()).rejects.toThrow('pg_dump failed');
    const snapshot = await automation.get();
    expect(snapshot.status).toMatchObject({
      lastScheduledFor: 'daily:2026-07-18@03',
      lastFailureAt: now.toISOString(),
      lastSuccessAt: null,
      lastError: 'pg_dump failed connection unavailable',
    });
    await expect(automation.runDue()).resolves.toEqual({ ran: false, reason: 'already-run' });
  });

  it('releases its run lock when claiming the schedule window fails', async () => {
    await repo.updateBackupAutomation({ enabled: true, cadence: 'daily', hour: 3 });
    const update = vi.spyOn(repo, 'updateBackupAutomation');
    update.mockRejectedValueOnce(new Error('database unavailable'));
    const automation = service();

    await expect(automation.runDue()).rejects.toThrow('database unavailable');
    await expect(automation.runDue()).resolves.toMatchObject({ ran: true });
    expect(backupService.create).toHaveBeenCalledOnce();
  });
});
