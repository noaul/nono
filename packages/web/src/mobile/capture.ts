/**
 * Pending share from the Android app ("share to NoNo"), handed to /mobile/capture.
 *
 * The URL never travels in the page address (deep links and server logs would keep it). The native
 * side delivers it in-page instead, through one of:
 *   - `receiveCapture(payload)` — what the message bridge will call;
 *   - a `nono:capture` CustomEvent on window whose `detail` is the payload;
 *   - a same-origin `message` event `{ type: 'capture.pending', payload }`;
 *   - `history.state.nonoCapture` set before the route loads.
 * Every path goes through the same validation.
 */

export interface PendingCapture {
  requestId: string;
  url: string;
  title: string | null;
}

export type CaptureRejection = 'invalid-payload' | 'invalid-request-id' | 'invalid-url' | 'url-too-long' | 'title-too-long';

export type CaptureValidation =
  | { ok: true; capture: PendingCapture }
  | { ok: false; reason: CaptureRejection };

export const CAPTURE_MAX_URL_LENGTH = 4096;
export const CAPTURE_MAX_TITLE_LENGTH = 200;
/** Same rule as the server (packages/server/src/routes/mobile/bookmarks.ts). */
export const CAPTURE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
export const CAPTURE_EVENT = 'nono:capture';
export const CAPTURE_SAVED_EVENT = 'nono:capture-saved';
export const CAPTURE_HISTORY_KEY = 'nonoCapture';

type CaptureListener = (capture: PendingCapture | null) => void;
type SavedListener = (requestId: string) => void;

let pending: PendingCapture | null = null;
const captureListeners = new Set<CaptureListener>();
const savedListeners = new Set<SavedListener>();

/** Returns the URL in canonical form when it is an http(s) address within the length limit. */
export function normalizeCaptureUrl(value: unknown): { ok: true; url: string } | { ok: false; reason: 'invalid-url' | 'url-too-long' } {
  if (typeof value !== 'string') return { ok: false, reason: 'invalid-url' };
  const trimmed = value.trim();
  if (trimmed.length > CAPTURE_MAX_URL_LENGTH) return { ok: false, reason: 'url-too-long' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'invalid-url' };
  if (parsed.href.length > CAPTURE_MAX_URL_LENGTH) return { ok: false, reason: 'url-too-long' };
  return { ok: true, url: parsed.href };
}

export function validateCapture(payload: unknown): CaptureValidation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'invalid-payload' };
  const input = payload as Record<string, unknown>;
  if (typeof input.requestId !== 'string' || !CAPTURE_REQUEST_ID_PATTERN.test(input.requestId)) {
    return { ok: false, reason: 'invalid-request-id' };
  }
  const url = normalizeCaptureUrl(input.url);
  if (!url.ok) return url;
  if (input.title !== undefined && input.title !== null && typeof input.title !== 'string') return { ok: false, reason: 'invalid-payload' };
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length > CAPTURE_MAX_TITLE_LENGTH) return { ok: false, reason: 'title-too-long' };
  return { ok: true, capture: { requestId: input.requestId, url: url.url, title: title || null } };
}

/** Validates and, when valid, makes the payload the pending capture shown by /mobile/capture. */
export function receiveCapture(payload: unknown): CaptureValidation {
  const result = validateCapture(payload);
  if (result.ok) {
    pending = result.capture;
    captureListeners.forEach((listener) => listener(pending));
  }
  return result;
}

export function currentCapture() {
  return pending;
}

/** Calls the listener with the current capture right away and on every change; returns an unsubscribe. */
export function subscribeCapture(listener: CaptureListener) {
  captureListeners.add(listener);
  listener(pending);
  return () => {
    captureListeners.delete(listener);
  };
}

export function clearCapture() {
  pending = null;
  captureListeners.forEach((listener) => listener(null));
}

/**
 * Tells the native side the share is saved so it can drop its stored copy (`capture.saved`).
 * The bridge subscribes with onCaptureSaved; a window event is dispatched as well. The pending
 * capture is dropped without notifying subscribers, so a page showing the saved result keeps it.
 */
export function notifyCaptureSaved(requestId: string) {
  if (pending?.requestId === requestId) pending = null;
  savedListeners.forEach((listener) => listener(requestId));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CAPTURE_SAVED_EVENT, { detail: { type: 'capture.saved', requestId } }));
  }
}

export function onCaptureSaved(listener: SavedListener) {
  savedListeners.add(listener);
  return () => {
    savedListeners.delete(listener);
  };
}

/** Wires the in-page delivery paths listed at the top of this file; returns a cleanup function. */
export function installCaptureListeners(target: Window = window) {
  const fromHistory = (target.history?.state as Record<string, unknown> | null)?.[CAPTURE_HISTORY_KEY];
  if (fromHistory) receiveCapture(fromHistory);

  const onCustomEvent = (event: Event) => {
    receiveCapture((event as CustomEvent).detail);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== target.location.origin) return;
    const data = event.data as { type?: unknown; payload?: unknown } | null;
    if (data && typeof data === 'object' && data.type === 'capture.pending') receiveCapture(data.payload);
  };
  target.addEventListener(CAPTURE_EVENT, onCustomEvent);
  target.addEventListener('message', onMessage);
  return () => {
    target.removeEventListener(CAPTURE_EVENT, onCustomEvent);
    target.removeEventListener('message', onMessage);
  };
}
