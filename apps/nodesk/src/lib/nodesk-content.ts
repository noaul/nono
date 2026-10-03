export type NodeskContentKey = 'site' | 'card-styles' | 'projects' | 'shares' | 'friends' | 'about' | 'snippets' | 'pictures'

export async function loadNodeskContent<T>(key: NodeskContentKey, fallback: T): Promise<T> {
	try {
		const response = await fetch(`/api/nodesk/content/${encodeURIComponent(key)}`, {
			cache: 'no-store',
			credentials: 'same-origin'
		})
		if (!response.ok) return fallback
		const payload = await response.json()
		return (payload?.data ?? fallback) as T
	} catch {
		return fallback
	}
}
