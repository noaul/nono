import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
import { createTestContext, describe, expect, test } from './test-utils.js';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import request from 'supertest';

describe('auth flow', () => {
  test.each(['nomoney', 'yumi'] as const)('requires the configured browser origin for %s session writes', async (product) => {
    const context = await createTestContext(product);
    context.publicOrigin = 'https://nono.test';
    const app = createApp(context);
    const setup = await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });
    const setCookie = setup.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : String(setCookie)).split(';', 1)[0];

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(403);
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://other.nono.test')
      .expect(403);
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://nono.test')
      .expect(204);
  });

  test('initial setup creates the single user and login exposes current user through a cookie session', async () => {
    const context = await createTestContext();
    const app = createApp(context);
    const agent = request.agent(app);

    const setupStatusBefore = await agent.get('/api/auth/setup-status');
    expect(setupStatusBefore.body).toEqual({ needsSetup: true });

    const setup = await agent.post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });
    expect(setup.status).toBe(201);
    const cookies = setup.headers['set-cookie'];
    expect(Array.isArray(cookies) ? cookies.join(';') : String(cookies)).toContain('moneypulse_session=');

    const setupStatusAfter = await agent.get('/api/auth/setup-status');
    expect(setupStatusAfter.body).toEqual({ needsSetup: false });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      username: 'owner',
      email: 'owner@example.com'
    });

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);

    const login = await agent.post('/api/auth/login').send({
      username: 'owner',
      password: 'correct horse battery staple'
    });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe('owner@example.com');
  });

  test('logout revokes the JWT even when a client replays the old cookie', async () => {
    const context = await createTestContext();
    const app = createApp(context);
    const setup = await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });
    const rawCookie = Array.isArray(setup.headers['set-cookie']) ? setup.headers['set-cookie'][0] : String(setup.headers['set-cookie']);
    const cookie = rawCookie.split(';', 1)[0];

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  test('initial setup requires the configured bootstrap token', async () => {
    const context = await createTestContext();
    context.bootstrapToken = 'bootstrap-secret';
    const app = createApp(context);

    await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    }).expect(403);
    await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com',
      bootstrapToken: 'bootstrap-secret'
    }).expect(201);
  });

  test('scopes the session cookie to the configured application path', async () => {
    const context = await createTestContext();
    context.cookiePath = '/nomoney';
    const app = createApp(context);
    const response = await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });

    const cookies = response.headers['set-cookie'];
    expect(Array.isArray(cookies) ? cookies.join(';') : String(cookies)).toContain('Path=/nomoney');
  });

  test('setup cannot run twice', async () => {
    const context = await createTestContext();
    const app = createApp(context);
    const agent = request.agent(app);

    await agent.post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });

    const secondSetup = await agent.post('/api/auth/setup').send({
      username: 'other',
      password: 'correct horse battery staple',
      email: 'other@example.com'
    });

    expect(secondSetup.status).toBe(409);
  });

  test('only one concurrent setup request can create the single user', async () => {
    const context = await createTestContext();
    const app = createApp(context);

    const attempts = await Promise.all([
      request(app).post('/api/auth/setup').send({
        username: 'first-owner',
        password: 'correct horse battery staple',
        email: 'first@example.com'
      }),
      request(app).post('/api/auth/setup').send({
        username: 'second-owner',
        password: 'correct horse battery staple',
        email: 'second@example.com'
      })
    ]);

    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(context.db.get<{ count: number }>('SELECT COUNT(*) as count FROM users')?.count).toBe(1);
  });

  test('compares a password even when the username does not exist', async () => {
    // Short-circuiting on an unknown username would answer instantly where a real account pays for
    // bcrypt, which tells an unauthenticated caller which accounts exist. Assert the comparison
    // itself runs on both paths rather than measuring wall-clock time, which is flaky under load.
    const context = await createTestContext();
    const app = createApp(context);
    await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });

    const compare = vi.spyOn(bcrypt, 'compare');
    try {
      const unknown = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'whatever' });
      const wrong = await request(app).post('/api/auth/login').send({ username: 'owner', password: 'whatever' });

      expect(unknown.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(compare).toHaveBeenCalledTimes(2);
      // Against a real bcrypt hash, not an empty string, which compare rejects for free.
      expect(String(compare.mock.calls[0][1])).toMatch(/^\$2[aby]\$10\$/);
    } finally {
      compare.mockRestore();
    }
  });

  test('rate limits repeated failed setup attempts', async () => {
    const context = await createTestContext();
    const app = createApp(context);
    await request(app).post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request(app).post('/api/auth/setup').send({
        username: `other-${attempt}`,
        password: 'correct horse battery staple',
        email: `other-${attempt}@example.com`
      });
      expect(response.status).toBe(409);
    }

    const limited = await request(app).post('/api/auth/setup').send({
      username: 'last',
      password: 'correct horse battery staple',
      email: 'last@example.com'
    });
    expect(limited.status).toBe(429);
  });

  test('initial setup returns the created user when database persistence is enabled', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moneypulse-auth-'));
    const db = await createDatabase({ persist: true, filePath: path.join(tempDir, 'app.db') });
    const app = createApp({
      db,
      jwtSecret: 'test-secret',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      cookieSecure: false,
      cookiePath: '/',
      now: () => new Date('2026-05-22T01:00:00.000Z'),
      mailer: {
        sent: [],
        async send(message) {
          this.sent.push(message);
        }
      }
    });
    const agent = request.agent(app);

    const setup = await agent.post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });

    expect(setup.status).toBe(201);
    expect(setup.body.user).toMatchObject({
      username: 'owner',
      email: 'owner@example.com'
    });
  });

  test('changing the password invalidates older sessions', async () => {
    const context = await createTestContext();
    const app = createApp(context);
    const firstAgent = request.agent(app);
    const secondAgent = request.agent(app);

    await firstAgent.post('/api/auth/setup').send({
      username: 'owner',
      password: 'correct horse battery staple',
      email: 'owner@example.com'
    });

    await secondAgent.post('/api/auth/login').send({
      username: 'owner',
      password: 'correct horse battery staple'
    }).expect(200);

    await firstAgent.put('/api/auth/password').send({
      currentPassword: 'correct horse battery staple',
      newPassword: 'new correct horse battery staple'
    }).expect(204);

    await firstAgent.get('/api/auth/me').expect(200);
    await secondAgent.get('/api/auth/me').expect(401);
  });
});
