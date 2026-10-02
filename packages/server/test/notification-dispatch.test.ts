import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import {
  decodeChannelConfig,
  deliverToChannel,
  encodeChannelConfig,
  publicChannel,
  type ChannelDeliveryDeps,
} from '../src/services/notification-channels.service.js';
import { createNotificationDispatcher, MAX_DELIVERY_ATTEMPTS } from '../src/services/notification-dispatch.service.js';
import type { NotificationItem } from '../src/services/notification.service.js';

const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const sessionSecret = 'test-session-secret-that-is-long-enough';
const admin = { id: 1, username: 'admin', email: 'a@x', displayName: 'Admin', role: 'admin' as const };
const reader = { id: 2, username: 'reader', email: 'r@x', displayName: 'Reader', role: 'user' as const };

/** Just enough of Prisma's notification tables for the dispatcher and routes. */
function fakePrisma(users = [admin, reader]) {
  let channelId = 0;
  let deliveryId = 0;
  const channels: any[] = [];
  const deliveries: any[] = [];
  const appConfig: any = { id: 1, notificationChannelsImportedAt: null };
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const prisma = {
    channels,
    deliveries,
    appConfig: {
      findUnique: async () => appConfig,
      upsert: async ({ update }: any) => Object.assign(appConfig, update),
    },
    user: {
      findFirst: async ({ where }: any) => users.find((user) => matches(user, where)) ?? null,
      findUnique: async ({ where }: any) => users.find((user) => user.id === where.id) ?? null,
    },
    notificationChannel: {
      findMany: async ({ where = {}, distinct }: any = {}) => {
        const rows = channels.filter((row) => matches(row, where));
        if (distinct) return [...new Map(rows.map((row) => [row.userId, { userId: row.userId }])).values()];
        return rows;
      },
      findFirst: async ({ where }: any) => channels.find((row) => matches(row, where)) ?? null,
      count: async ({ where }: any) => channels.filter((row) => matches(row, where)).length,
      create: async ({ data }: any) => {
        const row = { enabled: true, minSeverity: 'warning', lastSuccessAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date(), ...data, id: ++channelId };
        channels.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = channels.find((item) => item.id === where.id);
        for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value;
        return row;
      },
      delete: async ({ where }: any) => {
        channels.splice(channels.findIndex((item) => item.id === where.id), 1);
      },
    },
    notificationDelivery: {
      findMany: async ({ where, take }: any) => {
        const rows = deliveries.filter((row) => matches(row, where)).map((row) => ({ ...row, channel: channels.find((item) => item.id === row.channelId) }));
        return take ? rows.slice(0, take) : rows;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = deliveries.find((row) => row.channelId === where.channelId_key.channelId && row.key === where.channelId_key.key);
        if (!existing) {
          const row = { attempts: 1, updatedAt: new Date(), ...create, id: ++deliveryId };
          deliveries.push(row);
          return row;
        }
        Object.assign(existing, { status: update.status, error: update.error, attempts: existing.attempts + update.attempts.increment });
        return existing;
      },
    },
  };
  return prisma;
}

function item(key: string, overrides: Partial<NotificationItem> = {}): NotificationItem {
  return { key, source: 'links', severity: 'warning', title: `Title ${key}`, description: 'desc', href: '/admin/links', occurredAt: '', dueAt: null, read: false, ...overrides };
}

function deliveryDeps(overrides: Partial<ChannelDeliveryDeps> = {}) {
  const posts: { url: string; body: any }[] = [];
  const deps: ChannelDeliveryDeps = {
    encryptionKey,
    privateOutboundHosts: [],
    publicAddressResolver: vi.fn(async () => ({ address: '93.184.216.34', family: 4 as const })),
    safeRequester: vi.fn(async (url: string, options: any) => {
      posts.push({ url, body: JSON.parse(String(options.body)) });
      return { statusCode: 200, headers: {}, body: Buffer.from('{}') };
    }) as any,
    sendMail: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, posts };
}

async function addChannel(prisma: ReturnType<typeof fakePrisma>, data: { userId?: number; type: any; config: any; minSeverity?: string; name?: string }) {
  return prisma.notificationChannel.create({
    data: { userId: data.userId ?? admin.id, type: data.type, name: data.name ?? data.type, minSeverity: data.minSeverity ?? 'warning', config: encodeChannelConfig(data.type, data.config, null, encryptionKey) },
  });
}

