import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { clearCapture, onCaptureSaved, receiveCapture } from '@/mobile/capture';

const apiRequest = vi.fn();

enableAutoUnmount(afterEach);

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const requestId = '0b6f5a3e-8c1d-4f6a-9b2e-7d4c3a1f0e9b';
const folders = [
  { id: 1, userId: 1, parentId: null, name: 'Work', sortOrder: 20 },
  { id: 2, userId: 1, parentId: 1, name: 'Reading', sortOrder: 10 },
];

async function mountView() {
  const { default: MobileCaptureView } = await import('../src/views/mobile/MobileCaptureView.vue');
  const wrapper = mount(MobileCaptureView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
  await flushPromises();
  return wrapper;
}

describe('MobileCaptureView', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    window.localStorage.clear();
    clearCapture();
  });

  afterEach(() => clearCapture());

  it('shows an empty state and loads nothing without a pending share', async () => {
    const wrapper = await mountView();

    expect(wrapper.find('[data-testid="capture-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="capture-form"]').exists()).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('prefills the form from the share and lists folders with their path', async () => {
    apiRequest.mockResolvedValueOnce(folders);
    receiveCapture({ requestId, url: 'https://example.com/a', title: 'Shared title' });
    const wrapper = await mountView();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/folders');
    expect((wrapper.get('#capture-name').element as HTMLInputElement).value).toBe('Shared title');
    expect((wrapper.get('#capture-url').element as HTMLInputElement).value).toBe('https://example.com/a');
    const options = wrapper.findAll('[data-testid="capture-folder"] option').map((option) => option.text());
    expect(options).toEqual(['Work', 'Work / Reading']);
    expect((wrapper.get('[data-testid="capture-folder"]').element as HTMLSelectElement).value).toBe('2');
  });

  it('offers a retry when folders fail to load', async () => {
    apiRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(folders);
    receiveCapture({ requestId, url: 'https://example.com/a' });
    const wrapper = await mountView();

    expect(wrapper.get('[data-testid="capture-folders-error"]').text()).toContain('offline');
    expect(wrapper.get('[data-testid="capture-save"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="capture-retry-folders"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="capture-folders-error"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="capture-save"]').attributes('disabled')).toBeUndefined();
  });

  it('saves with the share requestId, shows the result and tells the bridge', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    apiRequest
      .mockResolvedValueOnce(folders)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    const bridge = vi.fn();
    const stop = onCaptureSaved(bridge);
    receiveCapture({ requestId, url: 'https://example.com/a', title: 'Shared title' });
    const wrapper = await mountView();
    await wrapper.get('#capture-description').setValue('  read later ');

    await wrapper.get('[data-testid="capture-form"]').trigger('submit');
    await flushPromises();

    const save = wrapper.get('[data-testid="capture-save"]');
    expect(save.attributes('disabled')).toBeDefined();
    expect(save.text()).toContain('保存中');
    const [url, options] = apiRequest.mock.calls[1];
    expect(url).toBe('/api/mobile/bookmarks');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ requestId, folderId: 2, name: 'Shared title', url: 'https://example.com/a', description: 'read later' });

    resolveSave({ id: 9, folderId: 2, name: 'Shared title', url: 'https://example.com/a', sortOrder: 0 });
    await flushPromises();

    expect(wrapper.get('[data-testid="capture-saved"]').text()).toContain('Work / Reading');
    expect(wrapper.get('[data-testid="capture-saved"]').text()).toContain('https://example.com/a');
    expect(bridge).toHaveBeenCalledWith(requestId);
    expect(window.localStorage.getItem('nono:mobile-capture-folder')).toBe('2');
    stop();
  });

  it('says so when the URL was already bookmarked', async () => {
    apiRequest.mockResolvedValueOnce(folders).mockResolvedValueOnce({ id: 3, folderId: 1, name: 'Old', url: 'https://example.com/a', sortOrder: 0, existing: true });
    receiveCapture({ requestId, url: 'https://example.com/a' });
    const wrapper = await mountView();

    await wrapper.get('[data-testid="capture-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-testid="capture-saved"]').text()).toContain('没有重复保存');
  });

  it('does not clear a newer share when the preceding save completes', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    apiRequest.mockResolvedValueOnce(folders).mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    const acknowledged = vi.fn();
    const stop = onCaptureSaved(acknowledged);
    receiveCapture({ requestId, url: 'https://example.com/first' });
    const wrapper = await mountView();
    await wrapper.get('[data-testid="capture-form"]').trigger('submit');
    receiveCapture({ requestId: 'new-share-request', url: 'https://example.com/second', title: 'Second' });
    resolveSave({ id: 9, folderId: 2, name: 'First', url: 'https://example.com/first' });
    await flushPromises();
    expect(acknowledged).toHaveBeenCalledWith(requestId);
    expect(acknowledged).not.toHaveBeenCalledWith('new-share-request');
    expect(wrapper.find('[data-testid="capture-saved"]').exists()).toBe(false);
    expect((wrapper.get('#capture-url').element as HTMLInputElement).value).toBe('https://example.com/second');
    stop();
  });

  it('keeps the form and allows a retry after a failed save', async () => {
    apiRequest
      .mockResolvedValueOnce(folders)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError('conflict', 409));
    receiveCapture({ requestId, url: 'https://example.com/a', title: 'Shared title' });
    const wrapper = await mountView();

    await wrapper.get('[data-testid="capture-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="capture-save-error"]').text()).toContain('网络连接失败');
    expect(wrapper.get('[data-testid="capture-save"]').text()).toContain('重试保存');
    expect((wrapper.get('#capture-name').element as HTMLInputElement).value).toBe('Shared title');

    await wrapper.get('[data-testid="capture-form"]').trigger('submit');
    await flushPromises();
    expect(JSON.parse(apiRequest.mock.calls[2][1].body).requestId).toBe(requestId);
    expect(wrapper.get('[data-testid="capture-save-error"]').text()).toContain('不同内容');
  });

  it('blocks saving an edited URL that is not http(s)', async () => {
    apiRequest.mockResolvedValueOnce(folders);
    receiveCapture({ requestId, url: 'https://example.com/a' });
    const wrapper = await mountView();

    await wrapper.get('#capture-url').setValue('javascript:alert(1)');

    expect(wrapper.get('[data-testid="capture-save"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="capture-form"]').trigger('submit');
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe('/mobile/capture route', () => {
  it('requires sign-in and returns to the path without carrying any query', async () => {
    vi.resetModules();
    vi.doMock('@/api/client', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/api/client')>()),
      apiRequest: async () => ({ authenticated: false, setupRequired: false, user: null }),
    }));
    const { createPinia, setActivePinia } = await import('pinia');
    setActivePinia(createPinia());
    const { router } = await import('../src/router');

    await router.push('/mobile/capture?url=https%3A%2F%2Fleak.example');

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query).toEqual({ next: '/mobile/capture' });
    vi.doUnmock('@/api/client');
  });
});
