/**
 * The UI language is shared across every NoNo app on this origin through one localStorage key.
 * An absent key means Chinese, NoStar's default. The zustand store's `language` mirrors it.
 */

export type Locale = 'zh' | 'en';

export const LOCALE_STORAGE_KEY = 'nono:locale';
export const DEFAULT_LOCALE: Locale = 'zh';

const isLocale = (value: unknown): value is Locale => value === 'zh' || value === 'en';

/** The stored locale, or `null` when no app has stored one yet. */
export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Not persisted; the language still applies for this page.
  }
}

export function currentLocale(): Locale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

/**
 * Reads the shared locale, migrating NoStar's own persisted language into it the first time.
 * Only a non-default choice is written: an absent key already means Chinese here, and writing
 * 'zh' for every existing user would pin it over the site default the other NoNo apps honour.
 */
export function adoptLocale(legacyLanguage: unknown): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  if (isLocale(legacyLanguage) && legacyLanguage !== DEFAULT_LOCALE) {
    writeStoredLocale(legacyLanguage);
    return legacyLanguage;
  }
  return DEFAULT_LOCALE;
}

/** Picks up a language change made in another NoNo tab. Returns an unsubscribe function. */
export function watchLocale(onChange: (locale: Locale) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) onChange(currentLocale());
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** The `lang` attribute value for a locale. */
export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}
