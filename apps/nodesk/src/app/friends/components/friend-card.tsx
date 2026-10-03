'use client'

import { motion } from 'motion/react'
import StarRating from '@/components/star-rating'
import { useSize } from '@/hooks/use-size'
import { cn } from '@/lib/utils'
import EditableStarRating from '@/components/editable-star-rating'
import { Friend, type FriendStatus } from '../grid-view'
import { useState } from 'react'
import AvatarUploadDialog, { type AvatarItem } from './avatar-upload-dialog'
import { useI18n } from '@/i18n'

interface FriendCardProps {
	friend: Friend
	isEditMode?: boolean
	onUpdate?: (friend: Friend, oldFriend: Friend, avatarItem?: AvatarItem) => void
	onDelete?: () => void
}

export function FriendCard({ friend, isEditMode = false, onUpdate, onDelete }: FriendCardProps) {


	const { copy } = useI18n()
	const [expanded, setExpanded] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const { maxSM } = useSize()
	const [localFriend, setLocalFriend] = useState(friend)
	const [showAvatarDialog, setShowAvatarDialog] = useState(false)
	const [avatarItem, setAvatarItem] = useState<AvatarItem | null>(null)

	const handleFieldChange = (field: keyof Friend, value: any) => {
		const updated = { ...localFriend, [field]: value }
		setLocalFriend(updated)
		onUpdate?.(updated, friend, avatarItem || undefined)
	}

	const handleAvatarSubmit = (avatar: AvatarItem) => {
		setAvatarItem(avatar)
		const avatarUrl = avatar.type === 'url' ? avatar.url : avatar.previewUrl
		const updated = { ...localFriend, avatar: avatarUrl }
		setLocalFriend(updated)
		onUpdate?.(updated, friend, avatar)
	}

	const handleCancel = () => {
		setLocalFriend(friend)
		setIsEditing(false)
		setAvatarItem(null)
	}

	const canEdit = isEditMode && isEditing

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.6 }}
			{...(maxSM ? { animate: { opacity: 1, scale: 1 } } : { whileInView: { opacity: 1, scale: 1 } })}
			className='card relative block overflow-hidden'>
			{isEditMode && (
				<div className='absolute top-3 right-3 z-10 flex gap-2'>
					{isEditing ? (
						<>
							<button onClick={handleCancel} className='rounded-lg px-2 py-1.5 text-xs text-gray-400 transition-colors hover:text-gray-600'>
								{copy('取消', 'Cancel')}
							</button>
							<button onClick={() => setIsEditing(false)} className='rounded-lg px-2 py-1.5 text-xs text-blue-400 transition-colors hover:text-blue-600'>
								{copy('完成', 'Done')}
							</button>
						</>
					) : (
						<>
							<button onClick={() => setIsEditing(true)} className='rounded-lg px-2 py-1.5 text-xs text-blue-400 transition-colors hover:text-blue-600'>
								{copy('编辑', 'Edit')}
							</button>
							<button onClick={onDelete} className='rounded-lg px-2 py-1.5 text-xs text-red-400 transition-colors hover:text-red-600'>
								{copy('删除', 'Delete')}
							</button>
						</>
					)}
				</div>
			)}

			<div>
				<div className='mb-4 flex items-center gap-4'>
					<div className='group relative'>
						<img
							src={localFriend.avatar}
							alt={localFriend.name}
							className={cn('h-16 w-16 rounded-full object-cover', canEdit && 'cursor-pointer')}
							onClick={() => canEdit && setShowAvatarDialog(true)}
						/>
						{canEdit && (
							<div className='ev pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
								<span className='text-xs text-white'>{copy('更换', 'Replace')}</span>
							</div>
						)}
					</div>
					<div className='flex-1'>
						<h3
							contentEditable={canEdit}
							suppressContentEditableWarning
							onBlur={e => handleFieldChange('name', e.currentTarget.textContent || '')}
							className={cn('group-hover:text-brand text-lg font-bold transition-colors focus:outline-none', canEdit && 'cursor-text')}>
							{localFriend.name}
						</h3>
						{canEdit ? (
							<div
								contentEditable
								suppressContentEditableWarning
								onBlur={e => handleFieldChange('url', e.currentTarget.textContent || '')}
								className='text-secondary mt-1 block max-w-[200px] cursor-text truncate text-xs focus:outline-none'>
								{localFriend.url}
							</div>
						) : (
							<a
								href={localFriend.url}
								target='_blank'
								rel='noopener noreferrer'
								className='text-secondary hover:text-brand mt-1 block max-w-[200px] truncate text-xs hover:underline'>
								{localFriend.url}
							</a>
						)}
					</div>
				</div>

				{canEdit ? (
					<EditableStarRating stars={localFriend.stars} editable={true} onChange={stars => handleFieldChange('stars', stars)} />
				) : (
					<StarRating stars={localFriend.stars} />
				)}

				{canEdit && (
					<div className='mt-2 flex gap-2'>
						{(['recent', 'disconnected'] as FriendStatus[]).map(status => (
							<button
								key={status}
								type='button'
								onClick={() => handleFieldChange('status', status)}
								className={`rounded-full px-3 py-1 text-xs transition-colors ${
									(localFriend.status ?? 'recent') === status ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
								}`}>
								{status === 'recent' ? copy('近期更新', 'Recently updated') : copy('长期失联', 'Long inactive')}
							</button>
						))}
					</div>
				)}

				<p
					contentEditable={canEdit}
					suppressContentEditableWarning
					onBlur={e => handleFieldChange('description', e.currentTarget.textContent || '')}
					onClick={e => {
						if (!canEdit) {
							e.preventDefault()
							setExpanded(!expanded)
						}
					}}
					className={cn(
						'mt-3 text-sm leading-relaxed text-gray-600 transition-all duration-300 focus:outline-none',
						canEdit ? 'cursor-text' : 'cursor-pointer',
						!canEdit && (expanded ? 'line-clamp-none' : 'line-clamp-3')
					)}>
					{localFriend.description}
				</p>
			</div>

			{canEdit && showAvatarDialog && (
				<AvatarUploadDialog currentAvatar={localFriend.avatar} onClose={() => setShowAvatarDialog(false)} onSubmit={handleAvatarSubmit} />
			)}
		</motion.div>
	)
}
