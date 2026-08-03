import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readView = (name: string) => fs.readFileSync(path.resolve(process.cwd(), `src/views/admin/${name}.vue`), 'utf8');
const readAdminCss = () => fs.readFileSync(path.resolve(process.cwd(), 'src/styles/admin.css'), 'utf8');
const readLayout = () => fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');

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
    expect(source).toContain("@/components/admin/ContentManagementTabs.vue");
    expect(source).toContain('<AdminPageHeader');
    expect(source).toContain('<ContentManagementTabs');
    expect(source).toContain('admin-page-stack');
    expect(source).not.toContain('class="admin-card"');
  });

  it('exposes one sidebar entry for the complete bookmark workspace', () => {
    const source = readLayout();

    expect(source).toContain("labelKey: 'admin.navContentManagement'");
    expect(source).toContain("matches: ['/admin/notabs', '/admin/folders', '/admin/links']");
    expect(source).not.toContain("labelKey: 'admin.navFolders'");
    expect(source).not.toContain("labelKey: 'admin.navLinks'");
  });

  it('styles the simulated table DOM as compact desktop grids', () => {
    const css = readAdminCss();

    expect(css).toMatch(/\.admin-table-head,\s*\n\.admin-table-row \{[\s\S]*?display:\s*grid/);
    expect(css).toMatch(/\.notab-table \.admin-table-head,[\s\S]*?grid-template-columns:/);
    expect(css).toMatch(/\.folder-table \.admin-table-head,[\s\S]*?grid-template-columns:/);
    expect(css).toMatch(/\.bookmark-table \.admin-table-head,[\s\S]*?grid-template-columns:/);
  });

  it('targets the simulated table rows when stacking mobile cards', () => {
    const css = readAdminCss();
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'));

    expect(mobile).toContain('.mobile-card-table .admin-table-head');
    expect(mobile).toContain('.mobile-card-table .admin-table-row');
    expect(mobile).toContain('.mobile-card-table .admin-table-row > [data-label]::before');
    expect(mobile).not.toContain('.mobile-card-table thead');
    expect(mobile).not.toContain('.mobile-card-table td');
  });

  it.each(['FoldersView', 'LinksView'])('%s uses shared success and error banners', (name) => {
    const source = readView(name);

    expect(source).toContain("@/components/admin/AdminStateBanner.vue");
    expect(source).toContain('<AdminStateBanner');
    expect(source).not.toContain('class="notice"');
    expect(source).not.toContain('class="error"');
  });
});
