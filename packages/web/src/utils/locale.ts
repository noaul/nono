export type Locale = 'zh' | 'en';

/** 'site' follows the site-wide default; 'zh'/'en' are explicit visitor overrides. */
export type LocalePreference = 'site' | Locale;

export const LOCALE_STORAGE_KEY = 'nono:locale';
export const DEFAULT_LOCALE: Locale = 'zh';

export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en';
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return isLocale(value) ? value : 'site';
}

/**
 * Resolution order: an explicit visitor choice always wins, then the site default the admin
 * picked, then Chinese.
 *
 * Deliberately does NOT sniff navigator.language: an existing site that has never set a
 * default would otherwise flip to English for anyone with an English browser. The admin owns
 * the default; visitors own their override.
 */
export function resolveLocale(
  preference: LocalePreference,
  siteDefault: Locale | null | undefined,
): Locale {
  if (isLocale(preference)) return preference;
  if (isLocale(siteDefault)) return siteDefault;
  return DEFAULT_LOCALE;
}

export function storedLocalePreference(storage: Pick<Storage, 'getItem'>): LocalePreference {
  return normalizeLocalePreference(storage.getItem(LOCALE_STORAGE_KEY));
}

export function writeLocalePreference(preference: LocalePreference, storage: Pick<Storage, 'setItem' | 'removeItem'>): void {
  const normalized = normalizeLocalePreference(preference);
  // 'site' is the absence of an override, so it clears the key instead of persisting a value.
  if (normalized === 'site') storage.removeItem(LOCALE_STORAGE_KEY);
  else storage.setItem(LOCALE_STORAGE_KEY, normalized);
}

/** Reads the admin-selected site default from site settings; unset means "no site opinion". */
export function getSiteDefaultLocale(settings: Record<string, unknown> | null | undefined): Locale | null {
  const i18n = (settings as { i18n?: { defaultLocale?: unknown } } | null | undefined)?.i18n;
  return isLocale(i18n?.defaultLocale) ? i18n.defaultLocale : null;
}

/** The `lang` attribute value for the resolved locale. */
export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}
