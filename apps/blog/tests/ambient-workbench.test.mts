import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
	filterWorkbenchItems,
	formatFocusDuration,
	getShanghaiClockParts,
	nextFocusDuration,
	normalizeClipSearchResults,
	normalizeEvents,
	normalizeTasks,
	selectUpcomingItems,
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

test('selects a compact mix of incomplete tasks and upcoming schedules', () => {
	const items = selectUpcomingItems([
		{ id: 'task-one', title: 'Prepare report', completed: false, createdAt: '2026-08-12T08:00:00.000Z' },
		{ id: 'task-done', title: 'Already done', completed: true, createdAt: '2026-08-12T09:00:00.000Z' },
		{ id: 'task-two', title: 'Review notes', completed: false, createdAt: '2026-08-12T10:00:00.000Z' }
	], [
		{ id: 'event-one', title: 'Stand-up', date: '2026-08-15', time: '09:00' },
		{ id: 'event-two', title: 'Planning', date: '2026-08-16', time: '10:30' }
	], 3)

	assert.deepEqual(items.map(item => `${item.kind}:${item.id}`), [
		'task:task-one',
		'event:event-one',
		'task:task-two'
	])
})

test('filters workbench search results across tasks, bookmarks, repositories, and clip tags', () => {
	const results = filterWorkbenchItems('node', [
		{ id: 'task:1', kind: 'task', title: 'Finish Nodesk', subtitle: 'Task' },
		{ id: 'bookmark:1', kind: 'bookmark', title: 'React docs', subtitle: 'Bookmark', href: 'https://react.dev' },
		{ id: 'repo:1', kind: 'repository', title: 'nodejs/node', subtitle: 'GitHub', href: 'https://github.com/nodejs/node' },
		{ id: 'clip:1', kind: 'clip', title: 'AI reading notes', subtitle: '剪藏 · node · research', href: '/clipper/?clip=1' }
	])

	assert.deepEqual(results.map(result => result.id), ['task:1', 'repo:1', 'clip:1'])
})

test('normalizes Clipper search rows into safe deep-linked workbench results', () => {
	assert.deepEqual(normalizeClipSearchResults({ items: [
		{ id: 8, title: 'AI reading', domain: 'example.com', tags: ['Research', 'AI'] },
		{ id: 'bad', title: 'Ignored' },
		{ id: 9, title: '', tags: [] }
	] }), [{
		id: 'clip:8',
		kind: 'clip',
		title: 'AI reading',
		subtitle: '剪藏 · example.com · Research, AI',
		href: '/clipper/?clip=8'
	}])
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
		navigationEntriesVersion: 4,
		nodeskWorkbench: { quickEntriesVisible: false },
		navigationEntries: [
			{ id: 'nomoney', label: '资产', url: '/nomoney', icon: 'wallet-cards', enabled: true, openInNewTab: false },
			{ id: 'unsafe', label: '危险地址', url: 'javascript:alert(1)', enabled: true },
			{ id: 'hidden', label: '隐藏入口', url: '/hidden', enabled: false }
		]
	}), {
		quickEntriesVisible: false,
		entries: [
			{ id: 'nomoney', label: '资产', url: '/nomoney', icon: 'wallet-cards', openInNewTab: false }
		]
	})

	assert.deepEqual(normalizeWorkbenchNavigation({
		navigationEntriesVersion: 4,
		navigationEntries: []
	}).entries, [])

	assert.deepEqual(normalizeWorkbenchNavigation({
		navigationEntriesVersion: 3,
		navigationEntries: [
			{ id: 'nomoney', label: 'NoMoney', url: '/nomoney', icon: 'wallet-cards', enabled: true },
			{ id: 'nostar', label: 'NoStar', url: '/nostar', icon: 'star', enabled: true }
		]
	}).entries.map(entry => entry.id), ['home', 'nomoney', 'nostar', 'yumi', 'clipper'])

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
	assert.match(workbench, /id: 'clipper', label: '剪藏', icon: Scissors, href: '\/clipper\/'/)
	assert.match(workbench, /<a[^>]+href=\{item\.href\}/)
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
	assert.doesNotMatch(layout, /LanguageControl|ColorModeControl/)
})

