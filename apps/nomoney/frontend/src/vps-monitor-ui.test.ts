import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney VPS monitor refresh', () => {
  it('refreshes live metrics every five seconds only while the page is visible', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    expect(source).toContain('const vpsMonitorRefreshIntervalMs = 5_000;');
    expect(source).toContain("document.visibilityState !== 'visible'");
    expect(source).toContain("document.addEventListener('visibilitychange', refreshWhenVisible)");
    expect(source).toContain('window.setInterval(refreshWhenVisible, vpsMonitorRefreshIntervalMs)');
    expect(source).toContain("copy('自动 5s', 'Auto 5s')");
  });
});
