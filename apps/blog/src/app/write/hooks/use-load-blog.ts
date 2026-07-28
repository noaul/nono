'use client'

import { useEffect } from 'react'
import { useWriteStore } from '../stores/write-store'
import { toast } from 'sonner'
import { useI18n } from '@/i18n'

export function useLoadBlog(slug?: string) {


	const { copy } = useI18n()
	const { loadBlogForEdit, loading } = useWriteStore()

	useEffect(() => {
		if (slug) {
			loadBlogForEdit(slug).catch(err => {
				console.error('Failed to load blog:', err)
				toast.error(copy('加载博客失败', 'Could not load the blog'))
			})
		}
	}, [slug, loadBlogForEdit])

	return { loading }
}
