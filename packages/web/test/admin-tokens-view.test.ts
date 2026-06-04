import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TokensView from '../src/views/admin/TokensView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

function mountTokensView() {
  return mount(TokensView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

async function settle(wrapper: ReturnType<typeof mountTokensView>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('TokensView governance workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows token summary, creates with a preset expiry, and revokes locally', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, name: 'Chrome extension', token: 'abc123...', expiresAt: null, createdAt: '2026-06-04T09:00:00.000Z' }])
      .mockResolvedValueOnce({ total: 1, active: 1, expired: 0, neverExpires: 1, expiringSoon: 0 })
      .mockResolvedValueOnce({ id: 2, name: 'CLI', token: 'secret-token', expiresAt: '2026-07-04T09:00:00.000Z', createdAt: '2026-06-04T09:00:00.000Z' })
      .mockResolvedValueOnce([
        { id: 1, name: 'Chrome extension', token: 'abc123...', expiresAt: null, createdAt: '2026-06-04T09:00:00.000Z' },
        { id: 2, name: 'CLI', token: 'secret...', expiresAt: '2026-07-04T09:00:00.000Z', createdAt: '2026-06-04T09:00:00.000Z' },
      ])
      .mockResolvedValueOnce({ total: 2, active: 2, expired: 0, neverExpires: 1, expiringSoon: 0 })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ total: 1, active: 1, expired: 0, neverExpires: 0, expiringSoon: 0 });

    const wrapper = mountTokensView();
    await settle(wrapper);

    expect(wrapper.text()).toContain('活跃 Token');
    expect(wrapper.text()).toContain('永久 Token');

    await wrapper.get('[data-testid="token-name"]').setValue('CLI');
    await wrapper.get('[data-testid="token-expiry-preset"]').setValue('30');
    await wrapper.get('form').trigger('submit');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/tokens', expect.objectContaining({ method: 'POST' }));
    expect(wrapper.text()).toContain('secret-token');

    await wrapper.get('[data-testid="revoke-token-1"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/tokens/1', { method: 'DELETE' });
    expect(wrapper.text()).not.toContain('Chrome extension');
  });
});
