import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import type { AppContext, SessionUser } from './types.js';

/** Session cookies the fake NoNo verifier accepts in tests. */
export const testSessions: Record<string, SessionUser> = {
  'admin-session': { id: 1, username: 'owner', role: 'admin' },
  'user-session': { id: 2, username: 'guest', role: 'user' }
};
export const adminCookie = 'nono_session=admin-session';
export const userCookie = 'nono_session=user-session';

export async function createTestContext(): Promise<AppContext> {
  const db = await createDatabase({ persist: false });
  return {
    db,
    verifySession: async (token) => testSessions[token] ?? null,
    internalToken: 'test-internal-token',
    encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    now: () => new Date('2026-05-22T01:00:00.000Z'),
    fetch: async () => new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }),
    privateOutboundHosts: [],
    notifier: {
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
  const agent = request.agent(app).set('Cookie', adminCookie);
  return { context, app, agent };
}

export { describe, expect, test };
