import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('backendAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mark a backend as available when health passes but authenticated routes reject it', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok', version: 'test', timestamp: 'now' });
      }
      if (url.endsWith('/settings')) {
        return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();

    expect(backend.isAvailable).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/settings'), expect.any(Object));
  });

  it('marks a backend as available when health and authenticated routes pass', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok', version: 'test', timestamp: 'now' });
      }
      if (url.endsWith('/settings')) {
        return jsonResponse({});
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();

    expect(backend.isAvailable).toBe(true);
  });

  it('uses the NoStar API mount and same-origin session credentials', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok', version: 'test', timestamp: 'now' });
      }
      if (url.endsWith('/settings')) {
        return jsonResponse({});
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await backend.init();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/nostar/health'), expect.any(Object));
    const settingsCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/settings'));
    expect(settingsCall?.[1]).toMatchObject({
      credentials: 'same-origin',
    });
    expect(settingsCall?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('never asks the server to decrypt integration credentials', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
      if (url.endsWith('/settings')) return jsonResponse({});
      if (url.includes('/configs/ai')) return jsonResponse([]);
      if (url.includes('/configs/webdav')) return jsonResponse([]);
      if (url.includes('/configs/embedding')) return jsonResponse([]);
      if (url.includes('/configs/vector-search')) return jsonResponse({ enabled: false });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await backend.init();

    await backend.fetchAIConfigs();
    await backend.fetchWebDAVConfigs();
    await backend.fetchEmbeddingConfigs();
    await backend.fetchVectorSearchConfig();

    expect(fetchMock.mock.calls.map(([url]) => String(url)).join('\n')).not.toContain('decrypt=true');
  });

  it('preserves Google form bodies and content type through the same-origin translation proxy', async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => jsonResponse(String(url).endsWith('/health') ? { status: 'ok' } : {}));
    vi.stubGlobal('fetch', request);
    await backend.init();
    const body = new URLSearchParams();
    body.append('q', 'hello world');
    body.append('q', 'another line');
    await backend.proxyPublicRequest('https://clients5.google.com/translate_a/t?tl=zh-CN', { method: 'POST', body });
    const call = request.mock.calls[request.mock.calls.length - 1] as unknown as [string, RequestInit];
    expect(call[0]).toContain('/api/nostar/proxy/public');
    expect(JSON.parse(String(call[1].body))).toMatchObject({ body: 'q=hello+world&q=another+line', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
  });

  it('sends release changes with explicit deletions instead of replacing another device snapshot', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
      if (url.endsWith('/settings')) return jsonResponse({});
      if (url.endsWith('/releases')) return jsonResponse({ synced: 0 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await backend.init();

    await backend.syncReleases([]);

    const request = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/releases') && init?.method === 'PUT');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ releases: [], isFullSync: false, deletedIds: [] });
  });
  it('keeps the last applied baseline when a polled snapshot is discarded', async () => {
    const original = [{ id: 42, full_name: 'owner/repo', custom_description: 'original' }];
    const remote = [{ ...original[0], custom_description: 'remote edit' }, { id: 43, full_name: 'owner/new' }];
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
      if (url.endsWith('/settings')) return jsonResponse({});
      if (init?.method === 'PUT') return jsonResponse({ synced: 1 });
      if (url.includes('/repositories?')) return jsonResponse({ repositories: remote, total: 2 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await backend.init();
    backend.acceptSyncBaselines({ repositories: original as never });
    await backend.fetchRepositories(false);
    await backend.syncRepositories([{ ...original[0], custom_category: 'local category' }] as never);
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(request?.[1]?.body)).baseRepositories).toEqual(original);
  });

});
