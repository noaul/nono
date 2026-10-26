'use client'

import { AnimatePresence, motion, type Variants } from 'motion/react'
import { ArrowUpRight, Bell, Check, CheckCheck, ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { islandColumns, islandPages, nextSeenKeys, readSeenKeys, SEEN_STORAGE_KEY, type IslandNotification } from './notification-island-model'

export type NotificationItem = IslandNotification & {
	source: NotificationSource
	description: string
	href: string
	occurredAt: string
}

export const NOTIFICATION_SOURCE_LABELS = { nodesk: 'NoDesk', nomoney: 'NoMoney', yumi: 'Yumi', nostar: 'NoStar', links: '书签', backup: '备份' } as const
export type NotificationSource = keyof typeof NOTIFICATION_SOURCE_LABELS
const ROTATE_MS = 4_000
const FRESH_MS = 4_000
/** The bell summary and the expand button take this much of the strip; the rest is shared by the columns. */
const STRIP_CHROME_WIDTH = 96
const ISLAND_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const
const PAGE_VARIANTS: Variants = {
	enter: {},
	center: { transition: { staggerChildren: 0.07 } },
	exit: { transition: { staggerChildren: 0.05 } }
}

type Props = {
	notifications: NotificationItem[]
	unreadCount: number
	ready: boolean
	expanded: boolean
	onExpandedChange: (expanded: boolean) => void
	onRead: (item: NotificationItem) => void
	onDismiss: (item: NotificationItem) => void
	onReadAll: () => void
	onOpenAll: () => void
	reducedMotion: boolean
}

function linkProps(href: string) {
	return href.startsWith('http') ? { href, target: '_blank', rel: 'noreferrer' } : { href }
}

/**
 * Unread notifications as a thin strip above the search bar. Two or three columns scroll upward
 * together, each taking its turn through a few notifications; the full list opens on demand.
 */
export function AmbientNotificationIsland({ notifications, unreadCount, ready, expanded, onExpandedChange, onRead, onDismiss, onReadAll, onOpenAll, reducedMotion }: Props) {
	const rootRef = useRef<HTMLDivElement>(null)
	const summaryRef = useRef<HTMLButtonElement>(null)
	const seenRef = useRef<Set<string> | null>(null)
	const [columns, setColumns] = useState(2)
	const [page, setPage] = useState(0)
	const [paused, setPaused] = useState(false)
	const [freshKey, setFreshKey] = useState<string | null>(null)
	const unread = useMemo(() => notifications.filter(item => !item.read), [notifications])
	const pages = useMemo(() => islandPages(unread, columns), [columns, unread])
	const pageIndex = pages.length ? page % pages.length : 0
	const freshItem = freshKey ? unread.find(item => item.key === freshKey) ?? null : null

	useEffect(() => {
		const root = rootRef.current
		if (!root) return
		const observer = new ResizeObserver(([entry]) => setColumns(islandColumns(entry.contentRect.width - STRIP_CHROME_WIDTH)))
		observer.observe(root)
		return () => observer.disconnect()
	}, [])

	// Each notification is announced once per browser; the seen list survives reloads.
	useEffect(() => {
		if (!ready) return
		if (!seenRef.current) seenRef.current = readSeenKeys(localStorage.getItem(SEEN_STORAGE_KEY))
		const fresh = unread.find(item => !seenRef.current!.has(item.key))
		if (!fresh) return
		const next = nextSeenKeys(seenRef.current, unread.map(item => item.key))
		seenRef.current = new Set(next)
		localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next))
		const freshPage = pages.findIndex(entries => entries.some(item => item.key === fresh.key))
		if (freshPage >= 0) setPage(freshPage)
		setFreshKey(fresh.key)
	}, [pages, ready, unread])

	useEffect(() => {
		if (!freshKey) return
		const timer = window.setTimeout(() => setFreshKey(null), FRESH_MS)
		return () => window.clearTimeout(timer)
	}, [freshKey])

	useEffect(() => {
		if (pages.length < 2 || paused || expanded) return
		const timer = window.setInterval(() => setPage(value => value + 1), ROTATE_MS)
		return () => window.clearInterval(timer)
	}, [expanded, pages.length, paused])

	useEffect(() => {
		if (!expanded) return
		const closeFromOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
			onExpandedChange(false)
		}
		document.addEventListener('pointerdown', closeFromOutside)
		return () => document.removeEventListener('pointerdown', closeFromOutside)
	}, [expanded, onExpandedChange])

	useEffect(() => {
		if (expanded && !unread.length) onExpandedChange(false)
	}, [expanded, onExpandedChange, unread.length])

	const cellVariants: Variants = reducedMotion
		? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
		: { enter: { opacity: 0, y: '100%' }, center: { opacity: 1, y: '0%' }, exit: { opacity: 0, y: '-100%' } }
	const cellTransition = reducedMotion ? { duration: 0 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }
	const visible = pages[pageIndex] ?? []
	const toggle = () => onExpandedChange(!expanded)

	return <div
		ref={rootRef}
		className='ambient-island-anchor'
		data-expanded={expanded ? 'true' : 'false'}
		onFocus={() => setPaused(true)}
		onKeyDown={event => {
			// Escape inside the list closes it and puts focus back on the strip instead of dropping it to the page.
			if (event.key !== 'Escape' || !expanded) return
			onExpandedChange(false)
			summaryRef.current?.focus()
		}}
		onBlur={event => {
			if (event.currentTarget.contains(event.relatedTarget)) return
			setPaused(false)
			if (event.relatedTarget) onExpandedChange(false)
		}}>
		<span className='ambient-sr-only' role='status' aria-live='polite'>{freshItem ? `新通知：${freshItem.title}` : ''}</span>
		<AnimatePresence>
			{unread.length > 0 && <motion.div
				key='island'
				className='ambient-island'
				data-fresh={freshItem ? 'true' : 'false'}
				initial={reducedMotion ? false : { opacity: 0, scaleX: 0.3, y: 6 }}
				animate={{ opacity: 1, scaleX: 1, y: 0 }}
				exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scaleX: 0.3, y: 6 }}
				transition={reducedMotion ? { duration: 0 } : ISLAND_SPRING}
				onPointerEnter={event => { if (event.pointerType === 'mouse') setPaused(true) }}
				onPointerLeave={event => { if (event.pointerType === 'mouse') setPaused(false) }}>
				<button ref={summaryRef} type='button' className='ambient-island-summary' onClick={toggle} aria-expanded={expanded} aria-label={`通知，${unreadCount} 条未读`}>
					<Bell size={13} />
					<b>{unreadCount > 99 ? '99+' : unreadCount}</b>
				</button>
				<div className='ambient-island-viewport' style={{ '--island-columns': columns } as React.CSSProperties}>
					<AnimatePresence initial={false}>
						<motion.div key={`${pageIndex}:${visible.map(item => item.key).join('|')}`} className='ambient-island-page' variants={PAGE_VARIANTS} initial='enter' animate='center' exit='exit'>
							{visible.map(item => <motion.a
								key={item.key}
								{...linkProps(item.href)}
								className='ambient-island-item'
								data-severity={item.severity}
								data-fresh={item.key === freshKey ? 'true' : 'false'}
								title={`${NOTIFICATION_SOURCE_LABELS[item.source]} · ${item.title}`}
								variants={cellVariants}
								transition={cellTransition}
								onClick={() => onRead(item)}>
								<i aria-hidden='true' />
								<span>{item.title}</span>
							</motion.a>)}
						</motion.div>
					</AnimatePresence>
				</div>
				<button type='button' className='ambient-island-toggle' onClick={toggle} aria-expanded={expanded} title={expanded ? '收起通知' : '展开通知'} aria-label={expanded ? '收起通知' : '展开通知'}>
					<ChevronDown size={15} />
				</button>
			</motion.div>}
		</AnimatePresence>

		<AnimatePresence>
			{expanded && unread.length > 0 && <motion.div
				key='panel'
				className='ambient-island-panel'
				role='dialog'
				aria-label='通知'
				initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
				transition={reducedMotion ? { duration: 0 } : { duration: 0.18 }}>
				<header>
					<strong>通知</strong>
					<span>{unreadCount} 条未读</span>
					<button type='button' onClick={onReadAll} title='全部标为已读' aria-label='全部标为已读'><CheckCheck size={16} /></button>
				</header>
				<div className='ambient-island-list'>
					{unread.slice(0, 8).map(item => <div key={item.key} className='ambient-island-row' data-severity={item.severity}>
						<a {...linkProps(item.href)} onClick={() => onRead(item)}>
							<i aria-hidden='true' />
							<span className='ambient-island-copy'>
								<strong>{item.title}</strong>
								<small>{[NOTIFICATION_SOURCE_LABELS[item.source], item.description].filter(Boolean).join(' · ')}</small>
							</span>
						</a>
						<button type='button' onClick={() => onRead(item)} title='标为已读' aria-label={`标为已读：${item.title}`}><Check size={15} /></button>
						<button type='button' onClick={() => onDismiss(item)} title='移除' aria-label={`移除：${item.title}`}><X size={15} /></button>
					</div>)}
				</div>
				<button type='button' className='ambient-island-all' onClick={() => { onExpandedChange(false); onOpenAll() }}>
					通知中心 <ArrowUpRight size={14} />
				</button>
			</motion.div>}
		</AnimatePresence>
	</div>
}
