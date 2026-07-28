'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export { LANGUAGE_STORAGE_KEY, localeCopy, readStoredLanguage, type Language } from './language'
import { readStoredLanguage, type Language } from './language'

type I18nContextValue = {
	language: Language
	setLanguage: (language: Language) => void
	toggleLanguage: () => void
	/** Inline pair rather than a key catalogue, matching how apps/nomoney does it. */
	copy: (zh: string, en: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
	// Always start on Chinese so the server and the first client render agree; the stored
	// choice is applied in an effect, which keeps hydration free of mismatches.
	const [language, setLanguageState] = useState<Language>('zh')

	useEffect(() => {
		const stored = readStoredLanguage()
		if (stored !== 'zh') setLanguageState(stored)
	}, [])

	const setLanguage = useCallback((next: Language) => {
		setLanguageState(next)
		try {
			window.localStorage.setItem('nono-blog-language', next)
		} catch {
			// The tab still switches when storage is unavailable.
		}
		document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
	}, [])

	const value = useMemo<I18nContextValue>(
		() => ({
			language,
			setLanguage,
			toggleLanguage: () => setLanguage(language === 'zh' ? 'en' : 'zh'),
			copy: (zh: string, en: string) => (language === 'zh' ? zh : en)
		}),
		[language, setLanguage]
	)

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
	const context = useContext(I18nContext)
	// Server components and any tree rendered outside the provider fall back to Chinese
	// rather than throwing, so a missed provider never blanks a page.
	if (!context) {
		return {
			language: 'zh',
			setLanguage: () => {},
			toggleLanguage: () => {},
			copy: (zh: string) => zh
		}
	}
	return context
}
