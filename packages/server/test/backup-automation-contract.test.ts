import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backup automation application contract', () => {
  it('registers the automatic backup scheduler with the Fastify lifecycle', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/app.ts'), 'utf8');
    expect(app).toContain("import { registerBackupAutomationScheduler } from './services/backup-automation.scheduler.js';");
    expect(app).toContain('registerBackupAutomationScheduler(app, services);');
  });

  it('persists the global policy and execution state in Prisma', () => {
    const schema = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    expect(schema).toMatch(/model BackupAutomation \{[\s\S]*?enabled\s+Boolean[\s\S]*?lastSuccessAt\s+DateTime\?[\s\S]*?lastError\s+String\?/);
  });
});
