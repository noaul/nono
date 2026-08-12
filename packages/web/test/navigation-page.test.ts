import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ColorModeControl from '../src/components/ColorModeControl.vue';
import NavigationPage from '../src/views/NavigationPage.vue';
import { useAuthStore } from '../src/stores/auth';

const apiRequest = vi.fn();
const originalElementFromPoint = document.elementFromPoint;

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  buildSearchUrl: (query: string) => `https://search.example/?q=${encodeURIComponent(query)}`,
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { username: 'admin' }, fullPath: '/' }),
}));

function navigationPayload(backgroundImage?: string, settings?: Record<string, unknown>) {
  return {
    site: {
      id: 1,
      userId: 1,
      name: 'NoNo',
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
    access: { required: false, unlocked: true },
  };
}

async function mountNavigationPage(authenticated = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.loaded = true;
  auth.user = authenticated
    ? { id: 1, username: 'admin', email: 'admin@example.com', displayName: 'Admin', role: 'admin' }
    : null;
  const wrapper = mount(NavigationPage, { global: { plugins: [pinia] } });
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  return wrapper;
}

function pointerEvent(type: string, init: { pointerId: number; clientX: number; clientY: number; button?: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button ?? 0,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId });
  return event;
}

describe('NavigationPage public workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(navigationPayload());
    document.head.querySelectorAll('[data-nono-background-preload]').forEach((node) => node.remove());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-color-mode');
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint });
    document.head.querySelectorAll('[data-nono-background-preload]').forEach((node) => node.remove());
  });

  it('waits for navigation data before rendering the homepage', async () => {
    let resolveNavigation!: (value: ReturnType<typeof navigationPayload>) => void;
    apiRequest.mockImplementation(() => new Promise((resolve) => {
      resolveNavigation = resolve;
    }));

    const wrapper = await mountNavigationPage();

    expect(wrapper.find('.nav-page').exists()).toBe(false);
    expect(wrapper.find('.nav-header').exists()).toBe(false);
    expect(wrapper.find('.search-bar').exists()).toBe(false);
    expect(wrapper.find('.public-loading').exists()).toBe(false);

    const response = navigationPayload();
    response.site.name = 'My Navigation';
    resolveNavigation(response);

    await vi.waitFor(() => {
      expect(wrapper.get('.nav-header h1').text()).toBe('My Navigation');
    });
    expect(wrapper.find('.search-bar').exists()).toBe(true);
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

  it('places NoMoney, Yumi and NoStar after the NoTab buttons', async () => {
    const wrapper = await mountNavigationPage();
    const tabs = wrapper.get('.folder-tabs');
    const noMoney = tabs.get('[data-testid="navigation-entry-nomoney"]');
    const noStar = tabs.get('[data-testid="navigation-entry-nostar"]');
    const yumi = tabs.get('[data-testid="navigation-entry-yumi"]');

    expect(noMoney.attributes('href')).toBe('/nomoney');
    expect(noStar.attributes('href')).toBe('/nostar');
    expect(yumi.attributes('href')).toBe('/yumi');
    expect(noMoney.attributes('target')).toBe('_blank');
    expect(noStar.attributes('target')).toBe('_blank');
    expect(noMoney.attributes('rel')).toBe('noreferrer');
    expect(noStar.attributes('rel')).toBe('noreferrer');
    expect(noMoney.element.previousElementSibling?.classList.contains('tab-service-separator')).toBe(true);
    expect(noMoney.element.nextElementSibling).toBe(yumi.element);
    expect(yumi.element.nextElementSibling).toBe(noStar.element);
    expect(tabs.element.lastElementChild).toBe(noStar.element);
    expect(tabs.findAll('button.active')).toHaveLength(1);
  });

  it('migrates saved NoMoney and NoStar entries to open in a new tab', async () => {
    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      navigationEntriesVersion: 2,
      navigationEntries: [
        { id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
        { id: 'nostar', label: 'NoStar', url: '/nostar', icon: 'star', enabled: true, openInNewTab: false },
      ],
    }));

    const wrapper = await mountNavigationPage();
    expect(wrapper.get('[data-testid="navigation-entry-nomoney"]').attributes('target')).toBe('_blank');
    expect(wrapper.get('[data-testid="navigation-entry-nostar"]').attributes('target')).toBe('_blank');
  });

  it('renders enabled custom service entries from site settings', async () => {
    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      navigationEntries: [
        { id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
        { id: 'status', label: 'Status', url: '/status', icon: 'activity', enabled: true, openInNewTab: false },
        { id: 'hidden', label: 'Hidden', url: '/hidden', icon: 'link', enabled: false, openInNewTab: false },
      ],
    }));

    const wrapper = await mountNavigationPage();
    const entries = wrapper.findAll('[data-testid^="navigation-entry-"]');

    expect(entries.map((entry) => entry.text())).toEqual(['NoMoney', 'Status', 'Yumi', 'NoStar']);
    expect(wrapper.get('[data-testid="navigation-entry-status"]').attributes('href')).toBe('/status');
    expect(wrapper.find('[data-testid="navigation-entry-hidden"]').exists()).toBe(false);
  });

  it('respects an explicitly saved versioned entry list', async () => {
    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      navigationEntriesVersion: 3,
      navigationEntries: [
        { id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
      ],
    }));

    const wrapper = await mountNavigationPage();
    expect(wrapper.find('[data-testid="navigation-entry-nostar"]').exists()).toBe(false);
  });

  it('uses card and search settings as the shared content and navigation glass variables', async () => {
    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      appearance: {
        cardRadius: 16,
        cardOpacity: 78,
        cardBlur: 20,
        searchRadius: 18,
        searchOpacity: 36,
        searchBlur: 8,
        modalRadius: 16,
        modalOpacity: 90,
        tabRadius: 24,
        tabOpacity: 80,
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
    expect(style).not.toContain('--admin-surface-radius');
  });

  it('renders the selected theme scene and complete public color variables', async () => {
    const themedPayload = navigationPayload(undefined, {
      theme: { id: 'verdant-leaves', accent: '#2f855a' },
    });
    themedPayload.site.fontColor = '#173b2a';
    apiRequest.mockResolvedValue(themedPayload);

    const wrapper = await mountNavigationPage();
    const page = wrapper.get('.nav-page');
    const scene = wrapper.get('[data-testid="theme-scene"]');

    expect(page.attributes('data-theme-tone')).toBe('light');
    expect(page.attributes('style')).toContain('--public-page-text: #173b2a');
    expect(page.attributes('style')).toContain('--public-border-rgb:');
    expect(page.attributes('style')).toContain('--public-hover-rgb:');
    expect(scene.attributes('data-scene')).toBe('leaves');
    expect(scene.attributes('aria-hidden')).toBe('true');
    // The scene carries no background imagery; the canvas is the whole effect.
    expect(scene.findAll('img')).toHaveLength(0);
    expect(scene.find('[data-testid="scene-canvas"]').exists()).toBe(true);
  });

  it('scales the scene by the persisted intensity dial and hides it entirely at zero', async () => {
    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      theme: { id: 'starlit-night', accent: '#f0b86e', sceneIntensity: 50 },
    }));

    const wrapper = await mountNavigationPage();
    const scene = wrapper.get('[data-testid="theme-scene"]');

    // starlit-night ships opacity 0.4; a 50% dial halves it and thins the particle field.
    expect(scene.attributes('style')).toContain('--theme-scene-opacity: 0.2');
    expect(scene.attributes('style')).toContain('--theme-particle-alpha: 0.68');
    // Particles live on a canvas now; the dial's effect on field size is covered by the
    // sceneParticles unit tests, so here we only assert the canvas is mounted and scaled.
    expect(scene.find('[data-testid="scene-canvas"]').exists()).toBe(true);

    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      theme: { id: 'starlit-night', accent: '#f0b86e', sceneIntensity: 0 },
    }));
    const offWrapper = await mountNavigationPage();
    expect(offWrapper.find('[data-testid="theme-scene"]').exists()).toBe(false);
  });

  it('keeps scene decoration out of the interaction and reduced-motion paths', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ThemeScene.vue'), 'utf8');

    expect(source).toContain('pointer-events: none');
    expect(source).toContain('.theme-scene.is-reduced-motion .scene-canvas');
    expect(source).toContain('@media (max-width: 640px)');
    // The background is deliberately still: nothing in the scene uses keyframes any more,
    // and the particles are simulated onto a canvas instead of being DOM nodes.
    expect(source).not.toMatch(/@keyframes/);
    expect(source).toContain('data-testid="scene-canvas"');
    // Battery + depth contracts: pause off-screen, parallax only for fine pointers.
    expect(source).toContain('visibilitychange');
    expect(source).toContain('is-paused');
    expect(source).toContain('scene-parallax');
    expect(source).toContain("matchMedia('(hover: hover) and (pointer: fine)')");
    expect(source).toContain('animation-play-state: paused');
    // Reduced motion never starts the simulation.
    expect(source).toContain('function syncReducedMotion()');
    expect(source).toContain('if (frame) cancelAnimationFrame(frame)');
  });

  it('loads the saved public background through the same-origin navigation endpoint', async () => {
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
    expect(page.attributes('style')).toContain('url("/api/navigation/admin/background")');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="dns-prefetch"]')).toBeNull();
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preconnect"]')).toBeNull();
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preload"]')?.getAttribute('href')).toBe('/api/navigation/admin/background');
    expect(document.head.querySelector('link[data-nono-background-preload][rel="preload"]')?.getAttribute('as')).toBe('image');
    expect(imageInstances[0]?.fetchPriority).toBe('high');
    expect(imageInstances[0]?.src).toBe('/api/navigation/admin/background');

    imageInstances[0].onload?.();
    await wrapper.vm.$nextTick();

    expect(page.classes()).toContain('nav-bg-loaded');
  });

  it('falls back to the saved image URL when the same-origin background endpoint fails', async () => {
    const imageInstances: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }> = [];
    class MockImage {
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        imageInstances.push(this);
      }
    }
    vi.stubGlobal('Image', MockImage);
    apiRequest.mockResolvedValue(navigationPayload('https://cdn.example.com/bg.jpg'));

    const wrapper = await mountNavigationPage();
    imageInstances[0].onerror?.();
    await wrapper.vm.$nextTick();

    expect(imageInstances[1]?.src).toBe('https://cdn.example.com/bg.jpg');
    expect(wrapper.get('.nav-page').classes()).toContain('nav-bg-visible');
    expect(wrapper.get('.nav-page').attributes('style')).toContain('url("https://cdn.example.com/bg.jpg")');
  });

  it('keeps the center portal link and gives the signed-in owner a settings drawer', async () => {
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

    const wrapper = await mountNavigationPage(true);
    const corner = wrapper.get('[data-testid="portal-corner-link"]');
    const center = wrapper.get('[data-testid="portal-center-link"]');

    expect(corner.element.tagName).toBe('BUTTON');
    expect(corner.text()).toContain('外观设置');
    await corner.trigger('click');
    expect(wrapper.get('[data-testid="appearance-settings-drawer"]').isVisible()).toBe(true);
    const adminLink = wrapper.get('[data-testid="appearance-admin-link"]');
    expect(adminLink.attributes('href')).toBe('/admin');
    expect(adminLink.attributes('target')).toBe('_blank');
    expect(adminLink.attributes('rel')).toBe('noreferrer');
    expect(center.attributes('href')).toBe('https://blog.example.com/');
    expect(center.attributes('target')).toBe('_blank');
    expect(center.attributes('rel')).toBe('noreferrer');
    expect(center.get('img').attributes('src')).toBe('https://cdn.example.com/avatar.png');
  });

  it('previews appearance changes on the homepage before saving', async () => {
    const wrapper = await mountNavigationPage(true);
    await wrapper.get('[data-testid="portal-corner-link"]').trigger('click');
    await wrapper.get('[data-testid="theme-winter-glow"]').trigger('click');
    await wrapper.vm.$nextTick();

    const style = wrapper.get('.nav-page').attributes('style');
    expect(style).toContain('--public-search-color: #fffdf8');
    expect(style).toContain('--nav-bg-color: #cfdcee');
  });

  it('keeps the settings entry visible but requires signed-out visitors to log in', async () => {
    const wrapper = await mountNavigationPage();

    const entry = wrapper.get('[data-testid="portal-corner-link"]');
    expect(entry.element.tagName).toBe('A');
    expect(entry.attributes('href')).toBe('/login?next=%2F');
    expect(entry.text()).toContain('后台管理登录');
    expect(wrapper.find('[data-testid="appearance-settings-drawer"]').exists()).toBe(false);
  });

  it('provides high-contrast notification and label tokens for both color modes', async () => {
    document.documentElement.dataset.colorMode = 'light';
    let wrapper = await mountNavigationPage();
    let style = wrapper.get('.nav-page').attributes('style');
    expect(style).toContain('--public-notification-surface: #ffffff');
    expect(style).toContain('--public-notification-text-rgb: 17, 24, 39');
    wrapper.unmount();

    apiRequest.mockResolvedValue(navigationPayload(undefined, {
      appearance: {
        bookmarkTextColor: '#111111',
        categoryTextColor: '#222222',
      },
    }));
    wrapper = await mountNavigationPage();
    wrapper.getComponent(ColorModeControl).vm.$emit('change', 'dark');
    await wrapper.vm.$nextTick();
    style = wrapper.get('.nav-page').attributes('style');
    expect(style).toContain('--public-bookmark-text-rgb: 255, 255, 255');
    expect(style).toContain('--public-category-text-rgb: 255, 255, 255');
    wrapper.unmount();
  });

  it('enters organize mode by holding All for one second and deletes bookmarks to the recycle bin', async () => {
    vi.useFakeTimers();
    const wrapper = await mountNavigationPage(true);
    const allTab = wrapper.get('[data-testid="category-tab-all"]');

    allTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 10, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.navigation-reveal-content').classes()).toContain('is-organizing');
    expect(wrapper.get('[data-testid="category-tab-all"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="public-folder-card-2"]').classes()).toContain('is-organizing');

    await wrapper.get('[data-testid="delete-bookmark-10"]').trigger('click');
    expect(wrapper.get('[data-testid="bookmark-delete-dialog"]').text()).toContain('Vue');
    expect(wrapper.get('[data-testid="bookmark-delete-dialog"]').text()).toContain('回收站');

    await wrapper.get('[data-testid="bookmark-delete-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="bookmark-delete-dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="delete-bookmark-10"]').trigger('click');
    await wrapper.get('[data-testid="bookmark-delete-confirm"]').trigger('click');
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/links/10', { method: 'DELETE' });
    expect(wrapper.find('[data-testid="public-bookmark-10"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it('opens the delete confirmation after holding a bookmark for two seconds', async () => {
    vi.useFakeTimers();
    const wrapper = await mountNavigationPage(true);
    const bookmark = wrapper.get('[data-testid="public-bookmark-10"]');

    bookmark.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 11, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(2000);
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="bookmark-delete-dialog"]').text()).toContain('Vue');
    expect(wrapper.get('[data-testid="bookmark-delete-dialog"]').text()).toContain('回收站');
    vi.useRealTimers();
  });

  it('switches notabs while dragging and persists a cross-folder insertion', async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue({
      ...navigationPayload(),
      folders: [
        ...navigationPayload().folders,
        { id: 3, userId: 1, parentId: null, name: 'Second', sortOrder: 80, locked: false, links: [] },
        {
          id: 4,
          userId: 1,
          parentId: 3,
          name: 'Target',
          sortOrder: 70,
          locked: false,
          links: [{ id: 11, folderId: 4, name: 'Vite', url: 'https://vite.dev/', sortOrder: 100 }],
        },
      ],
    });
    const wrapper = await mountNavigationPage(true);
    const allTab = wrapper.get('[data-testid="category-tab-all"]');
    allTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 90, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    const bookmark = wrapper.get('[data-testid="public-bookmark-10"]');
    const secondTab = wrapper.get('[data-testid="category-tab-3"]').element;
    const elementFromPoint = vi.fn(() => secondTab);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });

    bookmark.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 12, clientX: 20, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 12, clientX: 45, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(650);
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="category-tab-3"]').attributes('aria-pressed')).toBe('true');
    const targetPanel = wrapper.get('[data-testid="bookmark-drop-folder-4"]').element;
    elementFromPoint.mockReturnValue(targetPanel);
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 12, clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 12, clientX: 100, clientY: 100 }));
    const postDropClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    window.dispatchEvent(postDropClick);
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/links/move', {
      method: 'PUT',
      body: JSON.stringify({ linkId: 10, targetFolderId: 4, sourceIds: [], targetIds: [11, 10] }),
    });
    expect(postDropClick.defaultPrevented).toBe(true);
    expect(wrapper.get('[data-testid="bookmark-drop-folder-4"]').findAll('.large-link')).toHaveLength(2);
    vi.useRealTimers();
  });

  it('reorders bookmarks immediately inside the same folder during organize mode', async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue({
      ...navigationPayload(),
      folders: [
        navigationPayload().folders[0],
        {
          ...navigationPayload().folders[1],
          links: [
            { id: 10, folderId: 2, name: 'Vue', url: 'https://vuejs.org/', sortOrder: 100 },
            { id: 11, folderId: 2, name: 'Vite', url: 'https://vite.dev/', sortOrder: 90 },
          ],
        },
      ],
    });
    const wrapper = await mountNavigationPage(true);
    const allTab = wrapper.get('[data-testid="category-tab-all"]');
    allTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 91, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    const source = wrapper.get('[data-testid="public-bookmark-10"]');
    const target = wrapper.get('[data-testid="public-bookmark-11"]').element;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });

    source.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 13, clientX: 20, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 13, clientX: 45, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 13, clientX: 45, clientY: 20 }));
    const postDragClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    source.element.dispatchEvent(postDragClick);
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/links/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: [11, 10] }),
    });
    expect(postDragClick.defaultPrevented).toBe(true);
    expect(wrapper.get('[data-testid="bookmark-drop-folder-2"]').findAll('.large-link').map((item) => item.text())).toEqual(['Vite', 'Vue']);
  });

  it('keeps organize mode unavailable to signed-out visitors', async () => {
    vi.useFakeTimers();
    const wrapper = await mountNavigationPage(false);
    const allTab = wrapper.get('[data-testid="category-tab-all"]');
    allTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 92, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.get('.navigation-reveal-content').classes()).not.toContain('is-organizing');
  });

  it('suppresses the mobile context menu while the owner holds All to organize', async () => {
    const wrapper = await mountNavigationPage(true);
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    wrapper.get('[data-testid="category-tab-all"]').element.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
  });

  it('reorders NoTabs directly while organize mode is active', async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue({
      ...navigationPayload(),
      folders: [
        ...navigationPayload().folders,
        { id: 3, userId: 1, parentId: null, name: 'Second', sortOrder: 80, locked: false, links: [] },
      ],
    });
    const wrapper = await mountNavigationPage(true);
    const allTab = wrapper.get('[data-testid="category-tab-all"]');
    allTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 93, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    const firstTab = wrapper.get('[data-testid="category-tab-1"]');
    const secondTab = wrapper.get('[data-testid="category-tab-3"]').element;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => secondTab });

    firstTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 94, clientX: 20, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 94, clientX: 45, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 94, clientX: 45, clientY: 20 }));
    await Promise.resolve();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/folders/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: [3, 1] }),
    });
  });

  it('reorders sibling folders directly while organize mode is active', async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue({
      ...navigationPayload(),
      folders: [
        ...navigationPayload().folders,
        { id: 3, userId: 1, parentId: 1, name: 'Second child', sortOrder: 80, locked: false, links: [] },
      ],
    });
    const wrapper = await mountNavigationPage(true);
    const allTab = wrapper.get('[data-testid="category-tab-all"]');
    allTab.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 95, clientX: 20, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(1000);
    const source = wrapper.get('[data-testid="folder-drag-handle-2"]');
    const target = wrapper.get('[data-testid="public-folder-card-3"]').element;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });

    source.element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 96, clientX: 20, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 96, clientX: 45, clientY: 20 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 96, clientX: 45, clientY: 20 }));
    await Promise.resolve();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/folders/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: [3, 2] }),
    });
  });

  it('keeps the locked password entry indistinguishable from normal search', async () => {
    const locked = { ...navigationPayload(), folders: [], access: { required: true, unlocked: false } };
    const unlocked = { ...navigationPayload(), access: { required: true, unlocked: true } };
    apiRequest
      .mockResolvedValueOnce(locked)
      .mockResolvedValueOnce({ unlocked: true })
      .mockResolvedValueOnce(unlocked);

    const wrapper = await mountNavigationPage();
    const input = wrapper.get('.search-bar input');

    expect(input.attributes('type')).toBe('search');
    expect(input.attributes('placeholder')).toBe('搜索站内链接，回车继续搜索...');
    expect(wrapper.find('[data-testid="engine-trigger"]').exists()).toBe(true);
    expect(wrapper.find('.navigation-reveal-content').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('输入访问密码');
    expect(wrapper.text()).not.toContain('密码不正确');

    await input.setValue('nono');
    await wrapper.get('.search-bar').trigger('submit');
    await Promise.resolve();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledWith('/api/navigation/admin/unlock', {
      method: 'POST',
      body: JSON.stringify({ password: 'nono' }),
    });
    expect(wrapper.find('.navigation-reveal-content').exists()).toBe(true);
  });

  it('switches notabs without enter and leave transitions on the folder grid', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/NavigationPage.vue'), 'utf8');

    expect(source).toContain('<div class="adaptive-folder-grid">');
    expect(source).not.toContain('<TransitionGroup tag="div" name="folder-card" class="adaptive-folder-grid">');
    expect(source).not.toContain('.folder-card-enter-active');
    expect(source).not.toContain('.folder-card-leave-active');
    expect(source).not.toContain('.folder-card-move');
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
