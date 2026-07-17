import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, shouldForwardToConsole } from './logger';

afterEach(() => {
  logger.clear();
  vi.restoreAllMocks();
});

describe('logger console forwarding', () => {
  it('keeps production logs off the console unless diagnostics are enabled', () => {
    expect(shouldForwardToConsole(false, false)).toBe(false);
    expect(shouldForwardToConsole(false, true)).toBe(true);
    expect(shouldForwardToConsole(true, false)).toBe(true);
  });

  it('keeps sanitized Error details for non-error log levels', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logger.warn('test', 'Operation degraded', new Error('request failed'));

    expect(logger.getEntries()).toHaveLength(1);
    expect(logger.getEntries()[0].data).toMatchObject({
      name: 'Error',
      message: 'request failed',
    });
  });
});
