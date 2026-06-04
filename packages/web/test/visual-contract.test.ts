import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import FolderCard from '../src/components/FolderCard.vue';
import AdminLayout from '../src/components/AdminLayout.vue';

describe('visual contracts', () => {
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

  it('keeps the public background image on its own layer with color as fallback only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');

    expect(source).toContain('backgroundStyle');
    expect(source).toContain("'--nav-bg-image'");
    expect(source).toContain("'--nav-bg-color'");
    expect(source).toContain('JSON.stringify(payload.value.site.backgroundImage)');
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
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');
    expect(folderCardSource).toContain('content-visibility: auto');
  });

  it('keeps each large folder to three bookmark columns with overflow scrolling after fifteen items', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');

    expect(source).toContain('grid-template-rows: 38px 308px');
    expect(source).toContain('height: 358px');
    expect(source).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(source).toContain('grid-auto-rows: 40px');
    expect(source).toContain('height: 308px');
    expect(source).toContain('overflow-y: auto');
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

  it('renders an expanded folder link panel from the navigation page', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');
    const folderCardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FolderCard.vue'), 'utf8');

    expect(source).toContain('expandedFolder');
    expect(source).toContain('folder-expand-modal');
    expect(source).toContain('expanded-link-grid');
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

  it('renders admin pages with the previous workbench shell', () => {
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
    expect(wrapper.find('.topbar').exists()).toBe(true);
    expect(wrapper.find('.workspace').exists()).toBe(true);
  });

  it('defines shared admin feedback, empty, loading, and responsive table classes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

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
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

    expect(css).toContain('.bulk-action-bar');
    expect(css).toContain('.duplicate-panel');
    expect(css).toContain('.import-preview-panel');
    expect(css).toContain('--folder-depth');
  });

  it('defines link health operation styles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

    expect(css).toContain('.health-check-panel');
    expect(css).toContain('.health-result-row');
  });

  it('defines token governance styles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

    expect(css).toContain('.token-summary-grid');
    expect(css).toContain('.token-created-secret');
  });
});
