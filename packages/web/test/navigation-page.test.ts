import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function navigationPayload() {
  return {
    site: {
      id: 1,
      userId: 1,
      name: 'Nono',
      description: 'Navigation',
      slug: 'admin',
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
  });

  it('renders tree-aware folder cards and local search summary', async () => {
    const wrapper = await mountNavigationPage();

    expect(wrapper.get('[data-testid="public-folder-card-2"]').attributes('style')).toContain('--public-folder-depth: 1');
    expect(wrapper.get('[data-testid="public-folder-card-2"] .folder-parent-label').text()).toBe('Parent');

    await wrapper.get('.search-bar input').setValue('Vue');
    expect(wrapper.text()).toContain('站内命中 1 个链接');
  });
});
