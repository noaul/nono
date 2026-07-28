'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import type { SiteContent } from '../../stores/config-store'
import { Select } from '@/components/select'
import type { SocialButtonImageUploads } from './types'
import { hashFileSHA256 } from '@/lib/file-utils'
import { useI18n } from '@/i18n'

type SocialButtonType =
	| 'github'
	| 'juejin'
	| 'email'
	| 'link'
	| 'x'
	| 'tg'
	| 'wechat'
	| 'facebook'
	| 'tiktok'
	| 'instagram'
	| 'weibo'
	| 'xiaohongshu'
	| 'zhihu'
	| 'bilibili'
	| 'qq'

interface SocialButtonConfig {
	id: string
	type: SocialButtonType
	value: string
	label?: string
	order: number
}

interface SocialButtonsSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
	socialButtonImageUploads: SocialButtonImageUploads
	setSocialButtonImageUploads: React.Dispatch<React.SetStateAction<SocialButtonImageUploads>>
}

export function SocialButtonsSection({ formData, setFormData, socialButtonImageUploads, setSocialButtonImageUploads }: SocialButtonsSectionProps) {


	const { copy } = useI18n()
	const buttons = (formData.socialButtons || []) as SocialButtonConfig[]
	const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

	const handleAddButton = () => {
		const newId = `button-${Date.now()}`
		const newButton = {
			id: newId,
			type: 'link' as const,
			value: '',
			label: '',
			order: buttons.length + 1
		}
		setFormData(prev => ({
			...prev,
			socialButtons: [...(prev.socialButtons || []), newButton]
		}))
	}

	const handleUpdateButton = (id: string, updates: Partial<SocialButtonConfig>) => {
		setFormData(prev => ({
			...prev,
			socialButtons: (prev.socialButtons || []).map(btn => (btn.id === id ? { ...btn, ...updates, label: updates.label ?? btn.label ?? '' } : btn))
		}))
	}

	const handleRemoveButton = (id: string) => {
		setFormData(prev => ({
			...prev,
			socialButtons: (prev.socialButtons || []).filter(btn => btn.id !== id)
		}))
	}

	const handleMoveButton = (id: string, direction: 'up' | 'down') => {
		const currentIndex = buttons.findIndex(btn => btn.id === id)
		if (currentIndex === -1) return

		const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
		if (newIndex < 0 || newIndex >= buttons.length) return

		const newButtons = [...buttons]
		;[newButtons[currentIndex], newButtons[newIndex]] = [newButtons[newIndex], newButtons[currentIndex]]

		const updatedButtons = newButtons.map((btn, index) => ({
			...btn,
			order: index + 1,
			label: btn.label ?? ''
		}))

		setFormData(prev => ({
			...prev,
			socialButtons: updatedButtons
		}))
	}

	const handleImageSelect = async (buttonId: string, e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		if (!file.type.startsWith('image/')) {
			toast.error(copy('请选择图片文件', 'Choose an image file'))
			return
		}

		const hash = await hashFileSHA256(file)
		const ext = file.name.split('.').pop() || 'png'
		const targetPath = `/images/social-buttons/${hash}.${ext}`
		const previewUrl = URL.createObjectURL(file)

		setSocialButtonImageUploads(prev => ({
			...prev,
			[buttonId]: { type: 'file', file, previewUrl, hash }
		}))

		setFormData(prev => ({
			...prev,
			socialButtons: (prev.socialButtons || []).map(btn => (btn.id === buttonId ? { ...btn, value: targetPath } : btn))
		}))

		if (e.currentTarget) e.currentTarget.value = ''
	}

	const handleRemoveImage = (buttonId: string) => {
		const uploadItem = socialButtonImageUploads[buttonId]
		if (uploadItem?.type === 'file') {
			URL.revokeObjectURL(uploadItem.previewUrl)
		}

		setSocialButtonImageUploads(prev => {
			const next = { ...prev }
			delete next[buttonId]
			return next
		})

		setFormData(prev => ({
			...prev,
			socialButtons: (prev.socialButtons || []).map(btn => (btn.id === buttonId ? { ...btn, value: '' } : btn))
		}))
	}

	const sortedButtons = [...buttons].sort((a, b) => a.order - b.order)

	return (
		<div>
			<label className='mb-2 block text-sm font-medium'>{copy('社交按钮', 'Social buttons')}</label>
			{buttons.length === 0 && <p className='mb-2 text-xs text-gray-500'>{copy('暂未配置社交按钮，点击下方「+」添加。', 'No social buttons yet — use “+” below to add one.')}</p>}
			<div className='space-y-2 whitespace-nowrap'>
				{sortedButtons.map((button, index) => (
					<div key={button.id} className='flex items-center gap-2'>
						<Select
							value={button.type}
							onChange={value => handleUpdateButton(button.id, { type: value as SocialButtonType })}
							className='w-24'
							options={[
								{ value: 'github', label: 'Github' },
								{ value: 'juejin', label: copy('掘金', 'Juejin') },
								{ value: 'email', label: copy('邮箱', 'Email') },
								{ value: 'x', label: 'X' },
								{ value: 'tg', label: 'Telegram' },
								{ value: 'wechat', label: copy('微信', 'WeChat') },
								{ value: 'facebook', label: 'Facebook' },
								{ value: 'tiktok', label: 'TikTok' },
								{ value: 'instagram', label: 'Instagram' },
								{ value: 'weibo', label: copy('微博', 'Weibo') },
								{ value: 'xiaohongshu', label: copy('小红书', 'RED') },
								{ value: 'zhihu', label: copy('知乎', 'Zhihu') },
								{ value: 'bilibili', label: copy('哔哩哔哩', 'Bilibili') },
								{ value: 'qq', label: 'QQ' },
								{ value: 'link', label: copy('链接', 'Link') }
							]}
						/>
						{button.type === 'wechat' || button.type === 'qq' ? (
							<div className='flex flex-1 items-center gap-2'>
								<input
									ref={el => {
										imageInputRefs.current[button.id] = el
									}}
									type='file'
									accept='image/*'
									className='hidden'
									onChange={e => handleImageSelect(button.id, e)}
								/>
								{socialButtonImageUploads[button.id]?.type === 'file' ? (
									<div className='relative flex flex-1 items-center gap-2'>
										<img
											src={(socialButtonImageUploads[button.id] as { type: 'file'; file: File; previewUrl: string; hash?: string }).previewUrl}
											alt='preview'
											className='h-10 w-10 rounded-lg object-cover'
										/>
										<input
											type='text'
											value={button.value}
											onChange={e => handleUpdateButton(button.id, { value: e.target.value })}
											placeholder={button.type === 'wechat' ? copy('微信号或二维码链接', 'WeChat ID or QR link') : copy('QQ号或二维码链接', 'QQ number or QR link')}
											className='bg-secondary/10 flex-1 rounded-lg border px-3 py-1.5 text-xs'
										/>
										<button type='button' onClick={() => handleRemoveImage(button.id)} className='text-xs text-red-500 hover:text-red-600'>
											{copy('删除图片', 'Delete image')}
										</button>
									</div>
								) : button.value && button.value.startsWith('/images/social-buttons/') ? (
									<div className='relative flex flex-1 items-center gap-2'>
										<img src={button.value} alt='preview' className='h-10 w-10 rounded-lg object-cover' />
										<input
											type='text'
											value={button.value}
											onChange={e => handleUpdateButton(button.id, { value: e.target.value })}
											placeholder={button.type === 'wechat' ? copy('微信号或二维码链接', 'WeChat ID or QR link') : copy('QQ号或二维码链接', 'QQ number or QR link')}
											className='bg-secondary/10 flex-1 rounded-lg border px-3 py-1.5 text-xs'
										/>
									</div>
								) : (
									<>
										<input
											type='text'
											value={button.value}
											onChange={e => handleUpdateButton(button.id, { value: e.target.value })}
											placeholder={button.type === 'wechat' ? copy('微信号或二维码链接', 'WeChat ID or QR link') : copy('QQ号或二维码链接', 'QQ number or QR link')}
											className='bg-secondary/10 flex-1 rounded-lg border px-3 py-1.5 text-xs'
										/>
										<button
											type='button'
											onClick={() => imageInputRefs.current[button.id]?.click()}
											className='bg-card rounded-lg border px-3 py-1.5 text-xs font-medium'>
											{copy('上传图片', 'Upload image')}
										</button>
									</>
								)}
							</div>
						) : (
							<input
								type={button.type === 'email' ? 'email' : 'url'}
								value={button.value}
								onChange={e => handleUpdateButton(button.id, { value: e.target.value })}
								placeholder={button.type === 'email' ? 'example@email.com' : 'https://example.com'}
								className='bg-secondary/10 flex-1 rounded-lg border px-3 py-1.5 text-xs'
							/>
						)}
						{button.type !== 'email' && button.type !== 'wechat' && button.type !== 'qq' && (
							<input
								type='text'
								value={button.label || ''}
								onChange={e => handleUpdateButton(button.id, { label: e.target.value })}
								placeholder={copy('标签文本（可选）', 'Label text (optional)')}
								className='bg-secondary/10 w-32 rounded-lg border px-3 py-1.5 text-xs'
							/>
						)}
						<input
							type='number'
							value={button.order}
							onChange={e => {
								const order = parseInt(e.target.value, 10)
								if (!isNaN(order) && order > 0) {
									handleUpdateButton(button.id, { order })
								}
							}}
							min={1}
							placeholder={copy('顺序', 'Order')}
							className='bg-secondary/10 w-16 rounded-lg border px-2 py-1.5 text-xs'
						/>
						<div className='flex gap-1'>
							<button
								type='button'
								onClick={() => handleMoveButton(button.id, 'up')}
								disabled={index === 0}
								className='rounded px-2 py-1 text-xs hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300'>
								↑
							</button>
							<button
								type='button'
								onClick={() => handleMoveButton(button.id, 'down')}
								disabled={index === sortedButtons.length - 1}
								className='rounded px-2 py-1 text-xs hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300'>
								↓
							</button>
							<button type='button' onClick={() => handleRemoveButton(button.id)} className='rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50'>
								{copy('删除', 'Delete')}
							</button>
						</div>
					</div>
				))}
				<button
					type='button'
					onClick={handleAddButton}
					className='hover:border-brand/60 text-secondary hover:bg-card flex w-full items-center justify-center rounded-xl border border-dashed py-2 text-sm'>
					{copy('+ 添加按钮', '+ Add button')}
				</button>
			</div>
		</div>
	)
}
