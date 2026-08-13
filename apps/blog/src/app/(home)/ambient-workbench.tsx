'use client'

import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import {
	ArrowUpRight,
	AppWindow,
	Bell,
	Bookmark,
	CalendarDays,
	Check,
	Circle,
	CloudSun,
	ExternalLink,
	Github,
	ListTodo,
	Maximize2,
	Minimize2,
	Moon,
	Pause,
	Play,
	Plus,
	RefreshCw,
	RotateCcw,
	Search,
	Settings,
	Smile,
	Star,
	SunMedium,
	Timer,
	Trash2,
	WalletCards,
	X
} from 'lucide-react'
import { Children, FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'

import {
	filterWorkbenchItems,
	formatFocusDuration,
	nextFocusDuration,
	normalizeEvents,
	normalizeTasks,
	getShanghaiClockParts,
	shanghaiDateKey,
	sortCommonBookmarks,
	toggleTask,
	type WorkbenchEvent,
	type WorkbenchSearchItem,
	type WorkbenchTask
} from './ambient-workbench-model'
import { AmbientSettingsCenter } from './ambient-settings-center'
import { normalizeWorkbenchNavigation, type WorkbenchAppEntry } from './ambient-workbench-settings'

type PanelId = 'bookmarks' | 'github' | 'yumi' | 'notifications' | 'calendar' | 'tasks' | 'focus'
type DockActionId = PanelId | 'settings'
type LoadState = 'loading' | 'ready' | 'unavailable'
type IntegrationId = 'bookmarks' | 'github' | 'yumi' | 'notifications'

type BookmarkItem = {
	id: number
	name: string
	url: string
	description?: string | null
	clickCount: number
	lastClickedAt?: string | null
	sortOrder?: number
}

type RepositoryItem = {
	id: number
	full_name: string
	description?: string | null
	html_url: string
	language?: string | null
	stargazers_count?: number
}

type NotificationItem = {
	key: string
	source: 'nodesk' | 'nomoney' | 'yumi'
	title: string
	description: string
	href: string
	severity: 'info' | 'warning' | 'critical'
	read: boolean
	occurredAt: string
}

type DockItem = {
	id: DockActionId
	label: string
	icon: typeof Bookmark
	shortcutHref?: string
	shortcutLabel?: string
}

const TASKS_STORAGE_KEY = 'nodesk.ambient.tasks.v1'
const EVENTS_STORAGE_KEY = 'nodesk.ambient.events.v1'
const DIM_STORAGE_KEY = 'nodesk.ambient.dim.v1'
const FOCUS_PRESETS = [25, 50, 90]
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH === '/nodesk' ? '/nodesk' : ''

const DOCK_ITEMS: DockItem[] = [
	{ id: 'bookmarks', label: '书签', icon: Bookmark, shortcutHref: '/admin/links', shortcutLabel: '打开书签管理' },
	{ id: 'github', label: 'GitHub', icon: Github, shortcutHref: '/nostar/', shortcutLabel: '打开 NoStar' },
	{ id: 'yumi', label: 'Yumi', icon: Smile, shortcutHref: '/yumi', shortcutLabel: '打开 Yumi' },
	{ id: 'notifications', label: '通知', icon: Bell, shortcutHref: '/admin/notifications', shortcutLabel: '打开通知中心' },
	{ id: 'calendar', label: '日程', icon: CalendarDays },
	{ id: 'tasks', label: '任务', icon: ListTodo },
	{ id: 'focus', label: '专注', icon: Timer },
	{ id: 'settings', label: '设置', icon: Settings }
]

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'
const NOTIFICATION_SOURCE_LABELS = { nodesk: 'Nodesk', nomoney: 'NoMoney', yumi: 'Yumi' } as const

function localDateKey(date = new Date()) {
	return shanghaiDateKey(date)
}

function nextHourDate(date = new Date()) {
	return new Date(date.getTime() + 60 * 60 * 1000)
}

function nextHourKey(date = new Date()) {
	return `${getShanghaiClockParts(nextHourDate(date)).hour}:00`
}

function uniqueId(prefix: string) {
	const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
	return `${prefix}-${id}`
}

function parseStored<T>(key: string, normalize: (value: unknown) => T): T {
	try {
		return normalize(JSON.parse(localStorage.getItem(key) || '[]'))
	} catch {
		return normalize([])
	}
}

function apiData(value: unknown): unknown {
	if (!value || typeof value !== 'object') return value
	const record = value as Record<string, unknown>
	return 'data' in record ? record.data : value
}

function validWebUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null
	try {
		const url = new URL(value, window.location.origin)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
	} catch {
		return null
	}
}

function validNavigationHref(value: unknown, fallback: string): string {
	if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value
	return validWebUrl(value) || fallback
}

