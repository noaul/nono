import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { aiTarget, aiTestBody, assertProxyTarget, outboundRequest } from '../src/routes/nostar/network.js';

describe('NoStar AI network helpers', () => {
  it.each([
    ['openai', 'https://ai.example/v1/chat/completions'],
    ['openai-responses', 'https://ai.example/v1/responses'],
  ])('does not duplicate an API version already present in the base URL', (apiType, expectedUrl) => {
    const target = aiTarget({
      apiType,
      baseUrl: 'https://ai.example/v1',
      apiKey: 'secret',
      model: 'model',
    });

    expect(target.url).toBe(expectedUrl);
    expect(target.url).not.toContain('/v1/v1/');
  });

  it('uses the Responses API request shape when testing that API type', () => {
    expect(aiTestBody('openai-responses', 'model')).toEqual({
      model: 'model',
      max_output_tokens: 8,
      input: 'Reply OK.',
    });
  });
});

/**
 * When an admin enables a proxy the request leaves through axios, which resolves and dials itself,
 * so none of the address checks in safeRequester run. The proxy is a deliberate trust boundary, but
 * a target that is already private before resolution never needed a proxy to reach.
 */
describe('proxy target guard', () => {
  it.each([
    ['loopback v4', 'http://127.0.0.1:2030/api/internal/due'],
    ['loopback v6', 'http://[::1]:2040/api/internal/due'],
    ['RFC1918', 'http://192.168.1.10/admin'],
    ['link-local metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['carrier-grade NAT', 'http://100.64.0.1/'],
    ['localhost by name', 'http://localhost:3001/api/admin/users'],
    ['localhost with a trailing dot', 'http://localhost.:3001/api/admin/users'],
    ['an .internal name', 'https://vault.internal/secret'],
    ['an .internal name with a trailing dot', 'https://vault.internal./secret'],
  ])('rejects %s', (_label, url) => {
    expect(() => assertProxyTarget(url, [])).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Proxy target must be a public address' }),
    );
  });

  it.each([
    ['a public API', 'https://api.github.com/graphql'],
    ['a public literal', 'https://93.184.216.34/'],
    ['an ordinary hostname the proxy will resolve', 'https://ai.example.com/v1/chat/completions'],
  ])('allows %s', (_label, url) => {
    expect(() => assertProxyTarget(url, [])).not.toThrow();
  });

  it('honours the administrator private-host allowlist', () => {
    expect(() => assertProxyTarget('http://10.0.0.5:8080/', ['10.0.0.5'])).not.toThrow();
    expect(() => assertProxyTarget('http://10.0.0.6:8080/', ['10.0.0.5'])).toThrow('public address');
  });

  it('rejects a URL it cannot parse rather than passing it through', () => {
    expect(() => assertProxyTarget('not a url', [])).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Invalid outbound URL' }),
    );
  });

  it.each([
    'ftp://public.example/archive',
    'https://user:password@public.example/private',
  ])('rejects a non-HTTP or credential-bearing target: %s', (url) => {
    expect(() => assertProxyTarget(url, [])).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Invalid outbound URL' }),
    );
  });

  it('validates every proxy redirect before sending the next request', async () => {
    const targets: string[] = [];
    const proxy = http.createServer((request, response) => {
      targets.push(request.url || '');
      if (targets.length === 1) {
        response.writeHead(302, { location: 'http://127.0.0.1:4567/private' });
        response.end();
        return;
      }
      response.end('private response');
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Proxy did not bind a TCP port');

    try {
      await expect(outboundRequest(
        { privateOutboundHosts: [] } as never,
        { id: 1, username: 'admin', email: 'admin@nono.test', displayName: 'Admin', role: 'admin' },
        'http://public.example/start',
        { method: 'GET', timeout: 2000 },
        { enabled: true, type: 'http', host: '127.0.0.1', port: address.port },
      )).rejects.toMatchObject({ statusCode: 400, message: 'Proxy target must be a public address' });
      expect(targets).toEqual(['http://public.example/start']);
    } finally {
      await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('strips credentials before following a cross-origin proxy redirect', async () => {
    const requests: Array<{ url: string; authorization?: string }> = [];
    const proxy = http.createServer((request, response) => {
      requests.push({ url: request.url || '', authorization: request.headers.authorization });
      if (requests.length === 1) {
        response.writeHead(302, { location: 'http://second.example/final' });
        response.end();
        return;
      }
      response.end('ok');
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Proxy did not bind a TCP port');

    try {
      const response = await outboundRequest(
        { privateOutboundHosts: [] } as never,
        { id: 1, username: 'admin', email: 'admin@nono.test', displayName: 'Admin', role: 'admin' },
        'http://first.example/start',
        { method: 'GET', headers: { authorization: 'Bearer stored-secret' }, timeout: 2000 },
        { enabled: true, type: 'http', host: '127.0.0.1', port: address.port },
      );

      expect(response.status).toBe(200);
      expect(requests).toEqual([
        { url: 'http://first.example/start', authorization: 'Bearer stored-secret' },
        { url: 'http://second.example/final', authorization: undefined },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('stops after three followed proxy redirects', async () => {
    const targets: string[] = [];
    const proxy = http.createServer((request, response) => {
      targets.push(request.url || '');
      response.writeHead(302, { location: `http://public.example/hop-${targets.length}` });
      response.end();
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Proxy did not bind a TCP port');

    try {
      await expect(outboundRequest(
        { privateOutboundHosts: [] } as never,
        { id: 1, username: 'admin', email: 'admin@nono.test', displayName: 'Admin', role: 'admin' },
        'http://public.example/start',
        { method: 'GET', timeout: 2000 },
        { enabled: true, type: 'http', host: '127.0.0.1', port: address.port },
      )).rejects.toMatchObject({ statusCode: 502, message: 'Too many proxy redirects' });
      expect(targets).toHaveLength(4);
    } finally {
      await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each([
    [301, 'POST', 'GET', false],
    [302, 'POST', 'GET', false],
    [303, 'PUT', 'GET', false],
    [307, 'POST', 'POST', true],
    [308, 'POST', 'POST', true],
  ])('handles HTTP %i redirects from %s as %s', async (status, initialMethod, redirectedMethod, preservesBody) => {
    const requests: Array<{ method?: string; body: string }> = [];
    const proxy = http.createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        requests.push({ method: request.method, body });
        if (requests.length === 1) {
          response.writeHead(status, { location: 'http://public.example/final' });
          response.end();
          return;
        }
        response.end('ok');
      });
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Proxy did not bind a TCP port');

    try {
      const response = await outboundRequest(
        { privateOutboundHosts: [] } as never,
        { id: 1, username: 'admin', email: 'admin@nono.test', displayName: 'Admin', role: 'admin' },
        'http://public.example/start',
        { method: initialMethod, data: 'payload', headers: { 'content-type': 'text/plain' }, timeout: 2000 },
        { enabled: true, type: 'http', host: '127.0.0.1', port: address.port },
      );

      expect(response.status).toBe(200);
      expect(requests).toEqual([
        { method: initialMethod, body: 'payload' },
        { method: redirectedMethod, body: preservesBody ? 'payload' : '' },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  });

});
