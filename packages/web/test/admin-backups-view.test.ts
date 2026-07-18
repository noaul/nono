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

const automationSnapshot = {
  settings: { enabled: false, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 14 },
  status: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
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
      .mockResolvedValueOnce(automationSnapshot)
      .mockResolvedValueOnce({
        backup: secondBackup,
        automation: {
          ...automationSnapshot,
          status: { lastSuccessAt: '2026-07-18T13:00:00.000Z', lastFailureAt: null, lastError: null },
        },
      })
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
    expect(wrapper.text()).not.toContain('最近成功：暂无');

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

  it('configures automatic backups and retention from the backup page', async () => {
    apiRequest.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/admin/backups') return { backups: [firstBackup] };
      if (url === '/api/admin/backups/automation' && options?.method === 'PUT') {
        return {
          settings: { enabled: true, cadence: 'weekly', hour: 4, weekday: 1, retentionDays: 45, maxBackups: 10 },
          status: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
        };
      }
      if (url === '/api/admin/backups/automation') {
        return {
          settings: { enabled: false, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 14 },
          status: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const wrapper = await mountBackupsView();
    expect(wrapper.find('[data-testid="backup-automation-enabled"]').exists()).toBe(true);
    await wrapper.get('[data-testid="backup-automation-enabled"]').setValue(true);
    await wrapper.get('[data-testid="backup-cadence"]').setValue('weekly');
    await wrapper.get('[data-testid="backup-hour"]').setValue('4');
    await wrapper.get('[data-testid="backup-weekday"]').setValue('1');
    await wrapper.get('[data-testid="backup-retention-days"]').setValue('45');
    await wrapper.get('[data-testid="backup-max-count"]').setValue('10');
    await wrapper.get('[data-testid="save-backup-automation"]').trigger('click');
    await flushPromises();

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/backups/automation', expect.objectContaining({ method: 'PUT' }));
    const request = apiRequest.mock.calls.find(([url, options]) => url === '/api/admin/backups/automation' && options?.method === 'PUT');
    expect(JSON.parse(request?.[1]?.body as string)).toMatchObject({
      enabled: true,
      cadence: 'weekly',
      hour: 4,
      weekday: 1,
      retentionDays: 45,
      maxBackups: 10,
    });
  });
});
