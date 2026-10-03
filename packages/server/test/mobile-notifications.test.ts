import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { MemoryMobileStore } from '../src/services/mobile-store.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
async function setup() {
  const repo = new MemoryRepository(false);
  const store = new MemoryMobileStore(repo);
  const app = await buildApp({ repo, mobileStore: store, sessionSecret: 'test-session-secret', encryptionKey: '0123456789abcdef'.repeat(4) });
  apps.push(app);
  await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'a@example.test', displayName: 'Admin', password: 'Password123!' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'Password123!' } });
  const headers = { cookie: login.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
  const binding = await app.inject({ method: 'POST', url: '/api/mobile/devices', headers, payload: { provider: 'xiaomi', installationId: 'test-phone-1', registrationId: 'secret', appVersion: '0.2' } });
  const deviceId = binding.json().data.deviceId;
  const { event } = await store.upsertEvent({ userId: repo.users[0].id, eventId: 'links:1', source: 'links', severity: 'warning', title: 'Private details', targetPath: '/admin/links', occurredAt: new Date(), expiresAt: new Date(Date.now() + 100_000) });
  await store.createAttempts(event, [deviceId], new Date());
  return { app, store, headers, deviceId };
}
describe('mobile notification boundaries', () => {
  it('requires authentication and hides foreign or expired events', async () => {
    const s = await setup();
    expect((await s.app.inject('/api/mobile/notifications/links%3A1')).statusCode).toBe(401);
    expect((await s.app.inject({ url: '/api/mobile/notifications/links%3A1', headers: s.headers })).json().data.title).toBe('Private details');
    s.store.events[0].userId = 99;
    expect((await s.app.inject({ url: '/api/mobile/notifications/links%3A1', headers: s.headers })).statusCode).toBe(404);
    s.store.events[0].userId = 1;
    s.store.events[0].expiresAt = new Date(0);
    expect((await s.app.inject({ url: '/api/mobile/notifications/links%3A1', headers: s.headers })).statusCode).toBe(404);
  });
  it('records first open only for an eligible owned device with a matching attempt', async () => {
    const s = await setup();
    const open = (deviceId: string) => s.app.inject({ method: 'POST', url: '/api/mobile/notifications/links%3A1/opened', headers: s.headers, payload: { deviceId } });
    expect((await open('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await open(s.deviceId)).statusCode).toBe(200);
    const first = s.store.attempts[0].openedAt;
    expect((await open(s.deviceId)).statusCode).toBe(200);
    expect(s.store.attempts[0].openedAt).toEqual(first);
    expect(s.store.attempts[0].status).toBe('pending');
    await s.store.disableDevice(s.deviceId, 'revoked', new Date(), true);
    expect((await open(s.deviceId)).statusCode).toBe(404);
  });
  it('reports independent delivery states without device secrets', async () => {
    const s = await setup();
    const response = await s.app.inject({ url: '/api/mobile/deliveries', headers: s.headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ enabled: false, counts: { pending: 1 }, items: [{ receivedAt: null, openedAt: null, status: 'pending' }] });
    expect(response.body).not.toContain('registration');
  });
  it('serves public app links as JSON, empty until release fingerprint is configured', async () => {
    const s = await setup();
    const response = await s.app.inject('/.well-known/assetlinks.json');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual([]);
  });
  it('publishes only explicitly configured release fingerprints', async () => {
    const previous = process.env.ANDROID_RELEASE_SHA256_FINGERPRINTS;
    const fingerprint = Array(32).fill('AB').join(':');
    process.env.ANDROID_RELEASE_SHA256_FINGERPRINTS = fingerprint;
    try {
      const s = await setup();
      const response = await s.app.inject('/.well-known/assetlinks.json');
      expect(response.json()).toEqual([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.noaul.nono', sha256_cert_fingerprints: [fingerprint] } }]);
    } finally {
      if (previous === undefined) delete process.env.ANDROID_RELEASE_SHA256_FINGERPRINTS;
      else process.env.ANDROID_RELEASE_SHA256_FINGERPRINTS = previous;
    }
  });

});
