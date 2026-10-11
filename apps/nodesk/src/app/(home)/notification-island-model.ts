export type IslandNotification = {
	key: string
	title: string
	severity: 'info' | 'warning' | 'critical'
	read: boolean
}

export const SEEN_STORAGE_KEY = 'nodesk.ambient.island-seen.v1'
const SEEN_LIMIT = 300
/** Each column takes its turn through this many notifications before the strip starts over. */
export const ISLAND_ROWS = 3
const MIN_COLUMN_WIDTH = 130

/** Two or three columns when the strip is wide enough, so short titles are never cut to a few characters. */
export function islandColumns(width: number): number {
	return Math.max(1, Math.min(3, Math.floor(width / MIN_COLUMN_WIDTH)))
}

/**
 * Splits notifications into the rows the strip scrolls through: each row fills every column, and
 * only `columns * ISLAND_ROWS` notifications are shown; the rest wait in the expanded list.
 */
export function islandPages<T>(items: T[], columns: number): T[][] {
	const shown = items.slice(0, columns * ISLAND_ROWS)
	const pages: T[][] = []
	for (let index = 0; index < shown.length; index += columns) pages.push(shown.slice(index, index + columns))
	return pages
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
