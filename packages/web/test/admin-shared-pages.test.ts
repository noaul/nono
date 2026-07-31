import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readView = (name: string) => fs.readFileSync(path.resolve(process.cwd(), `src/views/admin/${name}.vue`), 'utf8');
const readAdminCss = () => fs.readFileSync(path.resolve(process.cwd(), 'src/styles/admin.css'), 'utf8');

describe('shared admin page structure', () => {
  it.each([
    'AdminDashboard',
    'SiteConfigView',
    'LlmView',
    'AccountView',
    'TokensView',
    'UsersView',
  ])('%s uses the shared page header', (name) => {
    const source = readView(name);

    expect(source).toContain("@/components/admin/AdminPageHeader.vue");
    expect(source).toContain('<AdminPageHeader');
  });

  it.each(['SiteConfigView', 'LlmView', 'AccountView', 'UsersView'])('%s uses accessible shared feedback banners', (name) => {
    const source = readView(name);

    expect(source).toContain("@/components/admin/AdminStateBanner.vue");
    expect(source).toContain('<AdminStateBanner');
    expect(source).not.toContain('class="notice"');
    expect(source).not.toContain('class="error"');
  });

  it.each(['LlmView', 'AccountView', 'TokensView', 'UsersView'])('%s no longer uses legacy panel form wrappers', (name) => {
    const source = readView(name);

    expect(source).not.toContain('class="panel grid"');
    expect(source).toContain('admin-section');
  });

  it('defines shared page, section, and responsive settings geometry', () => {
    const css = readAdminCss();

    expect(css).toContain('.admin-page-stack');
    expect(css).toContain('.admin-section');
    expect(css).toContain('.admin-section-head');
    expect(css).toContain('.admin-settings-grid');
    // The settings grid collapses at the contract's md boundary rather than a bespoke 900px.
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.admin-settings-grid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it('keeps the sidebar a fixed vertical column at every desktop width', () => {
    const css = readAdminCss();

    // One rule now, not a set of width-banded corrections: the sidebar is a fixed column from
    // the md breakpoint upward and only becomes a drawer below it.
    expect(css).toMatch(/\.workbench-sidebar \{[\s\S]*?flex-direction:\s*column/);
    expect(css).toMatch(/\.workbench-sidebar \{[\s\S]*?position:\s*fixed/);
    expect(css).toMatch(/\.workbench-sidebar \{[\s\S]*?width:\s*var\(--ui-sidebar-w\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.workbench-sidebar \{[\s\S]*?transform:\s*translateX\(-100%\)/);
  });

  it.each(['FoldersView', 'LinksView', 'NotabsView'])('%s uses the same management page hierarchy', (name) => {
    const source = readView(name);

    expect(source).toContain("@/components/admin/AdminPageHeader.vue");
    expect(source).toContain('<AdminPageHeader');
    expect(source).toContain('admin-page-stack');
    expect(source).not.toContain('class="admin-card"');
  });

  it.each(['FoldersView', 'LinksView'])('%s uses shared success and error banners', (name) => {
    const source = readView(name);

    expect(source).toContain("@/components/admin/AdminStateBanner.vue");
    expect(source).toContain('<AdminStateBanner');
    expect(source).not.toContain('class="notice"');
    expect(source).not.toContain('class="error"');
  });
});
