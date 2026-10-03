'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import ImageUploadDialog, { type ImageItem } from './image-upload-dialog'
import type { Project } from './project-card'
import { DialogModal } from '@/components/dialog-modal'
import { useI18n } from '@/i18n'

interface CreateDialogProps {
	project: Project | null
	onClose: () => void
	onSave: (project: Project) => void
}

export default function CreateDialog({ project, onClose, onSave }: CreateDialogProps) {
	const { copy } = useI18n()
	const [formData, setFormData] = useState<Project>({
		name: '',
		year: new Date().getFullYear(),
		image: '',
		url: '',
		description: '',
		tags: [],
		github: undefined,
		npm: undefined
	})
	const [showImageDialog, setShowImageDialog] = useState(false)
	const [tagsInput, setTagsInput] = useState('')

	useEffect(() => {
		if (project) {
			setFormData(project)
			setTagsInput(project.tags.join(', '))
		} else {
			setFormData({
				name: '',
				year: new Date().getFullYear(),
				image: '',
				url: '',
				description: '',
				tags: [],
				github: undefined,
				npm: undefined
			})
			setTagsInput('')
		}
	}, [project])

	const handleImageSubmit = (image: ImageItem) => {
		const imageUrl = image.type === 'url' ? image.url : image.previewUrl
		setFormData({ ...formData, image: imageUrl })
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
		if (!formData.name.trim() || !formData.image.trim() || !formData.url.trim() || !formData.description.trim()) {
			toast.error(copy('请填写所有必填项', 'Fill in every required field'))
			return
		}

		if (formData.tags.length === 0) {
			toast.error(copy('请至少添加一个标签', 'Add at least one tag'))
			return
		}

		onSave(formData)
		onClose()
		toast.success(project ? copy('更新成功', 'Updated') : copy('添加成功', 'Added'))
	}

	return (
		<DialogModal open onClose={onClose} className='card static w-md max-sm:w-full'>
			<div>
				<div className='mb-4 flex items-center gap-4'>
					<div className='group relative cursor-pointer' onClick={() => setShowImageDialog(true)}>
						{formData.image ? (
							<>
								<img src={formData.image} alt={formData.name} className='h-16 w-16 rounded-xl object-cover' />
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
							placeholder={copy('项目名称', 'Project name')}
							className='w-full text-lg font-bold focus:outline-none'
						/>
						<div className='mt-1 flex items-center gap-2'>
							<input
								type='number'
								value={formData.year}
								onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) || 0 })}
								placeholder={copy('年份', 'Year')}
								className='text-secondary w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none'
							/>
							<input
								type='url'
								value={formData.url}
								onChange={e => setFormData({ ...formData, url: e.target.value })}
								placeholder='https://example.com'
								className='text-secondary flex-1 truncate text-xs focus:outline-none'
							/>
						</div>
					</div>
				</div>

				<div className='mt-3'>
					<input
						type='text'
						value={tagsInput}
						onChange={e => handleTagsChange(e.target.value)}
						placeholder={copy('标签，用逗号分隔（如：React, Vue）', 'Tags, comma separated (e.g. React, Vue)')}
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
					placeholder={copy('项目介绍...', 'Describe the project…')}
					className='mt-3 w-full resize-none text-sm leading-relaxed focus:outline-none'
					rows={4}
				/>

				<div className='mt-3 space-y-2'>
					<input
						type='url'
						value={formData.github || ''}
						onChange={e => setFormData({ ...formData, github: e.target.value || undefined })}
						placeholder={copy('GitHub URL（可选）', 'GitHub URL (optional)')}
						className='w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:outline-none'
					/>
					<input
						type='url'
						value={formData.npm || ''}
						onChange={e => setFormData({ ...formData, npm: e.target.value || undefined })}
						placeholder={copy('NPM URL（可选）', 'NPM URL (optional)')}
						className='w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:outline-none'
					/>
				</div>
			</div>

			<div className='mt-6 flex gap-3'>
				<button onClick={onClose} className='flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm transition-colors hover:bg-gray-50'>
					{copy('取消', 'Cancel')}
				</button>
				<button onClick={handleSubmit} className='brand-btn flex-1 justify-center px-4'>
					{project ? copy('保存', 'Save') : copy('添加', 'Add')}
				</button>
			</div>

			{showImageDialog && <ImageUploadDialog currentImage={formData.image} onClose={() => setShowImageDialog(false)} onSubmit={handleImageSubmit} />}
		</DialogModal>
	)
}
