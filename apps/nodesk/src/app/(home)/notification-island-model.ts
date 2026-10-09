export type IslandNotification = {
	key: string
	title: string
	severity: 'info' | 'warning' | 'critical'
	read: boolean
}

export type IslandMode = 'hidden' | 'compact' | 'peek' | 'expanded'

export const SEEN_STORAGE_KEY = 'nodesk.ambient.island-seen.v1'
const SEEN_LIMIT = 300

/** The island only exists while something is unread; a fresh arrival peeks unless the list is already open. */
export function islandMode(unreadCount: number, expanded: boolean, peeking: boolean): IslandMode {
	if (!unreadCount) return 'hidden'
	if (expanded) return 'expanded'
	return peeking ? 'peek' : 'compact'
}

export function readSeenKeys(raw: string | null): Set<string> {
	try {
		const value: unknown = JSON.parse(raw || '[]')
		return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
	} catch {
		return new Set()
	}
}

/** Newest keys last; the oldest fall off so the stored list stays small. */
export function nextSeenKeys(seen: Set<string>, keys: string[]): string[] {
	const merged = [...seen].filter(key => !keys.includes(key))
	return [...merged, ...keys].slice(-SEEN_LIMIT)
}
