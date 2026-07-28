'use client'

import Card from '@/components/card'
import { DialogModal } from '@/components/dialog-modal'
import { CARD_SPACING } from '@/consts'
import { useCenterStore } from '@/hooks/use-center'
import { useAuthStore } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HomeDraggableLayer } from './home-draggable-layer'
import { pushSiteContent } from './services/push-site-content'
import { useConfigStore, type CalendarEvent } from './stores/config-store'
import { useI18n } from '@/i18n'

dayjs.locale('zh-cn')

const weekdayLabels = { zh: ['一', '二', '三', '四', '五', '六', '日'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }

export default function CalendarCard() {
	const { copy, language } = useI18n()
	const center = useCenterStore()
	const { cardStyles, siteContent, setSiteContent } = useConfigStore()
	const isAuth = useAuthStore(state => state.isAuth)
	const now = dayjs()
	const [viewMonth, setViewMonth] = useState(now.startOf('month'))
	const firstDayWeekday = (viewMonth.day() + 6) % 7
	const daysInMonth = viewMonth.daysInMonth()
	const viewingCurrentMonth = viewMonth.isSame(now, 'month')
	const currentWeekday = viewingCurrentMonth ? (now.day() + 6) % 7 : -1
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
		setSelectedDate(viewMonth.date(day).format('YYYY-MM-DD'))
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
			toast.error(`${copy('日程保存失败', 'Could not save the event')}: ${error instanceof Error ? error.message : copy('未知错误', 'Unknown error')}`)
		} finally {
			setIsSaving(false)
		}
	}

	const saveEvent = async () => {
		const trimmedTitle = title.trim()
		if (!trimmedTitle) {
			toast.error(copy('请输入日程名称', 'Enter an event name'))
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
		await persistEvents(nextEvents, editingId ? copy('日程已更新', 'Event updated') : copy('日程已添加', 'Event added'))
	}

	const deleteEvent = async (eventId: string) => {
		await persistEvents(
			events.filter(event => event.id !== eventId),
			copy('日程已删除', 'Event deleted')
		)
	}

	return (
		<>
			<HomeDraggableLayer cardKey='calendarCard' x={x} y={y} width={styles.width} height={styles.height}>
				<Card
					order={styles.order}
					width={styles.width}
					height={styles.height}
					x={x}
					y={y}
					className='flex flex-col max-sm:!static max-sm:!h-[370px] max-sm:!w-[calc(100vw-2rem)] max-sm:!translate-none max-sm:p-5'>
					{siteContent.enableChristmas && (
						<img
							src='/images/christmas/snow-7.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 150, right: -12, top: -12, opacity: 0.8 }}
						/>
					)}

					<div className='flex items-center justify-between gap-3'>
						<div>
							<h3 className='text-primary text-sm font-semibold'>{copy(viewMonth.format('YYYY年M月'), viewMonth.format('MMMM YYYY'))}</h3>
							<p className='text-secondary mt-0.5 text-[11px]'>{copy(`今天 ${now.format('M月D日 ddd')}`, `Today, ${now.format('D MMM ddd')}`)}</p>
						</div>
						<div className='flex items-center gap-1'>
							<button
								type='button'
								onClick={() => setViewMonth(month => month.subtract(1, 'month'))}
								className='grid size-8 place-items-center rounded-lg border bg-white/40 hover:bg-white/70'
								aria-label={copy('上个月', 'Previous month')}>
								<ChevronLeft className='size-4' />
							</button>
							<button
								type='button'
								onClick={() => setViewMonth(now.startOf('month'))}
								className='h-8 rounded-lg border bg-white/40 px-2 text-xs hover:bg-white/70'>
								{copy('今天', 'Today')}
							</button>
							<button
								type='button'
								onClick={() => setViewMonth(month => month.add(1, 'month'))}
								className='grid size-8 place-items-center rounded-lg border bg-white/40 hover:bg-white/70'
								aria-label={copy('下个月', 'Next month')}>
								<ChevronRight className='size-4' />
							</button>
						</div>
					</div>
					<ul className={cn('text-secondary mt-3 grid h-[206px] flex-1 grid-cols-7 gap-2 text-sm', (styles.height < 240 || styles.width < 240) && 'text-xs')}>
						{weekdayLabels[language].map((date, index) => (
							<li key={date} className={cn('flex items-center justify-center font-medium', index === currentWeekday && 'text-brand')}>
								{date}
							</li>
						))}

						{new Array(firstDayWeekday).fill(0).map((_, index) => (
							<li key={`empty-${index}`} />
						))}

						{new Array(daysInMonth).fill(0).map((_, index) => {
							const day = index + 1
							const dateKey = viewMonth.date(day).format('YYYY-MM-DD')
							const isToday = viewingCurrentMonth && day === now.date()
							return (
								<li key={day} className='flex items-center justify-center'>
									<button
										type='button'
										onClick={() => openDate(day)}
										aria-label={`${dateKey}${eventDates.has(dateKey) ? copy(' 有日程', ' has events') : ''}`}
										className={cn(
											'relative flex size-8 items-center justify-center rounded-lg transition hover:bg-white/45',
											isToday && 'bg-linear border font-medium'
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

			<DialogModal
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				className='card w-full max-w-lg p-6 max-sm:max-h-[calc(100dvh-2rem)] max-sm:overflow-y-auto max-sm:p-5'>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<p className='text-brand text-xs font-medium'>{copy(dayjs(selectedDate).format('YYYY年M月D日 dddd'), dayjs(selectedDate).format('dddd, D MMMM YYYY'))}</p>
						<h2 className='mt-1 text-xl font-semibold'>{isAuth ? copy('管理日程', 'Manage events') : copy('当日日程', "Today's events")}</h2>
					</div>
					<button
						type='button'
						onClick={() => setDialogOpen(false)}
						className='grid size-9 place-items-center rounded-full border bg-white/55'
						aria-label={copy('关闭', 'Close')}>
						<X className='size-4' />
					</button>
				</div>

				<div className='mt-5 max-h-52 space-y-2 overflow-y-auto pr-1'>
					{selectedEvents.length === 0 && <p className='text-secondary rounded-xl border bg-white/35 px-4 py-5 text-center text-sm'>{copy('这一天还没有日程', 'No events on this day')}</p>}
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
									<button
										type='button'
										onClick={() => editEvent(event)}
										className='grid size-8 place-items-center rounded-lg hover:bg-white/70'
										aria-label={copy(`编辑 ${event.title}`, `Edit ${event.title}`)}>
										<Pencil className='size-3.5' />
									</button>
									<button
										type='button'
										onClick={() => void deleteEvent(event.id)}
										disabled={isSaving}
										className='grid size-8 place-items-center rounded-lg text-red-500 hover:bg-red-50'
										aria-label={copy(`删除 ${event.title}`, `Delete ${event.title}`)}>
										<Trash2 className='size-3.5' />
									</button>
								</div>
							)}
						</div>
					))}
				</div>

				{isAuth && (
					<div className='mt-5 space-y-3 border-t pt-5'>
						<div className='grid grid-cols-[1fr_120px] gap-3 max-sm:grid-cols-1'>
							<input
								value={title}
								onChange={event => setTitle(event.target.value)}
								maxLength={40}
								placeholder={copy('日程名称', 'Event name')}
								className='rounded-xl border bg-white/55 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]'
							/>
							<input
								value={time}
								onChange={event => setTime(event.target.value)}
								type='time'
								aria-label={copy('日程时间', 'Event time')}
								className='rounded-xl border bg-white/55 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]'
							/>
						</div>
						<textarea
							value={note}
							onChange={event => setNote(event.target.value)}
							maxLength={160}
							placeholder={copy('备注（可选）', 'Notes (optional)')}
							className='min-h-20 w-full resize-none rounded-xl border bg-white/55 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]'
						/>
						<div className='flex flex-wrap justify-end gap-2'>
							{editingId && (
								<button type='button' onClick={resetForm} className='rounded-xl border bg-white/55 px-4 py-2 text-sm'>
									{copy('取消编辑', 'Cancel')}
								</button>
							)}
							<button type='button' onClick={() => void saveEvent()} disabled={isSaving} className='brand-btn flex items-center gap-2 px-4'>
								<Plus className='size-4' /> {isSaving ? copy('保存中', 'Saving…') : editingId ? copy('保存修改', 'Save changes') : copy('添加日程', 'Add event')}
							</button>
						</div>
					</div>
				)}
			</DialogModal>
		</>
	)
}
