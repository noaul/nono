import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// NoStar is served by NoNo at /nostar/; the upstream desktop app's
// "check GitHub for a new release" flow and its Electron-only bridges
// must not ship with it.
const srcDir = path.resolve(process.cwd(), 'src');

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const offendersFor = (pattern: RegExp) =>
  sourceFiles(srcDir)
    .filter((file) => pattern.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(srcDir, file));

describe('web-only NoStar build', () => {
  it('never fetches the upstream version manifest', () => {
    expect(offendersFor(/version-info\.xml|useAutoUpdateCheck|UpdateNotificationBanner|UpdateChecker|updateService/)).toEqual([]);
  });
});
