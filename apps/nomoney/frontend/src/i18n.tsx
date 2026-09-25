import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'zh' | 'en';

/** Shared with every NoNo app on this origin; absent means Chinese. */
export const LOCALE_STORAGE_KEY = 'nono:locale';
/** The per-app key used before the shared one existed. */
export const LEGACY_LANGUAGE_KEY = 'moneypulse-language';

type LanguageStorage = Pick<Storage, 'getItem' | 'setItem'>;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  copy: (zh: string, en: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const setLanguage = (next: Language) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
    setLanguageState(next);
  };

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(language === 'zh' ? 'en' : 'zh'),
    copy: (zh: string, en: string) => (language === 'zh' ? zh : en)
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}

function isLanguage(value: unknown): value is Language {
  return value === 'zh' || value === 'en';
}

/**
 * The explicit language choice, if any, carrying the retired per-app key over once. Only English
 * is carried: Chinese is already the default, and writing it would turn NoNo's site default into
 * a visitor override on every app.
 */
export function readStoredLanguage(storage: LanguageStorage = localStorage): Language | null {
  const stored = storage.getItem(LOCALE_STORAGE_KEY);
  if (stored !== null) return isLanguage(stored) ? stored : null;

  if (storage.getItem(LEGACY_LANGUAGE_KEY) !== 'en') return null;
  storage.setItem(LOCALE_STORAGE_KEY, 'en');
  return 'en';
}

export function getStoredLanguage(): Language {
  return readStoredLanguage() ?? 'zh';
}

export function localize(language: Language, zh: string, en: string): string {
  return language === 'zh' ? zh : en;
}
