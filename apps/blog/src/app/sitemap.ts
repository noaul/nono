import { MetadataRoute } from 'next'
import blogIndex from '@/../public/blogs/index.json'
import type { BlogIndexItem } from '@/app/blog/types'
import { getSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = getSiteUrl()
	const posts = blogIndex as BlogIndexItem[]

	const postEntries: MetadataRoute.Sitemap = posts.map(post => ({
		url: `${baseUrl}/blog/${post.slug}`,
		lastModified: post.date ? new Date(post.date) : new Date(),
		changeFrequency: 'weekly',
		priority: 0.8
	}))

	const staticEntries: MetadataRoute.Sitemap = ['', '/blog', '/about', '/projects', '/share', '/snippets'].map(path => ({
		url: `${baseUrl}${path}`,
		lastModified: new Date(),
		changeFrequency: path === '' || path === '/blog' ? 'daily' : 'weekly',
		priority: path === '' ? 1 : path === '/blog' ? 0.9 : 0.6
	}))

	return [...staticEntries, ...postEntries]
}
