import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney and Yumi product surfaces', () => {
  it('defines the approved navigation order for both products', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');
    expect(source).toContain("product === 'yumi'");
    expect(source).toContain("['/dashboard', '/expenses', '/vps', '/domains', '/trash', '/settings']");
    expect(source).toContain("['/dashboard', '/phones', '/subscriptions', '/accounts', '/trash', '/settings']");
  });

  it('uses a status-first Yumi overview with no cost components', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/YumiOverview.tsx'), 'utf8');
    expect(source).toContain('status-history-strip');
    expect(source).toContain('useLayoutActions');
    expect(source).toContain('yumi-status-grid');
    expect(source).toContain('domainStats');
    expect(source).not.toContain('<PageHeader');
    expect(source).toContain('overallStatus');
    expect(source).toContain('uptimePercent');
    expect(source).not.toContain('MoneyList');
    expect(source).not.toContain('predictedYearly');
    expect(source).not.toContain('actualYearly');
  });

  it('offers four status windows and defaults to the latest 24 hours', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/YumiOverview.tsx'), 'utf8');

    expect(source).toContain("useState<StatusWindow>('24h')");
    expect(source).toContain("['24h', '7d', '30d', '90d']");
    expect(source).toContain("/api/status/overview?window=${statusWindow}");
    expect(source).toContain('yumi-status-window-selector');
    expect(source).toContain("statusWindow === '24h'");
  });

  it('connects the tested refresh lifecycle and ignores requests after unmount', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/YumiOverview.tsx'), 'utf8');

    expect(source).toContain('startVisibleStatusRefresh');
    expect(source).toContain('mountedRef.current = false');
    expect(source).toContain('copyRef.current = copy');
    expect(source).toContain('const error = refreshError || loadError;');
  });

  it('moves the expense action into the shared top bar and shows summary before the ledger', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/Expenses.tsx'), 'utf8');
    expect(source).toContain('useLayoutActions');
    expect(source).toContain('expense-summary-grid');
    expect(source).toContain('meta?.summary');
    expect(source).not.toContain('<PageHeader');
    expect(source.indexOf('expense-summary-grid')).toBeLessThan(source.indexOf('<DataTable'));
  });

  it('scopes trash and expense asset options to the active product', () => {
    const trash = fs.readFileSync(path.resolve(process.cwd(), 'src/TrashPage.tsx'), 'utf8');
    const expenses = fs.readFileSync(path.resolve(process.cwd(), 'src/Expenses.tsx'), 'utf8');
    expect(trash).toContain("product === 'yumi'");
    expect(trash).toContain("['vps', 'domains']");
    expect(trash).toContain("['phones', 'subscriptions']");
    expect(expenses).toContain("['vps', 'domain']");
  });

  it('uses product-aware authentication and backup labels', () => {
    const auth = fs.readFileSync(path.resolve(process.cwd(), 'src/AuthPages.tsx'), 'utf8');
    const settings = fs.readFileSync(path.resolve(process.cwd(), 'src/SettingsPage.tsx'), 'utf8');
    expect(auth).toContain('productMeta.name');
    expect(settings).toContain('productBackupName');
  });

  it('brands the generated HTML for the active product', () => {
    const config = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(config).toContain('transformIndexHtml');
    expect(config).toContain("product === 'yumi' ? 'Yumi' : 'NoMoney'");
  });

  it('uses full-result asset summaries and cancels stale filter requests', () => {
    const assetPage = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');
    const api = fs.readFileSync(path.resolve(process.cwd(), 'src/api.ts'), 'utf8');

    expect(assetPage).toContain('meta?.assetSummary');
    expect(assetPage).toContain('new AbortController()');
    expect(assetPage).toContain('controller.abort()');
    expect(assetPage).toContain('value={stats.total}');
    expect(assetPage).toContain('`${stats.online}/${stats.total}`');
    expect(assetPage).toContain('stats.riskWithin30Days');
    expect(assetPage).toContain('<PhoneVisualDashboard items={items} stats={phoneStats}');
    expect(api).toContain('signal?: AbortSignal');
  });
});
