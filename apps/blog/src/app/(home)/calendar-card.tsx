'use client'

import Card from '@/components/card'
import { DialogModal } from '@/components/dialog-modal'
import { CARD_SPACING } from '@/consts'
import { useCenterStore } from '@/hooks/use-center'
import { useAuthStore } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HomeDraggableLayer } from './home-draggable-layer'
import { pushSiteContent } from './services/push-site-content'
import { useConfigStore, type CalendarEvent } from './stores/config-store'

dayjs.locale('zh-cn')

const dates = ['一', '二', '三', '四', '五', '六', '日']

export default function CalendarCard() {
	const center = useCenterStore()
	const { cardStyles, siteContent, setSiteContent } = useConfigStore()
	const isAuth = useAuthStore(state => state.isAuth)
	const now = dayjs()
	const currentDate = now.date()
	const firstDayWeekday = (now.startOf('month').day() + 6) % 7
	const daysInMonth = now.daysInMonth()
	const currentWeekday = (now.day() + 6) % 7
	const styles = cardStyles.calendarCard
	const hiCardStyles = cardStyles.hiCard
	const clockCardStyles = cardStyles.clockCard
	const events = siteContent.calendarEvents ?? []
	const [selectedDate, setSelectedDate] = useState(now.format('YYYY-MM-DD'))
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [title, setTitle] = useState('')
	const [time, setTime] = useState('')
	const [note, setNote] = useState('')
	const [isSaving, setIsSaving] = useState(false)

	const eventDates = useMemo(() => new Set(events.map(event => event.date)), [events])
	const selectedEvents = useMemo(
		() => events.filter(event => event.date === selectedDate).sort((left, right) => (left.time || '99:99').localeCompare(right.time || '99:99')),
		[events, selectedDate]
	)

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x + CARD_SPACING + hiCardStyles.width / 2
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y - clockCardStyles.offset + CARD_SPACING

	const openDate = (day: number) => {
		setSelectedDate(now.date(day).format('YYYY-MM-DD'))
		resetForm()
		setDialogOpen(true)
	}

	const resetForm = () => {
		setEditingId(null)
		setTitle('')
		setTime('')
		setNote('')
	}

	const editEvent = (event: CalendarEvent) => {
		setEditingId(event.id)
		setTitle(event.title)
		setTime(event.time || '')
		setNote(event.note || '')
	}

	const persistEvents = async (nextEvents: CalendarEvent[], successMessage: string) => {
		setIsSaving(true)
		try {
			const nextSiteContent = { ...siteContent, calendarEvents: nextEvents }
			await pushSiteContent(nextSiteContent, cardStyles)
			setSiteContent(nextSiteContent)
			toast.success(successMessage)
			resetForm()
		} catch (error) {
			toast.error(`日程保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
		} finally {
			setIsSaving(false)
		}
	}

	const saveEvent = async () => {
		const trimmedTitle = title.trim()
		if (!trimmedTitle) {
			toast.error('请输入日程名称')
			return
		}

		const nextEvent: CalendarEvent = {
			id: editingId || crypto.randomUUID(),
			date: selectedDate,
			title: trimmedTitle,
			...(time ? { time } : {}),
			...(note.trim() ? { note: note.trim() } : {})
		}
		const nextEvents = editingId ? events.map(event => (event.id === editingId ? nextEvent : event)) : [...events, nextEvent]
		await persistEvents(nextEvents, editingId ? '日程已更新' : '日程已添加')
	}

	const deleteEvent = async (eventId: string) => {
		await persistEvents(events.filter(event => event.id !== eventId), '日程已删除')
	}

	return (
		<>
			<HomeDraggableLayer cardKey='calendarCard' x={x} y={y} width={styles.width} height={styles.height}>
				<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className='flex flex-col'>
					{siteContent.enableChristmas && (
						<img
							src='/images/christmas/snow-7.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 150, right: -12, top: -12, opacity: 0.8 }}
						/>
					)}

					<h3 className='text-secondary text-sm'>
						{now.format('YYYY/M/D')} {now.format('ddd')}
					</h3>
					<ul className={cn('text-secondary mt-3 grid h-[206px] flex-1 grid-cols-7 gap-2 text-sm', (styles.height < 240 || styles.width < 240) && 'text-xs')}>
						{dates.map((date, index) => (
							<li key={date} className={cn('flex items-center justify-center font-medium', index === currentWeekday && 'text-brand')}>
								{date}
							</li>
						))}

						{new Array(firstDayWeekday).fill(0).map((_, index) => (
							<li key={`empty-${index}`} />
						))}

						{new Array(daysInMonth).fill(0).map((_, index) => {
							const day = index + 1
							const dateKey = now.date(day).format('YYYY-MM-DD')
							return (
								<li key={day} className='flex items-center justify-center'>
									<button
										type='button'
										onClick={() => openDate(day)}
										aria-label={`${dateKey}${eventDates.has(dateKey) ? ' 有日程' : ''}`}
										className={cn(
											'relative flex size-8 items-center justify-center rounded-lg transition hover:bg-white/45',
											day === currentDate && 'bg-linear border font-medium'
										)}>
										{day}
										{eventDates.has(dateKey) && <span className='bg-brand absolute bottom-0.5 size-1 rounded-full' />}
									</button>
								</li>
							)
						})}
					</ul>
				</Card>
			</HomeDraggableLayer>

			<DialogModal open={dialogOpen} onClose={() => setDialogOpen(false)} className='card w-full max-w-lg p-6'>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<p className='text-brand text-xs font-medium'>{dayjs(selectedDate).format('YYYY年M月D日 dddd')}</p>
						<h2 className='mt-1 text-xl font-semibold'>{isAuth ? '管理日程' : '当日日程'}</h2>
					</div>
					<button type='button' onClick={() => setDialogOpen(false)} className='grid size-9 place-items-center rounded-full border bg-white/55' aria-label='关闭'>
						<X className='size-4' />
					</button>
				</div>

				<div className='mt-5 max-h-52 space-y-2 overflow-y-auto pr-1'>
					{selectedEvents.length === 0 && <p className='text-secondary rounded-xl border bg-white/35 px-4 py-5 text-center text-sm'>这一天还没有日程</p>}
					{selectedEvents.map(event => (
						<div key={event.id} className='flex items-start gap-3 rounded-xl border bg-white/45 px-4 py-3'>
							<div className='min-w-0 flex-1'>
								<div className='flex items-center gap-2'>
									{event.time && <span className='text-brand text-xs font-semibold'>{event.time}</span>}
									<strong className='truncate text-sm'>{event.title}</strong>
								</div>
								{event.note && <p className='text-secondary mt-1 text-xs leading-5'>{event.note}</p>}
							</div>
							{isAuth && (
								<div className='flex gap-1'>
									<button type='button' onClick={() => editEvent(event)} className='grid size-8 place-items-center rounded-lg hover:bg-white/70' aria-label={`编辑 ${event.title}`}>
										<Pencil className='size-3.5' />
									</button>
									<button
										type='button'
										onClick={() => void deleteEvent(event.id)}
										disabled={isSaving}
										className='grid size-8 place-items-center rounded-lg text-red-500 hover:bg-red-50'
										aria-label={`删除 ${event.title}`}>
										<Trash2 className='size-3.5' />
									</button>
								</div>
							)}
						</div>
					))}
				</div>

				{isAuth && (
					<div className='mt-5 space-y-3 border-t pt-5'>
						<div className='grid grid-cols-[1fr_120px] gap-3'>
							<input value={title} onChange={event => setTitle(event.target.value)} maxLength={40} placeholder='日程名称' className='rounded-xl border bg-white/55 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]' />
							<input value={time} onChange={event => setTime(event.target.value)} type='time' aria-label='日程时间' className='rounded-xl border bg-white/55 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]' />
						</div>
						<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={160} placeholder='备注（可选）' className='min-h-20 w-full resize-none rounded-xl border bg-white/55 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]' />
						<div className='flex justify-end gap-2'>
							{editingId && (
								<button type='button' onClick={resetForm} className='rounded-xl border bg-white/55 px-4 py-2 text-sm'>
									取消编辑
								</button>
							)}
							<button type='button' onClick={() => void saveEvent()} disabled={isSaving} className='brand-btn flex items-center gap-2 px-4'>
								<Plus className='size-4' /> {isSaving ? '保存中' : editingId ? '保存修改' : '添加日程'}
							</button>
						</div>
					</div>
				)}
			</DialogModal>
		</>
	)
}
