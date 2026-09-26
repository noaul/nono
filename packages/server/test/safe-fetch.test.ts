import { describe, expect, it, vi } from 'vitest';
import { fetchPublicResource, isPublicAddress, requestSafeResource, resolvePublicAddress } from '../src/utils/safe-fetch.js';

describe('safe public resource fetching', () => {

  it.each([307, 308])('rejects cross-origin body replay on HTTP %i', async (statusCode) => {
    const request = vi.fn()
      .mockResolvedValueOnce({ statusCode, headers: { location: 'https://other.example/collect' }, body: Buffer.alloc(0) })
      .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: Buffer.alloc(0) });
    await expect(requestSafeResource('https://service.example/start', {
      method: 'PUT', body: 'private backup',
    }, { lookup: async () => [{ address: '8.8.8.8', family: 4 }], request })).rejects.toThrow('Cross-origin redirect cannot replay a request body');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [301, 'POST', 'GET', undefined], [302, 'POST', 'GET', undefined],
    [303, 'PUT', 'GET', undefined], [307, 'PUT', 'PUT', 'payload'], [308, 'POST', 'POST', 'payload'],
  ])('preserves HTTP %i redirect semantics for %s', async (statusCode, method, expectedMethod, expectedBody) => {
    const request = vi.fn()
      .mockResolvedValueOnce({ statusCode, headers: { location: '/final' }, body: Buffer.alloc(0) })
      .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: Buffer.alloc(0) });
    await requestSafeResource('https://service.example/start', {
      method, body: 'payload', headers: { 'content-type': 'text/plain', 'content-length': '7' },
    }, { lookup: async () => [{ address: '8.8.8.8', family: 4 }], request });
    expect(request.mock.calls[1][2]).toMatchObject({ method: expectedMethod, body: expectedBody });
    if (!expectedBody) expect(request.mock.calls[1][2].headers).not.toHaveProperty('content-length');
  });
  it('rejects non-public IPv4 and IPv6 addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fc00::1', 'fe80::1']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('rejects hostnames whose DNS answers include private addresses', async () => {
    const lookup = vi.fn(async () => [{ address: '169.254.169.254', family: 4 as const }]);
    await expect(resolvePublicAddress('metadata.google.internal', lookup)).rejects.toThrow('Target address is not public');
  });

  it('revalidates redirects before making the next request', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]);
    const request = vi.fn(async () => ({
      statusCode: 302,
      headers: { location: 'http://127.0.0.1/latest/meta-data/' },
      body: Buffer.alloc(0),
    }));

    await expect(fetchPublicResource('https://public.example/', {}, { lookup, request })).rejects.toThrow('Target address is not public');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('sends POST bodies through the pinned public address', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]);
    const request = vi.fn(async (_url, _address, options) => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"ok":true}'),
      requestOptions: options,
    }));

    const response = await requestSafeResource('https://api.example/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
      body: '{"prompt":"hello"}',
    }, { lookup, request });

    expect(response.statusCode).toBe(200);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'api.example' }),
      { address: '93.184.216.34', family: 4 },
      expect.objectContaining({ method: 'POST', body: '{"prompt":"hello"}' }),
    );
  });

  it('allows an exact private hostname only when explicitly allowlisted', async () => {
    const lookup = vi.fn(async () => [{ address: '192.168.1.20', family: 4 as const }]);
    const request = vi.fn(async () => ({ statusCode: 200, headers: {}, body: Buffer.alloc(0) }));

    await expect(requestSafeResource('http://llm.lan/v1/models', {}, { lookup, request })).rejects.toThrow('Target address is not public');
    await expect(requestSafeResource('http://llm.lan/v1/models', {
      allowPrivateHosts: ['llm.lan'],
    }, { lookup, request })).resolves.toMatchObject({ statusCode: 200 });
  });

  it('rejects credentials over public HTTP while allowing explicit private HTTP integrations', async () => {
    const lookup = vi.fn(async (hostname: string) => [{
      address: hostname === 'llm.lan' ? '192.168.1.20' : '93.184.216.34',
      family: 4 as const,
    }]);
    const request = vi.fn(async () => ({ statusCode: 200, headers: {}, body: Buffer.alloc(0) }));

    await expect(requestSafeResource('http://api.example/v1/messages', {
      headers: { authorization: 'Bearer secret' },
    }, { lookup, request })).rejects.toThrow('HTTPS');
    await expect(requestSafeResource('http://api.example/v1/messages', {
      headers: { 'x-openai-api-key': 'secret' },
    }, { lookup, request })).rejects.toThrow('HTTPS');
    await expect(requestSafeResource('http://api.example/v1/messages?key=secret', {}, {
      lookup,
      request,
    })).rejects.toThrow('HTTPS');
    await expect(requestSafeResource('http://api.example/v1/messages?client_secret=secret', {}, {
      lookup,
      request,
    })).rejects.toThrow('HTTPS');
    await expect(requestSafeResource('http://llm.lan/v1/messages', {
      headers: { 'x-api-key': 'secret' },
      allowPrivateHosts: ['llm.lan'],
    }, { lookup, request })).resolves.toMatchObject({ statusCode: 200 });
  });

  it('removes authorization when a redirect changes origin', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]);
    const request = vi
      .fn()
      .mockResolvedValueOnce({ statusCode: 307, headers: { location: 'https://other.example/v1/messages' }, body: Buffer.alloc(0) })
      .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: Buffer.alloc(0) });

    const response = await requestSafeResource('https://api.example/v1/messages', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'x-api-key': 'secret',
        'x-github-token': 'secret',
      },
    }, { lookup, request });

    expect(request.mock.calls[1][2].headers).not.toHaveProperty('authorization');
    expect(request.mock.calls[1][2].headers).not.toHaveProperty('x-api-key');
    expect(request.mock.calls[1][2].headers).not.toHaveProperty('x-github-token');
    expect(response.finalUrl).toBe('https://other.example/v1/messages');
  });
});
