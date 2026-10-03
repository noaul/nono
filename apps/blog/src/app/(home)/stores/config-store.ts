import { create } from 'zustand'
import siteContent from '@/config/site-content.json'
import cardStyles from '@/config/card-styles.json'
import { getPortalSettings } from '@/lib/portal'
import { loadNodeskContent } from '@/lib/nodesk-content'

export type CalendarEvent = {
	id: string
	date: string
	title: string
	time?: string
	note?: string
}

type SiteContentBase = typeof siteContent
export type SiteContent = Omit<SiteContentBase, 'calendarEvents' | 'meta'> & {
	meta: SiteContentBase['meta'] & { avatarUrl?: string }
	calendarEvents?: CalendarEvent[]
}
export type CardStyles = typeof cardStyles

interface ConfigStore {
	siteContent: SiteContent
	cardStyles: CardStyles
	regenerateKey: number
	hydrateRuntimeConfig: () => Promise<void>
}

function createInitialSiteContent(): SiteContent {
	return normalizeSiteContent(siteContent)
}

function normalizeSiteContent(content: SiteContent): SiteContent {
	return {
		...siteContent,
		...content,
		meta: { ...siteContent.meta, ...content.meta },
		calendarEvents: content.calendarEvents ?? [],
		portal: getPortalSettings({ ...siteContent.portal, ...content.portal })
	}
}

function normalizeCardStyles(content: Partial<CardStyles>): CardStyles {
	const merged = Object.fromEntries(
		Object.entries(cardStyles).map(([key, defaultStyle]) => [key, { ...defaultStyle, ...(content[key as keyof CardStyles] || {}) }])
	) as CardStyles
	return merged
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
	siteContent: createInitialSiteContent(),
	cardStyles: normalizeCardStyles(cardStyles),
	regenerateKey: 0,
	hydrateRuntimeConfig: async () => {
		const [runtimeSiteContent, runtimeCardStyles] = await Promise.all([
			loadNodeskContent<SiteContent>('site', get().siteContent),
			loadNodeskContent<CardStyles>('card-styles', get().cardStyles)
		])
		set({
			siteContent: normalizeSiteContent(runtimeSiteContent),
			cardStyles: normalizeCardStyles(runtimeCardStyles)
		})
	}
}))
