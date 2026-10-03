import { describe, expect, it } from 'vitest';
import { connectMobileBridge, parseFromApp } from '../src/mobile/bridge';

function fakePort() {
  const sent: any[] = [];
  let listener: ((event: { data: unknown }) => void) | null = null;
  return {
    sent,
    port: {
      postMessage: (data: string) => sent.push(JSON.parse(data)),
      addEventListener: (_type: 'message', handler: (event: { data: unknown }) => void) => { listener = handler; },
    },
    deliver: (message: unknown) => listener?.({ data: typeof message === 'string' ? message : JSON.stringify(message) }),
  };
}

describe('mobile bridge (page side)', () => {
  it('stays off outside the Android app', () => {
    expect(connectMobileBridge({ port: null, onBack: () => false })).toBeNull();
  });

  it('says hello and reports open layers only when they change', () => {
    const { port, sent } = fakePort();
    const bridge = connectMobileBridge({ port, onBack: () => false })!;
    bridge.setBackState(true);
    bridge.setBackState(true);
    bridge.setBackState(false);

    expect(sent.map((message) => [message.type, message.payload])).toEqual([
      ['bridge.hello', { version: 1 }],
      ['ui.backState', { canHandle: true }],
      ['ui.backState', { canHandle: false }],
    ]);
    expect(sent.every((message) => message.v === 1 && /^[A-Za-z0-9_-]{1,64}$/.test(message.requestId))).toBe(true);
  });

  it('answers a back request with the same request id', () => {
    const { port, sent, deliver } = fakePort();
    let closed = 0;
    connectMobileBridge({ port, onBack: () => { closed += 1; return true; } });
    deliver({ v: 1, requestId: 'back-1', type: 'ui.back', payload: {} });

    expect(closed).toBe(1);
    expect(sent.at(-1)).toMatchObject({ type: 'ui.backResult', requestId: 'back-1', payload: { handled: true } });
  });

  it('reports not handled when closing a layer throws', () => {
    const { port, sent, deliver } = fakePort();
    connectMobileBridge({ port, onBack: () => { throw new Error('boom'); } });
    deliver({ v: 1, requestId: 'back-2', type: 'ui.back', payload: {} });

    expect(sent.at(-1)).toMatchObject({ type: 'ui.backResult', requestId: 'back-2', payload: { handled: false } });
  });

  it('ignores messages it does not understand', () => {
    expect(parseFromApp('nope')).toBeNull();
    expect(parseFromApp(JSON.stringify({ v: 2, requestId: 'a', type: 'ui.back', payload: {} }))).toBeNull();
    expect(parseFromApp(JSON.stringify({ v: 1, requestId: 'a b', type: 'ui.back', payload: {} }))).toBeNull();
    expect(parseFromApp(JSON.stringify({ v: 1, requestId: 'a', type: 'shell.exec', payload: {} }))).toBeNull();
    expect(parseFromApp(JSON.stringify({ v: 1, requestId: 'a', type: 'ui.back' }))).toEqual({ v: 1, requestId: 'a', type: 'ui.back', payload: {} });
  });
});
