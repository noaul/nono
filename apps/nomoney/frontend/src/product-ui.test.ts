import { readAssetPageSource } from './test-source';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('NoMoney product surface', () => {
  it('defines the approved navigation order, with domains back in NoMoney', () => {
    const source = read('src/Layout.tsx');
    expect(source).toContain("['/dashboard', '/subscriptions', '/phones', '/expenses', '/domains', '/accounts', '/trash', '/settings']");
    expect(source).not.toContain("'/vps'");
    expect(source).not.toMatch(/yumi/i);
  });

  it('has no Yumi product mode, VPS pages or Status overview left', () => {
    for (const file of ['src/product.ts', 'src/YumiOverview.tsx', 'src/asset-page/vps.tsx', 'src/vps-capacity.ts', 'src/yumi-status-display.ts', 'src/yumi-status-refresh.ts']) {
      expect(fs.existsSync(path.resolve(process.cwd(), file)), file).toBe(false);
    }
    expect(read('src/assetConfig.ts')).not.toContain("endpoint: 'vps'");
    expect(read('package.json')).not.toContain('build:yumi');
    expect(read('vite.config.ts')).not.toMatch(/yumi/i);
  });

  it('moves the expense action into the shared top bar and shows summary before the ledger', () => {
    const source = read('src/Expenses.tsx');
    expect(source).toContain('useLayoutActions');
    expect(source).toContain('expense-summary-grid');
    expect(source).toContain('meta?.summary');
    expect(source).not.toContain('<PageHeader');
    expect(source.indexOf('expense-summary-grid')).toBeLessThan(source.indexOf('<DataTable'));
  });

  it('lists every NoMoney asset type in the trash and expense forms', () => {
    const trash = read('src/TrashPage.tsx');
    const expenses = read('src/Expenses.tsx');
    expect(trash).toContain('const productAssetConfigs = assetPageConfigs;');
    expect(trash).toContain("api.get<ListResponse<CommunicationAccount>>('/api/accounts?trashed=true')");
    expect(expenses).toContain("['phone', 'domain', 'subscription']");
  });

  it('signs in through NoNo instead of a product login page', () => {
    const app = read('src/App.tsx');
    const settings = read('src/SettingsPage.tsx');
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/AuthPages.tsx'))).toBe(false);
    expect(app).toContain('NoMoney 暂时无法验证登录');
    expect(app).toContain('window.location.replace(nonoLoginUrl())');
    expect(app).not.toContain('/api/auth/setup-status');
    expect(settings).toContain('productBackupName');
    expect(settings).toContain('/admin/account');
    expect(settings).not.toContain('/api/auth/password');
  });

  it('uses full-result asset summaries and cancels stale filter requests', () => {
    const assetPage = readAssetPageSource();
    const api = read('src/api.ts');

    expect(assetPage).toContain('meta?.assetSummary');
    expect(assetPage).toContain('new AbortController()');
    expect(assetPage).toContain('controller.abort()');
    expect(assetPage).toContain('<PhoneVisualDashboard items={items} stats={phoneStats}');
    expect(api).toContain('signal?: AbortSignal');
  });
});
