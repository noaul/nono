import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NetworkPanel } from './NetworkPanel';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backendAdapter';

vi.unmock('../../store/useAppStore');
const toast = vi.fn();
vi.mock('../../hooks/useDialog', () => ({ useDialog: () => ({ toast, confirm: async () => true }) }));

const proxy = { enabled: true, type: 'http' as const, host: '127.0.0.1', port: 7890 };
const rpc = { enabled: false, host: '127.0.0.1', port: 6800 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type FetchCall = { url: string; method: string; body?: string };

const mockFetch = (handler: (call: FetchCall) => Response | Promise<Response>) => {
  const calls: FetchCall[] = [];
  vi.mocked(window.fetch).mockImplementation(async (input, init) => {
    const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body as string | undefined };
    calls.push(call);
    return handler(call);
  });
  return calls;
};

const settingsGet = (call: FetchCall) => {
  if (call.url.endsWith('/settings/proxy')) return json(proxy);
  return json(rpc);
};

describe('NetworkPanel (web)', () => {
  beforeEach(() => {
    toast.mockReset();
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.spyOn(backend, 'backendUrl', 'get').mockReturnValue('/api/nostar');
    useAppStore.setState({ proxyConfig: proxy, rpcDownloadConfig: rpc, backendApiSecret: 'secret' });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it('tests the proxy through NoNo even if a stray electronAPI global exists', async () => {
    const electronTest = vi.fn();
    (window as unknown as Record<string, unknown>).electronAPI = { testProxy: electronTest, setProxy: vi.fn() };
    const calls = mockFetch((call) => call.method === 'POST' ? json({ success: true }) : settingsGet(call));
    render(<NetworkPanel t={(_zh, en) => en} />);
    fireEvent.click(screen.getByText('Test Connection'));
    expect(await screen.findByText('Proxy connection successful')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/nostar/settings/proxy/test')).toBe(true);
    expect(electronTest).not.toHaveBeenCalled();
  });

  it('hides the proxy card when NoNo is unreachable', () => {
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(false);
    vi.spyOn(backend, 'init').mockResolvedValue();
    (window as unknown as Record<string, unknown>).electronAPI = { testProxy: vi.fn(), setProxy: vi.fn() };
    mockFetch(settingsGet);
    render(<NetworkPanel t={(_zh, en) => en} />);
    expect(screen.queryByText('Network Proxy')).toBeNull();
    expect(screen.getByText('Remote Download')).toBeInTheDocument();
  });
});
