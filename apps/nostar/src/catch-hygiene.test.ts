import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// An empty catch is only acceptable when it says why ignoring the error is safe.
const srcDir = path.resolve(process.cwd(), 'src');

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

describe('catch hygiene', () => {
  it('has no silent catch without a reason', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/catch\s*(\([^)]*\))?\s*\{(\s*)\}/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(srcDir, file)}:${line}`);
      }
      for (const match of text.matchAll(/catch\s*(\([^)]*\))?\s*\{\s*(\/\*\s*(ignore|ignored)?\s*\*\/|\/\/\s*(ignore|ignored)?\s*\n)\s*\}/gi)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(srcDir, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
