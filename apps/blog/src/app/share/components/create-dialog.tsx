'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import LogoUploadDialog, { type LogoItem } from './logo-upload-dialog'
import type { Share } from './share-card'
import { DialogModal } from '@/components/dialog-modal'
import { useI18n } from '@/i18n'

interface CreateDialogProps {
	share: Share | null
	onClose: () => void
	onSave: (share: Share, logoItem?: LogoItem) => void
}

export default function CreateDialog({ share, onClose, onSave }: CreateDialogProps) {
	const { copy } = useI18n()
	const [formData, setFormData] = useState<Share>({
		name: '',
		logo: '',
		url: '',
		description: '',
		tags: [],
		stars: 3
	})
	const [showLogoDialog, setShowLogoDialog] = useState(false)
	const [logoItem, setLogoItem] = useState<LogoItem | null>(null)
	const [tagsInput, setTagsInput] = useState('')

	useEffect(() => {
		if (share) {
			setFormData(share)
			setTagsInput(share.tags.join(', '))
		} else {
			setFormData({
				name: '',
				logo: '',
				url: '',
				description: '',
				tags: [],
				stars: 3
			})
			setLogoItem(null)
			setTagsInput('')
		}
	}, [share])

	const handleLogoSubmit = (logo: LogoItem) => {
		setLogoItem(logo)
		const logoUrl = logo.type === 'url' ? logo.url : logo.previewUrl
		setFormData({ ...formData, logo: logoUrl })
	}

	const handleTagsChange = (value: string) => {
		setTagsInput(value)
		const tags = value
			.split(',')
			.map(t => t.trim())
			.filter(t => t)
		setFormData({ ...formData, tags })
	}

	const handleSubmit = () => {
		if (!formData.name.trim() || !formData.logo.trim() || !formData.url.trim() || !formData.description.trim()) {
			toast.error(copy('请填写所有必填项', 'Fill in every required field'))
			return
		}

		if (formData.tags.length === 0) {
			toast.error(copy('请至少添加一个标签', 'Add at least one tag'))
			return
		}

		onSave(formData, logoItem || undefined)
		onClose()
		toast.success(share ? copy('更新成功', 'Updated') : copy('添加成功', 'Added'))
	}

	return (
		<DialogModal open onClose={onClose} className='card max-h-[90vh] w-sm overflow-y-auto'>
			{/* Card-styled body */}
			<div>
				<div className='mb-4 flex items-center gap-4'>
					<div className='group relative cursor-pointer' onClick={() => setShowLogoDialog(true)}>
						{formData.logo ? (
							<>
								<img src={formData.logo} alt={formData.name} className='h-16 w-16 rounded-xl object-cover' />
								<div className='pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
									<span className='text-xs text-white'>{copy('更换', 'Replace')}</span>
								</div>
							</>
						) : (
							<div className='flex h-16 w-16 items-center justify-center rounded-xl bg-gray-200'>
								<Plus className='h-6 w-6 text-gray-500' />
							</div>
						)}
					</div>
					<div className='flex-1'>
						<input
							type='text'
							value={formData.name}
							onChange={e => setFormData({ ...formData, name: e.target.value })}
							placeholder={copy('资源名称', 'Resource name')}
							className='w-full text-lg font-bold focus:outline-none'
						/>
						<input
							type='url'
							value={formData.url}
							onChange={e => setFormData({ ...formData, url: e.target.value })}
							placeholder='https://example.com'
							className='text-secondary mt-1 w-full truncate text-xs focus:outline-none'
						/>
					</div>
				</div>

				{/* Star rating */}
				<div className='flex items-center gap-0.5'>
					{[1, 2, 3, 4, 5].map(index => (
						<div key={index} onClick={() => setFormData({ ...formData, stars: index })} className='cursor-pointer'>
							<svg width='16' height='16' viewBox='0 0 24 24' className={index <= formData.stars ? 'fill-yellow-400' : 'fill-gray-300'}>
								<path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
							</svg>
						</div>
					))}
				</div>

				{/* Tag input */}
				<div className='mt-3'>
					<input
						type='text'
						value={tagsInput}
						onChange={e => handleTagsChange(e.target.value)}
						placeholder={copy('标签，用逗号分隔（如：图片, 工具）', 'Tags, comma separated (e.g. images, tools)')}
						className='w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:outline-none'
					/>
					<div className='mt-2 flex flex-wrap gap-1.5'>
						{formData.tags.map(tag => (
							<span key={tag} className='rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs text-gray-600'>
								{tag}
							</span>
						))}
					</div>
				</div>

				<textarea
					value={formData.description}
					onChange={e => setFormData({ ...formData, description: e.target.value })}
					placeholder={copy('资源介绍...', 'Describe the resource…')}
					className='mt-3 w-full resize-none text-sm leading-relaxed focus:outline-none'
					rows={4}
				/>
			</div>

			{/* Actions */}
			<div className='mt-6 flex gap-3'>
				<button onClick={onClose} className='flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm transition-colors hover:bg-gray-50'>
					{copy('取消', 'Cancel')}
				</button>
				<button onClick={handleSubmit} className='brand-btn flex-1 justify-center px-4'>
					{share ? copy('保存', 'Save') : copy('添加', 'Add')}
				</button>
			</div>

			{showLogoDialog && <LogoUploadDialog currentLogo={formData.logo} onClose={() => setShowLogoDialog(false)} onSubmit={handleLogoSubmit} />}
		</DialogModal>
	)
}
