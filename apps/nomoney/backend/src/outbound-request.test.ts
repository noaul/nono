import { describe, expect, test, vi } from 'vitest';
import { requestSafeResource } from './outbound-request.js';

describe('safe outbound requests', () => {
  test('rejects targets that resolve to private addresses', async () => {
    await expect(requestSafeResource('http://probe.example/api/stat', {}, {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      request: vi.fn()
    })).rejects.toThrow('not public');
  });

  test('revalidates every redirect before sending the next request', async () => {
    const request = vi.fn(async () => ({
      statusCode: 302,
      headers: { location: 'http://internal.example/secret' },
      body: Buffer.alloc(0)
    }));

    await expect(requestSafeResource('https://public.example/start', {}, {
      lookup: async (hostname) => [{
        address: hostname === 'public.example' ? '8.8.8.8' : '10.0.0.8',
        family: 4
      }],
      request
    })).rejects.toThrow('not public');
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('allows an explicitly configured private host', async () => {
    const request = vi.fn(async () => ({ statusCode: 200, headers: {}, body: Buffer.from('{}') }));
    const response = await requestSafeResource('http://probe.lan/api/stat', {
      allowPrivateHosts: ['probe.lan']
    }, {
      lookup: async () => [{ address: '192.168.1.10', family: 4 }],
      request
    });

    expect(response.statusCode).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('does not send API credentials to a public HTTP endpoint', async () => {
    const request = vi.fn(async () => ({ statusCode: 200, headers: {}, body: Buffer.from('{}') }));

    await expect(requestSafeResource('http://probe.example/api/stat', {
      headers: { 'x-openai-api-key': 'secret' }
    }, {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      request
    })).rejects.toThrow('HTTPS');

    expect(request).not.toHaveBeenCalled();
  });

  test('removes custom token headers when a redirect changes origin', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        statusCode: 307,
        headers: { location: 'https://other.example/api/stat' },
        body: Buffer.alloc(0)
      })
      .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: Buffer.from('{}') });

    await requestSafeResource('https://probe.example/api/stat', {
      headers: { 'x-github-token': 'secret' }
    }, {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      request
    });

    expect(request.mock.calls[1][2].headers).not.toHaveProperty('x-github-token');
  });
});
