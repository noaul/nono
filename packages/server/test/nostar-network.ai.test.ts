import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { proxyJson } from '../src/routes/nostar/network.js';
import type { AppServices } from '../src/types.js';

describe('AI proxy response headers', () => {
  it('forwards provider retry advice and status without exposing unrelated headers', async () => {
    const app = Fastify();
    const services = { privateOutboundHosts: [], safeRequester: async () => ({ statusCode: 429, headers: { 'content-type': 'application/json', 'retry-after': '5', 'retry-after-ms': '5200', 'set-cookie': 'private' }, body: Buffer.from('{"error":"limited"}') }) } as unknown as AppServices;
    app.post('/ai', (_request, reply) => proxyJson(reply, services, { id: 1, username: 'user', email: 'user@nono.test', displayName: 'User', role: 'user' }, 'https://ai.example', { method: 'POST', body: '{}' }));
    try {
      const response = await app.inject({ method: 'POST', url: '/ai' });
      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('5');
      expect(response.headers['retry-after-ms']).toBe('5200');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.json()).toEqual({ error: 'limited' });
    } finally { await app.close(); }
  });
});
