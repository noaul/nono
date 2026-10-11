import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let app: FastifyInstance;
let repo: MemoryRepository;

async function setupAdmin() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password: 'Password2026!' },
  });
  const cookie = response.headers['set-cookie'];
  return Array.isArray(cookie) ? cookie[0] : String(cookie);
}

const task = { id: 'task-1', title: 'Write the report', completed: false, createdAt: '2026-10-03T08:00:00.000Z' };
const event = { id: 'event-1', title: 'Stand-up', date: '2026-10-04', time: '09:30', note: 'Room 2' };

describe('NoDesk planner sync', () => {
  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey });
  });

  it('starts empty with no revision so a browser can migrate its local tasks', async () => {
    const cookie = await setupAdmin();
    const response = await app.inject({ method: 'GET', url: '/api/admin/nodesk/planner', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ tasks: [], events: [], updatedAt: null });
  });

  it('stores tasks and events in the site settings, so account backups carry them', async () => {
    const cookie = await setupAdmin();
    const saved = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [task], events: [event] } });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().data).toMatchObject({ tasks: [task], events: [event] });
    expect(Date.parse(saved.json().data.updatedAt)).not.toBeNaN();

    const loaded = await app.inject({ method: 'GET', url: '/api/admin/nodesk/planner', headers: { cookie } });
    expect(loaded.json().data).toEqual(saved.json().data);
    const site = await repo.getSite(1);
    expect(site?.settings.nodeskPlanner).toEqual(saved.json().data);
  });

  it('rejects malformed items instead of storing them', async () => {
    const cookie = await setupAdmin();
    const badDate = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [], events: [{ ...event, date: 'tomorrow' }] } });
    const emptyTitle = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [{ ...task, title: ' ' }], events: [] } });

    expect(badDate.statusCode).toBe(400);
    expect(emptyTitle.statusCode).toBe(400);
  });

  it('rejects a save based on an outdated copy with the current one, so the client can merge', async () => {
    const cookie = await setupAdmin();
    const first = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [task], events: [], baseUpdatedAt: null } });
    expect(first.statusCode).toBe(200);
    const revision = first.json().data.updatedAt;

    const stale = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [], events: [], baseUpdatedAt: null } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().data).toEqual({ tasks: [task], events: [], updatedAt: revision });

    const current = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [], events: [event], baseUpdatedAt: revision } });
    expect(current.statusCode).toBe(200);
    const unconditional = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [task], events: [] } });
    expect(unconditional.statusCode).toBe(200);
  });

  it('keeps frequent planner saves out of the audit log', async () => {
    const cookie = await setupAdmin();
    const before = repo.auditLogs.length;
    await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [task], events: [] } });

    expect(repo.auditLogs.length).toBe(before);
  });

  it('never serves the planner through the public navigation API, locked or not', async () => {
    const cookie = await setupAdmin();
    await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [task], events: [event] } });
    await app.inject({ method: 'PUT', url: '/api/admin/nodesk/workbench', headers: { cookie }, payload: { quickEntriesVisible: false } });

    const open = await app.inject({ method: 'GET', url: '/api/navigation/admin' });
    expect(open.statusCode).toBe(200);
    expect(open.json().data.site.settings).not.toHaveProperty('nodeskPlanner');
    expect(open.json().data.site.settings.nodeskWorkbench).toEqual({ quickEntriesVisible: false });
    expect(open.body).not.toContain('Write the report');

    await app.inject({ method: 'PUT', url: '/api/admin/site', headers: { cookie }, payload: { guestAccessEnabled: true, guestAccessPassword: 'GuestAccess2026!' } });
    const locked = await app.inject({ method: 'GET', url: '/api/navigation/admin' });
    expect(locked.json().data.access).toMatchObject({ required: true, unlocked: false });
    expect(locked.json().data.site.settings).not.toHaveProperty('nodeskPlanner');
    expect(locked.body).not.toContain('Stand-up');
  });

  it('keeps the planner and workbench when a stale tab saves its site settings snapshot', async () => {
    const cookie = await setupAdmin();
    const stale = (await app.inject({ method: 'GET', url: '/api/admin/site', headers: { cookie } })).json().data.settings;
    await app.inject({ method: 'PUT', url: '/api/admin/site', headers: { cookie }, payload: { settings: { ...stale, i18n: { defaultLocale: 'en' } } } });
    const saved = await app.inject({ method: 'PUT', url: '/api/admin/nodesk/planner', headers: { cookie }, payload: { tasks: [task], events: [event] } });
    await app.inject({ method: 'PUT', url: '/api/admin/nodesk/workbench', headers: { cookie }, payload: { quickEntriesVisible: false } });

    const overwrite = await app.inject({
      method: 'PUT',
      url: '/api/admin/site',
      headers: { cookie },
      payload: { settings: { ...stale, nodeskPlanner: { tasks: [], events: [], updatedAt: null }, nodeskWorkbench: { quickEntriesVisible: true } } },
    });
    expect(overwrite.statusCode).toBe(200);
    const settings = (await repo.getSite(1))?.settings;
    expect(settings?.nodeskPlanner).toEqual(saved.json().data);
    expect(settings?.nodeskWorkbench).toEqual({ quickEntriesVisible: false });
    // Keys the request leaves out keep their stored value.
    expect(settings?.i18n).toEqual({ defaultLocale: 'en' });

    const partial = await app.inject({ method: 'PUT', url: '/api/admin/site', headers: { cookie }, payload: { settings: { navigationEntries: [] } } });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().data.settings).toMatchObject({ i18n: { defaultLocale: 'en' }, navigationEntries: [], nodeskWorkbench: { quickEntriesVisible: false } });
  });

  it('is only for a signed-in administrator', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/nodesk/planner' });
    expect(response.statusCode).toBe(401);
  });
});
