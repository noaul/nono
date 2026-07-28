'use client'

import { ExternalLink, ImageIcon } from 'lucide-react'
import type { SiteContent } from '../../stores/config-store'
import { useI18n } from '@/i18n'

interface ArtImagesSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function ArtImagesSection({ formData, setFormData }: ArtImagesSectionProps) {

	const { copy } = useI18n()
	const artImages = formData.artImages ?? []
	const currentId = formData.currentArtImageId || artImages[0]?.id || 'primary'
	const currentArt = artImages.find(item => item.id === currentId) ?? artImages[0]
	const imageUrl = currentArt?.url || ''

	const updateImageUrl = (url: string) => {
		setFormData(previous => {
			const images = previous.artImages ?? []
			const activeId = previous.currentArtImageId || images[0]?.id || 'primary'
			const hasActiveImage = images.some(item => item.id === activeId)
			return {
				...previous,
				artImages: hasActiveImage ? images.map(item => (item.id === activeId ? { ...item, url } : item)) : [{ id: activeId, url }, ...images],
				currentArtImageId: activeId
			}
		})
	}

	return (
		<section className='space-y-4 border-t border-white/55 pt-5'>
			<h3 className='flex items-center gap-2 text-sm font-semibold'>
				<ImageIcon className='text-brand size-4' />
				{copy('顶部图片', 'Header image')}
			</h3>

			<div className='grid grid-cols-[160px_minmax(0,1fr)] gap-4 max-sm:grid-cols-1'>
				<div className='grid aspect-[16/9] place-items-center overflow-hidden rounded-lg border border-white/65 bg-white/40'>
					{imageUrl ? <img src={imageUrl} alt={copy('顶部图片预览', 'Header image preview')} className='size-full object-cover' /> : <ImageIcon className='text-secondary size-7' />}
				</div>

				<div className='space-y-3'>
					<label className='block space-y-2'>
						<span className='text-xs font-medium'>{copy('图片地址（图床）', 'Image URL (CDN)')}</span>
						<input
							type='text'
							value={imageUrl}
							onChange={event => updateImageUrl(event.target.value.trim())}
							placeholder='https://img.example.com/photo.webp'
							className='bg-secondary/10 w-full rounded-lg border px-3 py-2 text-sm'
						/>
					</label>

					<label className='block space-y-2'>
						<span className='flex items-center gap-1.5 text-xs font-medium'>
							<ExternalLink className='size-3.5' />
							{copy('点击跳转地址', 'Link target')}
						</span>
						<input
							type='text'
							value={formData.artLinkUrl || ''}
							onChange={event => setFormData(previous => ({ ...previous, artLinkUrl: event.target.value }))}
							placeholder={copy('https://example.com 或 /projects', 'https://example.com or /projects')}
							className='bg-secondary/10 w-full rounded-lg border px-3 py-2 text-sm'
						/>
					</label>
				</div>
			</div>
		</section>
	)
}
