export interface PortalSettings {
	enabled: boolean
	url: string
	label: string
	imageUrl: string
	openInNewTab: boolean
}

export const portalDefaults: PortalSettings = {
	enabled: true,
	url: '/',
	label: '返回网址导航',
	imageUrl: '/images/avatar.png',
	openInNewTab: false
}

export function getPortalSettings(value: unknown, fallbackUrl = process.env.NEXT_PUBLIC_NONO_URL || portalDefaults.url): PortalSettings {
	const record = isRecord(value) ? value : {}

	return {
		enabled: typeof record.enabled === 'boolean' ? record.enabled : portalDefaults.enabled,
		url: normalizePortalHref(stringValue(record.url) || fallbackUrl),
		label: stringValue(record.label) || portalDefaults.label,
		imageUrl: normalizePortalImage(stringValue(record.imageUrl)) || portalDefaults.imageUrl,
		openInNewTab: typeof record.openInNewTab === 'boolean' ? record.openInNewTab : portalDefaults.openInNewTab
	}
}

export function normalizePortalHref(value: string) {
	const trimmed = value.trim()
	if (!trimmed) return ''
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed

	try {
		const url = new URL(trimmed)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
	} catch {
		return ''
	}
}

export function normalizePortalImage(value: string) {
	const trimmed = value.trim()
	if (!trimmed) return ''
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
	return normalizePortalHref(trimmed)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}
