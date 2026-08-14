'use client'

import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type AmbientDateTimePickerProps = {
	date: string
	time: string
	onDateChange: (value: string) => void
	onTimeChange: (value: string) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

function parseDateKey(value: string) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (!match) return new Date()
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
	return Number.isNaN(date.getTime()) ? new Date() : date
}

function formatDateKey(value: Date) {
	return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function formatDateLabel(value: string) {
	return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(parseDateKey(value))
}

export function AmbientDateTimePicker({ date, time, onDateChange, onTimeChange }: AmbientDateTimePickerProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	const selectedDate = useMemo(() => parseDateKey(date), [date])
	const [open, setOpen] = useState(false)
	const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
	const [hour = '00', minute = '00'] = time.split(':')

	useEffect(() => {
		if (!open) return
		const closeFromOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
		}
		const closeFromEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', closeFromOutside)
		document.addEventListener('keydown', closeFromEscape)
		return () => {
			document.removeEventListener('pointerdown', closeFromOutside)
			document.removeEventListener('keydown', closeFromEscape)
		}
	}, [open])

	useEffect(() => {
		if (open) setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
	}, [open, selectedDate])

	const calendarDays = useMemo(() => {
		const firstWeekday = (visibleMonth.getDay() + 6) % 7
		const firstCell = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - firstWeekday)
		return Array.from({ length: 42 }, (_, index) => {
			const value = new Date(firstCell)
			value.setDate(firstCell.getDate() + index)
			return value
		})
	}, [visibleMonth])

	const setTimePart = (nextHour: string, nextMinute: string) => onTimeChange(`${nextHour}:${nextMinute}`)

	return (
		<div className='ambient-date-time-picker' ref={rootRef}>
			<button type='button' className='ambient-date-time-trigger' onClick={() => setOpen(current => !current)} aria-expanded={open} aria-haspopup='dialog'>
				<span><CalendarDays size={16} /><strong>{formatDateLabel(date)}</strong></span>
				<span><Clock3 size={16} /><strong>{time}</strong></span>
			</button>

			{open && (
				<div className='ambient-date-time-popover' role='dialog' aria-label='选择日程日期和时间'>
					<div className='ambient-picker-month'>
						<button type='button' onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} title='上个月' aria-label='上个月'><ChevronLeft size={17} /></button>
						<strong>{visibleMonth.getFullYear()} 年 {visibleMonth.getMonth() + 1} 月</strong>
						<button type='button' onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} title='下个月' aria-label='下个月'><ChevronRight size={17} /></button>
					</div>
					<div className='ambient-picker-weekdays' aria-hidden='true'>{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
					<div className='ambient-picker-calendar'>
						{calendarDays.map(value => {
							const key = formatDateKey(value)
							const selected = key === date
							return <button type='button' key={key} className={`${value.getMonth() === visibleMonth.getMonth() ? '' : 'is-outside'}${selected ? ' is-selected' : ''}`} onClick={() => onDateChange(key)} aria-pressed={selected} aria-label={`${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`}>
								<span>{value.getDate()}</span>{selected ? <Check size={11} /> : null}
							</button>
						})}
					</div>
					<div className='ambient-picker-time'>
						<Clock3 size={16} />
						<label><span>选择小时</span><select value={hour} onChange={event => setTimePart(event.target.value, minute)} aria-label='选择小时'>{HOURS.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
						<i>:</i>
						<label><span>选择分钟</span><select value={minute} onChange={event => setTimePart(hour, event.target.value)} aria-label='选择分钟'>{MINUTES.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
						<button type='button' className='ambient-picker-done' onClick={() => setOpen(false)}>完成</button>
					</div>
				</div>
			)}
		</div>
	)
}
