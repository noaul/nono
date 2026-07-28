'use client'

import { useParams } from 'next/navigation'
import { useWriteStore } from '../stores/write-store'
import { usePreviewStore } from '../stores/preview-store'
import { useLoadBlog } from '../hooks/use-load-blog'
import { WriteEditor } from '../components/editor'
import { WriteSidebar } from '../components/sidebar'
import { WriteActions } from '../components/actions'
import { WritePreview } from '../components/preview'
import { WriteAccessGate } from '../components/write-access-gate'
import { useI18n } from '@/i18n'

export default function EditBlogPage() {

	const { copy } = useI18n()
	const params = useParams() as { slug?: string }
	const slug = params?.slug || ''

	const { form, cover } = useWriteStore()
	const { isPreview, closePreview } = usePreviewStore()
	const { loading } = useLoadBlog(slug)

	const coverPreviewUrl = cover ? (cover.type === 'url' ? cover.url : cover.previewUrl) : null

	if (loading) {
		return <div className='text-secondary flex h-screen items-center justify-center text-sm'>{copy('加载中...', 'Loading…')}</div>
	}

	if (!slug) {
		return <div className='flex h-screen items-center justify-center text-sm text-red-500'>{copy('无效的博客 ID', 'Invalid post ID')}</div>
	}

	return (
		<WriteAccessGate>
			{isPreview ? (
				<WritePreview form={form} coverPreviewUrl={coverPreviewUrl} onClose={closePreview} slug={slug} />
			) : (
				<>
					<div className='flex h-full justify-center gap-6 px-6 pt-24 pb-12'>
						<WriteEditor />
						<WriteSidebar />
					</div>

					<WriteActions />
				</>
			)}
		</WriteAccessGate>
	)
}
