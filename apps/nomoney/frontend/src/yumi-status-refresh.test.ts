import { describe, expect, it, vi } from 'vitest';
import { formatStatusDay, startVisibleStatusRefresh, type VisibleStatusRefreshRuntime } from './yumi-status-refresh';

class TestEventSource {
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

describe('Yumi status refresh lifecycle', () => {
  it('keeps an API calendar day unchanged in a UTC-negative browser timezone', () => {
    expect(formatStatusDay('2026-08-12', 'zh')).toBe('2026年8月12日');
    expect(formatStatusDay('2026-08-12', 'en')).toBe('Aug 12, 2026');
  });

  it('refreshes only while visible and stops every trigger during cleanup', () => {
    const windowEvents = new TestEventSource();
    const documentEvents = new TestEventSource();
    const refresh = vi.fn();
    let visible = true;
    let now = 0;
    let interval: (() => void) | undefined;
    const clearInterval = vi.fn();
    const runtime: VisibleStatusRefreshRuntime = {
      windowEvents,
      documentEvents,
      isVisible: () => visible,
      now: () => now,
      setInterval: (handler, delay) => {
        expect(delay).toBe(5 * 60_000);
        interval = handler;
        return 7;
      },
      clearInterval
    };

    const cleanup = startVisibleStatusRefresh(refresh, 5 * 60_000, runtime);

    interval?.();
    expect(refresh).toHaveBeenCalledTimes(1);

    visible = false;
    interval?.();
    documentEvents.emit('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(1);

    visible = true;
    now = 1_000;
    documentEvents.emit('visibilitychange');
    windowEvents.emit('focus');
    expect(refresh).toHaveBeenCalledTimes(2);

    now = 2_500;
    windowEvents.emit('online');
    expect(refresh).toHaveBeenCalledTimes(3);

    cleanup();
    now = 4_000;
    interval?.();
    windowEvents.emit('focus');
    documentEvents.emit('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(clearInterval).toHaveBeenCalledWith(7);
    expect(windowEvents.listenerCount('focus')).toBe(0);
    expect(windowEvents.listenerCount('online')).toBe(0);
    expect(documentEvents.listenerCount('visibilitychange')).toBe(0);
  });
});
