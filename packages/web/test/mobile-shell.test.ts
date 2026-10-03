import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMobileShell, requestPendingCapture, clearNativeSession, dismissPendingCapture } from '../src/mobile/shell';
import { clearCapture, currentCapture, notifyCaptureSaved } from '../src/mobile/capture';
import { resetMobileShellForTests } from '../src/mobile/back-layers';

afterEach(() => {
  clearCapture();
  resetMobileShellForTests();
  vi.unstubAllGlobals();
});

describe('Android shell integration', () => {
  it('receives shares after startup and acknowledges only saved requests', () => {
    const sent: any[] = [];
    let receive: (event: { data: string }) => void = () => {};
    vi.stubGlobal('NonoBridge', {
      postMessage: (raw: string) => sent.push(JSON.parse(raw)),
      addEventListener: (_: string, listener: typeof receive) => { receive = listener; },
    });
    const dispose = installMobileShell();
    requestPendingCapture();
    expect(sent.at(-1).type).toBe('capture.request');
    receive({ data: JSON.stringify({ v: 1, type: 'capture.pending', requestId: 'native-1', payload: { requestId: 'shared-request-1', url: 'https://example.com/', title: 'Example' } }) });
    expect(currentCapture()?.requestId).toBe('shared-request-1');
    dismissPendingCapture('stale-request');
    expect(currentCapture()?.requestId).toBe('shared-request-1');
    expect(sent.some(message => message.type === 'capture.saved')).toBe(false);
    notifyCaptureSaved('shared-request-1');
    expect(sent.at(-1)).toMatchObject({ type: 'capture.saved', payload: { requestId: 'shared-request-1' } });
    receive({ data: JSON.stringify({ v: 1, type: 'capture.pending', requestId: 'native-2', payload: { requestId: 'shared-request-2', url: 'https://example.com/' } }) });
    dismissPendingCapture('shared-request-2');
    expect(sent.at(-1)).toMatchObject({ type: 'capture.dismissed', payload: { requestId: 'shared-request-2' } });
    expect(currentCapture()).toBeNull();
    clearNativeSession();
    expect(currentCapture()).toBeNull();
    expect(sent.at(-1).type).toBe('session.clear');
    dispose();
  });

  it('keeps browser operation working without the native bridge', () => {
    vi.stubGlobal('NonoBridge', undefined);
    const dispose = installMobileShell();
    expect(() => { requestPendingCapture(); clearNativeSession(); }).not.toThrow();
    dispose();
  });
});
