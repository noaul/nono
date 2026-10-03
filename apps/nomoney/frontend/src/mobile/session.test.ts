import { describe, expect, it, vi } from 'vitest';
import { connectMobileBridge } from './bridge';
import { logoutSharedSession } from './session';

function native(capable = true) {
  const messages: Array<{ type: string; payload: unknown }> = [];
  const port = { postMessage: (raw: string) => messages.push(JSON.parse(raw)), onmessage: null as ((event: { data: unknown }) => void) | null };
  const bridge = connectMobileBridge({ port, onBack: () => false })!;
  if (capable) port.onmessage?.({ data: JSON.stringify({ v: 1, requestId: 'ready', type: 'bridge.ready', payload: { version: 1, capabilities: ['session.clear'] } }) });
  return { bridge, messages };
}

describe('shared NoMoney and Yumi logout', () => {
  it('revokes the server session before requesting negotiated native cleanup', async () => {
    const { bridge, messages } = native();
    const fetcher = vi.fn(async () => {
      expect(messages.some(item => item.type === 'session.clear')).toBe(false);
      return new Response(null, { status: 204 });
    });
    const navigate = vi.fn();
    expect(await logoutSharedSession({ bridge, fetcher, navigate, confirmLocalLogout: () => false })).toBe('native');
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    expect(messages.at(-1)?.type).toBe('session.clear');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('requires explicit consent before offline local cleanup and never replays logout', async () => {
    const { bridge, messages } = native();
    const fetcher = vi.fn(async () => { throw new TypeError('offline'); });
    const confirmLocalLogout = vi.fn(() => true);
    const navigate = vi.fn();
    expect(await logoutSharedSession({ bridge, fetcher, navigate, confirmLocalLogout })).toBe('local');
    expect(confirmLocalLogout).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(messages.at(-1)?.type).toBe('session.clear');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the session when local logout is canceled', async () => {
    const { bridge, messages } = native();
    const result = await logoutSharedSession({ bridge, fetcher: async () => { throw new TypeError('offline'); }, navigate: vi.fn(), confirmLocalLogout: () => false });
    expect(result).toBe('canceled');
    expect(messages.some(item => item.type === 'session.clear')).toBe(false);
  });

  it('does not silently leave the page on browser network or server failures', async () => {
    for (const fetcher of [async () => { throw new TypeError('offline'); }, async () => new Response(null, { status: 503 })]) {
      const navigate = vi.fn();
      await expect(logoutSharedSession({ bridge: null, fetcher, navigate, confirmLocalLogout: vi.fn() })).rejects.toThrow();
      expect(navigate).not.toHaveBeenCalled();
    }
  });

  it('does not treat an HTTP failure as consent for local native logout', async () => {
    const { bridge, messages } = native();
    const confirmLocalLogout = vi.fn(() => true);
    await expect(logoutSharedSession({ bridge, fetcher: async () => new Response(null, { status: 500 }), navigate: vi.fn(), confirmLocalLogout })).rejects.toThrow('HTTP 500');
    expect(confirmLocalLogout).not.toHaveBeenCalled();
    expect(messages.some(item => item.type === 'session.clear')).toBe(false);
  });

  it('unnegotiated native clients use browser navigation only after successful server logout', async () => {
    const { bridge, messages } = native(false);
    const navigate = vi.fn();
    await logoutSharedSession({ bridge, fetcher: async () => new Response(null, { status: 204 }), navigate, confirmLocalLogout: () => true });
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(messages.some(item => item.type === 'session.clear')).toBe(false);
  });
});
