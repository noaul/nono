'use client'

import { useState } from 'react'

import { type AvatarItem } from './components/avatar-upload-dialog'
import { FriendCard } from './components/friend-card'
import { useI18n } from '@/i18n'

export type FriendStatus = 'recent' | 'disconnected'

export interface Friend {
	name: string
	avatar: string
	url: string
	description: string
	stars: number
	status?: FriendStatus
}

interface GridViewProps {
	friends: Friend[]
	isEditMode?: boolean
	onUpdate?: (friend: Friend, oldFriend: Friend, avatarItem?: AvatarItem) => void
	onDelete?: (friend: Friend) => void
}

export default function GridView({ friends, isEditMode = false, onUpdate, onDelete }: GridViewProps) {


	const { copy } = useI18n()
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedCategory, setSelectedCategory] = useState<FriendStatus>('recent')

	const filteredFriends = friends.filter(friend => {
		const status = friend.status ?? 'recent'
		const matchesCategory = status === selectedCategory
		const matchesSearch =
			friend.name.toLowerCase().includes(searchTerm.toLowerCase()) || friend.description.toLowerCase().includes(searchTerm.toLowerCase())
		return matchesCategory && matchesSearch
	})

	return (
		<div className='mx-auto w-full max-w-7xl px-6 pt-24 pb-12'>
			<div className='mb-8 space-y-4'>
				<input
					type='text'
					placeholder={copy('搜索朋友...', 'Search friends…')}
					value={searchTerm}
					onChange={e => setSearchTerm(e.target.value)}
					className='focus:ring-brand mx-auto block w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:outline-none'
				/>

				<div className='flex flex-wrap justify-center gap-2'>
					<button
						onClick={() => setSelectedCategory('recent')}
						className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
							selectedCategory === 'recent' ? 'bg-brand text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
						}`}>
						{copy('近期更新', 'Recently updated')}
					</button>
					<button
						onClick={() => setSelectedCategory('disconnected')}
						className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
							selectedCategory === 'disconnected' ? 'bg-brand text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
						}`}>
						{copy('长期失联', 'Long inactive')}
					</button>
				</div>
			</div>

			<div className='grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
				{filteredFriends.map(friend => (
					<FriendCard key={friend.url} friend={friend} isEditMode={isEditMode} onUpdate={onUpdate} onDelete={() => onDelete?.(friend)} />
				))}
			</div>

			{filteredFriends.length === 0 && (
				<div className='mt-12 text-center text-gray-500'>
					<p>{copy('没有找到相关朋友', 'No matching friends')}</p>
				</div>
			)}
		</div>
	)
}
