'use client'

import type { SiteContent } from '../../stores/config-store'
import { useI18n } from '@/i18n'

interface SiteMetaFormProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function SiteMetaForm({ formData, setFormData }: SiteMetaFormProps) {


	const { copy } = useI18n()
	return (
		<>
			<div className='grid grid-cols-2 gap-2'>
				<div>
					<label className='mb-2 block text-sm font-medium'>{copy('站点标题', 'Site title')}</label>
					<input
						type='text'
						value={formData.meta.title}
						onChange={e => setFormData({ ...formData, meta: { ...formData.meta, title: e.target.value } })}
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>

				<div>
					<label className='mb-2 block text-sm font-medium'>{copy('用户名', 'Username')}</label>
					<input
						type='text'
						value={formData.meta.username || ''}
						onChange={e => setFormData({ ...formData, meta: { ...formData.meta, username: e.target.value } })}
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>
			</div>

			<div>
				<label className='mb-2 block text-sm font-medium'>{copy('站点描述', 'Site description')}</label>
				<textarea
					value={formData.meta.description}
					onChange={e => setFormData({ ...formData, meta: { ...formData.meta, description: e.target.value } })}
					rows={3}
					className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
				/>
			</div>
		</>
	)
}
