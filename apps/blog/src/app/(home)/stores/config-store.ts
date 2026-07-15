import { create } from 'zustand'
import siteContent from '@/config/site-content.json'
import cardStyles from '@/config/card-styles.json'
import { getPortalSettings } from '@/lib/portal'
import { loadNodeskContent } from '@/lib/nodesk-content'

export type SiteContent = typeof siteContent
export type CardStyles = typeof cardStyles

interface ConfigStore {
	siteContent: SiteContent
	cardStyles: CardStyles
	regenerateKey: number
	configDialogOpen: boolean
	setSiteContent: (content: SiteContent) => void
	setCardStyles: (styles: CardStyles) => void
	resetSiteContent: () => void
	resetCardStyles: () => void
	regenerateBubbles: () => void
	setConfigDialogOpen: (open: boolean) => void
	hydrateRuntimeConfig: () => Promise<void>
}

function createInitialSiteContent(): SiteContent {
	return {
		...siteContent,
		portal: getPortalSettings(siteContent.portal)
	}
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
	siteContent: createInitialSiteContent(),
	cardStyles: { ...cardStyles },
	regenerateKey: 0,
	configDialogOpen: false,
	setSiteContent: (content: SiteContent) => {
		set({ siteContent: content })
	},
	setCardStyles: (styles: CardStyles) => {
		set({ cardStyles: styles })
	},
	resetSiteContent: () => {
		set({ siteContent: createInitialSiteContent() })
	},
	resetCardStyles: () => {
		set({ cardStyles: { ...cardStyles } })
	},
	regenerateBubbles: () => {
		set(state => ({ regenerateKey: state.regenerateKey + 1 }))
	},
	setConfigDialogOpen: (open: boolean) => {
		set({ configDialogOpen: open })
	},
	hydrateRuntimeConfig: async () => {
		const [runtimeSiteContent, runtimeCardStyles] = await Promise.all([
			loadNodeskContent<SiteContent>('site', get().siteContent),
			loadNodeskContent<CardStyles>('card-styles', get().cardStyles)
		])
		set({
			siteContent: { ...runtimeSiteContent, portal: getPortalSettings(runtimeSiteContent.portal) },
			cardStyles: runtimeCardStyles
		})
	}
}))
