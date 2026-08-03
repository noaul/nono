import fs from 'node:fs';
import path from 'node:path';
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import FolderCard from '../src/components/FolderCard.vue';
import AdminLayout from '../src/components/AdminLayout.vue';
import { translate } from '../src/locales';

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
      // The --admin-* names are aliases now, not a second set of values: the shared UI
      // contract in design-tokens.css holds the only definition.
      '--admin-sidebar-width: var(--ui-sidebar-w)',
      '--admin-topbar-height: var(--ui-topbar-h)',
      '--admin-content-max: var(--ui-content-max)',
      '--admin-control-height: var(--ui-control-h)',
      '--admin-control-height-sm: var(--ui-control-h-sm)',
      '--admin-icon-button-size: var(--ui-icon-btn)',
      '--admin-radius-card: var(--ui-radius-md)',
      '--admin-radius-control: var(--ui-radius-sm)',
      '--admin-motion-fast: var(--ui-dur-fast)',
      '--admin-motion-standard: var(--ui-dur-base)',
      '--admin-canvas',
      '--admin-surface',
      '--admin-surface-elevated',
      '--admin-border',
      '--admin-border-strong',
      '--admin-text',
      '--admin-text-muted',
      '--admin-accent: var(--ui-accent)',
      '--admin-danger',
      '--admin-success',
      '--admin-warning',
    ]) {
      expect(tokens).toContain(token);
    }

    expect(publicStyles).toContain('.public-empty-state');
    expect(publicStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(adminStyles).toContain('.admin-shell');
    expect(adminStyles).toContain('.admin-card');
    expect(adminStyles).toContain('.sortable-row-dragging');
    expect(adminStyles).toContain('.admin-empty-state');

    for (const routeSpecificPrefix of ['.admin-shell', '.workbench-', '.admin-', '.sortable-']) {
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

  it('renders every bookmark and only enables inner scrolling after fifteen items', () => {
    const links = Array.from({ length: 16 }, (_, index) => ({
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

    expect(wrapper.findAll('.large-link')).toHaveLength(16);
    expect(wrapper.get('.large-links').classes()).toContain('is-scrollable');
    expect(wrapper.find('[data-testid="folder-overflow-more"]').exists()).toBe(false);
  });

  it('lets the page own the mouse wheel when a folder has at most fifteen bookmarks', () => {
    const links = Array.from({ length: 15 }, (_, index) => ({ id: index + 1, folderId: 1, name: `书签 ${index + 1}`, url: `https://example.com/${index + 1}`, sortOrder: 100 - index }));
    const wrapper = mount(FolderCard, { props: { folder: { id: 1, userId: 1, name: '常用工具', sortOrder: 100, locked: false, links } } });

    expect(wrapper.get('.large-links').classes()).not.toContain('is-scrollable');
  });

  it('keeps the public background image on its own layer with color as fallback only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');

    expect(source).toContain('backgroundStyle');
    expect(source).toContain("'--nav-bg-image'");
    expect(source).toContain("'--nav-bg-color'");
    expect(source).toContain('visibleBackgroundImage');
    // Gated on the background-image switch, and still passed through JSON.stringify for the url().
    expect(source).toContain('activeBackgroundImage');
    expect(source).toContain('JSON.stringify(activeBackgroundImage.value)');
    expect(source).toContain('backgroundImageEnabled');
    expect(source).toContain('preloadPublicBackground');
    expect(source).toContain('data-nono-background-preload');
    expect(source).toContain("addBackgroundHint('dns-prefetch', origin)");
    expect(source).toContain('new Image()');
    expect(source).toContain("image.fetchPriority = 'high'");
    expect(source).toContain('nav-bg-visible');
    expect(source).toContain('nav-bg-loaded');
    expect(source).toContain('getAppearanceSettings');
    expect(source).toContain('toAppearanceCssVars');
    expect(source).toContain('--public-card-color-rgb');
    expect(source).toContain('--public-card-opacity');
    expect(source).toContain('--public-search-color-rgb');
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
    // Content width, side padding, column count and both gaps are settings now; the old
    // literals survive as the var() fallbacks, so an unconfigured site looks unchanged.
    expect(css).toContain('var(--public-content-max, 2600px)');
    expect(css).toMatch(/\.nav-content \{[\s\S]*?padding:\s*0 var\(--public-page-padding-x, 32px\);/);
    expect(css).toContain('var(--public-folder-gap-y, 24px) var(--public-folder-gap-x, 20px)');
    expect(css).toMatch(/\.adaptive-folder-grid \{[\s\S]*?grid-template-columns:\s*repeat\(var\(--public-folder-columns, 4\),\s*minmax\(0,\s*1fr\)\)/);
    // Narrow viewports still step down, but clamp against the configured count rather than
    // overriding it, so a site set to 2 columns never widens to 3.
    expect(css).toMatch(/@media \(max-width: 1800px\)[\s\S]*?\.adaptive-folder-grid \{[\s\S]*?repeat\(min\(3, var\(--public-folder-columns, 4\)\),/);
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.adaptive-folder-grid \{[\s\S]*?repeat\(min\(2, var\(--public-folder-columns, 4\)\),/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.nav-content \{[\s\S]*?padding:\s*0 16px;/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.adaptive-folder-grid \{[\s\S]*?gap:\s*24px;/);
    expect(css).not.toContain('@media (max-width: 820px)');
    expect(css).not.toContain('repeat(auto-fit');
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
    // Desktop card: three bookmarks per row, five visible rows, then an inner vertical scrollbar.
    // Narrow viewports derive their own column count; see the mobile assertions below.
    expect(source).toContain('grid-template-rows: 38px auto');
    expect(source).toContain('contain-intrinsic-size: 398px 264px');
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(source).toContain('grid-auto-rows: var(--public-bookmark-row-height, 38px)');
    expect(source).toMatch(/\.large-folder \{[\s\S]*?gap:\s*12px;/);
    expect(source).toMatch(/\.large-links \{[\s\S]*?gap:\s*var\(--public-bookmark-gap-y, 4px\) var\(--public-bookmark-gap-x, 8px\);[\s\S]*?padding:\s*15px 4px 15px 16px;/);
    expect(source).toMatch(/\.large-link \{[\s\S]*?gap:\s*2px;[\s\S]*?min-height:\s*var\(--public-bookmark-row-height, 38px\);[\s\S]*?padding:\s*2px 0 2px 5px;/);
    expect(source).toMatch(/\.large-link span \{[\s\S]*?font-size:\s*var\(--public-bookmark-text-size, 14px\);/);
    // Ellipsis replaced `clip`, which cut labels mid-glyph with no cue that text was missing.
    expect(source).toMatch(/\.large-link span \{[\s\S]*?text-overflow:\s*ellipsis/);
    expect(source).toContain(':size="16"');
    // Bookmark icons are sized by the setting on the shared `.large-link-icon`, so the favicon
    // rule only has to keep them square and unstretched.
    expect(source).toMatch(/\.large-link-icon \{[\s\S]*?height:\s*var\(--public-bookmark-icon-size, 20px\);[\s\S]*?width:\s*var\(--public-bookmark-icon-size, 20px\);/);
    expect(source).toMatch(/\.link-favicon \{[\s\S]*?object-fit:\s*contain;/);
    expect(source).toMatch(/\.large-links \{[\s\S]*?height: 214px;[\s\S]*?max-height: 214px;/);
    expect(source).toContain("'is-scrollable': (folder.links || []).length > 15");
    // The inner list always scrolls when it overflows. It used to be `hidden` unless the link count
    // cleared a threshold tuned for three columns, which silently dropped links in any narrower
    // layout; `is-scrollable` now only decides whether scroll chaining is contained.
    expect(source).toMatch(/\.large-links \{[\s\S]*?overflow-y:\s*auto/);
    expect(source).not.toMatch(/\.large-links \{[\s\S]*?overflow-y:\s*hidden/);
    expect(source).toMatch(/\.large-links\.is-scrollable \{[\s\S]*?overscroll-behavior:\s*contain/);
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
    // Narrow viewports keep the required three-column grid (from the unconditional base rule) but
    // shrink the cell padding, gap, icon and type so a ~80px column stays legible at 320px.
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(source).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.large-links \{[\s\S]*?--public-bookmark-text-size: 9px;[\s\S]*?height: 214px;/,
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
    expect(expandModalSource).toContain('background: rgba(var(--public-card-color-rgb, 247, 248, 251), var(--public-card-opacity, 0.26))');
    expect(expandModalSource).toContain('backdrop-filter: blur(var(--public-card-blur, 18px))');
    expect(expandModalSource).toContain('var(--public-folder-text');
    expect(expandModalSource).toContain('var(--public-bookmark-text-size');
    expect(folderCardSource).toContain('large-link:hover');
    expect(folderCardSource).toContain('large-link:focus-visible');
    expect(folderCardSource).toContain('large-link:active');
  });

  it('uses the folder surface settings for the unlock modal without rendering a preview', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const unlockModalSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderUnlockModal.vue'), 'utf8');
    const appearanceEditorSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/AppearanceEditor.vue'), 'utf8');

    expect(unlockModalSource).toContain('background: rgba(var(--public-card-color-rgb, 247, 248, 251), var(--public-card-opacity, 0.26))');
    expect(unlockModalSource).toContain('border-radius: var(--public-card-radius, 8px)');
    expect(unlockModalSource).toContain('var(--public-folder-text');
    expect(unlockModalSource).toContain('var(--public-bookmark-text');
    expect(appearanceEditorSource).not.toContain('appearance-preview');
  });

  it('exposes a persisted manual sorting endpoint from bookmark management', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/LinksView.vue'), 'utf8');

    expect(source).toContain('/api/admin/links/reorder');
    expect(source).toContain('sortMode');
    expect(source).not.toContain('to="/admin/bookmarks"');
    expect(source).toContain('data-testid="add-link-row"');
    expect(source.indexOf('data-testid="start-link-sort"')).toBeLessThan(source.indexOf('class="admin-table bookmark-table'));
    expect(source).not.toContain('data-testid="bulk-folder"');
    expect(source).not.toContain('data-testid="bulk-move"');
  });

  it('keeps bookmark creation in the admin shell without embedding Nodesk', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const layoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');

    expect(routerSource).toContain("path: '/admin/add-bookmark', redirect: '/admin/links'");
    expect(routerSource).not.toContain("path: '/admin/nodesk'");
    expect(layoutSource).not.toContain("to: '/admin/add-bookmark'");
    expect(layoutSource).not.toContain("to: '/admin/nodesk'");
    expect(layoutSource).toContain('<RouterLink class="sidebar-brand" to="/">');
    expect(routerSource).toContain("path: '/admin/bookmarks', redirect: '/admin/links'");
    expect(layoutSource).toContain("to: '/admin/automation', labelKey: 'admin.navAutomation'");
    expect(routerSource).toContain("path: '/admin/automation'");
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/views/admin/NodeskView.vue'))).toBe(false);
  });

  it('keeps browser import and export in the automation page', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const linksSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/LinksView.vue'), 'utf8');
    const automationSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/AutomationView.vue'), 'utf8');
    const transferSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/BookmarkTransferPanel.vue'), 'utf8');

    expect(linksSource).not.toContain('BookmarkTransferPanel');
    expect(linksSource).not.toContain('to="/admin/bookmarks"');
    expect(automationSource).toContain('<BookmarkTransferPanel id="bookmark-import" />');
    expect(transferSource).toContain('/api/admin/bookmarks/preview');
    expect(transferSource).toContain('/api/admin/bookmarks/import');
    expect(transferSource).toContain('/api/admin/bookmarks/export');
  });

  it('uses a visible native file input for bookmark imports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/BookmarkTransferPanel.vue'), 'utf8');

    expect(source).toContain('class="native-file-input"');
    expect(source).toContain('id="bookmark-html-file"');
    expect(source).toContain(`:aria-label="t('transfer.pickHtml')"`);
    expect(translate('zh', 'transfer.pickHtml')).toBe('选择 HTML');
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

    expect(wrapper.find('.admin-shell').exists()).toBe(true);
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
    expect(css).toContain('.dashboard-shortcut-grid');
    expect(css).toContain('.ops-metric-card');
    expect(css).toContain('.dashboard-shortcut');
    expect(dashboardSource).not.toContain('dashboard-hero');
    expect(dashboardSource).toContain('ops-metric-card');
    expect(dashboardSource).toContain('dashboard-shortcut-grid');
  });

  it('defines shared admin feedback, empty, loading, and responsive table classes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');

    expect(css).toContain('.toast-stack');
    expect(css).toContain('.confirm-backdrop');
    expect(css).toContain('.admin-empty-state');
    expect(css).toContain('.loading-overlay');
    // Responsive behaviour now hangs off the contract's md boundary, not a bespoke 720px.
    expect(css).toContain('@media (max-width: 767px)');
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

  it('sets distinct public and admin browser favicons', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const favicon = fs.readFileSync(path.resolve(process.cwd(), 'public/favicon-32.png'));
    const adminFavicon = fs.readFileSync(path.resolve(process.cwd(), 'public/favicon-admin-32.png'));
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.vue'), 'utf8');

    expect(html).toContain('rel="icon"');
    expect(html).toContain('/favicon-32.png');
    expect(html).toContain('/favicon-192.png');
    expect(html).toContain('/apple-touch-icon.png');
    expect(html).toContain('name="theme-color" content="#5b5ce2"');
    expect(favicon.subarray(0, pngSignature.length)).toEqual(pngSignature);
    expect(adminFavicon.subarray(0, pngSignature.length)).toEqual(pngSignature);
    expect(app).toContain("const variant = isAdmin ? '-admin' : ''");
    expect(app).toContain("`/favicon${variant}-${size}.png${isAdmin ? '' : '?v=20260717b'}`");
    expect(app).toContain("`/apple-touch-icon${variant}.png${isAdmin ? '' : '?v=20260717b'}`");
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
    const appearanceDrawerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AppearanceSettingsDrawer.vue'), 'utf8');
    const publicStyles = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/public.css'), 'utf8');

    expect(navigationSource).toContain('search-result-summary');
    expect(navigationSource).toContain('public-empty-state');
    expect(navigationSource).toContain('public-glass-page');
    expect(navigationSource).toContain('--public-overlay-rgb');
    expect(navigationSource).toContain('rgba(var(--public-overlay-rgb, 8, 12, 18)');
    expect(navigationSource).toContain('backgroundOverlayTotal');
    // Light and dark carry their own strength on top of the shared one.
    expect(navigationSource).toContain('overlayDark');
    expect(navigationSource).toContain('overlayLight');
    expect(navigationSource).toMatch(/\.folder-tabs \{[\s\S]*?rgba\(var\(--public-search-color-rgb/);
    expect(navigationSource).toMatch(/\.notab-select \{[\s\S]*?font-size:\s*var\(--public-notab-text-size, 15px\)/);
    expect(folderCardSource).toContain('--public-folder-depth');
    expect(folderCardSource).not.toContain('folder-parent-label');
    expect(folderCardSource).toContain('rgba(var(--public-card-color-rgb');
    expect(folderCardSource).toContain('var(--public-bookmark-text');
    expect(folderCardSource).toContain('var(--public-folder-text');
    expect(folderCardSource).toContain('backdrop-filter: blur(var(--public-card-blur');
    expect(folderCardSource).toContain('.large-folder:hover .large-links');
    expect(folderCardSource).toContain('getFaviconUrl');
    expect(navigationSource).not.toContain('我的足迹');
    expect(navigationSource).not.toContain('Footprints');
    expect(searchBarSource).toContain('engine-picker');
    expect(searchBarSource).toContain('engine-trigger');
    expect(searchBarSource).not.toContain('search-provider-badge');
    expect(searchBarSource).toContain('rgba(var(--public-search-color-rgb');
    expect(searchBarSource).toContain('var(--public-bookmark-text');
    expect(searchBarSource).toContain('var(--public-search-radius');
    expect(searchBarSource).toContain('var(--public-search-opacity');
    expect(searchBarSource).toContain('var(--public-search-blur');
    expect(searchBarSource).toMatch(/\.search-bar \{[\s\S]*?z-index:\s*40/);
    expect(searchBarSource).toMatch(/\.engine-menu \{[\s\S]*?rgba\(var\(--public-card-color-rgb/);
    expect(searchBarSource).toMatch(/\.engine-menu \{[\s\S]*?blur\(var\(--public-card-blur/);
    expect(searchBarSource).toMatch(/\.engine-menu \{[\s\S]*?var\(--public-card-radius/);
    expect(appearanceDrawerSource).toMatch(/\.theme-swatch-tab \{[\s\S]*?var\(--theme-tab/);
    expect(searchBarSource).toContain('translateY(1px) scale(0.94)');
    expect(publicStyles).not.toMatch(/@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.search-bar,/);
  });

  it('keeps expensive visual effects off repeated admin and public surfaces', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = readStyle('admin');
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');

    // The glass skin is gone entirely; no admin surface blurs its backdrop any more.
    expect(css).not.toContain('backdrop-filter: blur(');
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

  it('provides a compact searchable folder icon modal in admin folder management', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const foldersSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/FoldersView.vue'), 'utf8');
    const pickerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/FolderIconPicker.vue'), 'utf8');

    expect(foldersSource).toContain('<FolderIconPicker v-model="form.icon"');
    expect(foldersSource).toContain('<FolderIconPicker v-model="inlineForm.icon"');
    expect(pickerSource).toContain('folder-icon-dialog');
    expect(pickerSource).toContain('folder-icon-search');
    expect(pickerSource).toContain("['recommended', 'recent', 'all']");
    expect(pickerSource).toContain('folder-icon-option');
  });

  it('reuses semantic folder glyphs across admin folder surfaces', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dashboard = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/AdminDashboard.vue'), 'utf8');
    const folders = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/FoldersView.vue'), 'utf8');
    const links = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/LinksView.vue'), 'utf8');

    expect(dashboard).toContain('<FolderIcon :size="20"');
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

  it('keeps folder and bookmark tables within the admin stage at scaled desktop widths', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/admin.css'), 'utf8');

    expect(source).toContain('@media (max-width: 767px)');
    expect(source).toContain('.folder-table .admin-table-head');
    expect(source).toContain('.bookmark-table .admin-table-row');
    expect(source).toContain('.admin-table-row:hover');
    expect(source).toContain('min-width: 760px');
  });

  it('defines the theme scene intensity, parallax, and public micro-effect contracts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
    const sceneSource = read('src/components/ThemeScene.vue');
    const navigationSource = read('src/views/NavigationPage.vue');
    const folderCardSource = read('src/components/FolderCard.vue');
    const searchBarSource = read('src/components/SearchBar.vue');
    const drawerSource = read('src/components/AppearanceSettingsDrawer.vue');
    const themesSource = read('src/utils/themes.ts');

    // The scene dial: persisted in settings.theme.sceneIntensity, applied by the page, edited in the drawer.
    expect(themesSource).toContain('getSceneIntensity');
    expect(navigationSource).toContain('getSceneIntensity');
    expect(navigationSource).toContain(':intensity="sceneIntensity"');
    // The dial still gates the scene, now alongside the explicit on/off switch.
    expect(navigationSource).toContain('sceneIntensity > 0 && appearance.sceneEnabled');
    expect(navigationSource).toContain(':tuning="sceneTuning"');
    expect(sceneSource).toContain('intensityRatio');
    expect(sceneSource).toContain('visibleParticles');
    expect(drawerSource).toContain('data-testid="scene-intensity"');
    expect(drawerSource).toContain('sceneIntensity');

    // Scene depth and battery behavior: pointer parallax on fine pointers, paused when hidden.
    expect(sceneSource).toContain('scene-parallax');
    expect(sceneSource).toContain('visibilitychange');
    expect(sceneSource).toContain('animation-play-state: paused');

    // Card micro-effects: staggered entrance plus a pointer spotlight that skips reduced motion.
    expect(navigationSource).toContain('--enter-delay');
    expect(folderCardSource).toContain('folder-card-enter');
    expect(folderCardSource).toContain('animation-delay: var(--enter-delay, 0ms)');
    expect(folderCardSource).toContain('--spot-x');
    expect(folderCardSource).toContain("matchMedia('(hover: hover) and (pointer: fine)')");
    expect(folderCardSource).toContain("matchMedia('(prefers-reduced-motion: reduce)')");

    // Search glow and springy modals stay inside the shared motion tokens.
    expect(searchBarSource).toContain('search-breathe');
    expect(read('src/components/FolderExpandModal.vue')).toContain('modal-pop');
    expect(read('src/components/FolderUnlockModal.vue')).toContain('modal-pop');

    // The six per-theme preview animations in the drawer theme wall.
    for (const kind of ['bubbles', 'snow', 'leaves', 'stars', 'sunbeams', 'rain']) {
      expect(drawerSource).toContain(`.theme-${kind} .theme-motion`);
    }
  });

  it('shares an adaptive color mode across public, admin, and Nodesk surfaces', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(process.cwd(), '../..');
    const navigation = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');
    const adminLayout = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');
    const tokens = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    const blogLayout = fs.readFileSync(path.join(root, 'apps/blog/src/app/layout.tsx'), 'utf8');
    const blogTheme = fs.readFileSync(path.join(root, 'apps/blog/src/styles/theme.css'), 'utf8');

    expect(navigation).toContain('<ColorModeControl');
    expect(navigation).toContain('data-color-mode');
    expect(navigation).toContain(':mode="resolvedMode"');
    expect(navigation).toContain('--public-mode-scrim');
    expect(fs.readFileSync(path.resolve(process.cwd(), 'src/components/ThemeScene.vue'), 'utf8')).toContain('modeMultiplier');
    expect(adminLayout).toContain('<ColorModeControl');
    expect(tokens).toContain(":root[data-color-mode='dark']");
    expect(blogLayout).toContain('/color-mode-bootstrap.js');
    expect(blogTheme).toContain("[data-color-mode='dark']");
  });
});
