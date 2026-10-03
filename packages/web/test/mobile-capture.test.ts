import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_EVENT,
  CAPTURE_SAVED_EVENT,
  clearCapture,
  currentCapture,
  installCaptureListeners,
  notifyCaptureSaved,
  onCaptureSaved,
  receiveCapture,
  subscribeCapture,
  validateCapture,
} from '@/mobile/capture';

const requestId = '0b6f5a3e-8c1d-4f6a-9b2e-7d4c3a1f0e9b';

describe('mobile capture payload', () => {
  afterEach(() => clearCapture());

  it('accepts an http(s) share and normalizes it', () => {
    expect(validateCapture({ requestId, url: '  https://Example.com/a b ', title: '  中文标题 ' })).toEqual({
      ok: true,
      capture: { requestId, url: 'https://example.com/a%20b', title: '中文标题' },
    });
    expect(validateCapture({ requestId, url: 'http://example.com' })).toMatchObject({ ok: true, capture: { title: null } });
    expect(validateCapture({ requestId, url: 'http://example.com', title: '   ' })).toMatchObject({ ok: true, capture: { title: null } });
  });

  it.each([
    ['not an object', null, 'invalid-payload'],
    ['an array', [requestId], 'invalid-payload'],
    ['missing requestId', { url: 'https://example.com' }, 'invalid-request-id'],
    ['short requestId', { requestId: 'abc', url: 'https://example.com' }, 'invalid-request-id'],
    ['requestId over 80 chars', { requestId: 'a'.repeat(81), url: 'https://example.com' }, 'invalid-request-id'],
    ['javascript URL', { requestId, url: 'javascript:alert(1)' }, 'invalid-url'],
    ['intent URL', { requestId, url: 'intent://scan/#Intent;end' }, 'invalid-url'],
    ['plain words', { requestId, url: 'look at this' }, 'invalid-url'],
    ['URL over 4096 chars', { requestId, url: `https://example.com/${'a'.repeat(4096)}` }, 'url-too-long'],
    ['title over 200 chars', { requestId, url: 'https://example.com', title: 't'.repeat(201) }, 'title-too-long'],
    ['non-string title', { requestId, url: 'https://example.com', title: 42 }, 'invalid-payload'],
  ])('rejects %s', (_label, payload, reason) => {
    expect(validateCapture(payload)).toEqual({ ok: false, reason });
  });

  it('only publishes valid payloads to subscribers', () => {
    const listener = vi.fn();
    const stop = subscribeCapture(listener);
    expect(listener).toHaveBeenLastCalledWith(null);

    expect(receiveCapture({ requestId, url: 'ftp://example.com' }).ok).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    receiveCapture({ requestId, url: 'https://example.com' });
    expect(listener).toHaveBeenLastCalledWith({ requestId, url: 'https://example.com/', title: null });
    stop();
  });

  it('receives shares from the window event, same-origin messages and history state', async () => {
    window.history.replaceState({ nonoCapture: { requestId, url: 'https://history.example/' } }, '');
    const cleanup = installCaptureListeners(window);
    expect(currentCapture()?.url).toBe('https://history.example/');

    window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: { requestId: 'event-request-1', url: 'https://event.example/' } }));
    expect(currentCapture()?.requestId).toBe('event-request-1');

    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { type: 'capture.pending', payload: { requestId: 'evil-request-1', url: 'https://evil.example/' } } }));
    expect(currentCapture()?.requestId).toBe('event-request-1');

    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, data: { type: 'capture.pending', payload: { requestId: 'message-request-1', url: 'https://message.example/' } } }));
    expect(currentCapture()?.requestId).toBe('message-request-1');

    cleanup();
    window.history.replaceState(null, '');
  });

  it('reports a saved capture to the bridge and forgets it', () => {
    receiveCapture({ requestId, url: 'https://example.com' });
    const bridge = vi.fn();
    const windowEvent = vi.fn();
    const stop = onCaptureSaved(bridge);
    window.addEventListener(CAPTURE_SAVED_EVENT, windowEvent);

    notifyCaptureSaved(requestId);

    expect(bridge).toHaveBeenCalledWith(requestId);
    expect((windowEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ type: 'capture.saved', requestId });
    expect(currentCapture()).toBeNull();
    stop();
    window.removeEventListener(CAPTURE_SAVED_EVENT, windowEvent);
  });
});
