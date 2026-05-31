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

  it('keeps folder columns responsive to viewport and zoom changes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');

    expect(css).toContain('adaptive-folder-grid');
    expect(css).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*max\(340px,\s*25vw\)\),\s*1fr\)\)/);
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
});
