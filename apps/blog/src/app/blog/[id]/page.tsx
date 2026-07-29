'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { motion } from 'motion/react'
import { BlogPreview } from '@/components/blog-preview'
import { loadBlog, type BlogConfig } from '@/lib/load-blog'
import { useReadArticles } from '@/hooks/use-read-articles'
import LiquidGrass from '@/components/liquid-grass'
import { useAuthStore } from '@/hooks/use-auth'
import { useI18n } from '@/i18n'

export default function Page() {

	const { copy, language } = useI18n()
	const params = useParams() as { id?: string | string[] }
	const slug = Array.isArray(params?.id) ? params.id[0] : params?.id || ''
	const router = useRouter()
	const { markAsRead } = useReadArticles()
	const isAuth = useAuthStore(state => state.isAuth)

	const [blog, setBlog] = useState<{ config: BlogConfig; markdown: string; cover?: string } | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState<boolean>(true)

	useEffect(() => {
		let cancelled = false
		async function run() {
			if (!slug) return
			try {
				setLoading(true)
				const blogData = await loadBlog(slug)

				if (!cancelled) {
					setBlog(blogData)
					setError(null)
					markAsRead(slug)
				}
			} catch (e: any) {
				if (!cancelled) setError(e?.message || copy('加载失败', 'Could not load'))
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		run()
		return () => {
			cancelled = true
		}
	}, [slug, markAsRead])

	const title = useMemo(() => (blog?.config.title ? blog.config.title : slug), [blog?.config.title, slug])
	const date = useMemo(
		() => dayjs(blog?.config.date).format(language === 'zh' ? 'YYYY年 M月 D日' : 'MMM D, YYYY'),
		[blog?.config.date, language]
	)
	const tags = blog?.config.tags || []

	const handleEdit = () => {
		if (!isAuth) return
		router.push(`/write/${slug}`)
	}

	if (!slug) {
		return <div className='text-secondary flex h-full items-center justify-center text-sm'>{copy('无效的链接', 'Invalid link')}</div>
	}

	if (loading) {
		return <div className='text-secondary flex h-full items-center justify-center text-sm'>{copy('加载中...', 'Loading…')}</div>
	}

	if (error) {
		return <div className='flex h-full items-center justify-center text-sm text-red-500'>{error}</div>
	}

	if (!blog) {
		return <div className='text-secondary flex h-full items-center justify-center text-sm'>{copy('文章不存在', 'That post does not exist')}</div>
	}

	return (
		<>
			<BlogPreview
				markdown={blog.markdown}
				title={title}
				tags={tags}
				date={date}
				summary={blog.config.summary}
				cover={blog.cover ? (blog.cover.startsWith('http') ? blog.cover : `${origin}${blog.cover}`) : undefined}
				slug={slug}
			/>

			{isAuth && (
				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					onClick={handleEdit}
					className='absolute top-4 right-6 z-40 rounded-xl border bg-white/60 px-6 py-2 text-sm backdrop-blur-sm transition-colors hover:bg-white/80 max-sm:fixed max-sm:top-auto max-sm:right-4 max-sm:bottom-4'>
					{copy('编辑', 'Edit')}
				</motion.button>
			)}

			{slug === 'liquid-grass' && <LiquidGrass />}
		</>
	)
}
