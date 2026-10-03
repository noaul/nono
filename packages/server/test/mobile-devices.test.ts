import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { MemoryMobileStore } from '../src/services/mobile-store.js';
import { hashPassword } from '../src/utils/crypto.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

function cookieOf(response: { headers: Record<string, unknown> }) {
  const value = response.headers['set-cookie'];
  return String(Array.isArray(value) ? value[0] : value).split(';', 1)[0];
}

const device = (overrides: Record<string, unknown> = {}) => ({
  installationId: 'install-0001',
  provider: 'xiaomi',
  registrationId: 'regid-secret-0001',
  appVersion: '0.2.0',
  ...overrides,
});

describe('mobile device binding', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;
  let store: MemoryMobileStore;

  async function login(username = 'admin', userAgent = 'Phone') {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'user-agent': userAgent }, payload: { username, password } });
    expect(response.statusCode).toBe(200);
    return cookieOf(response);
  }

  async function register(cookie: string, payload: Record<string, unknown> = device()) {
    return app.inject({ method: 'POST', url: '/api/mobile/devices', headers: { cookie }, payload });
  }

  async function eligibleIds(userId = 1) {
    return (await app.inject({ method: 'GET', url: '/api/mobile/devices', headers: { cookie: await login(repo.users.find((user) => user.id === userId)!.username, 'Checker') } }))
      .json().data.items.filter((item: any) => item.eligible).map((item: any) => item.id);
  }

  beforeEach(async () => {
    repo = new MemoryRepository(false);
    store = new MemoryMobileStore(repo);
    app = await buildApp({ repo, sessionSecret, encryptionKey, mobileStore: store } as any);
    await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', email: 'admin@nono.test', displayName: 'Admin', password } });
    await repo.createUser({ username: 'reader', email: 'reader@nono.test', displayName: 'Reader', passwordHash: await hashPassword(password), role: 'user' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a browser session', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/mobile/devices', payload: device() })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/mobile/devices' })).statusCode).toBe(401);
    const cookie = await login();
    const token = (await app.inject({ method: 'POST', url: '/api/admin/tokens', headers: { cookie }, payload: { name: 'cli' } })).json().data.token;
    const bearer = await app.inject({ method: 'POST', url: '/api/mobile/devices', headers: { authorization: `Bearer ${token}` }, payload: device() });
    expect(bearer.statusCode).toBe(403);
  });

  it('binds to the server session, ignores a forged userId and never returns credentials', async () => {
    const cookie = await login();
    const response = await register(cookie, { ...device(), userId: 2, sessionId: 'forged' });
    expect(response.statusCode).toBe(200);
    const created = response.json().data;
    expect(created.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.revokeToken).toMatch(/^nono_mrv_/);
    expect(new Date(created.sessionExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const stored = store.devices[0];
    expect(stored.userId).toBe(1);
    expect(repo.sessions.some((session) => session.id === stored.sessionId && session.userId === 1)).toBe(true);
    expect(stored.registrationCiphertext).not.toContain('regid-secret-0001');

    const list = await app.inject({ method: 'GET', url: '/api/mobile/devices', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const body = list.body;
    for (const secret of ['regid-secret-0001', created.revokeToken, stored.registrationHash, stored.revokeTokenHash, stored.registrationCiphertext]) {
      expect(body).not.toContain(secret);
    }
    expect(list.json().data.items).toEqual([expect.objectContaining({ id: created.deviceId, enabled: true, eligible: true, currentSession: true, provider: 'xiaomi', appVersion: '0.2.0' })]);

    const otherUser = await login('reader');
    expect((await app.inject({ method: 'GET', url: '/api/mobile/devices', headers: { cookie: otherUser } })).json().data.items).toEqual([]);
  });

  it('keeps vendor tokens out of the audit log', async () => {
    const cookie = await login();
    await register(cookie);
    expect(JSON.stringify(repo.auditLogs)).not.toContain('regid-secret-0001');
  });

  it('rotates the registration of one installation in place', async () => {
    const cookie = await login();
    const first = (await register(cookie)).json().data;
    const second = (await register(cookie, device({ registrationId: 'regid-secret-0002', appVersion: '0.2.1' }))).json().data;
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.revokeToken).not.toBe(first.revokeToken);
    expect(store.devices).toHaveLength(1);

    // The previous revoke credential no longer works; the new one does.
    await app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: first.deviceId, revokeToken: first.revokeToken } });
    expect(store.devices[0].enabled).toBe(true);
    await app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: first.deviceId, revokeToken: second.revokeToken } });
    expect(store.devices[0]).toMatchObject({ enabled: false, disabledReason: 'revoked' });
    expect(store.devices[0].revokedAt).toBeInstanceOf(Date);

    // Registering again from a live session re-enables the same binding.
    const third = (await register(cookie, device({ registrationId: 'regid-secret-0003' }))).json().data;
    expect(third.deviceId).toBe(first.deviceId);
    expect(store.devices[0]).toMatchObject({ enabled: true, revokedAt: null, disabledReason: null });
  });

  it('validates input lengths and providers', async () => {
    const cookie = await login();
    expect((await register(cookie, device({ provider: 'apns' }))).statusCode).toBe(400);
    expect((await register(cookie, device({ installationId: 'short' }))).statusCode).toBe(400);
    expect((await register(cookie, device({ registrationId: 'x'.repeat(513) }))).statusCode).toBe(400);
    expect((await register(cookie, device({ appVersion: '1.0 beta' }))).statusCode).toBe(400);
  });

  it('limits the number of bound phones per account', async () => {
    const cookie = await login();
    for (let index = 0; index < 10; index += 1) {
      expect((await register(cookie, device({ installationId: `install-${index}-xyz`, registrationId: `regid-${index}` }))).statusCode).toBe(200);
    }
    const overflow = await register(cookie, device({ installationId: 'install-overflow', registrationId: 'regid-overflow' }));
    expect(overflow.statusCode).toBe(409);
  });

  it('refuses to take over a token still bound to another live account', async () => {
    const adminCookie = await login();
    expect((await register(adminCookie)).statusCode).toBe(200);
    const readerCookie = await login('reader');
    const conflict = await register(readerCookie);
    expect(conflict.statusCode).toBe(409);
    expect(store.devices).toHaveLength(1);

    // Once the admin's binding can no longer receive pushes (logout), the phone may switch accounts.
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: adminCookie } });
    const takeover = await register(readerCookie);
    expect(takeover.statusCode).toBe(200);
    expect(store.devices).toHaveLength(1);
    expect(store.devices[0].userId).toBe(2);
  });

  it('returns 404 for a foreign or unknown device and deletes only its own', async () => {
    const adminCookie = await login();
    const created = (await register(adminCookie)).json().data;
    const readerCookie = await login('reader');
    expect((await app.inject({ method: 'DELETE', url: `/api/mobile/devices/${created.deviceId}`, headers: { cookie: readerCookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/mobile/devices/not-a-uuid', headers: { cookie: adminCookie } })).statusCode).toBe(404);
    expect(store.devices).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/api/mobile/devices/${created.deviceId}`, headers: { cookie: adminCookie } })).statusCode).toBe(200);
    expect(store.devices).toHaveLength(0);
    expect((await app.inject({ method: 'DELETE', url: `/api/mobile/devices/${created.deviceId}`, headers: { cookie: adminCookie } })).statusCode).toBe(404);
  });

  it('answers revoke requests identically whether or not the device exists', async () => {
    const created = (await register(await login())).json().data;
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: created.deviceId, revokeToken: 'wrong' } }),
      app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: '00000000-0000-4000-8000-000000000000', revokeToken: created.revokeToken } }),
      app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: 'garbage', revokeToken: 'x' } }),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ code: 0, data: { ok: true }, message: '' });
    }
    expect(store.devices[0].enabled).toBe(true);
  });

  it('rate-limits the session-less revoke endpoint', async () => {
    let limited = 0;
    for (let index = 0; index < 12; index += 1) {
      const response = await app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: 'x', revokeToken: 'y' } });
      if (response.statusCode === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });

  describe('eligibility follows the linked session', () => {
    it('ends on logout', async () => {
      const cookie = await login();
      const created = (await register(cookie)).json().data;
      expect(await eligibleIds()).toEqual([created.deviceId]);
      await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
      expect(await eligibleIds()).toEqual([]);
      expect(await store.eligibleDevices(1, new Date())).toEqual([]);
    });

    it('ends when a password change revokes other sessions', async () => {
      const phone = await login('admin', 'Phone');
      await register(phone);
      const desktop = await login('admin', 'Desktop');
      const change = await app.inject({ method: 'PUT', url: '/api/admin/account/password', headers: { cookie: desktop }, payload: { currentPassword: password, newPassword: 'Password2027!New' } });
      expect(change.statusCode).toBe(200);
      expect(await store.eligibleDevices(1, new Date())).toEqual([]);
    });

    it('ends when the session is revoked from the security page or by revoke-others', async () => {
      const phone = await login('admin', 'Phone');
      const created = (await register(phone)).json().data;
      const sessionId = store.devices[0].sessionId!;
      const desktop = await login('admin', 'Desktop');
      expect((await app.inject({ method: 'DELETE', url: `/api/admin/account/sessions/${sessionId}`, headers: { cookie: desktop } })).statusCode).toBe(200);
      expect(await store.eligibleDevices(1, new Date())).toEqual([]);

      const phoneAgain = await login('admin', 'Phone');
      expect((await register(phoneAgain)).json().data.deviceId).toBe(created.deviceId);
      expect(await store.eligibleDevices(1, new Date())).toHaveLength(1);
      await app.inject({ method: 'POST', url: '/api/admin/account/sessions/revoke-others', headers: { cookie: desktop } });
      expect(await store.eligibleDevices(1, new Date())).toEqual([]);
    });

    it('ends when the session expires', async () => {
      await register(await login());
      expect(await store.eligibleDevices(1, new Date())).toHaveLength(1);
      const session = repo.sessions.find((item) => item.id === store.devices[0].sessionId)!;
      expect(await store.eligibleDevices(1, new Date(session.expiresAt.getTime() + 1))).toEqual([]);
      session.expiresAt = new Date(Date.now() - 1000);
      expect(await store.eligibleDevices(1, new Date())).toEqual([]);
    });

    it('ends when the account is deleted', async () => {
      await register(await login('reader'));
      expect(await store.eligibleDeviceUserIds(new Date())).toEqual([2]);
      const adminCookie = await login();
      expect((await app.inject({ method: 'DELETE', url: '/api/admin/users/2', headers: { cookie: adminCookie } })).statusCode).toBe(200);
      expect(await store.eligibleDeviceUserIds(new Date())).toEqual([]);
      expect(await store.eligibleDevices(2, new Date())).toEqual([]);
    });

    it('ends when the device is disabled or revoked', async () => {
      const created = (await register(await login())).json().data;
      await app.inject({ method: 'POST', url: '/api/mobile/devices/revoke', payload: { deviceId: created.deviceId, revokeToken: created.revokeToken } });
      expect(await store.eligibleDevices(1, new Date())).toEqual([]);
    });
  });
});
