import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';
import { WebDAVService } from './webdavService';

const config = { id: 'dav-1', name: 'DAV', url: 'https://dav.example/root', path: '/backup/', username: 'alice', password: '', isActive: true };
describe('WebDAV through the NoNo stored credential proxy', () => {
  const requests: Array<{url: string; init?: RequestInit}> = [];
  beforeEach(async () => {
    requests.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({url, init});
      if (url.endsWith('/health')) return Response.json({ status: 'ok' });
      if (url.endsWith('/settings')) return Response.json({});
      if (url.endsWith('/configs/webdav/bulk')) return Response.json({synced: 1});
      if (url.endsWith('/proxy/webdav')) {
        const payload = JSON.parse(String(init?.body));
        if (payload.method === 'HEAD') return new Response('', {status: 405});
        if (payload.method === 'PROPFIND') return new Response('<D:multistatus xmlns:D="DAV:"><D:response><D:href>/root/backup/old%20backup.json</D:href></D:response></D:multistatus>', {status: 207});
        if (payload.method === 'OPTIONS') return new Response('', {status: 200, headers: {Server: 'TestDAV', DAV: '1, 2'}});
        if (payload.method === 'GET') return new Response('{"backup":true}', {status: 200});
        return new Response('', {status: 201});
      }
      throw new Error('Browser must not contact DAV origin');
    }));
    await backend.init();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('lists XML and downloads raw JSON using only the stored config id', async () => {
    const dav = new WebDAVService(config);
    expect(await dav.listFiles()).toEqual(['old backup.json']);
    expect(await dav.downloadFile('old backup.json')).toBe('{"backup":true}');
    const calls = requests.filter(r => r.url.endsWith('/proxy/webdav'));
    expect(calls.map(r => JSON.parse(String(r.init?.body)))).toEqual([
      expect.objectContaining({configId: 'dav-1', method: 'PROPFIND', path: 'backup/', timeoutMs: 15000}),
      expect.objectContaining({configId: 'dav-1', method: 'GET', path: 'backup/old%20backup.json', timeoutMs: 30000}),
    ]);
    expect(calls.every(r => !String(r.init?.body).includes('Basic '))).toBe(true);
  });
  it('bounds the HEAD fallback PROPFIND and uses masked server-side passwords', async () => {
    vi.useFakeTimers();
    expect(await new WebDAVService(config).testConnection()).toBe(true);
    expect(requests.filter(r => r.url.endsWith('/proxy/webdav')).map(r => JSON.parse(String(r.init?.body)))).toEqual([
      expect.objectContaining({method: 'HEAD', timeoutMs: 10000}),
      expect.objectContaining({method: 'PROPFIND', timeoutMs: expect.any(Number)}),
    ]);
  });
  it('addresses the configured root collection without an empty proxy path', async () => {
    expect(await new WebDAVService({...config, path: '/'}).testConnection()).toBe(true);
    const calls = requests.filter(r => r.url.endsWith('/proxy/webdav'));
    expect(JSON.parse(String(calls[0].init?.body)).path).toBe('./');
  });
  it('reads DAV capabilities at the configured server root through OPTIONS', async () => {
    expect(await new WebDAVService(config).getServerInfo()).toEqual({server: 'TestDAV', davLevel: '1, 2'});
  });
  it('keeps abort and timeout active until a download body has been consumed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true, status: 200,
      text: () => new Promise<string>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true})),
    })));
    const pending = new WebDAVService(config).downloadFile('slow.json');
    const assertion = expect(pending).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });
  it.each([
    ['<D:status>HTTP/1.1 404 Not Found</D:status>', false],
    ['<D:status>HTTP/1.1 403 Forbidden</D:status>', false],
    ['<D:propstat><D:prop/><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>', true],
  ])('checks target resource status rather than property status: %s', async (status, expected) => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (payload.method === 'HEAD') return new Response('', {status: 405});
      return new Response(`<D:multistatus xmlns:D="DAV:"><D:response><D:href>/root/backup/</D:href>${status}</D:response></D:multistatus>`, {status: 207});
    }));
    expect(await new WebDAVService(config).testConnection()).toBe(expected);
  });
  it('uses one ten second deadline across HEAD and fallback including the response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (payload.method === 'HEAD') {
        await new Promise(resolve => setTimeout(resolve, 6000));
        return new Response('', {status: 405});
      }
      return {ok: true, status: 207, text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
      })};
    }));
    let failure: Error | undefined;
    const pending = new WebDAVService(config).testConnection().catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(10000);
    const failureAtDeadline = failure;
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(failureAtDeadline?.message).toMatch(/超时/);
  });
  it.each([
    ['<D:propstat><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>', true],
    ['<D:status>HTTP/1.1 404 Not Found</D:status>', false],
  ])('checks the encoded file target after unsupported HEAD: %s', async (status, expected) => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (payload.method === 'HEAD') return new Response('', {status: 405});
      return new Response(`<D:multistatus xmlns:D="DAV:"><D:response><D:href>https://dav.example/root/backup/old%20backup.json</D:href>${status}</D:response></D:multistatus>`, {status: 207});
    }));
    expect(await new WebDAVService(config).fileExists('old backup.json')).toBe(expected);
  });

});
