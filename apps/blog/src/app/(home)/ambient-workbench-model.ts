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

export type WorkbenchSearchItem = {
	id: string
	kind: 'task' | 'bookmark' | 'repository' | 'event'
	title: string
	subtitle: string
	href?: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

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

export function filterWorkbenchItems(query: string, items: WorkbenchSearchItem[], limit = 8): WorkbenchSearchItem[] {
	const normalized = query.trim().toLocaleLowerCase()
	if (!normalized) return items.slice(0, limit)
	return items.filter(item => `${item.title} ${item.subtitle}`.toLocaleLowerCase().includes(normalized)).slice(0, limit)
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
