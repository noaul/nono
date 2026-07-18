import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const confirm = vi.fn().mockResolvedValue(true);
const viewModulePath = '../src/views/admin/BackupsView.vue';

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm }),
}));

const firstBackup = {
  id: '20260718T120000Z',
  filename: 'nono-backup-20260718T120000Z.tar.gz',
  createdAt: '2026-07-18T12:00:00.000Z',
  sourceCommit: 'abcdef123456',
  size: 1536,
  sha256: 'a'.repeat(64),
  status: 'verified',
  components: ['postgres', 'nodesk', 'nomoney'],
};

async function mountBackupsView() {
  const { default: BackupsView } = await import(viewModulePath);
  const wrapper = mount(BackupsView, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('BackupsView', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    confirm.mockClear();
  });

  it('lists, creates, downloads and deletes verified full backups', async () => {
    const secondBackup = {
      ...firstBackup,
      id: '20260718T130000Z',
      filename: 'nono-backup-20260718T130000Z.tar.gz',
      createdAt: '2026-07-18T13:00:00.000Z',
      sha256: 'b'.repeat(64),
    };
    apiRequest
      .mockResolvedValueOnce({ backups: [firstBackup] })
      .mockResolvedValueOnce({ backup: secondBackup })
      .mockResolvedValueOnce({ ok: true });

    const wrapper = await mountBackupsView();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/backups');
    expect(wrapper.text()).toContain('PostgreSQL');
    expect(wrapper.text()).toContain('Nodesk');
    expect(wrapper.text()).toContain('NoMoney');
    expect(wrapper.text()).toContain('1.5 KB');
    expect(wrapper.get(`[data-testid="download-backup-${firstBackup.id}"]`).attributes('href')).toBe(`/api/admin/backups/${firstBackup.id}/download`);

    await wrapper.get('[data-testid="create-backup"]').trigger('click');
    await flushPromises();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/backups', { method: 'POST' });
    expect(wrapper.find(`[data-testid="backup-${secondBackup.id}"]`).exists()).toBe(true);

    await wrapper.get(`[data-testid="delete-backup-${firstBackup.id}"]`).trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalled();
    expect(apiRequest).toHaveBeenCalledWith(`/api/admin/backups/${firstBackup.id}`, { method: 'DELETE' });
    expect(wrapper.find(`[data-testid="backup-${firstBackup.id}"]`).exists()).toBe(false);
  });

  it('registers an admin-only route and system navigation item', () => {
    const router = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminLayout.vue'), 'utf8');

    expect(router).toContain("const BackupsView = () => import('@/views/admin/BackupsView.vue')");
    expect(router).toMatch(/path:\s*'\/admin\/backups'[\s\S]*requiresAdmin:\s*true/);
    expect(layout).toMatch(/to:\s*'\/admin\/backups'[\s\S]*adminOnly:\s*true/);
  });
});
