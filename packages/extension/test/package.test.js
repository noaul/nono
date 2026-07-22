import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const archive = path.join(root, 'artifacts', `nono-quick-bookmark-chrome-v${manifest.version}.zip`);

describe('extension release package', () => {
  it('keeps package and manifest versions aligned', () => {
    expect(manifest.version).toBe(packageJson.version);
  });

  it('builds a Chrome Web Store ZIP archive', async () => {
    await rm(path.join(root, 'artifacts'), { recursive: true, force: true });
    const result = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const content = await readFile(archive);
    expect(content.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(content.length).toBeGreaterThan(10_000);
  });

  it('produces the same archive bytes on repeated builds', async () => {
    const first = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });
    expect(first.status, first.stderr || first.stdout).toBe(0);
    const firstContent = await readFile(archive);

    const second = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });
    expect(second.status, second.stderr || second.stdout).toBe(0);
    expect(await readFile(archive)).toEqual(firstContent);
  });
});
