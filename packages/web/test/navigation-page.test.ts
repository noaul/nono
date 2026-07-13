import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NavigationPage from '../src/views/NavigationPage.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  buildSearchUrl: (query: string) => `https://search.example/?q=${encodeURIComponent(query)}`,
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { username: 'admin' } }),
}));

function navigationPayload(backgroundImage?: string, settings?: Record<string, unknown>) {
  return {
    site: {
      id: 1,
      userId: 1,
      name: 'Nono',
      description: 'Navigation',
      slug: 'admin',
      backgroundImage,
      backgroundColor: '#000000',
      fontColor: '#ffffff',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      settings,
    },
    folders: [
      { id: 1, userId: 1, parentId: null, name: 'Parent', sortOrder: 100, locked: false, links: [] },
      {
        id: 2,
        userId: 1,
        parentId: 1,
        name: 'Child',
        sortOrder: 90,
        locked: false,
        links: [{ id: 10, folderId: 2, name: 'Vue', url: 'https://vuejs.org/', sortOrder: 100 }],
      },
    ],
  };
}

async function mountNavigationPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(NavigationPage, { global: { plugins: [pinia] } });
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('NavigationPage public workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(navigationPayload());
    document.head.querySelectorAll('[data-nono-background-preload]').forEach((node) => node.remove());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.querySelectorAll('[data-nono-background-preload]').forEach((node) => node.remove());
  });

  it('renders category tabs, sub-folder cards, and local search summary', async () => {
    apiRequest.mockResolvedValue({
      ...navigationPayload(),
      folders: [
        ...navigationPayload().folders,
        { id: 3, userId: 1, parentId: null, name: 'Second', sortOrder: 80, locked: false, links: [] },
        {
          id: 4,
          userId: 1,
          parentId: 3,
          name: 'Another child',
          sortOrder: 70,
          locked: false,
          links: [{ id: 11, folderId: 4, name: 'Vite', url: 'https://vite.dev/', sortOrder: 100 }],
        },
      ],
    });
    const wrapper = await mountNavigationPage();

    expect(wrapper.get('[data-testid="public-folder-card-2"]').attributes('style')).toContain('--public-folder-depth: 1');
    expect(wrapper.find('[data-testid="public-folder-card-2"] .folder-parent-label').exists()).toBe(false);
    // Category (top-level folder without direct links) is a tab, not a card.
    expect(wrapper.find('[data-testid="public-folder-card-1"]').exists()).toBe(false);
    const tabs = wrapper.findAll('.folder-tabs button');
    expect(tabs.map((tab) => tab.text())).toEqual(['全部', 'Parent', 'Second']);
    expect(wrapper.get('[data-testid="category-tab-1"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="public-folder-card-4"]').exists()).toBe(false);

    // "全部" remains available, but the first real category is the initial view.
    await wrapper.get('[data-testid="category-tab-all"]').trigger('click');
    expect(wrapper.findAll('[data-testid^="public-folder-card-"]')).toHaveLength(2);

    await wrapper.get('.search-bar input').setValue('Vue');
    await new Promise((resolve) => setTimeout(resolve, 180));
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('站内命中 1 个链接');
  });

  it('applies modal, tab, and admin-compatible appearance variables from saved settings', async () => {
    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      appearance: {
        modalRadius: 16,
        modalOpacity: 78,
        modalBlur: 20,
        tabRadius: 18,
        tabOpacity: 36,
        tabBlur: 8,
        adminRadius: 12,
        adminOpacity: 84,
        adminBlur: 6,
      },
    }));

    const wrapper = await mountNavigationPage();
    const style = wrapper.get('.nav-page').attributes('style');

    expect(style).toContain('--public-modal-radius: 16px');
    expect(style).toContain('--public-modal-opacity: 0.78');
    expect(style).toContain('--public-tab-radius: 18px');
    expect(style).toContain('--public-tab-opacity: 0.36');
    expect(style).toContain('--admin-surface-radius: 12px');
  });

  it('shows the public background image immediately while keeping preload hints', async () => {
    const imageInstances: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null; fetchPriority?: string; decoding?: string }> = [];
    class MockImage {
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      fetchPriority?: string;
      decoding?: string;

      constructor() {
        imageInstances.push(this);
      }
    }
    vi.stubGlobal('Image', MockImage);
    apiRequest.mockResolvedValue(navigationPayload('https://cdn.example.com/bg.jpg'));

    const wrapper = await mountNavigationPage();
    const page = wrapper.get('.nav-page');

    expect(page.classes()).toContain('nav-bg-visible');
    expect(page.classes()).not.toContain('nav-bg-loaded');
    expect(page.attributes('style')).toContain('url("https://cdn.example.com/bg.jpg")');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="dns-prefetch"]')?.getAttribute('href')).toBe('https://cdn.example.com');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preconnect"]')?.getAttribute('href')).toBe('https://cdn.example.com');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preload"]')?.getAttribute('href')).toBe('https://cdn.example.com/bg.jpg');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preload"]')?.getAttribute('as')).toBe('image');
    expect(imageInstances[0]?.fetchPriority).toBe('high');

    imageInstances[0].onload?.();
    await wrapper.vm.$nextTick();

    expect(page.classes()).toContain('nav-bg-loaded');
  });

  it('keeps the center portal link while the corner link opens admin', async () => {
    apiRequest.mockResolvedValue(
      navigationPayload(undefined, {
        portal: {
          enabled: true,
          url: 'https://blog.example.com/',
          label: '博客空间',
          imageUrl: 'https://cdn.example.com/avatar.png',
          openInNewTab: true,
        },
      }),
    );

    const wrapper = await mountNavigationPage();
    const corner = wrapper.get('[data-testid="portal-corner-link"]');
    const center = wrapper.get('[data-testid="portal-center-link"]');

    expect(corner.attributes('href')).toBe('/admin');
    expect(corner.attributes('target')).toBeUndefined();
    expect(corner.attributes('rel')).toBeUndefined();
    expect(corner.text()).toContain('后台管理');
    expect(center.attributes('href')).toBe('https://blog.example.com/');
    expect(center.attributes('target')).toBe('_blank');
    expect(center.attributes('rel')).toBe('noreferrer');
    expect(center.get('img').attributes('src')).toBe('https://cdn.example.com/avatar.png');
  });

  it('renders large folder collections in incremental batches', async () => {
    const folders = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      userId: 1,
      parentId: null,
      name: `Folder ${index + 1}`,
      sortOrder: 100 - index,
      locked: false,
      links: [{ id: index + 100, folderId: index + 1, name: `Link ${index + 1}`, url: `https://example.com/${index + 1}`, sortOrder: 100 }],
    }));
    apiRequest.mockResolvedValue({ ...navigationPayload(), folders });

    const wrapper = await mountNavigationPage();
    await wrapper.get('[data-testid="category-tab-all"]').trigger('click');

    expect(wrapper.findAll('[data-testid^="public-folder-card-"]')).toHaveLength(24);
    await wrapper.get('.folder-load-more').trigger('click');
    expect(wrapper.findAll('[data-testid^="public-folder-card-"]')).toHaveLength(30);
    expect(wrapper.find('.folder-load-more').exists()).toBe(false);
  });
});
