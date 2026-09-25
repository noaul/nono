import { product } from './product';

/**
 * Every NoNo app is served from the same origin and shares one colour-mode preference, so a
 * choice made in NoNo, NoDesk, NoStar, NoMoney or Yumi carries across all of them.
 */
export type ColorModePreference = 'system' | 'light' | 'dark';
export type ResolvedColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'nono:color-mode';
export const COLOR_MODE_CHANGE_EVENT = 'nono-color-mode-change';
/** Per-app keys used before the shared preference existed, newest first. */
export const LEGACY_COLOR_MODE_KEYS = [`${product}-theme`, 'moneypulse-theme'];

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function normalizeColorMode(value: unknown): ColorModePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveColorMode(preference: ColorModePreference, prefersDark: boolean): ResolvedColorMode {
  if (preference !== 'system') return preference;
  return prefersDark ? 'dark' : 'light';
}

/** Reads the shared preference, carrying a retired per-app choice over once if there is no shared one yet. */
export function readColorModePreference(storage: PreferenceStorage, legacyKeys = LEGACY_COLOR_MODE_KEYS): ColorModePreference {
  const stored = storage.getItem(COLOR_MODE_STORAGE_KEY);
  if (stored !== null) return normalizeColorMode(stored);

  for (const key of legacyKeys) {
    const legacy = storage.getItem(key);
    if (legacy === 'light' || legacy === 'dark') {
      storage.setItem(COLOR_MODE_STORAGE_KEY, legacy);
      return legacy;
    }
  }
  return 'system';
}

const darkSchemeQuery = '(prefers-color-scheme: dark)';
let preference: ColorModePreference = 'system';
let resolved: ResolvedColorMode = 'light';

function prefersDarkScheme(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(darkSchemeQuery).matches;
}

function applyColorMode(): ResolvedColorMode {
  resolved = resolveColorMode(preference, prefersDarkScheme());
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.colorMode = resolved;
  root.dataset.colorModePreference = preference;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0f1216' : '#ffffff');
  window.dispatchEvent(new CustomEvent<ResolvedColorMode>(COLOR_MODE_CHANGE_EVENT, { detail: resolved }));
  return resolved;
}

/** Applies the stored preference at boot and keeps following the OS while it is 'system'. */
export function initColorMode(): ResolvedColorMode {
  try {
    preference = readColorModePreference(window.localStorage);
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts; fall back to the OS.
    preference = 'system';
  }
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(darkSchemeQuery).addEventListener('change', () => {
      if (preference === 'system') applyColorMode();
    });
  }
  return applyColorMode();
}

export function setColorModePreference(next: ColorModePreference): ResolvedColorMode {
  preference = normalizeColorMode(next);
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  } catch {
    // The current tab still follows the choice when storage is unavailable.
  }
  return applyColorMode();
}

export function currentColorMode(): ResolvedColorMode {
  return resolved;
}
