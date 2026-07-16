import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney base path', () => {
  it('normalizes the browser mount and prefixes application URLs', async () => {
    const modulePath = path.resolve(process.cwd(), 'src/base-path.ts');
    expect(fs.existsSync(modulePath)).toBe(true);

    const { normalizeBasePath, withBasePath } = await import('./base-path');
    expect(normalizeBasePath('/nomoney/')).toBe('/nomoney');
    expect(normalizeBasePath('/')).toBe('');
    expect(withBasePath('/api/auth/me', '/nomoney/')).toBe('/nomoney/api/auth/me');
    expect(withBasePath('dashboard', '/nomoney')).toBe('/nomoney/dashboard');
  });
});
