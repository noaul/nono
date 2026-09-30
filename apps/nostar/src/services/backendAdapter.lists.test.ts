import { beforeEach, expect, it, vi } from 'vitest';
import { backend } from './backendAdapter';
beforeEach(() => vi.restoreAllMocks());
it('uses session GraphQL proxy without client token and never replays failed mutations', async () => {
  const call = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }));
    if (String(input).endsWith('/settings')) return new Response('{}');
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', call);
  await backend.init();
  await expect(
    backend.proxyGitHubGraphQL('mutation { createUserList }', { name: 'Tools' }),
  ).rejects.toThrow('Failed to fetch');
  const requests = call.mock.calls.filter(([url]) => String(url).endsWith('/proxy/github/graphql'));
  expect(requests).toHaveLength(1);
  expect(call).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/nostar/proxy/github/graphql'),
    expect.objectContaining({
      credentials: 'same-origin',
      body: JSON.stringify({ query: 'mutation { createUserList }', variables: { name: 'Tools' } }),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});
