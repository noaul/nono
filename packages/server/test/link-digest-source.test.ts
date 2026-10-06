import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/services/repository.js';
import { listBrokenLinks } from '../src/services/link-health.service.js';

describe('broken links for the weekly digest', () => {
  it('lists failed, still-monitored links newest check first with their folder', async () => {
    const repo = new MemoryRepository(false);
    const user = await repo.createUser({ username: 'u', email: 'u@x', displayName: 'U', passwordHash: 'x', role: 'admin' });
    const folder = await repo.createFolder({ userId: user.id, name: 'Reading', sortOrder: 0 });
    const make = (name: string, extra: Record<string, unknown>) => repo.createLink({ folderId: folder.id, name, url: `https://${name}.example/`, sortOrder: 0, ...extra });
    await make('ok', { healthStatus: 'ok', healthCheckedAt: new Date('2026-10-01') });
    await make('older', { healthStatus: 'broken', healthStatusCode: 404, healthCheckedAt: new Date('2026-10-01') });
    await make('newer', { healthStatus: 'timeout', healthCheckedAt: new Date('2026-10-03') });
    await make('muted', { healthStatus: 'broken', healthCheckEnabled: false, healthCheckedAt: new Date('2026-10-03') });

    expect(await listBrokenLinks(repo, user.id)).toEqual([
      { name: 'newer', url: 'https://newer.example/', status: '检测超时', statusCode: null, folderName: 'Reading' },
      { name: 'older', url: 'https://older.example/', status: '访问异常', statusCode: 404, folderName: 'Reading' },
    ]);
  });
});
