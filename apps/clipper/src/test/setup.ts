import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * This jsdom build does not expose window.localStorage (Node's own experimental localStorage
 * shadows it and needs a CLI flag). The app guards every access, so it degrades gracefully in
 * production — but without a working store the persistence path would go untested. Install a
 * minimal in-memory implementation so those assertions mean something.
 */
if (!globalThis.window?.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis.window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globalThis.window?.localStorage?.clear();
});
