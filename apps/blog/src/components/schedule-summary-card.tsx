'use client'

import Card from '@/components/card'
import { CARD_SPACING } from '@/consts'
import { useCenterStore } from '@/hooks/use-center'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { CalendarDays } from 'lucide-react'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { HomeDraggableLayer } from '@/app/(home)/home-draggable-layer'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { useI18n } from '@/i18n'

dayjs.locale('zh-cn')

export default function ScheduleSummaryCard() {

	const { copy } = useI18n()
	const pathname = usePathname()
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const styles = cardStyles.scheduleCard
	const hiCardStyles = cardStyles.hiCard
	const clockCardStyles = cardStyles.clockCard
	const calendarCardStyles = cardStyles.calendarCard

	const events = useMemo(
		() =>
			[...(siteContent.calendarEvents ?? [])]
				.filter(event => event.date >= dayjs().format('YYYY-MM-DD'))
				.sort((left, right) => `${left.date} ${left.time || '99:99'}`.localeCompare(`${right.date} ${right.time || '99:99'}`)),
		[siteContent.calendarEvents]
	)
	const nearest = events[0]
	const nextDays = [1, 2, 3].map(offset => {
		const date = dayjs().add(offset, 'day')
		return {
			date,
			events: events.filter(event => event.date === date.format('YYYY-MM-DD'))
		}
	})

	if (pathname !== '/') return null

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x + CARD_SPACING + hiCardStyles.width / 2 - styles.offset
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y - clockCardStyles.offset + CARD_SPACING + calendarCardStyles.height + CARD_SPACING

	return (
		<HomeDraggableLayer cardKey='scheduleCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card
				order={styles.order}
				width={styles.width}
				height={styles.height}
				x={x}
				y={y}
				className='flex items-center gap-3 overflow-hidden px-4 py-3 max-sm:!static max-sm:!h-auto max-sm:min-h-[132px] max-sm:!w-[calc(100vw-2rem)] max-sm:!translate-none max-sm:flex-wrap'>
				<div className='bg-brand/15 text-brand grid size-10 shrink-0 place-items-center rounded-full'>
					<CalendarDays className='size-5' />
				</div>
				<div className='min-w-0 flex-1'>
					<div className='text-secondary text-[11px] font-medium'>{copy('最近日程', 'Upcoming')}</div>
					<div className='text-primary mt-0.5 truncate text-sm font-medium'>
						{nearest ? `${dayjs(nearest.date).format('M月D日')} ${nearest.time ? `${nearest.time} ` : ''}${nearest.title}` : copy('暂无待办日程', 'Nothing scheduled')}
					</div>
				</div>
				<div className='bg-border/60 h-9 w-px shrink-0 max-sm:hidden' />
				<div className='flex min-w-0 flex-1 items-stretch gap-1.5 max-sm:basis-full' aria-label={copy('未来三天日程', 'Next three days')}>
					{nextDays.map(({ date, events: dayEvents }) => (
						<div key={date.format('YYYY-MM-DD')} className='min-w-0 flex-1 rounded-xl bg-white/30 px-2 py-1.5 text-center'>
							<div className={cn('text-[10px]', date.day() === 0 || date.day() === 6 ? 'text-secondary' : 'text-brand')}>
								{date.format('M/D')} {date.format('ddd')}
							</div>
							<div className='text-primary mt-0.5 truncate text-[11px]' title={dayEvents[0]?.title || copy('暂无', 'None')}>
								{dayEvents[0]?.title || copy('暂无', 'None')}
							</div>
						</div>
					))}
				</div>
			</Card>
		</HomeDraggableLayer>
	)
}
