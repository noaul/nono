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

  it('keeps VPS cards compact and exposes only the useful quick actions', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');
    const start = source.indexOf('function VpsNodeCard');
    const end = source.indexOf('function VpsRenewalToast', start);
    const vpsCard = source.slice(start, end);

    expect(vpsCard).toContain("copy('复制 IP 地址', 'Copy IP address')");
    expect(vpsCard).toContain('copiedIp ? <Check');
    expect(vpsCard).toContain('shrink-0 whitespace-nowrap');
    expect(vpsCard).toContain('h-12');
    expect(vpsCard).not.toContain('{sshCommand');
    expect(vpsCard).not.toContain("copy('更新 ', 'Updated ')");
    expect(vpsCard).not.toContain("copy('运行 ', 'Uptime ')");
    expect(vpsCard).not.toContain("copy('安装探针', 'Install probe')");
    expect(vpsCard).not.toContain("copy('打开 SSH 链接', 'Open SSH link')");
  });
});
