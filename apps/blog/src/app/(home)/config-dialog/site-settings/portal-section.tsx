'use client'

import { ArrowUpRight, Compass, ImageIcon } from 'lucide-react'
import { getPortalSettings } from '@/lib/portal'
import type { SiteContent } from '../../stores/config-store'

interface PortalSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function PortalSection({ formData, setFormData }: PortalSectionProps) {
	const portal = getPortalSettings(formData.portal)
	const updatePortal = (patch: Partial<SiteContent['portal']>) => {
		setFormData(previous => ({
			...previous,
			portal: {
				...previous.portal,
				...patch
			}
		}))
	}

	return (
		<section className='space-y-4 border-t border-white/55 pt-5'>
			<div className='flex items-start justify-between gap-4'>
				<div>
					<h3 className='flex items-center gap-2 text-sm font-semibold'>
						<Compass className='text-brand size-4' />
						网址导航联动
					</h3>
					<p className='text-secondary mt-1 text-xs'>控制中心头像和右上角返回 Nono 的入口</p>
				</div>
				<label className='flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium'>
					<input
						type='checkbox'
						checked={formData.portal.enabled}
						onChange={event => updatePortal({ enabled: event.target.checked })}
						className='accent-brand size-4'
					/>
					启用
				</label>
			</div>

			<div className='grid grid-cols-2 gap-3 max-sm:grid-cols-1'>
				<label className='space-y-2'>
					<span className='block text-xs font-medium'>入口名称</span>
					<input
						type='text'
						value={formData.portal.label}
						onChange={event => updatePortal({ label: event.target.value })}
						className='bg-secondary/10 w-full rounded-lg border px-3 py-2 text-sm'
						placeholder='返回网址导航'
					/>
				</label>
				<label className='space-y-2'>
					<span className='block text-xs font-medium'>Nono 地址</span>
					<input
						type='text'
						value={formData.portal.url}
						onChange={event => updatePortal({ url: event.target.value })}
						className='bg-secondary/10 w-full rounded-lg border px-3 py-2 text-sm'
						placeholder='由 NEXT_PUBLIC_NONO_URL 提供'
					/>
				</label>
				<label className='col-span-2 space-y-2 max-sm:col-span-1'>
					<span className='block text-xs font-medium'>中心自定义图片</span>
					<div className='flex gap-2'>
						<input
							type='text'
							value={formData.portal.imageUrl}
							onChange={event => updatePortal({ imageUrl: event.target.value })}
							className='bg-secondary/10 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm'
							placeholder='/images/avatar.png 或 https://...'
						/>
						<button
							type='button'
							onClick={() => updatePortal({ imageUrl: formData.meta.avatarUrl || '/images/avatar.png' })}
							className='bg-card shrink-0 rounded-lg border px-3 text-xs font-medium'>
							使用头像
						</button>
					</div>
				</label>
			</div>

			<label className='flex cursor-pointer items-center gap-2 text-xs font-medium'>
				<input
					type='checkbox'
					checked={formData.portal.openInNewTab}
					onChange={event => updatePortal({ openInNewTab: event.target.checked })}
					className='accent-brand size-4'
				/>
				在新窗口打开
			</label>

			<div className={`relative overflow-hidden rounded-lg border border-white/65 bg-white/38 p-4 backdrop-blur-xl ${formData.portal.enabled ? '' : 'opacity-45'}`}>
				<div className='flex items-center gap-4'>
					<div className='grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-white/80 bg-white/60 shadow-lg'>
						{portal.imageUrl ? <img src={portal.imageUrl} alt='' className='size-full object-cover' /> : <ImageIcon className='text-secondary size-6' />}
					</div>
					<div className='min-w-0'>
						<strong className='flex items-center gap-1.5 text-sm'>
							{formData.portal.label || '返回网址导航'}
							<ArrowUpRight className='size-3.5' />
						</strong>
						<p className='text-secondary mt-1 truncate text-xs'>{portal.url || '尚未配置跳转地址'}</p>
					</div>
				</div>
			</div>
		</section>
	)
}
