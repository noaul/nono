export type WorkbenchAppEntry = {
	id: string
	label: string
	url: string
	icon: string
	openInNewTab: boolean
}

export type WorkbenchNavigation = {
	quickEntriesVisible: boolean
	entries: WorkbenchAppEntry[]
}

export const DEFAULT_WORKBENCH_APP_ENTRIES: WorkbenchAppEntry[] = [
	{ id: 'home', label: '书签', url: '/', icon: 'bookmark', openInNewTab: false },
	{ id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', openInNewTab: false },
	{ id: 'nostar', label: 'NoStar', url: '/nostar/', icon: 'star', openInNewTab: false },
	{ id: 'yumi', label: 'Yumi', url: '/yumi', icon: 'server-cog', openInNewTab: false },
	{ id: 'clipper', label: 'Clipper', url: '/clipper/', icon: 'scissors', openInNewTab: false }
]

const WORKBENCH_NAVIGATION_VERSION = 4

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function safeLocation(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const text = value.trim()
	if (text.startsWith('/') && !text.startsWith('//')) return text
	try {
		const url = new URL(text)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
	} catch {
		return null
	}
}

export function normalizeWorkbenchNavigation(settings: unknown): WorkbenchNavigation {
	const source = record(settings)
	const workbench = record(source?.nodeskWorkbench)
	const savedEntries = Array.isArray(source?.navigationEntries) ? source.navigationEntries : null
	const savedVersion = Number(source?.navigationEntriesVersion || 0)
	const savedIds = new Set(savedEntries?.flatMap(value => {
		const entry = record(value)
		return typeof entry?.id === 'string' ? [entry.id.trim()] : []
	}) || [])
	const sourceEntries = savedEntries && savedVersion < WORKBENCH_NAVIGATION_VERSION
		? [...savedEntries, ...DEFAULT_WORKBENCH_APP_ENTRIES.filter(entry => entry.id !== 'home' && !savedIds.has(entry.id))]
		: savedEntries
	const entries = sourceEntries?.flatMap((value, index) => {
		const entry = record(value)
		const label = typeof entry?.label === 'string' ? entry.label.trim().slice(0, 60) : ''
		const url = safeLocation(entry?.url)
		if (!label || !url || entry?.enabled === false) return []
		return [{
			id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim().slice(0, 80) : `entry-${index + 1}`,
			label,
			url,
			icon: typeof entry?.icon === 'string' && entry.icon.trim() ? entry.icon.trim().slice(0, 40) : 'link',
			openInNewTab: entry?.openInNewTab === true
		}]
	})
	const includesHome = entries?.some(entry => entry.id === 'home' || entry.url === '/')
	const visibleEntries = savedEntries && savedVersion >= WORKBENCH_NAVIGATION_VERSION
		? entries || []
		: entries?.length
			? includesHome ? entries : [DEFAULT_WORKBENCH_APP_ENTRIES[0], ...entries]
			: DEFAULT_WORKBENCH_APP_ENTRIES

	return {
		quickEntriesVisible: typeof workbench?.quickEntriesVisible === 'boolean' ? workbench.quickEntriesVisible : true,
		entries: visibleEntries
	}
}
