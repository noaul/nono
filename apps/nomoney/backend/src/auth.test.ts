import request from 'supertest';
import { createNonoSessionVerifier } from './auth.js';
import { createApp } from './app.js';
import { adminCookie, createTestContext, describe, expect, test, userCookie } from './test-utils.js';

describe('NoNo session authorisation', () => {
  test.each(['nomoney', 'yumi'] as const)('%s rejects requests without a NoNo session', async (product) => {
    const app = createApp(await createTestContext(product));
    const response = await request(app).get('/api/auth/me').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    await request(app).get('/api/expenses').expect(401);
  });

  test('rejects a session NoNo does not recognise', async () => {
    const app = createApp(await createTestContext());
    await request(app).get('/api/expenses').set('Cookie', 'nono_session=forged').expect(401);
  });

  test('only a NoNo administrator may use the product', async () => {
    const app = createApp(await createTestContext());
    const forbidden = await request(app).get('/api/expenses').set('Cookie', userCookie).expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie).expect(200);
    expect(me.body.user).toEqual({ id: 1, username: 'owner', role: 'admin' });
  });

  test('reports 503 when NoNo cannot be reached', async () => {
    const context = await createTestContext();
    context.verifySession = async () => { throw new Error('connection refused'); };
    await request(createApp(context)).get('/api/expenses').set('Cookie', adminCookie).expect(503);
  });

  test('legacy login and setup routes are gone', async () => {
    const app = createApp(await createTestContext());
    for (const path of ['/api/auth/login', '/api/auth/setup', '/api/auth/logout']) {
      const response = await request(app).post(path).send({});
      expect(response.status).not.toBe(200);
      expect(response.status).not.toBe(201);
    }
    await request(app).get('/api/auth/setup-status').expect(401);
  });

  test.each(['nomoney', 'yumi'] as const)('%s requires the configured browser origin for session writes', async (product) => {
    const context = await createTestContext(product);
    context.publicOrigin = 'https://nono.test';
    const app = createApp(context);
    await request(app).put('/api/settings').set('Cookie', adminCookie).send({}).expect(403);
    await request(app).put('/api/settings').set('Cookie', adminCookie).set('Origin', 'https://other.nono.test').send({}).expect(403);
    const allowed = await request(app).put('/api/settings').set('Cookie', adminCookie).set('Origin', 'https://nono.test').send({});
    expect(allowed.status).not.toBe(403);
  });
});

describe('createNonoSessionVerifier', () => {
  function fakeNono(status: number, body: unknown) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  }

  test('forwards the cookie with the internal token and caches the answer', async () => {
    let clock = 0;
    const { calls, fetcher } = fakeNono(200, { code: 0, data: { user: { id: 7, username: 'me', role: 'admin', email: 'x' } } });
    const verify = createNonoSessionVerifier({ baseUrl: 'http://nono', internalToken: 'secret', fetch: fetcher, ttlMs: 1000, now: () => clock });

    expect(await verify('abc')).toEqual({ id: 7, username: 'me', role: 'admin' });
    expect(await verify('abc')).toEqual({ id: 7, username: 'me', role: 'admin' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://nono/api/internal/auth/session');
    expect(calls[0].headers).toMatchObject({ cookie: 'nono_session=abc', 'x-nono-internal-token': 'secret' });

    clock = 2000;
    await verify('abc');
    expect(calls).toHaveLength(2);
  });

  test('treats 401 as no session and other failures as errors', async () => {
    const unauthorised = fakeNono(401, { code: 401 });
    expect(await createNonoSessionVerifier({ baseUrl: 'http://nono', internalToken: 't', fetch: unauthorised.fetcher })('x')).toBeNull();

    const broken = fakeNono(500, {});
    await expect(createNonoSessionVerifier({ baseUrl: 'http://nono', internalToken: 't', fetch: broken.fetcher })('x')).rejects.toThrow('HTTP 500');
  });
});
