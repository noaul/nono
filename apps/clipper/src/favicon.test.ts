import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Clipper browser icon', () => {
  it('declares and ships a favicon at the mounted application path', () => {
    const root = path.resolve(process.cwd());
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/clipper/favicon.svg"');
    expect(fs.existsSync(path.join(root, 'public/favicon.svg'))).toBe(true);
  });
});
