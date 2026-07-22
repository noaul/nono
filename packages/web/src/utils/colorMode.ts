export type ColorModePreference = 'system' | 'light' | 'dark';
export type ResolvedColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'nono:color-mode';

export function normalizeColorMode(value: unknown): ColorModePreference {
  if (value === 'light' || value === 'dark') return value;
  return 'system';
}

export function resolveColorMode(preference: ColorModePreference, prefersDark: boolean): ResolvedColorMode {
  if (preference !== 'system') return preference;
  return prefersDark ? 'dark' : 'light';
}

export function storedColorMode(storage: Pick<Storage, 'getItem'>): ColorModePreference {
  return normalizeColorMode(storage.getItem(COLOR_MODE_STORAGE_KEY));
}

export function writeColorMode(preference: ColorModePreference, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(COLOR_MODE_STORAGE_KEY, normalizeColorMode(preference));
}
