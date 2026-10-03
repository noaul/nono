import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
	const siteUrl = getSiteUrl()

	return {
		rules: {
			userAgent: '*',
			allow: '/',
			disallow: ['/image-toolbox']
		},
		sitemap: `${siteUrl}/sitemap.xml`,
		host: siteUrl
	}
}
