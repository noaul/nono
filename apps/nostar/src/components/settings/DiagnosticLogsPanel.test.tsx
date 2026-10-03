import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiagnosticLogsPanel } from './DiagnosticLogsPanel';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backendAdapter';

vi.unmock('../../store/useAppStore');
const toast = vi.fn();
vi.mock('../../hooks/useDialog', () => ({ useDialog: () => ({ toast, confirm: async () => true }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const t = (_zh: string, en: string) => en;

describe('DiagnosticLogsPanel feedback', () => {
  let failMethod: string | null;
  let failStatus: number | null;

  beforeEach(() => {
    toast.mockReset();
    failMethod = null;
    failStatus = null;
    useAppStore.setState({ language: 'en' });
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.mocked(window.fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET';
      if (failMethod === method || failMethod === '*') {
        if (failStatus) return json({ error: 'nope' }, failStatus);
        throw new TypeError('Failed to fetch');
      }
      return method === 'POST' ? json({ debugMode: true }) : json([]);
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const errorToasts = () => toast.mock.calls.filter(([, type]) => type === 'error');

  it('tells the user when the log export fails', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => { throw new Error('blob blocked'); } });
    render(<DiagnosticLogsPanel t={t} />);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(errorToasts()).toHaveLength(1));
    expect(errorToasts()[0][0]).toMatch(/export/i);
    expect(screen.getByRole('button', { name: /Export/ })).not.toBeDisabled();
  });

  it('warns when backend logs could not be included in the export', async () => {
    const created: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { created.push(blob); return 'blob:x'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DiagnosticLogsPanel t={t} />);
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    failMethod = 'GET';
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(toast.mock.calls.some(([msg, type]) => type === 'warning' && /backend/i.test(msg))).toBe(true);
  });

  it('tells the user when refreshing backend logs fails', async () => {
    render(<DiagnosticLogsPanel t={t} />);
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    failMethod = 'GET';
    fireEvent.click(screen.getByTitle('Refresh'));
    await waitFor(() => expect(errorToasts()).toHaveLength(1));
  });

  it('tells the user when clearing backend logs is rejected',async () => {
    render(<DiagnosticLogsPanel t={t} />);
    failMethod = 'DELETE';
    failStatus = 500;
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => expect(errorToasts()).toHaveLength(1));
  });

  it('tells the user when toggling backend debug fails and leaves it off', async () => {
    render(<DiagnosticLogsPanel t={t} />);
    failMethod = 'POST';
    fireEvent.click(screen.getByRole('button', { name: 'Toggle backend debug' }));
    await waitFor(() => expect(errorToasts()).toHaveLength(1));
    expect(screen.queryByText('Debug mode ON')).toBeNull();
  });
});
