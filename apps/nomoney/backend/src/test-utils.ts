import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import type { AppContext } from './types.js';

export async function createTestContext(): Promise<AppContext> {
  const db = await createDatabase({ persist: false });
  return {
    db,
    jwtSecret: 'test-secret',
    cookieSecure: false,
    cookiePath: '/',
    now: () => new Date('2026-05-22T01:00:00.000Z'),
    fetch: async () => new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }),
    mailer: {
      sent: [],
      async send(message) {
        this.sent.push(message);
      }
    }
  };
}

export async function setupAgent() {
  const context = await createTestContext();
  const app = createApp(context);
  const agent = request.agent(app);
  await agent.post('/api/auth/setup').send({
    username: 'owner',
    password: 'correct horse battery staple',
    email: 'owner@example.com'
  });
  return { context, app, agent };
}

export { describe, expect, test };
