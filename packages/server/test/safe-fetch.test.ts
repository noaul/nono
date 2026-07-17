import { describe, expect, it, vi } from 'vitest';
import { fetchPublicResource, isPublicAddress, resolvePublicAddress } from '../src/utils/safe-fetch.js';

describe('safe public resource fetching', () => {
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
});
