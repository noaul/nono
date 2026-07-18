import { describe, expect, it } from 'vitest';
import { createAuditLogService, sanitizeAuditDetails } from '../src/services/audit.service.js';
import { MemoryRepository } from '../src/services/repository.js';

describe('audit log service', () => {
  it('removes sensitive values and bounds highly branched details', () => {
    const leaf = { passwordHash: 'secret-hash', apiKey: 'secret-key', content: 'x'.repeat(700) };
    const details = Array.from({ length: 20 }, () => (
      Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => leaf))
    ));

    const serialized = JSON.stringify(sanitizeAuditDetails({ details, token: 'secret-token' }));

    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('secret-token');
    expect(serialized.length).toBeLessThan(20_000);
  });

  it('prunes records older than the configured retention window', async () => {
    const repo = new MemoryRepository(false);
    const now = new Date('2026-07-18T12:00:00.000Z');
    repo.auditLogs.push({
      id: 1,
      actorUserId: null,
      actorUsername: 'system',
      actorRole: 'system',
      action: 'update',
      resourceType: 'system',
      resourceId: null,
      resourceLabel: 'old',
      result: 'success',
      statusCode: 200,
      ipAddress: null,
      userAgent: null,
      details: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await repo.updateAuditConfig({ retentionDays: 30 });
    const service = createAuditLogService(repo, () => now);

    await service.record({
      actorUserId: null,
      actorUsername: 'system',
      actorRole: 'system',
      action: 'update',
      resourceType: 'system',
      resourceId: null,
      resourceLabel: 'current',
      result: 'success',
      statusCode: 200,
      ipAddress: null,
      userAgent: null,
      details: {},
    });

    expect(repo.auditLogs.map((entry) => entry.resourceLabel)).toEqual(['current']);
  });
});
