import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requiredEnv } from '../src/utils/required-env.js';

describe('explicit initialization credentials', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('requires seed and migration passwords to be supplied explicitly', async () => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', '');
    expect(() => requiredEnv('SEED_ADMIN_PASSWORD')).toThrow('SEED_ADMIN_PASSWORD is required');

    vi.stubEnv('MIGRATED_ADMIN_PASSWORD', 'Migrated password from operator');
    expect(requiredEnv('MIGRATED_ADMIN_PASSWORD')).toBe('Migrated password from operator');
  });

  it('does not retain a fixed password fallback or print migration passwords', () => {
    const seed = fs.readFileSync(path.resolve('prisma/seed.ts'), 'utf8');
    const migration = fs.readFileSync(path.resolve('src/scripts/migrate-from-json.ts'), 'utf8');

    expect(seed).not.toContain('Password2026!');
    expect(migration).not.toContain('Password2026!');
    expect(migration).not.toContain('Temporary password:');
    expect(seed).toMatch(/initializedAt:\s*new Date\(\)/);
    expect(migration).toMatch(/updateConfig\(\{ initializedAt:\s*new Date\(\) \}\)/);
    expect(seed).toMatch(/admin\.role !== 'admin' \|\| !admin\.passwordHash/);
    expect(migration).toMatch(/listUsers\(\).*role === 'admin'.*passwordHash/s);
  });
});
