import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryRepository } from '../src/services/repository.js';
import { createSessionToken } from '../src/utils/crypto.js';

const sessionSecret = 'test-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

const webAuthn = {
  async generateRegistrationOptions() {
    return { challenge: 'register-challenge' };
  },
  async verifyRegistrationResponse() {
    return {
      verified: true,
      registrationInfo: {
        credential: {
          id: 'credential-1',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    };
  },
  async generateAuthenticationOptions() {
    return { challenge: 'login-challenge' };
  },
  async verifyAuthenticationResponse() {
    return { verified: true, authenticationInfo: { newCounter: 1 } };
  },
};

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }) {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value[0] : String(value)).split(';', 1)[0];
}

describe('account security', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;

  beforeEach(async () => {
    repo = new MemoryRepository(false);
    app = await buildApp({ repo, sessionSecret, encryptionKey, webAuthn } as any);
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      headers: { 'user-agent': 'Setup Browser' },
      payload: {
        username: 'admin',
        email: 'admin@nono.test',
        displayName: 'Admin',
        password,
      },
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('lists the current tracked browser session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'user-agent': 'Chrome on Windows' },
      payload: { username: 'admin', password },
    });
    const cookie = sessionCookie(login);

    const security = await app.inject({
      method: 'GET',
      url: '/api/admin/account/security',
      headers: { cookie },
    });

    expect(security.statusCode).toBe(200);
    expect(security.json().data.sessions).toEqual([
      expect.objectContaining({
        current: true,
        userAgent: 'Chrome on Windows',
      }),
      expect.objectContaining({
        current: false,
        userAgent: 'Setup Browser',
      }),
    ]);
  });

  it('does not write session activity on every authenticated request', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password } });
    const cookie = sessionCookie(login);
    const touch = vi.spyOn(repo, 'touchSession');

    await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/api/admin/account/security', headers: { cookie } });

    expect(touch).not.toHaveBeenCalled();
  });

  it('rejects legacy stateless cookies that cannot be revoked', async () => {
    const user = await repo.findUserByUsername('admin');
    const legacyToken = createSessionToken(user!, sessionSecret);

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `nono_session=${legacyToken}` },
    });

    expect(session.json().data.authenticated).toBe(false);
  });

  it('revokes another browser session immediately', async () => {
    const firstLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'user-agent': 'Browser A' },
      payload: { username: 'admin', password },
    });
    const firstCookie = sessionCookie(firstLogin);
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'user-agent': 'Browser B' },
      payload: { username: 'admin', password },
    });
    const secondCookie = sessionCookie(secondLogin);
    const security = await app.inject({
      method: 'GET',
      url: '/api/admin/account/security',
      headers: { cookie: secondCookie },
    });
    const firstSession = security.json().data.sessions.find((session: any) => session.userAgent === 'Browser A');

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/admin/account/sessions/${firstSession.id}`,
      headers: { cookie: secondCookie },
    });
    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: firstCookie },
    });

    expect(revoked.statusCode).toBe(200);
    expect(oldSession.json().data.authenticated).toBe(false);
  });

  it('registers a passkey and uses it for passwordless login', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password },
    });
    const cookie = sessionCookie(login);
    const registrationOptions = await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys/options',
      headers: { cookie, origin: 'https://nono.test' },
    });
    const registered = await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys',
      headers: { cookie, origin: 'https://nono.test' },
      payload: {
        challengeId: registrationOptions.json().data.challengeId,
        name: 'Windows Hello',
        response: { id: 'credential-1' },
      },
    });
    const security = await app.inject({
      method: 'GET',
      url: '/api/admin/account/security',
      headers: { cookie },
    });

    expect(registrationOptions.statusCode).toBe(200);
    expect(registered.statusCode).toBe(200);
    expect(security.json().data.passkeys).toEqual([
      expect.objectContaining({ id: 'credential-1', name: 'Windows Hello', backedUp: true }),
    ]);

    const authenticationOptions = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/options',
      headers: { origin: 'https://nono.test' },
    });
    const passkeyLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login',
      headers: { origin: 'https://nono.test', 'user-agent': 'Passkey Browser' },
      payload: {
        challengeId: authenticationOptions.json().data.challengeId,
        response: { id: 'credential-1' },
      },
    });
    const passkeySession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: sessionCookie(passkeyLogin) },
    });

    expect(authenticationOptions.statusCode).toBe(200);
    expect(passkeyLogin.statusCode).toBe(200);
    expect(passkeySession.json().data).toMatchObject({ authenticated: true, user: { username: 'admin' } });
  });

  it('returns a generic unauthorized response for malformed passkey assertions', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password } });
    const cookie = sessionCookie(login);
    const registrationOptions = await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys/options',
      headers: { cookie, origin: 'https://nono.test' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys',
      headers: { cookie, origin: 'https://nono.test' },
      payload: {
        challengeId: registrationOptions.json().data.challengeId,
        name: 'Security key',
        response: { id: 'credential-1' },
      },
    });
    const authenticationOptions = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/options',
      headers: { origin: 'https://nono.test' },
    });
    vi.spyOn(webAuthn, 'verifyAuthenticationResponse').mockRejectedValueOnce(new Error('CBOR parser detail'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login',
      headers: { origin: 'https://nono.test' },
      payload: {
        challengeId: authenticationOptions.json().data.challengeId,
        response: { id: 'credential-1' },
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Passkey authentication failed');
  });

  it('returns a generic validation response for malformed passkey registration data', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password } });
    const cookie = sessionCookie(login);
    const options = await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys/options',
      headers: { cookie, origin: 'https://nono.test' },
    });
    vi.spyOn(webAuthn, 'verifyRegistrationResponse').mockRejectedValueOnce(new Error('attestation parser detail'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys',
      headers: { cookie, origin: 'https://nono.test' },
      payload: {
        challengeId: options.json().data.challengeId,
        name: 'Security key',
        response: { id: 'credential-1' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('Passkey registration failed');
  });

  it('deletes a registered passkey from the current account', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password } });
    const cookie = sessionCookie(login);
    const options = await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys/options',
      headers: { cookie, origin: 'https://nono.test' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/admin/account/passkeys',
      headers: { cookie, origin: 'https://nono.test' },
      payload: {
        challengeId: options.json().data.challengeId,
        name: 'Phone',
        response: { id: 'credential-1' },
      },
    });

    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/admin/account/passkeys/credential-1',
      headers: { cookie },
    });
    const security = await app.inject({ method: 'GET', url: '/api/admin/account/security', headers: { cookie } });

    expect(removed.statusCode).toBe(200);
    expect(security.json().data.passkeys).toEqual([]);
  });

  it('revokes every session except the current browser', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password } });
    const firstCookie = sessionCookie(first);
    const current = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password } });
    const currentCookie = sessionCookie(current);

    const revoked = await app.inject({
      method: 'POST',
      url: '/api/admin/account/sessions/revoke-others',
      headers: { cookie: currentCookie },
    });
    const oldSession = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: firstCookie } });
    const currentSession = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: currentCookie } });

    expect(revoked.statusCode).toBe(200);
    expect(oldSession.json().data.authenticated).toBe(false);
    expect(currentSession.json().data.authenticated).toBe(true);
  });
});
