import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }) {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value[0] : String(value)).split(';', 1)[0];
}

describe('operation audit logs', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let memberCookie: string;

  beforeEach(async () => {
    const repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password },
    });
    adminCookie = sessionCookie(setup);

    await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { cookie: adminCookie },
      payload: { allowRegistration: true },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'member', email: 'member@nono.test', displayName: 'Member', password },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'member', password },
    });
    memberCookie = sessionCookie(login);
  });

  afterEach(async () => {
    await app.close();
  });

  it('records initial setup and self-registration as user creation events', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?resourceType=user&action=create&pageSize=20',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.total).toBe(2);
    expect(response.json().data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorUsername: 'admin', resourceLabel: 'admin', result: 'success' }),
      expect.objectContaining({ actorUsername: 'member', resourceLabel: 'member', result: 'success' }),
    ]));
    expect(JSON.stringify(response.json().data.items)).not.toContain(password);
  });

  it('records successful and failed mutations without retaining secrets', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      remoteAddress: '127.0.0.1',
      headers: { cookie: adminCookie, 'x-forwarded-for': '203.0.113.9', 'user-agent': 'NoNo audit test' },
      payload: { name: '工作台', parentId: null, password: 'FolderSecret2026!' },
    });
    expect(created.statusCode).toBe(200);
    const folderId = created.json().data.id as number;

    const failed = await app.inject({
      method: 'PUT',
      url: `/api/admin/folders/${folderId}`,
      headers: { cookie: adminCookie },
      payload: { parentId: folderId },
    });
    expect(failed.statusCode).toBe(400);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?page=1&pageSize=20',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ page: 1, pageSize: 20 });
    const items = response.json().data.items as Array<Record<string, any>>;
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorUsername: 'admin',
        action: 'create',
        resourceType: 'notab',
        resourceLabel: '工作台',
        result: 'success',
        ipAddress: '203.0.113.9',
      }),
      expect.objectContaining({ action: 'update', resourceType: 'folder', result: 'failure' }),
    ]));
    expect(items.find((item) => item.result === 'failure')?.details).toMatchObject({ error: 'Folder cannot be its own parent' });
    expect(JSON.stringify(items)).not.toContain('FolderSecret2026!');
    expect(JSON.stringify(items)).not.toContain('passwordHash');
  });

  it('lets administrators filter records but rejects ordinary members', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: memberCookie },
      payload: { name: '成员分类', parentId: null },
    });

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/audit',
      headers: { cookie: memberCookie },
    });
    expect(forbidden.statusCode).toBe(403);

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?actor=member&resourceType=notab&result=success&pageSize=10',
      headers: { cookie: adminCookie },
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data.total).toBe(1);
    expect(filtered.json().data.items[0]).toMatchObject({ actorUsername: 'member', resourceLabel: '成员分类' });
  });

  it('configures retention and never exposes generated API tokens in audit details', async () => {
    const token = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie: adminCookie },
      payload: { name: '自动收藏' },
    });
    expect(token.statusCode).toBe(200);
    const generatedToken = token.json().data.token as string;

    const initial = await app.inject({ method: 'GET', url: '/api/admin/audit/settings', headers: { cookie: adminCookie } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().data.retentionDays).toBe(180);

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/admin/audit/settings',
      headers: { cookie: adminCookie },
      payload: { retentionDays: 90 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.retentionDays).toBe(90);

    const logs = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?resourceType=token',
      headers: { cookie: adminCookie },
    });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'create', resourceType: 'token', resourceLabel: '自动收藏' }),
    ]));
    expect(JSON.stringify(logs.json().data.items)).not.toContain(generatedToken);
  });

  it('captures before and after snapshots for core administrative edits', async () => {
    const notab = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: adminCookie },
      payload: { name: '研究', parentId: null },
    });
    const folder = await app.inject({
      method: 'POST',
      url: '/api/admin/folders',
      headers: { cookie: adminCookie },
      payload: { name: '资料', parentId: notab.json().data.id },
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/admin/links',
      headers: { cookie: adminCookie },
      payload: { folderId: folder.json().data.id, nameMode: 'manual', name: '旧名称', url: 'https://example.com/docs' },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/admin/links/${link.json().data.id}`,
      headers: { cookie: adminCookie },
      payload: { name: '文档库' },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie: adminCookie },
      payload: { name: 'NoNo 工作台' },
    });
    const users = await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: adminCookie } });
    const memberId = users.json().data.find((user: any) => user.username === 'member').id as number;
    await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${memberId}`,
      headers: { cookie: adminCookie },
      payload: { displayName: '成员二号' },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/admin/backups/automation',
      headers: { cookie: adminCookie },
      payload: { enabled: true, cadence: 'daily', hour: 4, weekday: 0, retentionDays: 30, maxBackups: 14 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?action=update&pageSize=100',
      headers: { cookie: adminCookie },
    });
    const items = response.json().data.items as Array<Record<string, any>>;
    expect(items.find((item) => item.resourceType === 'bookmark')).toMatchObject({
      resourceLabel: '文档库',
      details: { before: { name: '旧名称' }, after: { name: '文档库' } },
    });
    expect(items.find((item) => item.resourceType === 'site')).toMatchObject({
      resourceLabel: 'NoNo 工作台',
      details: { before: { name: 'NoNo' }, after: { name: 'NoNo 工作台' } },
    });
    expect(items.find((item) => item.resourceType === 'user')).toMatchObject({
      resourceLabel: 'member',
      details: { before: { displayName: 'Member' }, after: { displayName: '成员二号' } },
    });
    expect(items.find((item) => item.resourceType === 'backup')).toMatchObject({
      action: 'update',
      details: { before: { settings: { enabled: false } }, after: { settings: { enabled: true } } },
    });
  });

  it('keeps a readable snapshot when a token is deleted', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/tokens',
      headers: { cookie: adminCookie },
      payload: { name: '稍后删除' },
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/admin/tokens/${created.json().data.id}`,
      headers: { cookie: adminCookie },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?resourceType=token&action=delete',
      headers: { cookie: adminCookie },
    });
    expect(response.json().data.items[0]).toMatchObject({
      resourceLabel: '稍后删除',
      details: { before: { name: '稍后删除' } },
    });
  });
});
