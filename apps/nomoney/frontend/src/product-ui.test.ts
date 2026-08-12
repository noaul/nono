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
    expect(source).toContain('overallStatus');
    expect(source).toContain('uptimePercent');
    expect(source).not.toContain('MoneyList');
    expect(source).not.toContain('predictedYearly');
    expect(source).not.toContain('actualYearly');
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
});
