import { connectMobileShell } from './back-layers';
import { clearCapture, currentCapture, onCaptureSaved, receiveCapture } from './capture';

/** Connect once at startup, before routing or any dialogs register their back handlers. */
export function installMobileShell() {
  const bridge = connectMobileShell({ onCapture: payload => { receiveCapture(payload); } });
  return onCaptureSaved(requestId => bridge?.send('capture.saved', { requestId }));
}

/** Request again after SPA navigation/login, when native hello may have preceded this route. */
export function requestPendingCapture() {
  connectMobileShell()?.send('capture.request');
}

export function dismissPendingCapture(requestId: string) {
  if (currentCapture()?.requestId !== requestId) return;
  connectMobileShell()?.send('capture.dismissed', { requestId });
  clearCapture();
}

/** Older APKs and ordinary browsers cannot promise native local cleanup. */
export function canClearNativeSession() {
  return connectMobileShell()?.supports('session.clear') === true;
}

/** Clear after server logout or explicit confirmation of a local-only logout. */
export function clearNativeSession() {
  clearCapture();
  connectMobileShell()?.send('session.clear');
}
