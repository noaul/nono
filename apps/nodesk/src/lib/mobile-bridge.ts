/**
 * Page side of the NoNo Android bridge, protocol v1: `{v:1, requestId, type, payload}` as JSON.
 * The app injects `window.NonoBridge` only into NoNo pages in its own WebView; elsewhere this is a
 * no-op. The message names follow the app's allowlist in BridgeProtocol.kt.
 */
export type BridgeEnvelope = { v: 1; requestId: string; type: string; payload: Record<string, unknown> };

type NativePort = {
  postMessage(data: string): void;
  addEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
};

export type MobileBridge = {
  /** Tell the app whether a back press should go to this page (an open dialog, panel or menu). */
  setBackState(canHandle: boolean): void;
  send(type: string, payload?: Record<string, unknown>, requestId?: string): void;
  supports(capability: string): boolean;
  dispose(): void;
};

/** Messages the app may send to a page. */
const FROM_APP = new Set(['bridge.ready', 'ui.back', 'capture.pending']);
/** Messages a page may send to the app; must match INBOUND in BridgeProtocol.kt. */
export const TO_APP = ['bridge.hello', 'ui.backState', 'ui.backResult', 'capture.request', 'capture.saved', 'capture.dismissed', 'download.request', 'session.clear'] as const;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function newRequestId() {
  return `web-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function envelope(type: string, payload: Record<string, unknown> = {}, requestId = newRequestId()) {
  return JSON.stringify({ v: 1, requestId, type, payload });
}

export function parseFromApp(raw: unknown): BridgeEnvelope | null {
  if (typeof raw !== 'string' || raw.length > 16 * 1024) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.v !== 1 || typeof message.type !== 'string' || !FROM_APP.has(message.type)) return null;
  if (typeof message.requestId !== 'string' || !REQUEST_ID.test(message.requestId)) return null;
  const payload = message.payload && typeof message.payload === 'object' ? message.payload as Record<string, unknown> : {};
  return { v: 1, requestId: message.requestId, type: message.type, payload };
}

export function connectMobileBridge(options: {
  port?: NativePort | null;
  /** Close the top-most layer; return whether something was closed. */
  onBack: () => boolean;
  onCapture?: (payload: Record<string, unknown>, requestId: string) => void;
}): MobileBridge | null {
  const port = options.port !== undefined ? options.port : (globalThis as { NonoBridge?: NativePort }).NonoBridge;
  if (!port || typeof port.postMessage !== 'function') return null;
  let disposed = false;
  const capabilities = new Set<string>();
  const post = (type: string, payload: Record<string, unknown> = {}, requestId?: string) => {
    if (!disposed) port.postMessage(envelope(type, payload, requestId));
  };
  const receive = (event: { data: unknown }) => {
    if (disposed) return;
    const message = parseFromApp(event.data);
    if (!message) return;
    if (message.type === 'bridge.ready') {
      capabilities.clear();
      if (message.payload.version === 1 && Array.isArray(message.payload.capabilities)) {
        for (const capability of message.payload.capabilities) if (typeof capability === 'string') capabilities.add(capability);
      }
    } else if (message.type === 'ui.back') {
      let handled = false;
      try {
        handled = options.onBack();
      } catch {
        // A failed close must not swallow the gesture; the app falls back to history.
      }
      post('ui.backResult', { handled }, message.requestId);
    } else if (message.type === 'capture.pending') {
      options.onCapture?.(message.payload, message.requestId);
    }
  };
  if (typeof port.addEventListener === 'function') port.addEventListener('message', receive);
  else port.onmessage = receive;
  post('bridge.hello', { version: 1 });

  let lastBackState: boolean | null = null;
  return {
    setBackState(canHandle) {
      if (canHandle === lastBackState) return;
      lastBackState = canHandle;
      post('ui.backState', { canHandle });
    },
    send: post,
    supports: capability => !disposed && capabilities.has(capability),
    dispose() {
      disposed = true;
      capabilities.clear();
      port.removeEventListener?.('message', receive);
      if (port.onmessage === receive) port.onmessage = null;
    },
  };
}
