import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
	filterWorkbenchItems,
	formatFocusDuration,
	getShanghaiClockParts,
	nextFocusDuration,
	normalizeEvents,
	normalizeTasks,
	shanghaiDateKey,
	sortCommonBookmarks,
	toggleTask
} from '../src/app/(home)/ambient-workbench-model.ts'
import {
	DEFAULT_WORKBENCH_APP_ENTRIES,
	normalizeWorkbenchNavigation
} from '../src/app/(home)/ambient-workbench-settings.ts'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('normalizes persisted tasks without accepting malformed records', () => {
	const tasks = normalizeTasks([
		{ id: 'one', title: ' Read the paper ', completed: false, createdAt: '2026-08-12T08:00:00.000Z' },
		{ id: '', title: 'Missing id', completed: false },
		{ id: 'two', title: '', completed: false },
		null
	])

	assert.deepEqual(tasks, [
		{ id: 'one', title: 'Read the paper', completed: false, createdAt: '2026-08-12T08:00:00.000Z' }
	])
})

test('normalizes events and sorts them by date and time', () => {
	const events = normalizeEvents([
		{ id: 'later', title: 'Review', date: '2026-08-13', time: '09:30' },
		{ id: 'first', title: 'Stand-up', date: '2026-08-12', time: '08:30' },
		{ id: 'invalid', title: 'Bad date', date: 'tomorrow', time: '09:00' }
	])

	assert.deepEqual(events.map(event => event.id), ['first', 'later'])
})

test('toggles a task without mutating unrelated tasks', () => {
	const tasks = normalizeTasks([
		{ id: 'one', title: 'One', completed: false, createdAt: '2026-08-12T08:00:00.000Z' },
		{ id: 'two', title: 'Two', completed: false, createdAt: '2026-08-12T09:00:00.000Z' }
	])

	assert.deepEqual(toggleTask(tasks, 'one').map(task => task.completed), [true, false])
	assert.deepEqual(tasks.map(task => task.completed), [false, false])
})

test('filters workbench search results across tasks, bookmarks, and repositories', () => {
	const results = filterWorkbenchItems('node', [
		{ id: 'task:1', kind: 'task', title: 'Finish Nodesk', subtitle: 'Task' },
		{ id: 'bookmark:1', kind: 'bookmark', title: 'React docs', subtitle: 'Bookmark', href: 'https://react.dev' },
		{ id: 'repo:1', kind: 'repository', title: 'nodejs/node', subtitle: 'GitHub', href: 'https://github.com/nodejs/node' }
	])

	assert.deepEqual(results.map(result => result.id), ['task:1', 'repo:1'])
})

test('ranks common bookmarks by persisted usage and recent clicks', () => {
	const ranked = sortCommonBookmarks([
		{ id: 1, clickCount: 2, lastClickedAt: '2026-08-10T08:00:00.000Z', sortOrder: 100 },
		{ id: 2, clickCount: 8, lastClickedAt: '2026-08-09T08:00:00.000Z', sortOrder: 80 },
		{ id: 3, clickCount: 2, lastClickedAt: '2026-08-11T08:00:00.000Z', sortOrder: 60 }
	])

	assert.deepEqual(ranked.map(item => item.id), [2, 3, 1])
})

test('formats clock and date against Shanghai instead of the browser timezone', () => {
	const date = new Date('2026-08-12T16:30:00.000Z')
	assert.deepEqual(getShanghaiClockParts(date), {
		year: '2026',
		month: '08',
		day: '13',
		hour: '00',
		minute: '30',
		second: '00',
		hourNumber: 0
	})
	assert.equal(shanghaiDateKey(date), '2026-08-13')
})

test('formats focus duration without exposing invalid or negative time', () => {
	assert.equal(formatFocusDuration(0), '00:00')
	assert.equal(formatFocusDuration(2_341), '39:01')
	assert.equal(formatFocusDuration(-20), '00:00')
})

test('restarts a completed focus session from the selected preset', () => {
	assert.equal(nextFocusDuration(0, 25), 1_500)
	assert.equal(nextFocusDuration(1_204, 25), 1_204)
})

