export const DEFAULT_SITE_URL = 'http://localhost:3000/nodesk'

interface SiteUrlEnvironment {
	NEXT_PUBLIC_SITE_URL?: string
	SITE_URL?: string
	VERCEL_URL?: string
}

export function normalizeSiteUrl(value: string): string {
	const trimmedValue = value.trim()
	const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`
	const url = new URL(candidate)

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('Site URL must use http or https')
	}

	const pathname = url.pathname.replace(/\/+$/, '')
	return `${url.origin}${pathname}`
}

export function getSiteUrl(
	environment: SiteUrlEnvironment = {
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		SITE_URL: process.env.SITE_URL,
		VERCEL_URL: process.env.VERCEL_URL
	}
): string {
	const configuredUrl =
		environment.NEXT_PUBLIC_SITE_URL || environment.SITE_URL || (environment.VERCEL_URL ? `https://${environment.VERCEL_URL}` : DEFAULT_SITE_URL)

	return normalizeSiteUrl(configuredUrl)
}
