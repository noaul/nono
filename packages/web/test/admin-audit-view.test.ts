import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLogsView from '../src/views/admin/AuditLogsView.vue';
import { apiRequest } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  apiRequest: vi.fn(),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

const mockedApiRequest = vi.mocked(apiRequest);
const auditPage = {
  total: 120,
  page: 1,
  pageSize: 50,
  items: [
    {
      id: 1,
      actorUserId: 1,
      actorUsername: 'admin',
      actorRole: 'admin',
      action: 'update',
      resourceType: 'bookmark',
      resourceId: '8',
      resourceLabel: '文档库',
      result: 'success',
      statusCode: 200,
      ipAddress: '203.0.113.9',
      userAgent: 'Chrome',
      details: { before: { name: '旧名称' }, after: { name: '文档库' } },
      createdAt: '2026-07-18T10:00:00.000Z',
    },
    {
      id: 2,
      actorUserId: 1,
      actorUsername: 'admin',
      actorRole: 'admin',
      action: 'delete',
      resourceType: 'backup',
      resourceId: '20260718T100000Z',
      resourceLabel: '20260718T100000Z',
      result: 'failure',
      statusCode: 500,
      ipAddress: '203.0.113.9',
      userAgent: 'Chrome',
      details: { backupId: '20260718T100000Z' },
      createdAt: '2026-07-18T09:30:00.000Z',
    },
  ],
};

describe('AuditLogsView', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockImplementation(async (url) => {
      if (url === '/api/admin/audit/settings') {
        return { id: 1, retentionDays: 180, createdAt: '', updatedAt: '' } as any;
      }
      return structuredClone(auditPage) as any;
    });
  });

  it('loads the audit feed and expands structured changes', async () => {
    const wrapper = mount(AuditLogsView);
    await flushPromises();

    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/audit?page=1&pageSize=50');
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/audit/settings');
    expect(wrapper.findAll('[data-testid^="audit-row-"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('文档库');
    expect(wrapper.text()).toContain('失败');

    await wrapper.get('[data-testid="audit-expand-1"]').trigger('click');
    expect(wrapper.get('[data-testid="audit-details-1"]').text()).toContain('旧名称');
    expect(wrapper.get('[data-testid="audit-details-1"]').text()).toContain('文档库');
  });

  it('applies combined filters and resets pagination', async () => {
    const wrapper = mount(AuditLogsView);
    await flushPromises();

    await wrapper.get('[data-testid="audit-search"]').setValue('文档');
    await wrapper.get('[data-testid="audit-actor"]').setValue('admin');
    await wrapper.get('[data-testid="audit-resource"]').setValue('bookmark');
    await wrapper.get('[data-testid="audit-result"]').setValue('success');
    await wrapper.get('[data-testid="audit-filter-form"]').trigger('submit');
    await flushPromises();

    const url = String(mockedApiRequest.mock.calls.at(-1)?.[0]);
    expect(url).toContain('/api/admin/audit?page=1&pageSize=50');
    expect(url).toContain('search=%E6%96%87%E6%A1%A3');
    expect(url).toContain('actor=admin');
    expect(url).toContain('resourceType=bookmark');
    expect(url).toContain('result=success');
  });

  it('updates retention and moves to the next page', async () => {
    mockedApiRequest.mockImplementation(async (url, options) => {
      if (url === '/api/admin/audit/settings' && options?.method === 'PUT') {
        return { id: 1, retentionDays: 90, removed: 3, createdAt: '', updatedAt: '' } as any;
      }
      if (url === '/api/admin/audit/settings') return { id: 1, retentionDays: 180, createdAt: '', updatedAt: '' } as any;
      return structuredClone(auditPage) as any;
    });
    const wrapper = mount(AuditLogsView);
    await flushPromises();

    await wrapper.get('[data-testid="audit-retention-days"]').setValue(90);
    await wrapper.get('[data-testid="audit-save-retention"]').trigger('click');
    await flushPromises();
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/audit/settings', {
      method: 'PUT',
      body: JSON.stringify({ retentionDays: 90 }),
    });

    await wrapper.get('[data-testid="audit-next"]').trigger('click');
    await flushPromises();
    expect(String(mockedApiRequest.mock.calls.at(-1)?.[0])).toContain('/api/admin/audit?page=2&pageSize=50');
  });
});
