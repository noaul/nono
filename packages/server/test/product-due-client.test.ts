import { describe, expect, it, vi } from 'vitest';
import { createProductDueReader } from '../src/services/product-due-client.js';

describe('product due client', () => {
  it('reads product due items through the authenticated internal API', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      items: [{ assetType: 'vps', id: 10, name: 'nc48', dueDate: '2026-08-10', status: 'active' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const reader = createProductDueReader({
      port: 2040,
      token: 'internal-secret',
      serviceName: 'Yumi',
      fetch: request as typeof fetch,
    });

    await expect(reader()).resolves.toEqual([
      { assetType: 'vps', id: 10, name: 'nc48', dueDate: '2026-08-10', status: 'active' },
    ]);
    expect(request).toHaveBeenCalledWith('http://127.0.0.1:2040/api/internal/notifications/due', expect.objectContaining({
      headers: { 'x-nono-internal-token': 'internal-secret' },
      redirect: 'error',
    }));
  });

  it('rejects missing authentication and malformed product responses', async () => {
    const unauthenticated = createProductDueReader({ token: '', serviceName: 'NoMoney' });
    await expect(unauthenticated()).rejects.toThrow(
      'NoMoney internal notification authentication is not configured',
    );

    const reader = createProductDueReader({
      token: 'internal-secret',
      serviceName: 'NoMoney',
      fetch: vi.fn(async () => new Response(JSON.stringify({ items: [{ assetType: 'root', id: 1 }] }), { status: 200 })) as typeof fetch,
    });
    await expect(reader()).rejects.toThrow('NoMoney returned an invalid notification feed');
  });
});
