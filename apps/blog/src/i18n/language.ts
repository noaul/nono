export type Language = 'zh' | 'en'

/** Shared by every NoNo app on this origin, so one language choice follows the user around. */
export const LANGUAGE_STORAGE_KEY = 'nono:locale'
/** NoDesk's own key from before the choice was shared. */
const LEGACY_LANGUAGE_KEY = 'nono-blog-language'

/**
 * React-free so plain service modules can read the choice without importing the provider
 * (which is a 'use client' module).
 */
export function readStoredLanguage(): Language {
	if (typeof window === 'undefined') return 'zh'
	try {
		const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
		if (stored !== null) return stored === 'en' ? 'en' : 'zh'
		// Only English carries over: Chinese is already the default, and writing it would turn NoNo's
		// site default into a visitor override in every app.
		if (window.localStorage.getItem(LEGACY_LANGUAGE_KEY) !== 'en') return 'zh'
		window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
		return 'en'
	} catch {
		return 'zh'
	}
}

/** Resolves a zh/en pair against the stored choice, for code outside React. */
export function localeCopy(zh: string, en: string): string {
	return readStoredLanguage() === 'zh' ? zh : en
}