test('normalizes the server-backed NoDesk app switcher settings', () => {
	assert.deepEqual(normalizeWorkbenchNavigation({
		nodeskWorkbench: { quickEntriesVisible: false },
		navigationEntries: [
			{ id: 'nomoney', label: '资产', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
			{ id: 'unsafe', label: '危险地址', url: 'javascript:alert(1)', enabled: true },
			{ id: 'hidden', label: '隐藏入口', url: '/hidden', enabled: false }
		]
	}), {
		quickEntriesVisible: false,
		entries: [
			DEFAULT_WORKBENCH_APP_ENTRIES[0],
			{ id: 'nomoney', label: '资产', url: '/nomoney', icon: 'wallet-cards', openInNewTab: false }
		]
	})

	assert.deepEqual(normalizeWorkbenchNavigation(null), {
		quickEntriesVisible: true,
		entries: DEFAULT_WORKBENCH_APP_ENTRIES
	})
})

test('replaces the legacy card canvas with an ambient dock-driven workbench', async () => {
	const page = await read('src/app/(home)/page.tsx')
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')
	const layout = await read('src/layout/index.tsx')

	assert.match(page, /AmbientWorkbench/)
	assert.doesNotMatch(page, /HiCard|ArtCard|CalendarCard|ScheduleSummaryCard|SnowfallBackground/)
	assert.match(workbench, /书签|GitHub|Yumi|日程|任务|专注/)
	assert.match(workbench, /prefers-reduced-motion|useReducedMotion/)
	assert.match(workbench, /requestFullscreen/)
	assert.match(workbench, /localStorage/)
	assert.match(workbench, /NEXT_PUBLIC_BASE_PATH/)
	assert.match(styles, /ambient-workbench/)
	assert.match(styles, /overflow: clip/)
	assert.match(styles, /backdrop-filter/)
	assert.match(styles, /@media \(max-width: 640px\)/)
	assert.match(styles, /data-panel='open'/)
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
	assert.match(layout, /isAmbientHome/)
})

test('keeps browser-local time copy from causing hydration mismatches', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')

	assert.match(workbench, /className='ambient-compact-date' suppressHydrationWarning/)
	assert.match(workbench, /className='ambient-time' suppressHydrationWarning/)
	assert.match(workbench, /className='ambient-date' suppressHydrationWarning/)
	assert.match(workbench, /className='ambient-greeting' suppressHydrationWarning/)
})

test('syncs the ambient workbench with Shanghai time and Nono home data', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /timeZone: 'Asia\/Shanghai'/)
	assert.match(workbench, /上海时间/)
	assert.match(workbench, /\/api\/navigation\/admin\/background/)
	assert.match(workbench, /repositories\?limit=1000/)
	assert.match(workbench, /sources=nodesk%2Cnomoney%2Cyumi/)
	assert.match(workbench, /id: 'notifications'/)
	assert.match(workbench, /clickCount/)
	assert.match(styles, /ambient-time-zone/)
	assert.match(styles, /ambient-dock-badge/)
})

test('uses a seconds clock with flip motion and dismisses dock panels from outside', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /shanghaiClock\.second/)
	assert.match(workbench, /function FlipClockUnit/)
	assert.match(workbench, /window\.setInterval\(tick, 1_000\)/)
	assert.match(workbench, /document\.addEventListener\('pointerdown', closePanelFromOutside\)/)
	assert.match(workbench, /panelRef\.current\?\.contains\(target\)/)
	assert.match(workbench, /dockRef\.current\?\.contains\(target\)/)
	assert.match(workbench, /rotateX/)
	assert.match(styles, /\.ambient-time-unit/)
	assert.match(styles, /\.ambient-dock-status[\s\S]*top: calc\(100% \+ 8px\)/)
})

test('uses a wider lower search trigger and links integration panels to their products', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /shortcutHref: '\/admin\/links', shortcutLabel: '打开书签管理'/)
	assert.match(workbench, /shortcutHref: '\/nostar\/', shortcutLabel: '打开 NoStar'/)
	assert.match(workbench, /shortcutHref: '\/yumi', shortcutLabel: '打开 Yumi'/)
	assert.match(workbench, /shortcutHref: '\/admin\/notifications', shortcutLabel: '打开通知中心'/)
	assert.match(workbench, /href=\{activeDockItem\.shortcutHref\}/)
	assert.doesNotMatch(workbench, /返回 Nono 主页/)
	assert.doesNotMatch(workbench, /DOCK_ITEMS\.find\(item => item\.id === activePanel\)\?\.detail/)
	assert.doesNotMatch(workbench, /aria-label='关闭面板'/)
	assert.match(styles, /minmax\(320px, 520px\)/)
	assert.match(styles, /\.ambient-command-trigger \{[\s\S]*margin-top: 56px/)
})

test('adds a hover app switcher and a dock settings center with independent backups', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')
	const styles = await read('src/styles/ambient-workbench.css')
	const source = `${workbench}\n${settings}`

	assert.match(source, /className=\{`ambient-app-switcher/)
	assert.match(source, /onMouseEnter=.*setAppSwitcherOpen\(true\)/)
	assert.match(source, /aria-label='应用切换器'/)
	assert.match(source, /id: 'settings'[\s\S]*icon: Settings/)
	assert.match(source, /桌面/)
	assert.match(source, /备份与恢复/)
	assert.match(source, /quickEntriesVisible/)
	assert.match(source, /\/api\/admin\/backups/)
	assert.match(source, /\/api\/nostar\/sync\/export/)
	assert.match(source, /\/nomoney\/api\/export\/json/)
	assert.match(source, /\/yumi\/api\/export\/json/)
	assert.match(styles, /\.ambient-app-switcher[\s\S]*left: 50%/)
	assert.match(styles, /\.ambient-app-switcher:not\(:hover\):not\(:focus-within\)/)
	assert.match(styles, /\.ambient-command-trigger \{[\s\S]*margin-top: 56px/)
	assert.match(styles, /\.ambient-settings-dialog/)
	assert.match(settings, /event\.key !== 'Tab'/)
	assert.match(settings, /previouslyFocused\?\.focus\(\)/)
})
