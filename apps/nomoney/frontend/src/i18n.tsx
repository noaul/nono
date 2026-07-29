import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'zh' | 'en';

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
    localStorage.setItem('moneypulse-language', next);
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

export function getStoredLanguage(): Language {
  return localStorage.getItem('moneypulse-language') === 'en' ? 'en' : 'zh';
}

export function localize(language: Language, zh: string, en: string): string {
  return language === 'zh' ? zh : en;
}
