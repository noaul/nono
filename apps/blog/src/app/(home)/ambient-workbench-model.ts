export type WorkbenchTask = {
	id: string
	title: string
	completed: boolean
	createdAt: string
}

export type WorkbenchEvent = {
	id: string
	title: string
	date: string
	time: string
	note?: string
}

export type WorkbenchUpcomingItem =
	| { id: string; kind: 'task'; title: string; detail: string }
	| { id: string; kind: 'event'; title: string; detail: string }

export type WorkbenchSearchItem = {
	id: string
	kind: 'task' | 'bookmark' | 'repository' | 'event'
	title: string
	subtitle: string
	href?: string
}

export type WorkbenchBookmarkUsage = {
	id: number
	clickCount: number
	lastClickedAt?: string | null
	sortOrder?: number
}

export type ShanghaiClockParts = {
	year: string
	month: string
	day: string
	hour: string
	minute: string
	second: string
	hourNumber: number
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'
const SHANGHAI_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
	timeZone: SHANGHAI_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
})

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function cleanText(value: unknown, maximum = 180): string {
	return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

export function normalizeTasks(value: unknown): WorkbenchTask[] {
	if (!Array.isArray(value)) return []
	return value.flatMap(item => {
		const input = record(item)
		const id = cleanText(input?.id, 120)
		const title = cleanText(input?.title)
		const createdAt = cleanText(input?.createdAt, 64)
		if (!id || !title || !createdAt || Number.isNaN(Date.parse(createdAt))) return []
		return [{ id, title, completed: input?.completed === true, createdAt }]
	})
}

export function normalizeEvents(value: unknown): WorkbenchEvent[] {
	if (!Array.isArray(value)) return []
	return value
		.flatMap(item => {
			const input = record(item)
			const id = cleanText(input?.id, 120)
			const title = cleanText(input?.title)
			const date = cleanText(input?.date, 10)
			const time = cleanText(input?.time, 5)
			if (!id || !title || !DATE_PATTERN.test(date) || !TIME_PATTERN.test(time) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return []
			const note = cleanText(input?.note, 240)
			return [{ id, title, date, time, ...(note ? { note } : {}) }]
		})
		.sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`))
}

export function toggleTask(tasks: WorkbenchTask[], id: string): WorkbenchTask[] {
	return tasks.map(task => (task.id === id ? { ...task, completed: !task.completed } : task))
}

export function selectUpcomingItems(tasks: WorkbenchTask[], events: WorkbenchEvent[], limit = 3): WorkbenchUpcomingItem[] {
	const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3
	const pendingTasks = tasks.filter(task => !task.completed)
	const items: WorkbenchUpcomingItem[] = []
	let taskIndex = 0
	let eventIndex = 0

	while (items.length < maximum && (taskIndex < pendingTasks.length || eventIndex < events.length)) {
		const task = pendingTasks[taskIndex]
		if (task && items.length < maximum) {
			items.push({ id: task.id, kind: 'task', title: task.title, detail: '任务' })
			taskIndex += 1
		}

		const event = events[eventIndex]
		if (event && items.length < maximum) {
			items.push({ id: event.id, kind: 'event', title: event.title, detail: `${event.date} · ${event.time}` })
			eventIndex += 1
		}
	}

	return items
}

export function filterWorkbenchItems(query: string, items: WorkbenchSearchItem[], limit = 8): WorkbenchSearchItem[] {
	const normalized = query.trim().toLocaleLowerCase()
	if (!normalized) return items.slice(0, limit)
	return items.filter(item => `${item.title} ${item.subtitle}`.toLocaleLowerCase().includes(normalized)).slice(0, limit)
}

export function sortCommonBookmarks<T extends WorkbenchBookmarkUsage>(bookmarks: T[]): T[] {
	return [...bookmarks].sort((left, right) => {
		const clicks = right.clickCount - left.clickCount
		if (clicks) return clicks
		const leftClicked = left.lastClickedAt ? Date.parse(left.lastClickedAt) : 0
		const rightClicked = right.lastClickedAt ? Date.parse(right.lastClickedAt) : 0
		const recency = (Number.isNaN(rightClicked) ? 0 : rightClicked) - (Number.isNaN(leftClicked) ? 0 : leftClicked)
		if (recency) return recency
		return (right.sortOrder || 0) - (left.sortOrder || 0) || left.id - right.id
	})
}

export function getShanghaiClockParts(date = new Date()): ShanghaiClockParts {
	const values = Object.fromEntries(SHANGHAI_CLOCK_FORMATTER.formatToParts(date).map(part => [part.type, part.value]))
	const hour = values.hour || '00'
	return {
		year: values.year || '0000',
		month: values.month || '00',
		day: values.day || '00',
		hour,
		minute: values.minute || '00',
		second: values.second || '00',
		hourNumber: Number(hour) || 0
	}
}

export function shanghaiDateKey(date = new Date()): string {
	const { year, month, day } = getShanghaiClockParts(date)
	return `${year}-${month}-${day}`
}

export function formatFocusDuration(seconds: number): string {
	const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
	const minutes = Math.floor(safeSeconds / 60)
	const remainder = safeSeconds % 60
	return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function nextFocusDuration(remainingSeconds: number, presetMinutes: number): number {
	const safeRemaining = Number.isFinite(remainingSeconds) ? Math.max(0, Math.floor(remainingSeconds)) : 0
	if (safeRemaining > 0) return safeRemaining
	const safeMinutes = Number.isFinite(presetMinutes) ? Math.max(1, Math.floor(presetMinutes)) : 25
	return safeMinutes * 60
}
