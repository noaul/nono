import fs from 'node:fs';
import path from 'node:path';
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import FolderCard from '../src/components/FolderCard.vue';
import AdminLayout from '../src/components/AdminLayout.vue';

const readSource = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
const readStyle = (name: string) => readSource(`src/styles/${name}.css`);

describe('visual contracts', () => {
  it('loads shared foundations globally and route-specific styles at their boundaries', () => {
    const mainSource = readSource('src/main.ts');
    const navigationSource = readSource('src/views/NavigationPage.vue');
    const adminLayoutSource = readSource('src/components/AdminLayout.vue');
    const tokens = readStyle('tokens');
    const base = readStyle('base');
    const publicStyles = readStyle('public');
    const adminStyles = readStyle('admin');

    expect(mainSource).toContain("import './styles/tokens.css'");
    expect(mainSource).toContain("import './styles/base.css'");
    expect(mainSource).not.toContain("import './styles.css'");
    expect(navigationSource).toContain("import '@/styles/public.css'");
    expect(adminLayoutSource).toContain("import '@/styles/admin.css'");

    for (const token of [
      '--nono-accent',
      '--nono-radius-sm',
      '--nono-radius-md',
      '--nono-radius-lg',
      '--nono-surface-opacity',
      '--nono-surface-blur',
      '--nono-ease-standard',
      '--nono-focus-ring',
    ]) {
      expect(tokens).toContain(token);
    }

    expect(publicStyles).toContain('.public-empty-state');
    expect(publicStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(adminStyles).toContain('.app-workbench');
    expect(adminStyles).toContain('.admin-card');
    expect(adminStyles).toContain('.sortable-row-dragging');
    expect(adminStyles).toContain('.admin-empty-state');

    for (const routeSpecificPrefix of ['.app-workbench', '.glass-workbench', '.workbench-', '.admin-', '.sortable-']) {
      expect(base).not.toContain(routeSpecificPrefix);
      expect(publicStyles).not.toContain(routeSpecificPrefix);
    }
  });

  it('renders public folders in the large folder layout', () => {
    const wrapper = mount(FolderCard, {
      props: {
        folder: {
          id: 1,
          userId: 1,
          name: '常用工具',
          sortOrder: 100,
          locked: false,
          links: [
            { id: 1, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
            { id: 2, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 90 },
          ],
        },
      },
    });

    expect(wrapper.classes()).toContain('large-folder');
    expect(wrapper.find('.large-links').exists()).toBe(true);
    expect(wrapper.findAll('.large-link')).toHaveLength(2);
  });

  it('renders every bookmark in a folder and lets the card scroll after twelve items', () => {
    const links = Array.from({ length: 13 }, (_, index) => ({
      id: index + 1,
      folderId: 1,
      name: `书签 ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      sortOrder: 100 - index,
    }));
    const wrapper = mount(FolderCard, {
      props: {
        folder: {
          id: 1,
          userId: 1,
          name: '常用工具',
          sortOrder: 100,
          locked: false,
          links,
        },
      },
    });

    expect(wrapper.findAll('.large-link')).toHaveLength(13);
    expect(wrapper.find('[data-testid="folder-overflow-more"]').exists()).toBe(false);
  });

  it('keeps the public background image on its own layer with color as fallback only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');

    expect(source).toContain('backgroundStyle');
    expect(source).toContain("'--nav-bg-image'");
    expect(source).toContain("'--nav-bg-color'");
    expect(source).toContain('visibleBackgroundImage');
    expect(source).toContain('JSON.stringify(visibleBackgroundImage.value)');
    expect(source).toContain('preloadPublicBackground');
    expect(source).toContain('data-nono-background-preload');
    expect(source).toContain("addBackgroundHint('dns-prefetch', origin)");
    expect(source).toContain('new Image()');
    expect(source).toContain("image.fetchPriority = 'high'");
    expect(source).toContain('nav-bg-visible');
    expect(source).toContain('nav-bg-loaded');
    expect(source).toContain('getAppearanceSettings');
    expect(source).toContain('toAppearanceCssVars');
    expect(source).toContain('--public-card-opacity');
    expect(source).toContain('--public-search-blur');
    expect(source).toContain('.nav-page::before');
    expect(source).toMatch(/background:\s*var\(--nav-bg-color,\s*#090a0f\)/);
    expect(source).toMatch(/background-image:\s*var\(--nav-bg-image,\s*none\)/);
    expect(source).not.toContain('backgroundImage: payload?.site.backgroundImage');
    expect(source).not.toContain("url('${payload.site.backgroundImage}')");
  });

  it('keeps folder columns stable across viewport and zoom changes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');

    expect(css).toContain('adaptive-folder-grid');
    expect(css).toContain('--folder-card-width: 445px');
    expect(css).toContain('max-width: 2048px');
    expect(css).toContain('gap: 38px 32px');
    expect(css).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*var\(--folder-card-width\)\)/);
    expect(css).toContain('justify-content: center');
    expect(css).not.toContain('25vw');
    expect(css).not.toContain('--folder-panel-width');
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');
    expect(folderCardSource).toContain('content-visibility: auto');
  });

  it('keeps each public folder as a compact glass bookmark card', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');

    expect(source).toContain('folder-glass-panel');
    // Fixed card: three bookmarks per row, four visible rows, then an inner vertical scrollbar.
    expect(source).toContain('grid-template-rows: 38px auto');
    expect(source).toContain('contain-intrinsic-size: 445px 268px');
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(source).toContain('grid-auto-rows: 40px');
    expect(source).toMatch(/\.large-links \{[\s\S]*?height: 218px;[\s\S]*?max-height: 218px;/);
    expect(source).toContain('max-height: 218px');
    expect(source).toContain('overflow-y: auto');
    expect(source).toContain('overscroll-behavior: contain');
    expect(source).not.toContain('link-overflow-more');
    expect(source).not.toContain('MAX_VISIBLE_LINKS');
    expect(source).not.toContain('visibleLinks');
    expect(source).toContain('border-radius: 8px');
    expect(source).toContain('backdrop-filter: blur(var(--public-card-blur');
    expect(source).toContain('var(--public-card-radius');
    expect(source).toContain('var(--public-card-opacity');
    expect(source).toContain('var(--public-card-blur');
    expect(source).toContain('.large-folder:hover .large-links');
    expect(source).not.toContain('will-change: transform');
    expect(source).toContain('link-favicon');
    expect(source).toContain('loading="lazy"');
    expect(source).not.toContain('Monitor');
    expect(source).not.toContain('height: clamp(320px, 36vw, 440px)');
    expect(source).not.toContain('grid-auto-rows: 58px');
    expect(source).not.toContain('border-radius: 32px');
    expect(source).toMatch(/@media \(max-width: 640px\)[\s\S]*?grid-template-rows: 38px auto/);
    expect(source).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.large-links \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?height: 218px;/,
    );

    const navigationSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');
    const searchBarSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SearchBar.vue'), 'utf8');
    expect(navigationSource).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.nav-header,[\s\S]*?\.adaptive-folder-grid \{[\s\S]*?min-width: 0;[\s\S]*?width: 100%;/,
    );
    expect(searchBarSource).toMatch(/\.search-bar \{[\s\S]*?min-width: 0;/);
  });

  it('makes the folder expand control interactive', async () => {
    const wrapper = mount(FolderCard, {
      props: {
        folder: {
          id: 1,
          userId: 1,
          name: '综合资源',
          sortOrder: 100,
          locked: false,
          links: [{ id: 1, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 }],
        },
      },
    });

    await wrapper.get('[data-testid="folder-expand"]').trigger('click');
    expect(wrapper.emitted('expand')?.[0]).toEqual([expect.objectContaining({ id: 1 })]);
  });

  it('renders semantic folder icon names as icons instead of visible source text', () => {
    const wrapper = mount(FolderCard, {
      props: {
        folder: {
          id: 1,
          userId: 1,
          name: '开发',
          icon: 'code',
          sortOrder: 100,
          locked: false,
          links: [],
        },
      },
    });

    expect(wrapper.find('.title-icon').element.tagName.toLowerCase()).toBe('svg');
    expect(wrapper.find('.title-main').text()).not.toContain('code');
  });

  it('renders an expanded folder link panel from the navigation page', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');
    const expandModalSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderExpandModal.vue'), 'utf8');
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');

    expect(source).toContain('expandedFolder');
    expect(source).toContain('<FolderExpandModal');
    expect(expandModalSource).toContain('folder-expand-modal');
    expect(expandModalSource).toContain('expanded-link-grid');
    expect(expandModalSource).toContain('<FolderGlyph class="expand-folder-icon"');
    expect(expandModalSource).toContain('getFaviconUrl(link.url, link.icon)');
    expect(folderCardSource).toContain('large-link:hover');
    expect(folderCardSource).toContain('large-link:focus-visible');
    expect(folderCardSource).toContain('large-link:active');
  });

  it('exposes a persisted manual sorting endpoint from bookmark management', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/LinksView.vue'), 'utf8');

    expect(source).toContain('/api/admin/links/reorder');
    expect(source).toContain('sortMode');
    expect(source).toContain('to="/admin/bookmarks"');
  });

  it('uses a visible native file input for bookmark imports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/BookmarksView.vue'), 'utf8');

    expect(source).toContain('class="native-file-input"');
    expect(source).toContain('id="bookmark-html-file"');
    expect(source).toContain('aria-label="选择 HTML"');
    expect(source).not.toContain('openFilePicker');
    expect(source).not.toContain('opacity: 0');
    expect(source).not.toContain('position: absolute');
    expect(source).not.toContain('hidden @change="pickFile"');
    expect(source).toContain('fileName');
  });

  it('renders admin pages with the redesigned operations shell', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(AdminLayout, {
      props: { title: '总览' },
      global: {
        stubs: { RouterLink: RouterLinkStub },
        plugins: [pinia],
        mocks: {
          $route: { path: '/admin' },
        },
      },
    });

    expect(wrapper.find('.app-workbench').exists()).toBe(true);
    expect(wrapper.find('.glass-workbench').exists()).toBe(true);
    expect(wrapper.find('.figma-admin-shell').exists()).toBe(true);
    expect(wrapper.find('.workbench-sidebar').exists()).toBe(true);
    expect(wrapper.find('.workbench-topbar').exists()).toBe(true);
    expect(wrapper.find('.workbench-stage').exists()).toBe(true);
    expect(wrapper.findAll('.nav-section')).toHaveLength(3);
    expect(wrapper.find('.operator-card').exists()).toBe(true);
    // Reduced-noise shell: no redundant section chip strip, no command card, avatar menu instead of button row.
    expect(wrapper.find('.figma-control-strip').exists()).toBe(false);
    expect(wrapper.find('.page-command-card').exists()).toBe(false);
    expect(wrapper.find('.topbar-avatar').exists()).toBe(true);
  });

  it('defines the redesigned admin operations dashboard shell styles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');
    const dashboardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/AdminDashboard.vue'), 'utf8');

    expect(css).toContain('.workbench-sidebar');
    expect(css).toContain('.workbench-topbar');
    expect(css).toContain('.user-menu');
    expect(css).toContain('.dashboard-hero');
    expect(css).toContain('.ops-metric-card');
    expect(css).toContain('.operations-grid');
    expect(dashboardSource).toContain('dashboard-hero');
    expect(dashboardSource).toContain('ops-metric-card');
    expect(dashboardSource).toContain('operations-grid');
  });

  it('defines the admin glassmorphism surface system', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');

    expect(css).toContain('.glass-workbench');
    expect(css).toContain('.glass-workbench::before');
    expect(css).toContain('.glass-surface');
    expect(css).toContain('backdrop-filter: blur');
    expect(css).toContain('-webkit-backdrop-filter: blur');
    expect(css).toContain('rgba(255, 255, 255, 0.62)');
    expect(css).toContain('border: 1px solid rgba(255, 255, 255, 0.46)');
  });

  it('defines the Figma-inspired admin frame and component tokens', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');
    const layoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');

    expect(layoutSource).toContain('figma-admin-shell');
    expect(css).toContain('--figma-surface');
    expect(css).toContain('--figma-stroke');
    expect(css).toContain('.figma-admin-shell::after');
    expect(css).toContain('linear-gradient(rgba(15, 118, 110, 0.07) 1px, transparent 1px)');
  });

  it('defines shared admin feedback, empty, loading, and responsive table classes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');

    expect(css).toContain('.toast-stack');
    expect(css).toContain('.confirm-backdrop');
    expect(css).toContain('.admin-empty-state');
    expect(css).toContain('.loading-overlay');
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toContain('.admin-table.mobile-card-table');
    expect(css).toContain('[data-label]::before');
    expect(css).toContain('.admin-search-input');
    expect(css).toContain('.row-actions .icon-button');
  });

  it('defines phase 2 admin operation styles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');

    expect(css).toContain('.bulk-action-bar');
    expect(css).toContain('.duplicate-panel');
    expect(css).toContain('.import-preview-panel');
    expect(css).toContain('--folder-depth');
  });

  it('defines link health operation styles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');

    expect(css).toContain('.health-check-panel');
    expect(css).toContain('.health-result-row');
  });

  it('sets a real browser favicon for the web app', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const favicon = fs.readFileSync(path.resolve(process.cwd(), 'public/favicon.svg'), 'utf8');

    expect(html).toContain('rel="icon"');
    expect(html).toContain('/favicon.svg');
    expect(html).toContain('theme-color');
    expect(favicon).toContain('<svg');
    expect(favicon).toContain('#123f36');
  });

  it('defines token governance styles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');

    expect(css).toContain('.token-summary-grid');
    expect(css).toContain('.token-created-secret');
  });

  it('defines public navigation tree and search polish contracts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const navigationSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');
    const searchBarSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SearchBar.vue'), 'utf8');

    expect(navigationSource).toContain('search-result-summary');
    expect(navigationSource).toContain('public-empty-state');
    expect(navigationSource).toContain('public-glass-page');
    expect(navigationSource).toContain('--public-glass-bg');
    expect(navigationSource).toContain('rgba(10, 11, 16, 0.06)');
    expect(navigationSource).toContain('rgba(10, 11, 16, 0.26)');
    expect(folderCardSource).toContain('--public-folder-depth');
    expect(folderCardSource).toContain('folder-parent-label');
    expect(folderCardSource).toContain('rgba(255, 255, 255, 0.18)');
    expect(folderCardSource).toContain('background: rgba(10, 14, 18, 0.52)');
    expect(folderCardSource).toContain('backdrop-filter: blur(var(--public-card-blur');
    expect(folderCardSource).toContain('.large-folder:hover .large-links');
    expect(folderCardSource).toContain('getFaviconUrl');
    expect(navigationSource).not.toContain('我的足迹');
    expect(navigationSource).not.toContain('Footprints');
    expect(searchBarSource).toContain('engine-picker');
    expect(searchBarSource).toContain('engine-trigger');
    expect(searchBarSource).not.toContain('search-provider-badge');
    expect(searchBarSource).toContain('rgba(10, 14, 18, 0.26)');
    expect(searchBarSource).toContain('blur(14px)');
    expect(searchBarSource).toContain('var(--public-search-radius');
    expect(searchBarSource).toContain('var(--public-search-opacity');
    expect(searchBarSource).toContain('var(--public-search-blur');
    expect(searchBarSource).toContain('translateY(1px) scale(0.94)');
  });

  it('keeps expensive visual effects off repeated admin and public surfaces', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');

    expect(css).not.toMatch(/\.glass-workbench \.admin-card[\s\S]*?backdrop-filter:\s*blur/);
    expect(css).not.toContain('will-change: transform');
    expect(folderCardSource).not.toContain('filter: drop-shadow(0 18px 30px');
  });

  it('loads non-public routes on demand', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');

    expect(source).toContain("const LoginView = () => import('@/views/LoginView.vue')");
    expect(source).toContain("const AdminDashboard = () => import('@/views/admin/AdminDashboard.vue')");
    expect(source).not.toContain("import AdminDashboard from '@/views/admin/AdminDashboard.vue'");
  });

  it('provides selectable folder icon presets in admin folder management', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/FoldersView.vue'), 'utf8');

    expect(source).toContain('folderIconOptions');
    expect(source).toContain('folder-icon-picker');
    expect(source).toContain('folder-icon-option');
    expect(source).toContain('chooseIcon(icon)');
    expect(source).toContain('aria-pressed');
  });

  it('reuses semantic folder glyphs across admin folder surfaces', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dashboard = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/AdminDashboard.vue'), 'utf8');
    const folders = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/FoldersView.vue'), 'utf8');
    const links = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/LinksView.vue'), 'utf8');

    expect(dashboard).toContain('<FolderGlyph :icon="folder.icon"');
    expect(folders).toContain('<FolderGlyph :icon="folder.icon"');
    expect(links).toContain('<FolderGlyph :icon="folder.icon"');
  });

  it('defines repeatable desktop and mobile browser performance baselines', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(process.cwd(), '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const playwrightConfig = fs.readFileSync(path.join(root, 'playwright.config.ts'), 'utf8');
    const smokeTest = fs.readFileSync(path.join(root, 'tests/e2e/public-navigation.smoke.spec.ts'), 'utf8');
    const baselineDoc = fs.readFileSync(path.join(root, 'docs/quality/ui-performance-baseline.md'), 'utf8');

    expect(packageJson.scripts['test:e2e']).toBe('playwright test');
    expect(packageJson.devDependencies['@playwright/test']).toBeTruthy();
    expect(playwrightConfig).toContain("name: 'desktop-chromium'");
    expect(playwrightConfig).toContain("name: 'mobile-chromium'");
    expect(playwrightConfig).toContain('webServer');
    expect(smokeTest).toContain("page.route('**/api/navigation/admin'");
    expect(smokeTest).toContain("page.goto('/admin')");
    expect(smokeTest).toContain('performance.getEntriesByType');
    expect(baselineDoc).toContain('npm run test:e2e');
    expect(baselineDoc).toContain('desktop-chromium');
    expect(baselineDoc).toContain('mobile-chromium');
  });
});