function greetingForHour(hour: number) {
	if (hour < 6) return '夜深了，留一点安静给自己。'
	if (hour < 11) return '上午好，今天只做重要的事。'
	if (hour < 14) return '中午好，慢一点也没关系。'
	if (hour < 18) return '下午好，保持轻盈的节奏。'
	return '晚上好，把今天温柔地收尾。'
}

function panelTitle(panel: PanelId) {
	if (panel === 'bookmarks') return '常用书签'
	return DOCK_ITEMS.find(item => item.id === panel)?.label || ''
}

function AppEntryIcon({ entry }: { entry: WorkbenchAppEntry }) {
	if (entry.id === 'home' || entry.icon === 'bookmark') return <Bookmark size={19} />
	if (entry.id === 'nomoney' || entry.icon === 'wallet-cards') return <WalletCards size={19} />
	if (entry.id === 'nostar' || entry.icon === 'star') return <Star size={19} />
	if (entry.id === 'yumi' || entry.icon === 'server-cog') return <Smile size={19} />
	return <AppWindow size={19} />
}

export default function AmbientWorkbench() {
	const reducedMotion = useReducedMotion()
	const pointerX = useMotionValue(0)
	const pointerY = useMotionValue(0)
	const wallpaperX = useSpring(pointerX, { stiffness: 38, damping: 24, mass: 0.8 })
	const wallpaperY = useSpring(pointerY, { stiffness: 38, damping: 24, mass: 0.8 })
	const searchInputRef = useRef<HTMLInputElement>(null)
	const panelRef = useRef<HTMLElement>(null)
	const dockRef = useRef<HTMLDivElement>(null)

	const [now, setNow] = useState(() => new Date())
	const [activePanel, setActivePanel] = useState<PanelId | null>(null)
	const activeDockItem = activePanel ? DOCK_ITEMS.find(item => item.id === activePanel) : undefined
	const [searchOpen, setSearchOpen] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')
	const [idleDepth, setIdleDepth] = useState<'awake' | 'quiet' | 'deep'>('awake')
	const [dimmed, setDimmed] = useState(false)
	const [isFullscreen, setIsFullscreen] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [appSwitcherOpen, setAppSwitcherOpen] = useState(false)
	const [workbenchNavigation, setWorkbenchNavigation] = useState(() => normalizeWorkbenchNavigation(null))

	const [tasks, setTasks] = useState<WorkbenchTask[]>([])
	const [events, setEvents] = useState<WorkbenchEvent[]>([])
	const [taskTitle, setTaskTitle] = useState('')
	const [eventTitle, setEventTitle] = useState('')
	const [eventDate, setEventDate] = useState(() => localDateKey(nextHourDate()))
	const [eventTime, setEventTime] = useState(nextHourKey)
	const [storageReady, setStorageReady] = useState(false)

	const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
	const [repositories, setRepositories] = useState<RepositoryItem[]>([])
	const [notifications, setNotifications] = useState<NotificationItem[]>([])
	const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)
	const [integrationState, setIntegrationState] = useState<Record<IntegrationId, LoadState>>({
		bookmarks: 'loading',
		github: 'loading',
		yumi: 'loading',
		notifications: 'loading'
	})

	const [focusMinutes, setFocusMinutes] = useState(25)
	const [focusRemaining, setFocusRemaining] = useState(25 * 60)
	const [focusRunning, setFocusRunning] = useState(false)

	const updateIntegration = (key: IntegrationId, state: LoadState) => {
		setIntegrationState(current => ({ ...current, [key]: state }))
	}

	const loadNotifications = async (showLoading = true) => {
		if (showLoading) {
			updateIntegration('yumi', 'loading')
			updateIntegration('notifications', 'loading')
		}
		try {
			const response = await fetch('/api/admin/notifications?limit=100&sources=nodesk%2Cnomoney%2Cyumi', { credentials: 'same-origin', cache: 'no-store' })
			if (!response.ok) throw new Error('Notifications unavailable')
			const value = apiData(await response.json()) as { items?: unknown; unreadCount?: unknown } | null
			const list = Array.isArray(value?.items) ? value.items : []
			setNotifications(
				list.flatMap(item => {
					if (!item || typeof item !== 'object') return []
					const notification = item as Record<string, unknown>
					if (
						typeof notification.key !== 'string'
						|| typeof notification.title !== 'string'
						|| (notification.source !== 'nodesk' && notification.source !== 'nomoney' && notification.source !== 'yumi')
					) return []
					const severity = notification.severity === 'critical' || notification.severity === 'warning' ? notification.severity : 'info'
					return [{
						key: notification.key,
						source: notification.source,
						title: notification.title,
						description: typeof notification.description === 'string' ? notification.description : '',
						href: validNavigationHref(notification.href, '/'),
						severity,
						read: notification.read === true,
						occurredAt: typeof notification.occurredAt === 'string' ? notification.occurredAt : ''
					}]
				})
			)
			setNotificationUnreadCount(typeof value?.unreadCount === 'number' ? value.unreadCount : 0)
			updateIntegration('yumi', 'ready')
			updateIntegration('notifications', 'ready')
		} catch {
			updateIntegration('yumi', 'unavailable')
			updateIntegration('notifications', 'unavailable')
		}
	}

	const loadIntegrations = async () => {
		setIntegrationState({ bookmarks: 'loading', github: 'loading', yumi: 'loading', notifications: 'loading' })
		void loadNotifications(false)

		void fetch('/api/admin/links', { credentials: 'same-origin', cache: 'no-store' })
			.then(async response => {
				if (!response.ok) throw new Error('Bookmarks unavailable')
				const value = apiData(await response.json())
				const list = Array.isArray(value) ? value : []
				setBookmarks(sortCommonBookmarks(
					list.flatMap(item => {
						if (!item || typeof item !== 'object') return []
						const link = item as Record<string, unknown>
						const url = validWebUrl(link.url)
						if (typeof link.id !== 'number' || typeof link.name !== 'string' || !url) return []
						return [{
							id: link.id,
							name: link.name.trim() || url,
							url,
							description: typeof link.description === 'string' ? link.description : null,
							clickCount: typeof link.clickCount === 'number' ? link.clickCount : 0,
							lastClickedAt: typeof link.lastClickedAt === 'string' ? link.lastClickedAt : null,
							sortOrder: typeof link.sortOrder === 'number' ? link.sortOrder : 0
						}]
					})
				))
				updateIntegration('bookmarks', 'ready')
			})
			.catch(() => updateIntegration('bookmarks', 'unavailable'))

		void fetch('/api/nostar/repositories?limit=1000', { credentials: 'same-origin', cache: 'no-store' })
			.then(async response => {
				if (!response.ok) throw new Error('GitHub unavailable')
				const body = (await response.json()) as { repositories?: unknown }
				const list = Array.isArray(body.repositories) ? body.repositories : []
				setRepositories(
					list.flatMap(item => {
						if (!item || typeof item !== 'object') return []
						const repository = item as Record<string, unknown>
						const url = validWebUrl(repository.html_url)
						if (typeof repository.id !== 'number' || typeof repository.full_name !== 'string' || !url) return []
						return [
							{
								id: repository.id,
								full_name: repository.full_name,
								description: typeof repository.description === 'string' ? repository.description : null,
								html_url: url,
								language: typeof repository.language === 'string' ? repository.language : null,
								stargazers_count: typeof repository.stargazers_count === 'number' ? repository.stargazers_count : 0
							}
						]
					})
				)
				updateIntegration('github', 'ready')
			})
			.catch(() => updateIntegration('github', 'unavailable'))

	}

	const loadWorkbenchNavigation = async () => {
		try {
			const response = await fetch('/api/navigation/admin', { credentials: 'same-origin', cache: 'no-store' })
			if (!response.ok) return
			const value = apiData(await response.json()) as { site?: { settings?: unknown } } | null
			setWorkbenchNavigation(normalizeWorkbenchNavigation(value?.site?.settings))
		} catch {
			// Defaults keep the switcher usable while the navigation service is unavailable.
		}
	}

	const saveQuickEntriesVisibility = async (visible: boolean) => {
		const response = await fetch('/api/admin/nodesk/workbench', {
			method: 'PUT',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ quickEntriesVisible: visible })
		})
		if (!response.ok) throw new Error(response.status === 403 ? '只有管理员可以修改此设置。' : '快捷入口设置保存失败。')
		setWorkbenchNavigation(current => ({ ...current, quickEntriesVisible: visible }))
	}

	useEffect(() => {
		setTasks(parseStored(TASKS_STORAGE_KEY, normalizeTasks))
		setEvents(parseStored(EVENTS_STORAGE_KEY, normalizeEvents))
		setDimmed(localStorage.getItem(DIM_STORAGE_KEY) === 'true')
		setStorageReady(true)
		void loadIntegrations()
		void loadWorkbenchNavigation()
		const refreshNotifications = () => {
			void loadNotifications()
		}
		const pollTimer = window.setInterval(refreshNotifications, 5 * 60 * 1000)
		window.addEventListener('focus', refreshNotifications)
		// Other integrations refresh on demand; notifications additionally follow the homepage cadence.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		return () => {
			window.clearInterval(pollTimer)
			window.removeEventListener('focus', refreshNotifications)
		}
	}, [])

	useEffect(() => {
		if (!storageReady) return
		localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
	}, [storageReady, tasks])

	useEffect(() => {
		if (!storageReady) return
		localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events))
	}, [events, storageReady])

	useEffect(() => {
		const tick = () => setNow(new Date())
		tick()
		const interval = window.setInterval(tick, 1_000)
		return () => {
			window.clearInterval(interval)
		}
	}, [])

	useEffect(() => {
		if (!activePanel) return
		const closePanelFromOutside = (event: PointerEvent) => {
			const target = event.target
			if (!(target instanceof Node)) return
			if (panelRef.current?.contains(target) || dockRef.current?.contains(target)) return
			setActivePanel(null)
		}
		document.addEventListener('pointerdown', closePanelFromOutside)
		return () => document.removeEventListener('pointerdown', closePanelFromOutside)
	}, [activePanel])

	useEffect(() => {
		if (!focusRunning) return
		const timerId = window.setInterval(() => {
			setFocusRemaining(value => {
				if (value <= 1) {
					setFocusRunning(false)
					return 0
				}
				return value - 1
			})
		}, 1000)
		return () => window.clearInterval(timerId)
	}, [focusRunning])

	useEffect(() => {
		let quietTimer = 0
		let deepTimer = 0
		const wake = () => {
			setIdleDepth('awake')
			window.clearTimeout(quietTimer)
			window.clearTimeout(deepTimer)
			quietTimer = window.setTimeout(() => setIdleDepth('quiet'), 90_000)
			deepTimer = window.setTimeout(() => setIdleDepth('deep'), 300_000)
		}
		const events: Array<keyof WindowEventMap> = ['pointerdown', 'pointermove', 'keydown', 'touchstart']
		events.forEach(event => window.addEventListener(event, wake, { passive: true }))
		wake()
		return () => {
			events.forEach(event => window.removeEventListener(event, wake))
			window.clearTimeout(quietTimer)
			window.clearTimeout(deepTimer)
		}
	}, [])

	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			if (reducedMotion) return
			pointerX.set((event.clientX / window.innerWidth - 0.5) * 16)
			pointerY.set((event.clientY / window.innerHeight - 0.5) * 16)
		}
		window.addEventListener('pointermove', onPointerMove, { passive: true })
		return () => window.removeEventListener('pointermove', onPointerMove)
	}, [pointerX, pointerY, reducedMotion])

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault()
				setSearchOpen(true)
			}
			if (event.key === 'Escape') {
				setSearchOpen(false)
				setActivePanel(null)
				setAppSwitcherOpen(false)
			}
		}
		const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
		window.addEventListener('keydown', onKeyDown)
		document.addEventListener('fullscreenchange', onFullscreen)
		return () => {
			window.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('fullscreenchange', onFullscreen)
		}
	}, [])

	useEffect(() => {
		if (!searchOpen) return
		const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus())
		return () => window.cancelAnimationFrame(frame)
	}, [searchOpen])

	const shanghaiClock = getShanghaiClockParts(now)
	const yumiItems = useMemo(() => notifications.filter(item => item.source === 'yumi'), [notifications])
	const incompleteTasks = useMemo(() => tasks.filter(task => !task.completed), [tasks])
	const upcomingEvents = useMemo(() => events.filter(event => `${event.date} ${event.time}` >= `${localDateKey(now)} ${shanghaiClock.hour}:${shanghaiClock.minute}`), [events, now, shanghaiClock.hour, shanghaiClock.minute])
	const currentItem = focusRunning
		? { label: '正在专注', title: formatFocusDuration(focusRemaining), detail: `${focusMinutes} 分钟节奏`, panel: 'focus' as PanelId }
		: incompleteTasks[0]
			? { label: '接下来', title: incompleteTasks[0].title, detail: `${incompleteTasks.length} 项待完成`, panel: 'tasks' as PanelId }
			: upcomingEvents[0]
				? { label: '下一项日程', title: upcomingEvents[0].title, detail: `${upcomingEvents[0].date} · ${upcomingEvents[0].time}`, panel: 'calendar' as PanelId }
				: { label: 'Now', title: '此刻没有安排', detail: '留白也是计划的一部分', panel: 'tasks' as PanelId }

	const searchItems = useMemo<WorkbenchSearchItem[]>(
		() => [
			...incompleteTasks.map(task => ({ id: `task:${task.id}`, kind: 'task' as const, title: task.title, subtitle: '任务' })),
			...events.map(event => ({ id: `event:${event.id}`, kind: 'event' as const, title: event.title, subtitle: `${event.date} · ${event.time}` })),
			...bookmarks.map(item => ({ id: `bookmark:${item.id}`, kind: 'bookmark' as const, title: item.name, subtitle: '书签', href: item.url })),
			...repositories.map(item => ({ id: `repository:${item.id}`, kind: 'repository' as const, title: item.full_name, subtitle: 'GitHub', href: item.html_url }))
		],
		[bookmarks, events, incompleteTasks, repositories]
	)
	const searchResults = useMemo(() => filterWorkbenchItems(searchQuery, searchItems), [searchItems, searchQuery])

	const togglePanel = (panel: PanelId) => {
		setSearchOpen(false)
		setActivePanel(current => (current === panel ? null : panel))
	}

	const recordBookmarkClick = (id: number) => {
		setBookmarks(current => sortCommonBookmarks(current.map(item => item.id === id
			? { ...item, clickCount: item.clickCount + 1, lastClickedAt: new Date().toISOString() }
			: item)))
		void fetch(`/api/navigation/admin/links/${id}/click`, {
			method: 'POST',
			credentials: 'same-origin',
			keepalive: true
		}).catch(() => undefined)
	}

	const markNotificationRead = (item: NotificationItem) => {
		if (item.read) return
		setNotifications(current => current.map(entry => entry.key === item.key ? { ...entry, read: true } : entry))
		setNotificationUnreadCount(current => Math.max(0, current - 1))
		void fetch(`/api/admin/notifications/${encodeURIComponent(item.key)}/read`, {
			method: 'PUT',
			credentials: 'same-origin',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ read: true })
		}).then(response => {
			if (!response.ok) throw new Error('Notification update failed')
			window.dispatchEvent(new CustomEvent('nono:notifications-changed', { detail: 'nodesk' }))
		}).catch(() => void loadNotifications(false))
	}

	const addTask = (event: FormEvent) => {
		event.preventDefault()
		const title = taskTitle.trim()
		if (!title) return
		setTasks(current => [{ id: uniqueId('task'), title, completed: false, createdAt: new Date().toISOString() }, ...current])
		setTaskTitle('')
	}

	const addEvent = (event: FormEvent) => {
		event.preventDefault()
		const title = eventTitle.trim()
		if (!title || !eventDate || !eventTime) return
		setEvents(current => normalizeEvents([...current, { id: uniqueId('event'), title, date: eventDate, time: eventTime }]))
		setEventTitle('')
	}

	const chooseFocusPreset = (minutes: number) => {
		setFocusRunning(false)
		setFocusMinutes(minutes)
		setFocusRemaining(minutes * 60)
	}

	const toggleDim = () => {
		setDimmed(current => {
			localStorage.setItem(DIM_STORAGE_KEY, String(!current))
			return !current
		})
	}

	const toggleFullscreen = async () => {
		if (document.fullscreenElement) await document.exitFullscreen()
		else await document.documentElement.requestFullscreen()
	}

	const activateSearchResult = (item: WorkbenchSearchItem) => {
		setSearchOpen(false)
		setSearchQuery('')
		if (item.href) {
			if (item.kind === 'bookmark') recordBookmarkClick(Number(item.id.slice('bookmark:'.length)))
			window.open(item.href, '_blank', 'noopener,noreferrer')
			return
		}
		setActivePanel(item.kind === 'event' ? 'calendar' : 'tasks')
	}

	const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter' && searchResults[0]) activateSearchResult(searchResults[0])
	}

	return (
		<section
			className='ambient-workbench'
			data-idle={idleDepth}
			data-dimmed={dimmed ? 'true' : 'false'}
			data-panel={activePanel ? 'open' : 'closed'}
			style={{ '--ambient-wallpaper-url': `url("/api/navigation/admin/background"), url("${BASE_PATH}/images/nodesk-ambient-wallpaper.png")` } as React.CSSProperties}>
			<motion.div className='ambient-wallpaper-parallax' style={{ x: wallpaperX, y: wallpaperY }} aria-hidden='true'>
				<div className='ambient-wallpaper' />
			</motion.div>
			<div className='ambient-contrast-scrim' aria-hidden='true' />

			<header className='ambient-topbar ambient-wakeable'>
				<div className='ambient-brand' aria-label='Nodesk 系统状态正常'>
					<span className='ambient-brand-mark'><CloudSun size={21} strokeWidth={1.8} /></span>
					<strong>Nodesk</strong>
					<span className='ambient-status-dot' aria-hidden='true' />
					<span className='ambient-status-copy'>就绪</span>
				</div>


				<div className='ambient-top-center'>
					{workbenchNavigation.quickEntriesVisible && <div
						className={`ambient-app-switcher${appSwitcherOpen ? ' is-open' : ''}`}
						onMouseEnter={() => setAppSwitcherOpen(true)}
						onMouseLeave={() => setAppSwitcherOpen(false)}
						onFocus={() => setAppSwitcherOpen(true)}
						onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAppSwitcherOpen(false) }}>
						<button type='button' className='ambient-app-switcher-trigger' aria-label='应用切换器' aria-expanded={appSwitcherOpen}>
							<AppWindow size={17} /><span>应用</span>
						</button>
						<div className='ambient-app-switcher-menu' role='navigation' aria-label='应用快捷入口'>
							{workbenchNavigation.entries.map(entry => <a key={entry.id} href={entry.url} target={entry.openInNewTab ? '_blank' : undefined} rel={entry.openInNewTab ? 'noreferrer' : undefined}>
								<span><AppEntryIcon entry={entry} /></span><strong>{entry.label}</strong><ArrowUpRight size={15} />
							</a>)}
						</div>
					</div>}

					<button type='button' className='ambient-command-trigger' onClick={() => setSearchOpen(true)} aria-label='打开快速搜索'>
						<Search size={17} strokeWidth={1.8} />
						<span>快速搜索与执行...</span>
						<kbd>⌘ K</kbd>
					</button>
				</div>

				<div className='ambient-top-actions'>
					<span className='ambient-compact-date' suppressHydrationWarning>{new Intl.DateTimeFormat('zh-CN', { timeZone: SHANGHAI_TIME_ZONE, month: 'long', day: 'numeric', weekday: 'short' }).format(now)}</span>
					<button type='button' className='ambient-icon-button' onClick={toggleDim} title={dimmed ? '调亮画面' : '柔和画面'} aria-label={dimmed ? '调亮画面' : '柔和画面'}>
						{dimmed ? <SunMedium size={20} /> : <Moon size={20} />}
					</button>
					<button type='button' className='ambient-icon-button' onClick={() => void toggleFullscreen()} title={isFullscreen ? '退出全屏' : '进入全屏'} aria-label={isFullscreen ? '退出全屏' : '进入全屏'}>
						{isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
					</button>
				</div>
			</header>

			<main className='ambient-center-stage'>
				<motion.div className='ambient-clock-stack' initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
					<div className='ambient-time-zone'><span aria-hidden='true' />上海时间 · UTC+8</div>
					<time className='ambient-time' suppressHydrationWarning dateTime={`${shanghaiClock.hour}:${shanghaiClock.minute}:${shanghaiClock.second}`} aria-label={`上海时间 ${shanghaiClock.hour} 时 ${shanghaiClock.minute} 分 ${shanghaiClock.second} 秒`}>
						<FlipClockUnit value={shanghaiClock.hour} reducedMotion={reducedMotion} />
						<i aria-hidden='true'>:</i>
						<FlipClockUnit value={shanghaiClock.minute} reducedMotion={reducedMotion} />
						<i aria-hidden='true'>:</i>
						<FlipClockUnit value={shanghaiClock.second} reducedMotion={reducedMotion} />
					</time>
					<p className='ambient-date' suppressHydrationWarning>{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now)}</p>
					<p className='ambient-greeting' suppressHydrationWarning>{greetingForHour(shanghaiClock.hourNumber)}</p>

					<button type='button' className='ambient-now' onClick={() => togglePanel(currentItem.panel)} aria-label={`${currentItem.label}：${currentItem.title}`}>
						<span className='ambient-now-label'>{currentItem.label}</span>
						<strong>{currentItem.title}</strong>
						<span className='ambient-now-detail'>
							<span className='ambient-now-indicator'>{focusRunning ? <Timer size={16} /> : <Circle size={12} fill='currentColor' />}</span>
							{currentItem.detail}
							<ArrowUpRight size={16} />
						</span>
					</button>
				</motion.div>
			</main>

			<AnimatePresence>
				{activePanel && (
					<motion.section
						key={activePanel}
						ref={panelRef}
						className='ambient-panel ambient-wakeable'
						initial={reducedMotion ? { x: '-50%' } : { opacity: 0, x: '-50%', y: 18, scale: 0.98 }}
						animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
						exit={{ opacity: 0, x: '-50%', y: 12, scale: 0.985 }}
						transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
						aria-label={`${panelTitle(activePanel)}面板`}>
						<div className='ambient-panel-heading'>
							<h2>{panelTitle(activePanel)}</h2>
							<div className='ambient-panel-tools'>
								{activeDockItem?.shortcutHref && activeDockItem.shortcutLabel && (
									<a className='ambient-small-icon' href={activeDockItem.shortcutHref} title={activeDockItem.shortcutLabel} aria-label={activeDockItem.shortcutLabel}>
										<ArrowUpRight size={17} />
									</a>
								)}
								{(['bookmarks', 'github', 'yumi', 'notifications'] as PanelId[]).includes(activePanel) && (
									<button type='button' className='ambient-small-icon' onClick={() => void loadIntegrations()} title='刷新数据' aria-label='刷新数据'>
										<RefreshCw size={16} />
									</button>
								)}
							</div>
						</div>

						<div className='ambient-panel-body'>
							{activePanel === 'bookmarks' && <IntegrationList state={integrationState.bookmarks} empty='还没有可显示的书签。' unavailable='登录 Nono 后即可在这里查看书签。'>
								{bookmarks.slice(0, 7).map(item => <ExternalRow key={item.id} title={item.name} subtitle={item.clickCount ? `${item.clickCount} 次打开 · ${item.description || new URL(item.url).hostname}` : item.description || new URL(item.url).hostname} href={item.url} icon={<Bookmark size={17} />} onActivate={() => recordBookmarkClick(item.id)} />)}
							</IntegrationList>}

							{activePanel === 'github' && <IntegrationList state={integrationState.github} empty='NoStar 中还没有仓库。' unavailable='登录 Nono 后即可读取 NoStar 仓库。'>
								{repositories.slice(0, 7).map(item => <ExternalRow key={item.id} title={item.full_name} subtitle={[item.language, `${item.stargazers_count || 0} stars`].filter(Boolean).join(' · ')} href={item.html_url} icon={<Github size={17} />} />)}
							</IntegrationList>}

							{activePanel === 'yumi' && <IntegrationList state={integrationState.yumi} empty='Yumi 当前一切正常。' unavailable='登录 Nono 后即可读取 Yumi 状态。'>
								{yumiItems.slice(0, 7).map(item => <ExternalRow key={item.key} title={item.title} subtitle={item.description} href={item.href} icon={<span className={`ambient-severity ambient-severity-${item.severity}`}><Circle size={11} fill='currentColor' /></span>} />)}
								<a className='ambient-panel-link' href='/yumi'>打开 Yumi <ArrowUpRight size={15} /></a>
							</IntegrationList>}

							{activePanel === 'notifications' && <IntegrationList state={integrationState.notifications} empty='现在没有通知。' unavailable='登录 Nono 后即可同步主页通知。'>
								{notifications.slice(0, 7).map(item => <ExternalRow
									key={item.key}
									title={item.title}
									subtitle={`${NOTIFICATION_SOURCE_LABELS[item.source]} · ${item.description}`}
									href={item.href}
									unread={!item.read}
									onActivate={() => markNotificationRead(item)}
									icon={<span className={`ambient-severity ambient-severity-${item.severity}`}><Bell size={16} /></span>}
								/>)}
							</IntegrationList>}

							{activePanel === 'tasks' && (
								<div className='ambient-local-tool'>
									<form className='ambient-add-row' onSubmit={addTask}>
										<input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder='添加一件要做的事' maxLength={180} aria-label='任务标题' />
										<button type='submit' className='ambient-add-button' aria-label='添加任务'><Plus size={18} /></button>
									</form>
									<div className='ambient-list'>
										{tasks.length ? tasks.map(task => (
											<div className={`ambient-task-row ${task.completed ? 'is-complete' : ''}`} key={task.id}>
												<button type='button' className='ambient-check' onClick={() => setTasks(current => toggleTask(current, task.id))} aria-label={task.completed ? `恢复任务 ${task.title}` : `完成任务 ${task.title}`}>{task.completed ? <Check size={15} /> : null}</button>
												<span>{task.title}</span>
												<button type='button' className='ambient-row-action' onClick={() => setTasks(current => current.filter(item => item.id !== task.id))} aria-label={`删除任务 ${task.title}`}><Trash2 size={15} /></button>
											</div>
										)) : <EmptyState copy='今天还没有任务。' />}
									</div>
								</div>
							)}

							{activePanel === 'calendar' && (
								<div className='ambient-local-tool'>
									<form className='ambient-event-form' onSubmit={addEvent}>
										<input className='ambient-event-title' value={eventTitle} onChange={event => setEventTitle(event.target.value)} placeholder='添加日程' maxLength={180} aria-label='日程标题' />
										<input type='date' value={eventDate} onChange={event => setEventDate(event.target.value)} aria-label='日程日期' />
										<input type='time' value={eventTime} onChange={event => setEventTime(event.target.value)} aria-label='日程时间' />
										<button type='submit' className='ambient-add-button' aria-label='添加日程'><Plus size={18} /></button>
									</form>
									<div className='ambient-list'>
										{events.length ? events.map(item => (
											<div className='ambient-event-row' key={item.id}>
												<CalendarDays size={17} />
												<div><strong>{item.title}</strong><span>{item.date} · {item.time}</span></div>
												<button type='button' className='ambient-row-action' onClick={() => setEvents(current => current.filter(event => event.id !== item.id))} aria-label={`删除日程 ${item.title}`}><Trash2 size={15} /></button>
											</div>
										)) : <EmptyState copy='日历仍是一片留白。' />}
									</div>
								</div>
							)}

							{activePanel === 'focus' && (
								<div className='ambient-focus-tool'>
									<div className='ambient-focus-time'>{formatFocusDuration(focusRemaining)}</div>
									<div className='ambient-focus-presets' aria-label='专注时长'>
										{FOCUS_PRESETS.map(minutes => <button type='button' key={minutes} className={focusMinutes === minutes ? 'is-active' : ''} onClick={() => chooseFocusPreset(minutes)}>{minutes} 分钟</button>)}
									</div>
									<div className='ambient-focus-actions'>
										<button type='button' className='ambient-focus-primary' onClick={() => {
											if (focusRunning) {
												setFocusRunning(false)
												return
											}
											setFocusRemaining(current => nextFocusDuration(current, focusMinutes))
											setFocusRunning(true)
										}}>{focusRunning ? <Pause size={19} /> : <Play size={19} fill='currentColor' />}<span>{focusRunning ? '暂停' : focusRemaining === 0 ? '重新开始' : '开始'}</span></button>
										<button type='button' className='ambient-focus-reset' onClick={() => { setFocusRunning(false); setFocusRemaining(focusMinutes * 60) }} title='重置计时' aria-label='重置计时'><RotateCcw size={18} /></button>
									</div>
								</div>
							)}
						</div>
					</motion.section>
				)}
			</AnimatePresence>

			<div ref={dockRef} className='ambient-dock-wrap ambient-wakeable'>
				<nav className='ambient-dock' aria-label='工作台工具'>
					{DOCK_ITEMS.map(item => {
						const Icon = item.icon
						const isActive = item.id === 'settings' ? settingsOpen : activePanel === item.id
						return <button type='button' key={item.id} className={isActive ? 'is-active' : ''} onClick={() => {
							if (item.id === 'settings') {
								setActivePanel(null)
								setSettingsOpen(true)
								return
							}
							togglePanel(item.id)
						}} aria-pressed={isActive} aria-label={item.id === 'notifications' && notificationUnreadCount ? `${item.label}，${notificationUnreadCount} 条未读` : item.label}>
							<span className='ambient-dock-icon'><Icon size={26} strokeWidth={1.75} />{item.id === 'notifications' && notificationUnreadCount > 0 ? <b className='ambient-dock-badge'>{notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}</b> : null}</span>
							<span>{item.label}</span>
						</button>
					})}
				</nav>
				<div className='ambient-dock-status' aria-live='polite'>
					<span className='ambient-status-dot' aria-hidden='true' />
					<span>{focusRunning ? `专注 ${formatFocusDuration(focusRemaining)}` : `${incompleteTasks.length} 项任务 · ${upcomingEvents.length} 项日程`}</span>
				</div>
			</div>

			<AmbientSettingsCenter
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				quickEntriesVisible={workbenchNavigation.quickEntriesVisible}
				onQuickEntriesVisibleChange={saveQuickEntriesVisibility}
			/>

			<AnimatePresence>
				{searchOpen && (
					<motion.div className='ambient-search-backdrop' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
						<motion.div className='ambient-search-dialog' role='dialog' aria-modal='true' aria-label='快速搜索' initial={reducedMotion ? false : { opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.985 }}>
							<div className='ambient-search-input-row'>
								<Search size={20} />
								<input ref={searchInputRef} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder='搜索任务、日程、书签与仓库' aria-label='搜索内容' />
								<button type='button' onClick={() => setSearchOpen(false)} aria-label='关闭搜索'><X size={18} /></button>
							</div>
							<div className='ambient-search-results'>
								{searchResults.length ? searchResults.map(item => <button type='button' key={item.id} onClick={() => activateSearchResult(item)}><span><strong>{item.title}</strong><small>{item.subtitle}</small></span>{item.href ? <ExternalLink size={16} /> : <ArrowUpRight size={16} />}</button>) : <EmptyState copy={searchQuery ? '没有找到匹配内容。' : '输入关键词开始搜索。'} />}
							</div>
							<div className='ambient-search-footer'><span>Enter 打开首项</span><span>Esc 关闭</span></div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	)
}

