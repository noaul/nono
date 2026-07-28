import { computed, ref } from 'vue';
import { translate, type MessageKey } from '@/locales';
import {
  htmlLang,
  normalizeLocalePreference,
  resolveLocale,
  storedLocalePreference,
  writeLocalePreference,
  type Locale,
  type LocalePreference,
} from '@/utils/locale';

export const LOCALE_CHANGE_EVENT = 'nono-locale-change';

// Module-level state so every component shares one locale without a provider, matching how
// ColorModeControl shares the colour mode across independently mounted controls.
const preference = ref<LocalePreference>('site');
const siteDefault = ref<Locale | null>(null);
let initialised = false;

function safeStoredPreference(): LocalePreference {
  try {
    return storedLocalePreference(window.localStorage);
  } catch {
    return 'site';
  }
}

const locale = computed(() => resolveLocale(preference.value, siteDefault.value));

function applyDocumentLocale() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = htmlLang(locale.value);
}

function onSharedLocaleChange(event: Event) {
  const detail = event instanceof CustomEvent ? event.detail : safeStoredPreference();
  preference.value = normalizeLocalePreference(detail);
  applyDocumentLocale();
}

/** Called once from the app entry; safe to call again (later calls are ignored). */
export function initLocale() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  preference.value = safeStoredPreference();
  applyDocumentLocale();
  window.addEventListener(LOCALE_CHANGE_EVENT, onSharedLocaleChange);
}

export function setLocalePreference(next: LocalePreference) {
  preference.value = normalizeLocalePreference(next);
  try {
    writeLocalePreference(preference.value, window.localStorage);
  } catch {
    // The active tab still follows the choice when storage is unavailable.
  }
  applyDocumentLocale();
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: preference.value }));
}

/** The site-wide default, published by whichever view loaded the site payload. */
export function setSiteDefaultLocale(next: Locale | null) {
  siteDefault.value = next;
  applyDocumentLocale();
}

export function useI18n() {
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale.value, key, params);
  return { locale, preference, siteDefault, t, setLocalePreference, setSiteDefaultLocale };
}
