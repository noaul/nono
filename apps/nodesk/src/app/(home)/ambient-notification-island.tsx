'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Bell, Check, CheckCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { islandMode, nextSeenKeys, readSeenKeys, SEEN_STORAGE_KEY, type IslandNotification } from './notification-island-model'

export type NotificationItem = IslandNotification & {
	source: NotificationSource
	description: string
	href: string
	occurredAt: string
}

export const NOTIFICATION_SOURCE_LABELS = { nodesk: 'NoDesk', nomoney: 'NoMoney', yumi: 'Yumi', nostar: 'NoStar', links: '书签', backup: '备份' } as const
export type NotificationSource = keyof typeof NOTIFICATION_SOURCE_LABELS
const SOURCE_LABELS = NOTIFICATION_SOURCE_LABELS
const PEEK_MS = 5_000
const ROTATE_MS = 6_000
const ISLAND_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const

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

/**
 * Unread notifications as a Dynamic Island above the search bar: a quiet pill that briefly
 * bubbles out when something new arrives, and opens into a short list on hover, focus, or tap.
 */
export function AmbientNotificationIsland({ notifications, unreadCount, ready, expanded, onExpandedChange, onRead, onDismiss, onReadAll, onOpenAll, reducedMotion }: Props) {
	const rootRef = useRef<HTMLDivElement>(null)
	const seenRef = useRef<Set<string> | null>(null)
	const [peekKey, setPeekKey] = useState<string | null>(null)
	const [rotation, setRotation] = useState(0)
	const unread = useMemo(() => notifications.filter(item => !item.read), [notifications])
	const peekItem = peekKey ? unread.find(item => item.key === peekKey) ?? null : null
	const mode = islandMode(unread.length, expanded, Boolean(peekItem))
	const current = unread.length ? unread[rotation % unread.length] : null

	// Each notification bubbles out once per browser; the seen list survives reloads.
	useEffect(() => {
		if (!ready) return
		if (!seenRef.current) seenRef.current = readSeenKeys(localStorage.getItem(SEEN_STORAGE_KEY))
		const fresh = unread.find(item => !seenRef.current!.has(item.key))
		if (!fresh) return
		const next = nextSeenKeys(seenRef.current, unread.map(item => item.key))
		seenRef.current = new Set(next)
		localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next))
		setPeekKey(fresh.key)
	}, [ready, unread])

	useEffect(() => {
		if (!peekKey) return
		const timer = window.setTimeout(() => setPeekKey(null), PEEK_MS)
		return () => window.clearTimeout(timer)
	}, [peekKey])

	useEffect(() => {
		if (mode !== 'compact' || unread.length < 2) return
		const timer = window.setInterval(() => setRotation(value => value + 1), ROTATE_MS)
		return () => window.clearInterval(timer)
	}, [mode, unread.length])

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

	const open = () => {
		setPeekKey(null)
		onExpandedChange(true)
	}
	const transition = reducedMotion ? { duration: 0 } : ISLAND_SPRING
	const fade = reducedMotion ? { duration: 0 } : { duration: 0.18, delay: 0.06 }

	return <div
		ref={rootRef}
		className='ambient-island-anchor'
		onPointerEnter={event => { if (event.pointerType === 'mouse' && unread.length) open() }}
		onPointerLeave={event => { if (event.pointerType === 'mouse') onExpandedChange(false) }}
		// The tapped pill unmounts as the island opens, which can blur with no target; outside clicks are handled above.
		onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) onExpandedChange(false) }}>
		<span className='ambient-sr-only' role='status' aria-live='polite'>{peekItem ? `新通知：${peekItem.title}` : ''}</span>
		<AnimatePresence>
			{mode !== 'hidden' && <motion.div
				key='island'
				layout
				className='ambient-island'
				data-mode={mode}
				data-severity={(mode === 'peek' ? peekItem : current)?.severity}
				initial={reducedMotion ? false : { opacity: 0, scale: 0.4, y: -6 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: -6 }}
				transition={transition}
				style={{ borderRadius: mode === 'expanded' ? 24 : 999 }}>
				<AnimatePresence mode='popLayout' initial={false}>
					{mode === 'compact' && current && <motion.button
						key='compact'
						type='button'
						className='ambient-island-compact'
						onClick={open}
						aria-expanded={false}
						aria-label={`通知，${unreadCount} 条未读，最新：${current.title}`}
						initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
						<span className='ambient-island-glyph'><Bell size={14} /></span>
						<AnimatePresence mode='wait' initial={false}>
							<motion.span key={current.key} className='ambient-island-ticker' initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
								{current.title}
							</motion.span>
						</AnimatePresence>
						{unreadCount > 1 && <b className='ambient-island-count'>{unreadCount > 99 ? '99+' : unreadCount}</b>}
					</motion.button>}

					{mode === 'peek' && peekItem && <motion.button
						key='peek'
						type='button'
						className='ambient-island-peek'
						onClick={open}
						aria-expanded={false}
						initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
						<span className='ambient-island-glyph is-large'><Bell size={17} /></span>
						<span className='ambient-island-copy'>
							<small>{SOURCE_LABELS[peekItem.source]} · 新通知</small>
							<strong>{peekItem.title}</strong>
						</span>
					</motion.button>}

					{mode === 'expanded' && <motion.div
						key='expanded'
						className='ambient-island-panel'
						role='dialog'
						aria-label='通知'
						initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
						<header>
							<strong>通知</strong>
							<span>{unreadCount} 条未读</span>
							<button type='button' onClick={onReadAll} title='全部标为已读' aria-label='全部标为已读'><CheckCheck size={16} /></button>
						</header>
						<div className='ambient-island-list'>
							{unread.slice(0, 5).map(item => <div key={item.key} className='ambient-island-row' data-severity={item.severity}>
								<a href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel={item.href.startsWith('http') ? 'noreferrer' : undefined} onClick={() => onRead(item)}>
									<span className='ambient-island-glyph'><Bell size={14} /></span>
									<span className='ambient-island-copy'>
										<strong>{item.title}</strong>
										<small>{[SOURCE_LABELS[item.source], item.description].filter(Boolean).join(' · ')}</small>
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
			</motion.div>}
		</AnimatePresence>
	</div>
}
