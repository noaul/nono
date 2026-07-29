import { useAppStore } from './store/useAppStore';

export type Language = 'zh' | 'en';

/**
 * Language already lives in the persisted zustand store and drives the `t(zh, en)` helper
 * that components define locally. This module exposes the same value to plain modules
 * (services, utils, helpers) that cannot call a hook, so both paths stay in sync.
 */
export function getLanguage(): Language {
  return useAppStore.getState().language === 'en' ? 'en' : 'zh';
}

/** Non-reactive: for code running outside React. */
export function copy(zh: string, en: string): string {
  return getLanguage() === 'zh' ? zh : en;
}

/** Reactive: components re-render when the language changes. */
export function useCopy(): (zh: string, en: string) => string {
  const language = useAppStore((state) => state.language);
  return (zh: string, en: string) => (language === 'en' ? en : zh);
}
