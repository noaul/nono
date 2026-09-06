import { describe, expect, it } from 'vitest';
import path from 'node:path';

describe('package output isolation', () => {
  it('honors an explicit artifact directory and rejects unknown arguments', async () => {
    const { packageOutputDirectory } = await import('../scripts/package-output.mjs');
    expect(packageOutputDirectory(['--output-dir', '/tmp/nono-package-test'], '/repo')).toBe('/tmp/nono-package-test');
    expect(packageOutputDirectory([], '/repo')).toBe(path.join('/repo', 'artifacts'));
    expect(() => packageOutputDirectory(['--output-dir'], '/repo')).toThrow();
    expect(() => packageOutputDirectory(['--typo'], '/repo')).toThrow();
  });
});
