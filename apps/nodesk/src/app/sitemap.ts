import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = getSiteUrl()
	return ['', '/about', '/projects', '/pictures', '/friends', '/share', '/snippets'].map(path => ({
		url: `${baseUrl}${path}`,
		lastModified: new Date(),
		changeFrequency: path === '' ? 'daily' : 'weekly',
		priority: path === '' ? 1 : 0.6
	}))
}
