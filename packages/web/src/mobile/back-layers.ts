import { onBeforeUnmount, watch, type WatchSource } from 'vue';
import { connectMobileBridge, type MobileBridge } from './bridge';

/**
 * Open dialogs, drawers and menus, newest last. In the Android app a back press closes the newest
 * one before the WebView goes back in history.
 */
const layers: Array<{ close: () => void }> = [];
let bridge: MobileBridge | null | undefined;

export function connectMobileShell(options: { onCapture?: (payload: Record<string, unknown>, requestId: string) => void } = {}) {
  if (bridge === undefined) bridge = connectMobileBridge({ onBack: closeTopLayer, onCapture: options.onCapture });
  return bridge;
}

export function closeTopLayer() {
  const top = layers.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

function sync() {
  bridge?.setBackState(layers.length > 0);
}

function remove(entry: { close: () => void }) {
  const index = layers.indexOf(entry);
  if (index >= 0) layers.splice(index, 1);
}

/** Registers a layer while `open` is true; `close` must close it the same way its own close button does. */
export function useMobileBackLayer(open: WatchSource<boolean>, close: () => void) {
  const entry = { close };
  const stop = watch(open, (isOpen) => {
    remove(entry);
    if (isOpen) layers.push(entry);
    sync();
  }, { immediate: true });
  onBeforeUnmount(() => {
    stop();
    remove(entry);
    sync();
  });
}

/** Test hook: forget all layers and the bridge connection. */
export function resetMobileShellForTests() {
  layers.length = 0;
  bridge = undefined;
}
