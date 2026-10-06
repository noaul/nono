import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'abcdefghijklmnopqrstuvwx' } }) }));
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }) }));
vi.mock('@/composables/useToasts', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

describe('shared folder page', () => {
  beforeEach(() => apiRequest.mockReset());

  it('renders the shared folder tree read-only and marks the page noindex', async () => {
    apiRequest.mockResolvedValueOnce({
      folder: { id: 1, parentId: null, name: 'Reading', icon: null, description: 'Things worth reading' },
      folders: [
        { id: 1, parentId: null, name: 'Reading', icon: null, description: 'Things worth reading' },
        { id: 2, parentId: 1, name: 'Essays', icon: null, description: null },
      ],
      links: [{ id: 9, folderId: 2, name: 'On writing', url: 'https://essay.example/', icon: null, description: null }],
      expiresAt: null,
    });
    const { default: SharedFolderView } = await import('../src/views/SharedFolderView.vue');
    const wrapper = mount(SharedFolderView);
    await flushPromises();

    expect(apiRequest).toHaveBeenCalledWith('/api/share/abcdefghijklmnopqrstuvwx');
    expect(wrapper.get('[data-testid="share-title"]').text()).toBe('Reading');
    expect(wrapper.text()).toContain('Essays');
    expect(wrapper.get('[data-testid="share-link-9"]').attributes('href')).toBe('https://essay.example/');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
    wrapper.unmount();
  });

  it('explains an unavailable link', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Share not found'));
    const { default: SharedFolderView } = await import('../src/views/SharedFolderView.vue');
    const wrapper = mount(SharedFolderView);
    await flushPromises();
    expect(wrapper.find('[data-testid="share-missing"]').exists()).toBe(true);
  });
});

describe('folder share panel', () => {
  beforeEach(() => apiRequest.mockReset());

  it('creates a share with the chosen expiry and revokes it', async () => {
    const share = { id: 4, folderId: 3, path: '/s/token', expiresAt: null, expired: false, viewCount: 0, lastViewedAt: null, createdAt: '2026-10-06T00:00:00.000Z' };
    apiRequest.mockResolvedValueOnce([]).mockResolvedValueOnce(share).mockResolvedValueOnce({ ok: true });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { default: FolderSharePanel } = await import('../src/components/admin/FolderSharePanel.vue');
    const wrapper = mount(FolderSharePanel, { props: { folder: { id: 3, userId: 1, name: 'Docs', sortOrder: 0 } } });
    await flushPromises();

    await wrapper.get('[data-testid="share-expiry"]').setValue('7');
    await wrapper.get('[data-testid="create-share"]').trigger('click');
    await flushPromises();
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/folders/3/shares', { method: 'POST', body: JSON.stringify({ expiresInDays: 7 }) });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/s/token`);

    await wrapper.get('[data-testid="revoke-share-4"]').trigger('click');
    await flushPromises();
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/shares/4', { method: 'DELETE' });
    expect(wrapper.find('[data-testid="share-4"]').exists()).toBe(false);
  });
});
