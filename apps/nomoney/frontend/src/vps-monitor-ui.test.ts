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

  it('shows configured resource totals beside live VPS utilization', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    expect(source).toContain("total={formatVpsCapacity(item.cpu, 'cpu')}");
    expect(source).toContain("total={formatVpsCapacity(item.memory, 'memory')}");
    expect(source).toContain("total={formatVpsCapacity(item.storage, 'storage')}");
  });

  it('uses the VPS expiration date as the only renewal date input', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');
    const start = source.indexOf('function VpsFormSections');
    const end = source.indexOf('function DomainCommandPanel', start);
    const vpsForm = source.slice(start, end);

    expect(vpsForm).toContain("copy('到期日（续费）', 'Renewal date')");
    expect(vpsForm).not.toContain('form.startDate');
    expect(vpsForm).not.toContain('form.nextDueDate');
    expect(source).toContain('payload.startDate = null;');
    expect(source).toContain('payload.nextDueDate = null;');
    expect(source).toContain("result.expireDate = item.expireDate ?? item.nextDueDate ?? '';");
    expect(source.match(/item\.expireDate \?\? item\.nextDueDate/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('captures and filters the VPS role', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');
    const start = source.indexOf('function VpsFormSections');
    const end = source.indexOf('function DomainCommandPanel', start);
    const vpsForm = source.slice(start, end);

    expect(vpsForm).toContain('form.vpsType');
    expect(source).toContain("params.set('vpsType', vpsType)");
    expect(source).toContain('value={vpsType}');
    expect(source).toContain("{ value: 'website', labelZh: '建站机'");
    expect(source).toContain("{ value: 'route', labelZh: '线路机'");
    expect(source).toContain("{ value: 'residential', labelZh: '家宽'");
  });
});
