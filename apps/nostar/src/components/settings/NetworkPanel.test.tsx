import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// Render and let the on-mount settings load settle so it cannot race the click.
const renderLoaded = async (calls: FetchCall[]) => {
  render(<NetworkPanel t={(_zh, en) => en} />);
  await waitFor(() => expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2));
  await new Promise((resolve) => setTimeout(resolve, 0));
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

  it('rolls back the proxy switch and tells the user when NoNo rejects it', async () => {
    const calls = mockFetch((call) => call.method === 'PUT' ? json({ error: 'nope' }, 500) : settingsGet(call));
    await renderLoaded(calls);
    const toggle = screen.getByRole('switch', { name: 'Enable network proxy' });
    fireEvent.click(toggle);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/proxy/i), 'error'));
    expect(useAppStore.getState().proxyConfig.enabled).toBe(true);
    expect(screen.getByRole('switch', { name: 'Enable network proxy' })).toHaveAttribute('aria-checked', 'true');
  });

  it('rolls back the remote download switch and tells the user when saving fails', async () => {
    const calls = mockFetch((call) => {
      if (call.method === 'PUT') throw new TypeError('Failed to fetch');
      return settingsGet(call);
    });
    await renderLoaded(calls);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable remote download' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/remote download/i), 'error'));
    expect(useAppStore.getState().rpcDownloadConfig.enabled).toBe(false);
    expect(screen.getByRole('switch', { name: 'Enable remote download' })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps a successful switch without an error', async () => {
    const calls = mockFetch((call) => call.method === 'PUT' ? json({ ok: true }) : settingsGet(call));
    await renderLoaded(calls);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable remote download' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(useAppStore.getState().rpcDownloadConfig.enabled).toBe(true);
    expect(toast).not.toHaveBeenCalled();
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
