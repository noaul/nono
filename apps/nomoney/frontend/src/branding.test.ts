import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney branding', () => {
  it('uses NoMoney across visible application chrome', () => {
    const files = ['../index.html', 'App.tsx', 'AuthPages.tsx', 'Layout.tsx'];
    const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), 'src', file), 'utf8')).join('\n');

    expect(source).toContain('NoMoney');
    expect(source).not.toContain('Moneypulse');
  });
});
