export type Language = 'zh' | 'en'

/** Shared by every NoNo app on this origin, so one language choice follows the user around. */
export const LANGUAGE_STORAGE_KEY = 'nono:locale'

/**
 * React-free so plain service modules can read the choice without importing the provider
 * (which is a 'use client' module).
 */
export function readStoredLanguage(): Language {
	if (typeof window === 'undefined') return 'zh'
	try {
		const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
		return stored === 'en' ? 'en' : 'zh'
	} catch {
		return 'zh'
	}
}

/** Resolves a zh/en pair against the stored choice, for code outside React. */
export function localeCopy(zh: string, en: string): string {
	return readStoredLanguage() === 'zh' ? zh : en
}
