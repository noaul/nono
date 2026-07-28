export type Language = 'zh' | 'en'

export const LANGUAGE_STORAGE_KEY = 'nono-blog-language'

/**
 * React-free so plain service modules can read the choice without importing the provider
 * (which is a 'use client' module).
 */
export function readStoredLanguage(): Language {
	if (typeof window === 'undefined') return 'zh'
	try {
		return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh'
	} catch {
		return 'zh'
	}
}

/** Resolves a zh/en pair against the stored choice, for code outside React. */
export function localeCopy(zh: string, en: string): string {
	return readStoredLanguage() === 'zh' ? zh : en
}
