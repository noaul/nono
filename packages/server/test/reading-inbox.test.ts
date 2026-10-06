import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let app: FastifyInstance;
let cookie: string;
let folderId: number;

async function save(payload: Record<string, unknown>) {
  return (await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, ...payload } })).json().data;
}

async function update(id: number, payload: Record<string, unknown>) {
  return (await app.inject({ method: 'PUT', url: `/api/admin/links/${id}`, headers: { cookie }, payload })).json().data;
}

async function inbox(status = 'unread') {
  return (await app.inject({ method: 'GET', url: `/api/admin/reading?status=${status}`, headers: { cookie } })).json().data;
}

describe('reading inbox', () => {
  beforeEach(async () => {
    app = await buildApp({ repo: new MemoryRepository(false), sessionSecret, encryptionKey } as any);
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'a@nono.test', displayName: 'Admin', password: 'Password2026!' } });
    cookie = String(setup.headers['set-cookie']).split(';', 1)[0];
    folderId = (await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Inbox' } })).json().data.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('queues links saved for later and lists them newest first with their folder path', async () => {
    await save({ name: 'Plain', url: 'https://plain.example/' });
    const first = await save({ name: 'First', url: 'https://first.example/', readLater: true });
    const second = await save({ name: 'Second', url: 'https://second.example/', readLater: true });
    expect(first.readLaterAt).toBeTruthy();

    const page = await inbox();
    expect(page.items.map((item: any) => item.id)).toEqual([second.id, first.id]);
    expect(page.items[0].folderPath).toEqual(['Inbox']);
    expect(page).toMatchObject({ total: 2, unread: 2 });
  });

  it('queues an already bookmarked URL instead of saving a duplicate', async () => {
    const original = await save({ name: 'Doc', url: 'https://doc.example/' });
    const again = await save({ name: 'Doc again', url: 'https://doc.example/', readLater: true });

    expect(again).toMatchObject({ id: original.id, existing: true });
    expect(again.readLaterAt).toBeTruthy();
    expect((await inbox()).total).toBe(1);
  });

  it('moves links between unread and read, and out of the inbox', async () => {
    const link = await save({ name: 'Article', url: 'https://article.example/', readLater: true });

    const read = await update(link.id, { read: true });
    expect(read.readAt).toBeTruthy();
    expect((await inbox()).total).toBe(0);
    expect((await inbox('read')).items[0].id).toBe(link.id);

    await update(link.id, { read: false });
    expect((await inbox()).total).toBe(1);

    const removed = await update(link.id, { readLater: false });
    expect(removed).toMatchObject({ readLaterAt: null, readAt: null });
    expect((await inbox()).total).toBe(0);
  });

  it('lets an extension token read the inbox', async () => {
    const token = (await app.inject({ method: 'POST', url: '/api/admin/tokens', headers: { cookie }, payload: { name: 'Ext', scopes: ['bookmarks:read'] } })).json().data.token;
    const response = await app.inject({ method: 'GET', url: '/api/admin/reading', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
  });
});
