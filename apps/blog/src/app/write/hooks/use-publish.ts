'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { pushBlog } from '../services/push-blog'
import { deleteBlog } from '../services/delete-blog'
import { useWriteStore } from '../stores/write-store'
import { useAuthStore } from '@/hooks/use-auth'
import { useI18n } from '@/i18n'

export function usePublish() {


	const { copy } = useI18n()
	const { loading, setLoading, form, cover, images, mode, originalSlug } = useWriteStore()
	const { isAuth } = useAuthStore()

	const onPublish = useCallback(async () => {
		try {
			setLoading(true)
			await pushBlog({
				form,
				cover,
				images,
				mode,
				originalSlug
			})

			const successMsg = mode === 'edit' ? copy('更新成功', 'Updated') : copy('发布成功', 'Published')
			toast.success(successMsg)
		} catch (err: any) {
			console.error(err)
			toast.error(err?.message || copy('操作失败', 'Action failed'))
		} finally {
			setLoading(false)
		}
	}, [form, cover, images, mode, originalSlug, setLoading])

	const onDelete = useCallback(async () => {
		const targetSlug = originalSlug || form.slug
		if (!targetSlug) {
			toast.error(copy('缺少 slug，无法删除', 'Missing slug — cannot delete'))
			return
		}
		try {
			setLoading(true)
			await deleteBlog(targetSlug)
		} catch (err: any) {
			console.error(err)
			toast.error(err?.message || copy('删除失败', 'Could not delete'))
		} finally {
			setLoading(false)
		}
	}, [form.slug, originalSlug, setLoading])

	return {
		isAuth,
		loading,
		onPublish,
		onDelete
	}
}
