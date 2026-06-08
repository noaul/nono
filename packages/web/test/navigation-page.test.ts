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

function navigationPayload(backgroundImage?: string) {
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

  it('renders tree-aware folder cards and local search summary', async () => {
    const wrapper = await mountNavigationPage();

    expect(wrapper.get('[data-testid="public-folder-card-2"]').attributes('style')).toContain('--public-folder-depth: 1');
    expect(wrapper.get('[data-testid="public-folder-card-2"] .folder-parent-label').text()).toBe('Parent');

    await wrapper.get('.search-bar input').setValue('Vue');
    expect(wrapper.text()).toContain('站内命中 1 个链接');
  });

  it('preloads the public background image before fading it onto the page', async () => {
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

    expect(page.classes()).not.toContain('nav-bg-loaded');
    expect(page.attributes('style')).toContain('--nav-bg-image: none');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preconnect"]')?.getAttribute('href')).toBe('https://cdn.example.com');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preload"]')?.getAttribute('href')).toBe('https://cdn.example.com/bg.jpg');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preload"]')?.getAttribute('as')).toBe('image');
    expect(imageInstances[0]?.fetchPriority).toBe('high');

    imageInstances[0].onload?.();
    await wrapper.vm.$nextTick();

    expect(page.classes()).toContain('nav-bg-loaded');
    expect(page.attributes('style')).toContain('url("https://cdn.example.com/bg.jpg")');
  });
});
