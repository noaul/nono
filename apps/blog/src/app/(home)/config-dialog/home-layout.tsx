'use client'

import { motion } from 'motion/react'
import { useConfigStore, type CardStyles } from '../stores/config-store'
import { useLayoutEditStore } from '../stores/layout-edit-store'
import cardStylesDefault from '@/config/card-styles-default.json'
import { useI18n } from '@/i18n'

/** [zh, en] pairs so the table headers follow the active language. */
const CARD_LABELS: Record<string, [string, string]> = {
	artCard: ['首图', 'Hero'],
	hiCard: ['中心', 'Centre'],
	clockCard: ['时钟', 'Clock'],
	calendarCard: ['日历', 'Calendar'],
	scheduleCard: ['近期日程', 'Schedule'],
	musicCard: ['音乐', 'Music'],
	socialButtons: ['联系', 'Contact'],
	shareCard: ['分享', 'Shares'],
	articleCard: ['文章', 'Posts'],
	writeButtons: ['写作', 'Write'],
	navCard: ['导航', 'Nav'],
	likePosition: ['点赞', 'Likes'],
	hatCard: ['帽子', 'Hat'],
	beianCard: ['备案', 'ICP']
}

interface HomeLayoutProps {
	cardStylesData: CardStyles
	setCardStylesData: React.Dispatch<React.SetStateAction<CardStyles>>
	onClose?: () => void
}

export function HomeLayout({ cardStylesData, setCardStylesData, onClose }: HomeLayoutProps) {
	const { copy } = useI18n()
	const { setCardStyles } = useConfigStore()
	const startEditing = useLayoutEditStore(state => state.startEditing)
	const editing = useLayoutEditStore(state => state.editing)

	const handleStartManualLayout = () => {
		setCardStyles(cardStylesData)
		startEditing()
		onClose?.()
	}

	const handleReset = () => {
		setCardStylesData(cardStylesDefault as unknown as CardStyles)
	}

	return (
		<div className='overflow-x-auto'>
			<div className='flex items-center justify-between'>
				<div className='text-secondary text-sm'>{copy('（偏移代表相对中心的偏移）', '(offsets are relative to the centre)')}</div>
				<div className='flex shrink-0 items-center gap-2 whitespace-nowrap'>
					<button type='button' onClick={handleReset} className='bg-card rounded-xl border px-3 py-1.5 text-xs font-medium'>
						{copy('重置', 'Reset')}
					</button>
					<button
						type='button'
						onClick={handleStartManualLayout}
						disabled={editing}
						className='bg-card rounded-xl border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50'>
						{editing ? copy('主页正在编辑中', 'Editing the home page') : copy('进入主页拖拽布局', 'Drag the layout on the home page')}
					</button>
				</div>
			</div>
			<table className='mt-3 w-full border-collapse text-sm whitespace-nowrap'>
				<thead>
					<tr className='border-b text-xs text-gray-500'>
						<th className='px-3 py-2 text-left font-medium'>{copy('卡片', 'Card')}</th>
						<th className='px-3 py-2 text-left font-medium'>{copy('宽度', 'Width')}</th>
						<th className='px-3 py-2 text-left font-medium'>{copy('高度', 'Height')}</th>
						<th className='px-3 py-2 text-left font-medium'>{copy('显示顺序', 'Order')}</th>
						<th className='px-3 py-2 text-left font-medium'>{copy('横向偏移', 'Offset X')}</th>
						<th className='px-3 py-2 text-left font-medium'>{copy('纵向偏移', 'Offset Y')}</th>
						<th className='px-3 py-2 text-left font-medium'>{copy('启用', 'Enabled')}</th>
					</tr>
				</thead>
				<tbody>
					{Object.entries(cardStylesData).map(([key, cardStyle]: [string, any]) => (
						<tr key={key} className='border-b last:border-0'>
							<td className='px-3 py-2 align-middle whitespace-nowrap'>{CARD_LABELS[key] ? copy(CARD_LABELS[key][0], CARD_LABELS[key][1]) : key.replace(/([A-Z])/g, ' $1').trim()}</td>

							<td className='px-3 py-2'>
								{cardStyle.width !== undefined ? (
									<input
										type='number'
										value={cardStyle.width}
										onChange={e =>
											setCardStylesData(prev => ({
												...prev,
												[key]: {
													...prev[key as keyof CardStyles],
													width: parseInt(e.target.value) || 0
												}
											}))
										}
										className='no-spinner bg-secondary/10 w-full rounded-lg border px-3 py-1.5 text-xs'
									/>
								) : (
									<span className='text-xs text-gray-400'>-</span>
								)}
							</td>
							<td className='px-3 py-2'>
								{cardStyle.height !== undefined ? (
									<input
										type='number'
										value={cardStyle.height}
										onChange={e =>
											setCardStylesData(prev => ({
												...prev,
												[key]: {
													...prev[key as keyof CardStyles],
													height: parseInt(e.target.value) || 0
												}
											}))
										}
										className='no-spinner bg-secondary/10 w-full rounded-lg border px-3 py-1.5 text-xs'
									/>
								) : (
									<span className='text-xs text-gray-400'>-</span>
								)}
							</td>
							<td className='px-3 py-2'>
								<input
									type='number'
									value={cardStyle.order}
									onChange={e =>
										setCardStylesData(prev => ({
											...prev,
											[key]: {
												...prev[key as keyof CardStyles],
												order: parseInt(e.target.value) || 0
											}
										}))
									}
									className='bg-secondary/10 w-full rounded-lg border px-3 py-1.5 text-xs'
								/>
							</td>
							<td className='px-3 py-2'>
								<input
									type='number'
									value={cardStyle.offsetX ?? ''}
									placeholder='null'
									onChange={e => {
										const value = e.target.value === '' ? null : parseInt(e.target.value) || 0
										setCardStylesData(prev => ({
											...prev,
											[key]: {
												...prev[key as keyof CardStyles],
												offsetX: value
											}
										}))
									}}
									className='no-spinner bg-secondary/10 w-full rounded-lg border px-3 py-1.5 text-xs'
								/>
							</td>
							<td className='px-3 py-2'>
								<input
									type='number'
									value={cardStyle.offsetY ?? ''}
									placeholder='null'
									onChange={e => {
										const value = e.target.value === '' ? null : parseInt(e.target.value) || 0
										setCardStylesData(prev => ({
											...prev,
											[key]: {
												...prev[key as keyof CardStyles],
												offsetY: value
											}
										}))
									}}
									className='no-spinner bg-secondary/10 w-full rounded-lg border px-3 py-1.5 text-xs'
								/>
							</td>
							<td className='px-3 py-2'>
								<input
									type='checkbox'
									checked={cardStyle.enabled ?? true}
									onChange={e =>
										setCardStylesData(prev => ({
											...prev,
											[key]: {
												...prev[key as keyof CardStyles],
												enabled: e.target.checked
											}
										}))
									}
									className='accent-brand h-4 w-4 rounded border-gray-300'
								/>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