describe('notification channel config', () => {
  it('encrypts secrets, keeps them when left blank and never returns them', () => {
    const stored = encodeChannelConfig('telegram', { botToken: 'tg-secret', chatId: '42' }, null, encryptionKey);
    expect(JSON.stringify(stored)).not.toContain('tg-secret');
    const kept = encodeChannelConfig('telegram', { botToken: '', chatId: '43' }, stored, encryptionKey);
    expect(decodeChannelConfig({ type: 'telegram', config: kept }, encryptionKey)).toEqual({ botToken: 'tg-secret', chatId: '43' });

    const view = publicChannel({ id: 1, userId: 1, type: 'telegram', name: 'TG', enabled: true, minSeverity: 'info', config: kept, lastSuccessAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date() });
    expect(view.config).toEqual({ botToken: '', botTokenSet: true, chatId: '43' });
  });

  it('rejects channels missing a required secret or with an invalid webhook URL', () => {
    expect(() => encodeChannelConfig('bark', { url: '' }, null, encryptionKey)).toThrow('Bark URL is required');
    expect(() => encodeChannelConfig('webhook', { url: 'ftp://x' }, null, encryptionKey)).toThrow();
  });
});

describe('deliverToChannel', () => {
  const channel = (type: string, config: Record<string, unknown>) => ({ id: 1, userId: 1, type, name: type, enabled: true, minSeverity: 'info', config: encodeChannelConfig(type as any, config, null, encryptionKey), lastSuccessAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date() });

  it.each(['telegram', 'bark'] as const)('%s sends every Unicode character in bounded parts', async (type) => {
    const { deps, posts } = deliveryDeps();
    const message = { subject: 'Notice', text: 'a'.repeat(2999) + '😀中文'.repeat(3000) };
    await deliverToChannel(deps, channel(type, type === 'telegram' ? { botToken: 't', chatId: '1' } : { url: 'https://api.day.app/key/' }), message, { allowPrivateSmtp: true });
    const parts = posts.map((post) => (type === 'telegram' ? post.body.text : post.body.body));
    expect(parts.join('')).toBe(type === 'telegram' ? `${message.subject}\n\n${message.text}` : message.text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(type === 'telegram' ? 4000 : 3000);
    if (type === 'bark') expect(posts[0].url).toBe('https://api.day.app/key');
  });

  it('posts Slack-compatible webhook payloads and reports HTTP failures', async () => {
    const { deps, posts } = deliveryDeps();
    await deliverToChannel(deps, channel('webhook', { url: 'https://hooks.test/x' }), { subject: 'S', text: 'T' }, { allowPrivateSmtp: false });
    expect(posts[0]).toEqual({ url: 'https://hooks.test/x', body: { source: 'nono', subject: 'S', text: 'T', content: 'S\n\nT' } });

    const failing = deliveryDeps({ safeRequester: vi.fn(async () => ({ statusCode: 500, headers: {}, body: Buffer.alloc(0) })) as any });
    await expect(deliverToChannel(failing.deps, channel('webhook', { url: 'https://hooks.test/x' }), { subject: 'S', text: 'T' }, { allowPrivateSmtp: false })).rejects.toThrow('HTTP 500');
  });

  it('only lets administrators send mail through a private SMTP host', async () => {
    const resolver = vi.fn(async () => { throw new Error('Target address is not public'); });
    const { deps } = deliveryDeps({ publicAddressResolver: resolver as any });
    const smtp = channel('email', { host: '10.0.0.5', port: 25, to: 'me@example.com', password: 'p' });
    await expect(deliverToChannel(deps, smtp, { subject: 'S', text: 'T' }, { allowPrivateSmtp: false })).rejects.toThrow('not public');
    await deliverToChannel(deps, smtp, { subject: 'S', text: 'T' }, { allowPrivateSmtp: true });
    expect(deps.sendMail).toHaveBeenCalledWith({ host: '10.0.0.5', port: 25, user: '', password: 'p' }, expect.objectContaining({ to: 'me@example.com', subject: 'S' }));
  });
});

describe('notification dispatcher', () => {
  function setup(items: NotificationItem[], depsOverrides: Partial<ChannelDeliveryDeps> = {}) {
    const prisma = fakePrisma();
    const { deps, posts } = deliveryDeps(depsOverrides);
    const list = vi.fn(async () => ({ items, unreadCount: items.length, urgentUnreadCount: 0, generatedAt: '' }));
    const dispatcher = createNotificationDispatcher({ prisma: prisma as any, notificationService: { list }, delivery: deps, publicUrl: 'https://nono.test/' });
    return { prisma, posts, dispatcher, list };
  }

  it('pushes unread notifications once as a digest with absolute links', async () => {
    const { prisma, posts, dispatcher } = setup([
      item('a', { severity: 'critical' }),
      item('b'),
      item('read', { read: true }),
      item('money', { source: 'nomoney' }),
      item('quiet', { severity: 'info' }),
    ]);
    await addChannel(prisma, { type: 'webhook', config: { url: 'https://hooks.test/x' } });

    expect(await dispatcher.dispatchUser(admin)).toEqual({ sent: 2, failed: 0 });
    expect(posts).toHaveLength(1);
    expect(posts[0].body.subject).toBe('[NoNo] 2 条新通知（1 条紧急）');
    expect(posts[0].body.text).toContain('https://nono.test/admin/links');
    expect(posts[0].body.text).not.toContain('Title money');
    expect(posts[0].body.text).not.toContain('Title quiet');

    expect(await dispatcher.dispatchUser(admin)).toEqual({ sent: 0, failed: 0 });
    expect(posts).toHaveLength(1);
  });

  it('retries a failing channel a bounded number of times', async () => {
    const { prisma, dispatcher } = setup([item('a')], { safeRequester: vi.fn(async () => ({ statusCode: 503, headers: {}, body: Buffer.alloc(0) })) as any });
    const channel = await addChannel(prisma, { type: 'webhook', config: { url: 'https://hooks.test/x' } });
    for (let attempt = 0; attempt < MAX_DELIVERY_ATTEMPTS + 2; attempt += 1) await dispatcher.dispatchUser(admin);
    expect(prisma.deliveries).toEqual([expect.objectContaining({ key: 'a', status: 'failed', attempts: MAX_DELIVERY_ATTEMPTS })]);
    expect(prisma.channels.find((row) => row.id === channel.id).lastError).toBe('HTTP 503');
  });

  it('runs for every user who owns an enabled channel', async () => {
    const { prisma, dispatcher, list } = setup([item('a')]);
    await addChannel(prisma, { type: 'webhook', config: { url: 'https://hooks.test/a' } });
    await addChannel(prisma, { userId: reader.id, type: 'webhook', config: { url: 'https://hooks.test/r' } });
    await dispatcher.runDue();
    expect(list.mock.calls.map((call: any[]) => call[0].id).sort()).toEqual([1, 2]);
  });

  it('relays product messages to the administrator, honouring severity', async () => {
    const { prisma, posts, dispatcher } = setup([]);
    await expect(dispatcher.relay('yumi', { subject: 'S', text: 'T', severity: 'critical' })).rejects.toMatchObject({ statusCode: 409 });

    await addChannel(prisma, { type: 'webhook', config: { url: 'https://hooks.test/x' }, minSeverity: 'critical' });
    const skipped = await dispatcher.relay('nomoney', { subject: 'S', text: 'T', severity: 'warning' });
    expect(skipped).toEqual([expect.objectContaining({ ok: true, skipped: true })]);
    expect(posts).toHaveLength(0);

    await dispatcher.relay('yumi', { subject: 'Down', text: 'T', severity: 'critical' });
    expect(posts[0].body.subject).toBe('Down');
    expect(prisma.deliveries[0]).toMatchObject({ source: 'yumi', status: 'sent' });
  });

  it('fails a relay when every channel fails so the product retries later', async () => {
    const { prisma, dispatcher } = setup([], { safeRequester: vi.fn(async () => ({ statusCode: 500, headers: {}, body: Buffer.alloc(0) })) as any });
    await addChannel(prisma, { type: 'webhook', config: { url: 'https://hooks.test/x' } });
    await expect(dispatcher.relay('nomoney', { subject: 'S', text: 'T', severity: 'warning' })).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('legacy channel import', () => {
  it('imports NoMoney and Yumi channels once, without duplicates', async () => {
    const prisma = fakePrisma();
    const { deps } = deliveryDeps();
    const legacy = { email: { host: 'smtp.saved', port: 587, user: '', from: '', to: 'me@x.com' }, webhook: { url: 'https://hooks.test/x' }, telegram: null, bark: { url: 'https://api.day.app/k' } };
    const readLegacyChannels = vi.fn(async (product: string) => (product === 'nomoney' ? legacy : { ...legacy, telegram: { botToken: 't', chatId: '1' } }));
    const dispatcher = createNotificationDispatcher({ prisma: prisma as any, notificationService: { list: vi.fn() } as any, delivery: deps, readLegacyChannels, legacySmtpEnv: { host: 'smtp.env', password: 'env-pass' } });

    expect(await dispatcher.importLegacyChannels()).toBe('imported');
    expect(prisma.channels.map((row) => row.type)).toEqual(['email', 'webhook', 'bark', 'telegram']);
    const email = decodeChannelConfig(prisma.channels[0], encryptionKey);
    expect(email).toMatchObject({ host: 'smtp.env', password: 'env-pass', to: 'me@x.com' });
    expect(prisma.channels.every((row) => row.minSeverity === 'info' && row.userId === admin.id)).toBe(true);

    expect(await dispatcher.importLegacyChannels()).toBe('skipped');
    expect(readLegacyChannels).toHaveBeenCalledTimes(2);
  });

  it('waits for the products to come up instead of recording an empty import', async () => {
    const prisma = fakePrisma();
    const { deps } = deliveryDeps();
    const dispatcher = createNotificationDispatcher({ prisma: prisma as any, notificationService: { list: vi.fn() } as any, delivery: deps, readLegacyChannels: async () => { throw new Error('ECONNREFUSED'); } });
    expect(await dispatcher.importLegacyChannels()).toBe('unavailable');
    expect(prisma.channels).toEqual([]);
  });
});

describe('notification channel routes', () => {
  let app: FastifyInstance;
  afterEach(async () => { await app?.close(); });

  async function start() {
    const repo = new MemoryRepository(false);
    const prisma = fakePrisma();
    const { deps, posts } = deliveryDeps();
    const notificationDispatcher = createNotificationDispatcher({ prisma: prisma as any, notificationService: { list: vi.fn() } as any, delivery: deps });
    app = await buildApp({ repo, prisma: prisma as any, sessionSecret, encryptionKey, internalToken: 'internal-secret', notificationDispatcher });
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'admin@nono.test', password: 'Password2026!' } });
    const cookie = String(setup.headers['set-cookie']).split(';', 1)[0];
    return { prisma, posts, cookie };
  }

  it('creates, lists, updates, tests and deletes channels without exposing secrets', async () => {
    const { cookie, posts } = await start();
    const created = await app.inject({ method: 'POST', url: '/api/admin/notification-channels', headers: { cookie }, payload: { type: 'bark', name: '手机', config: { url: 'https://api.day.app/secret-key' } } });
    expect(created.statusCode).toBe(200);
    expect(created.body).not.toContain('secret-key');
    const id = created.json().data.id;

    const listed = await app.inject({ method: 'GET', url: '/api/admin/notification-channels', headers: { cookie } });
    expect(listed.json().data.items[0]).toMatchObject({ name: '手机', minSeverity: 'warning', config: { url: '', urlSet: true } });

    const updated = await app.inject({ method: 'PATCH', url: `/api/admin/notification-channels/${id}`, headers: { cookie }, payload: { minSeverity: 'critical', config: { url: '' } } });
    expect(updated.json().data).toMatchObject({ minSeverity: 'critical', config: { urlSet: true } });

    const tested = await app.inject({ method: 'POST', url: `/api/admin/notification-channels/${id}/test`, headers: { cookie } });
    expect(tested.json().data).toMatchObject({ ok: true });
    expect(posts[0].url).toBe('https://api.day.app/secret-key');

    expect((await app.inject({ method: 'DELETE', url: `/api/admin/notification-channels/${id}`, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/notification-channels/${id}`, headers: { cookie } })).statusCode).toBe(404);
  });

  it('requires a browser session and keeps the relay behind the internal token', async () => {
    const { cookie } = await start();
    expect((await app.inject({ method: 'GET', url: '/api/admin/notification-channels' })).statusCode).toBe(401);
    const relay = (token?: string) => app.inject({ method: 'POST', url: '/api/internal/notifications/relay', headers: token ? { 'x-nono-internal-token': token } : {}, payload: { product: 'nomoney', subject: 'S', text: 'T' } });
    expect((await relay()).statusCode).toBe(401);
    expect((await relay('wrong')).statusCode).toBe(401);
    expect((await relay('internal-secret')).statusCode).toBe(409);

    await app.inject({ method: 'POST', url: '/api/admin/notification-channels', headers: { cookie }, payload: { type: 'webhook', name: 'Hook', config: { url: 'https://hooks.test/x' } } });
    const ok = await relay('internal-secret');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.results).toEqual([expect.objectContaining({ ok: true })]);

    const log = await app.inject({ method: 'GET', url: '/api/admin/notification-deliveries', headers: { cookie } });
    expect(log.json().data.items[0]).toMatchObject({ source: 'nomoney', status: 'sent', channel: { name: 'Hook', type: 'webhook' } });
  });
});
