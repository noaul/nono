import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DebugModeIndicator } from './DebugModeIndicator';
import { useAppStore } from '../store/useAppStore';
import { backend } from '../services/backendAdapter';

vi.unmock('../store/useAppStore');
const toast = vi.fn();
vi.mock('../hooks/useDialog', () => ({ useDialog: () => ({ toast, confirm: async () => true }) }));

describe('DebugModeIndicator', () => {
  beforeEach(() => {
    toast.mockReset();
    sessionStorage.setItem('gsm:frontend-debug', 'true');
    sessionStorage.setItem('gsm:backend-debug', 'true');
    useAppStore.setState({ language: 'en' });
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('keeps showing backend debug and tells the user when it cannot be turned off', async () => {
    vi.mocked(window.fetch).mockResolvedValue(new Response('{}', { status: 503 }));
    render(<DebugModeIndicator />);
    fireEvent.click(screen.getByRole('button', { name: /DEBUG/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/backend debug/i), 'error'));
    expect(sessionStorage.getItem('gsm:backend-debug')).toBe('true');
    expect(screen.getByText('BE')).toBeInTheDocument();
  });

  it('turns both debug modes off when NoNo accepts', async () => {
    vi.mocked(window.fetch).mockResolvedValue(new Response(JSON.stringify({ debugMode: false }), { status: 200 }));
    render(<DebugModeIndicator />);
    fireEvent.click(screen.getByRole('button', { name: /DEBUG/ }));
    await waitFor(() => expect(sessionStorage.getItem('gsm:backend-debug')).toBe('false'));
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /DEBUG/ })).toBeNull();
  });
});
