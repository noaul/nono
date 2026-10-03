import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = () => { throw new Error('kaboom'); };

describe('ErrorBoundary copy button', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const setClipboard = (writeText: (text: string) => Promise<void>) =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  it('confirms when the error details were copied', async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Error Info' }));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('says so when copying is not possible', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Error Info' }));
    expect(await screen.findByRole('button', { name: /Copy failed/ })).toBeInTheDocument();
  });
});