function FlipClockUnit({ value, reducedMotion }: { value: string; reducedMotion: boolean | null }) {
	return <span className='ambient-time-unit' aria-hidden='true'>
		{value.split('').map((digit, index) => (
			<span className='ambient-flip-digit' key={index}>
				<AnimatePresence initial={false}>
					<motion.span
						key={digit}
						className='ambient-flip-digit-value'
						suppressHydrationWarning
						initial={reducedMotion ? false : { opacity: 0, rotateX: -82, y: '-18%' }}
						animate={{ opacity: 1, rotateX: 0, y: '0%' }}
						exit={reducedMotion ? { opacity: 0 } : { opacity: 0, rotateX: 82, y: '18%' }}
						transition={{ duration: reducedMotion ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}>
						{digit}
					</motion.span>
				</AnimatePresence>
			</span>
		))}
	</span>
}

function IntegrationList({ state, empty, unavailable, children }: { state: LoadState; empty: string; unavailable: string; children: React.ReactNode }) {
	if (state === 'loading') return <div className='ambient-loading' aria-label='正在载入'><i /><i /><i /></div>
	if (state === 'unavailable') return <EmptyState copy={unavailable} />
	return <div className='ambient-integration-list'>{Children.count(children) ? children : <EmptyState copy={empty} />}</div>
}

function ExternalRow({ title, subtitle, href, icon, unread = false, onActivate }: { title: string; subtitle: string; href: string; icon: React.ReactNode; unread?: boolean; onActivate?: () => void }) {
	return <a className={`ambient-external-row${unread ? ' is-unread' : ''}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined} onClick={onActivate}>
		<span className='ambient-row-icon'>{icon}</span>
		<span><strong>{title}</strong><small>{subtitle}</small></span>
		<ArrowUpRight size={16} />
	</a>
}

function EmptyState({ copy }: { copy: string }) {
	return <div className='ambient-empty'><Circle size={15} /><span>{copy}</span></div>
}