test('keeps private NoDesk data and controls behind the live Nono admin session', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')

	assert.match(workbench, /useAuthStore/)
	assert.match(workbench, /const privateWorkbenchVisible = initialized && isAuth/)
	assert.match(workbench, /if \(!privateWorkbenchVisible\) \{[\s\S]*setTasks\(\[\]\)[\s\S]*setEvents\(\[\]\)[\s\S]*setNotifications\(\[\]\)[\s\S]*return/)
	assert.match(workbench, /privateWorkbenchVisible && <div className='ambient-top-center'/)
	assert.match(workbench, /privateWorkbenchVisible && \(focusRunning \?/)
	assert.match(workbench, /privateWorkbenchVisible && activePanel &&/)
	assert.match(workbench, /privateWorkbenchVisible && <div className='ambient-side-stack/)
	assert.match(workbench, /workbenchNavigation\.quickEntriesVisible && <aside/)
	assert.match(workbench, /privateWorkbenchVisible && <div ref=\{dockRef\} className='ambient-dock-wrap/)
	assert.match(workbench, /open=\{privateWorkbenchVisible && settingsOpen\}/)
	assert.match(workbench, /privateWorkbenchVisible && searchOpen &&/)
})

test('waits for the live session check before revealing the complete workbench interface', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /data-session=\{initialized \? 'ready' : 'loading'\}/)
	assert.match(styles, /\.ambient-workbench\[data-session='loading'\][\s\S]*\.ambient-topbar[\s\S]*\.ambient-center-stage/)
})

test('loads Clipper title and tag matches into NoDesk quick search', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const model = await read('src/app/(home)/ambient-workbench-model.ts')

	assert.match(workbench, /\/api\/clipper\/search\?q=/)
	assert.match(workbench, /normalizeClipSearchResults/)
	assert.match(model, /kind:\s*'clip'/)
	assert.match(model, /\/clipper\/\?clip=/)
	assert.match(workbench, /搜索任务、日程、书签、仓库与剪藏/)
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
	assert.match(workbench, /ambient-notification-rail/)
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
	assert.match(workbench, /href='\/admin\/notifications'/)
	assert.match(workbench, /href=\{activeDockItem\.shortcutHref\}/)
	assert.doesNotMatch(workbench, /返回 Nono 主页/)
	assert.doesNotMatch(workbench, /DOCK_ITEMS\.find\(item => item\.id === activePanel\)\?\.detail/)
	assert.doesNotMatch(workbench, /aria-label='关闭面板'/)
	assert.match(styles, /minmax\(320px, 520px\)/)
	assert.match(styles, /\.ambient-command-trigger \{[\s\S]*margin-top: 56px/)
})

test('places a hover-expanded application rail below the notification rail', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')
	const backupCenter = await read('src/app/(home)/ambient-backup-center.tsx')
	const styles = await read('src/styles/ambient-workbench.css')
	const source = `${workbench}\n${settings}\n${backupCenter}`

	assert.match(source, /className='ambient-side-stack ambient-wakeable'/)
	assert.match(source, /ambient-notification-rail[\s\S]*ambient-app-rail/)
	assert.match(source, /onMouseEnter=.*setAppSwitcherOpen\(true\)/)
	assert.match(source, /aria-label='应用'/)
	assert.match(source, /id: 'settings'[\s\S]*icon: Settings/)
	assert.match(source, /桌面/)
	assert.match(source, /备份与恢复/)
	assert.match(source, /quickEntriesVisible/)
	assert.match(source, /\/api\/admin\/backup-center\/webdav\/backups/)
	assert.match(source, /\/api\/admin\/backup-center\/webdav\/restore/)
	assert.match(source, /\/api\/admin\/backup-center\/local/)
	assert.match(styles, /\.ambient-side-stack\s*\{[^}]*right: max\(28px, env\(safe-area-inset-right\)\)/)
	assert.match(styles, /\.ambient-app-rail\s*\{[^}]*width: min\(300px, calc\(100vw - 56px\)\)/)
	assert.doesNotMatch(styles, /\.ambient-app-switcher\s*\{[^}]*bottom:/)
	assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.ambient-side-stack\s*\{[^}]*right: max\(16px, env\(safe-area-inset-right\)\)/)
	assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.ambient-command-trigger\s*\{[^}]*left: max\(16px, env\(safe-area-inset-left\)\);[^}]*right: max\(68px, calc\(env\(safe-area-inset-right\) \+ 68px\)\)/)
	assert.match(styles, /\.ambient-command-trigger \{[\s\S]*margin-top: 56px/)
	assert.match(styles, /\.ambient-settings-dialog/)
	assert.match(settings, /event\.key !== 'Tab'/)
	assert.match(settings, /previouslyFocused\?\.focus\(\)/)
})

