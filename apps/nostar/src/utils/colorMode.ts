/**
 * The colour mode is shared across every NoNo app on this origin through one localStorage key,
 * so switching it in NoStar, the NoNo admin or the blog switches it everywhere. The zustand
 * store's `theme` only mirrors the *resolved* mode; this key is the source of truth.
 */

export type ColorModePreference = 'system' | 'light' | 'dark';
export type ResolvedColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'nono:color-mode';
export const COLOR_MODE_EVENT = 'nono-color-mode-change';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const isPreference = (value: unknown): value is ColorModePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/** The stored preference, or `null` when nothing has been stored yet. */
export function readColorModePreference(): ColorModePreference | null {
  try {
    const value = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return isPreference(value) ? value : null;
  } catch {
    return null; // Storage can be unavailable in hardened or private contexts.
  }
}

export function writeColorModePreference(preference: ColorModePreference): void {
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  } catch {
    // Not persisted; the mode still applies for this page.
  }
}

function darkQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY)
    : null;
}

export function resolveColorMode(preference: ColorModePreference | null): ResolvedColorMode {
  if (preference === 'light' || preference === 'dark') return preference;
  return darkQuery()?.matches ? 'dark' : 'light';
}

/** The mode to apply right now: the shared preference, defaulting to the OS setting. */
export function currentColorMode(): ResolvedColorMode {
  return resolveColorMode(readColorModePreference());
}

/**
 * Reads the shared preference, migrating NoStar's own persisted theme into it the first time.
 * Once the key exists it always wins, so the migration cannot run twice.
 */
export function adoptColorMode(legacyTheme: unknown): ResolvedColorMode {
  const stored = readColorModePreference();
  if (stored) return resolveColorMode(stored);
  if (legacyTheme === 'light' || legacyTheme === 'dark') {
    writeColorModePreference(legacyTheme);
    return legacyTheme;
  }
  return resolveColorMode('system');
}

/** Applies the mode for both Tailwind (`html.dark`) and the contract tokens (`data-color-mode`). */
export function applyColorMode(mode: ResolvedColorMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.colorMode = mode;
  root.style.colorScheme = mode;
  window.dispatchEvent(new CustomEvent(COLOR_MODE_EVENT, { detail: mode }));
}

/**
 * Follows the OS while the preference is 'system', and picks up changes another NoNo tab makes
 * to the shared key. Returns an unsubscribe function.
 */
export function watchColorMode(onChange: (mode: ResolvedColorMode) => void): () => void {
  const query = darkQuery();
  const onSystemChange = () => {
    const preference = readColorModePreference();
    if (!preference || preference === 'system') onChange(resolveColorMode('system'));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === COLOR_MODE_STORAGE_KEY || event.key === null) onChange(currentColorMode());
  };

  if (query?.addEventListener) query.addEventListener('change', onSystemChange);
  else query?.addListener?.(onSystemChange);
  window.addEventListener('storage', onStorage);

  return () => {
    if (query?.removeEventListener) query.removeEventListener('change', onSystemChange);
    else query?.removeListener?.(onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}
