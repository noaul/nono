import { describe, expect, it } from 'vitest';
import { aiTarget, aiTestBody, assertProxyTarget } from '../src/routes/nostar/network.js';

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
    ['an .internal name', 'https://vault.internal/secret'],
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
});