test('auto-collapses notifications and expands the rail only on hover or keyboard focus', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /notificationRailExpanded[\s\S]*useState\(false\)/)
	assert.match(workbench, /ambient-notification-rail/)
	assert.match(workbench, /onMouseEnter=\{\(\) => setNotificationRailExpanded\(true\)\}/)
	assert.match(workbench, /onMouseLeave=\{\(\) => setNotificationRailExpanded\(false\)\}/)
	assert.doesNotMatch(workbench, /aria-label=\{notificationRailCollapsed \? '展开通知' : '折叠通知'\}/)
	assert.match(workbench, /href='\/admin\/notifications'/)
	assert.doesNotMatch(workbench, /\{ id: 'notifications', label: '通知', icon: Bell/)
	assert.doesNotMatch(workbench, /activePanel === 'notifications'/)
	assert.match(styles, /\.ambient-side-stack[\s\S]*right: max\(28px, env\(safe-area-inset-right\)\)/)
	assert.match(styles, /\.ambient-notification-rail\.is-collapsed\s*\{[^}]*grid-template-rows: 44px;[^}]*max-height: 44px;[^}]*width: min\(300px, calc\(100vw - 56px\)\)/)
	assert.doesNotMatch(styles, /\.ambient-notification-rail\.is-collapsed\s*\{[^}]*width: 44px/)
	assert.doesNotMatch(styles, /\.ambient-notification-rail\.is-collapsed \.ambient-notification-heading > span\s*\{[^}]*display: none/)
	assert.match(workbench, /notificationRailExpanded \? <ChevronUp size=\{18\} \/> : <ChevronDown size=\{18\} \/>/)
	assert.match(workbench, /data-notifications=\{privateWorkbenchVisible \? \(notificationRailExpanded \? 'expanded' : 'collapsed'\) : 'hidden'\}/)
	assert.match(styles, /data-notifications='expanded'[\s\S]*\.ambient-center-stage/)
	assert.match(styles, /\.ambient-command-trigger[\s\S]*right: max\(68px/)
})

test('uses calmer backup page groupings instead of one dense control grid', async () => {
	const backupCenter = await read('src/app/(home)/ambient-backup-center.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(backupCenter, /ambient-backup-page-header/)
	assert.match(backupCenter, /ambient-backup-policy-block/)
	assert.match(backupCenter, /ambient-backup-policy-grid/)
	assert.match(backupCenter, /ambient-backup-module-list/)
	assert.match(styles, /\.ambient-backup-center\s*\{[^}]*gap: 20px/)
	assert.match(styles, /\.ambient-backup-policy-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
})

test('downloads local backups through an error-aware client action', async () => {
	const backupCenter = await read('src/app/(home)/ambient-backup-center.tsx')

	assert.match(backupCenter, /const downloadLocalBackup = \(module: BackupModule \| 'all'\)/)
	assert.match(backupCenter, /response\.blob\(\)/)
	assert.doesNotMatch(backupCenter, /href='\/api\/admin\/backup-center\/local\/all'/)
})

test('uses restrained corner radii for the upcoming card, notification rail, and dock', async () => {
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(styles, /\.ambient-now\s*\{[^}]*border-radius: 14px/)
	assert.match(styles, /\.ambient-notification-rail\s*\{[^}]*border-radius: 14px/)
	assert.match(styles, /\.ambient-dock\s*\{[^}]*border-radius: 14px/)
	assert.doesNotMatch(styles, /@media \(max-width: 640px\)[\s\S]*\.ambient-now\s*\{[^}]*border-radius: (?:20|24)px/)
	assert.doesNotMatch(styles, /@media \(max-width: 640px\)[\s\S]*\.ambient-dock\s*\{[^}]*border-radius: (?:22|28)px/)
})

test('lets administrators edit server-backed quick applications from NoDesk settings', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /navigationEntries: entries/)
	assert.match(workbench, /quickEntries=\{workbenchNavigation\.entries\}/)
	assert.match(settings, /应用名称/)
	assert.match(settings, /跳转链接/)
	assert.match(settings, /新标签页打开/)
	assert.match(settings, /添加快捷应用/)
	assert.match(settings, /删除快捷应用/)
	assert.match(settings, /onQuickEntriesChange/)
	assert.match(styles, /\.ambient-quick-app-list/)
	assert.match(styles, /\.ambient-now-list\s*\{[^}]*min-height:\s*0/)
})

test('keeps dock task and schedule panels separate while the home summary shows both', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const picker = await read('src/app/(home)/ambient-date-time-picker.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /selectUpcomingItems/)
	assert.match(workbench, /ambient-now-list/)
	assert.match(workbench, /activePanel === 'tasks' &&/)
	assert.match(workbench, /activePanel === 'calendar' &&/)
	assert.doesNotMatch(workbench, /activePanel === 'tasks' \|\| activePanel === 'calendar'/)
	assert.match(workbench, /AmbientDateTimePicker/)
	assert.doesNotMatch(workbench, /type='date'/)
	assert.doesNotMatch(workbench, /type='time'/)
	assert.match(picker, /ambient-date-time-popover/)
	assert.match(picker, /createPortal/)
	assert.match(picker, /上个月/)
	assert.match(picker, /选择小时/)
	assert.match(styles, /\.ambient-date-time-popover/)
	assert.match(styles, /\.ambient-date-time-popover \{[\s\S]*position: fixed/)
})
