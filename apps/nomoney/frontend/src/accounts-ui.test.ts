import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney account management UI', () => {
  it('registers an authenticated accounts route and navigation entry', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');

    expect(app).toContain("const AccountPage = lazy(() => import('./AccountPage')");
    expect(app).toContain('<Route path="/accounts" element={<AccountPage />} />');
    expect(layout).toContain("to: '/accounts'");
    expect(layout).toContain("labelZh: '账号'");
  });

  it('provides real app and country assets with phone and type filters', () => {
    const pagePath = path.resolve(process.cwd(), 'src/AccountPage.tsx');
    const catalogPath = path.resolve(process.cwd(), 'src/accountCatalog.tsx');
    expect(fs.existsSync(pagePath)).toBe(true);
    expect(fs.existsSync(catalogPath)).toBe(true);

    const page = fs.readFileSync(pagePath, 'utf8');
    const catalog = fs.readFileSync(catalogPath, 'utf8');
    expect(page).toContain("params.set('phone', phoneFilter.trim())");
    expect(page).toContain("params.set('accountType', accountTypeFilter)");
    expect(page).toContain('<AccountAppIcon');
    expect(page).toContain('<CountryFlag');
    expect(page).toContain("api.post<{ item: CommunicationAccount }>('/api/accounts'");
    expect(page).toContain("api.put<{ item: CommunicationAccount }>(`/api/accounts/${editing.id}`");
    expect(page).toContain("api.delete(`/api/accounts/${item.id}`)");
    expect(catalog).toContain("from 'simple-icons'");
    expect(catalog).toContain("from 'libphonenumber-js'");
    expect(catalog).toContain('fi fi-');
  });

  it('exposes physical SIM and eSIM choices for foreign phone cards', () => {
    const assetPage = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');
    const config = fs.readFileSync(path.resolve(process.cwd(), 'src/assetConfig.ts'), 'utf8');

    expect(config).toContain("{ key: 'isEsim'");
    expect(assetPage).toContain("updateForm('isEsim', option.value)");
    expect(assetPage).toContain("copy('实体 SIM', 'Physical SIM')");
    expect(assetPage).toContain("copy('eSIM', 'eSIM')");
  });
});
