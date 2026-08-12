import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
	filterWorkbenchItems,
	formatFocusDuration,
	nextFocusDuration,
	normalizeEvents,
	normalizeTasks,
	toggleTask
} from '../src/app/(home)/ambient-workbench-model.ts'

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

test('formats focus duration without exposing invalid or negative time', () => {
	assert.equal(formatFocusDuration(0), '00:00')
	assert.equal(formatFocusDuration(2_341), '39:01')
	assert.equal(formatFocusDuration(-20), '00:00')
})

test('restarts a completed focus session from the selected preset', () => {
	assert.equal(nextFocusDuration(0, 25), 1_500)
	assert.equal(nextFocusDuration(1_204, 25), 1_204)
})

test('replaces the legacy card canvas with an ambient dock-driven workbench', async () => {
	const page = await read('src/app/(home)/page.tsx')
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')
	const layout = await read('src/layout/index.tsx')

	assert.match(page, /AmbientWorkbench/)
	assert.doesNotMatch(page, /HiCard|ArtCard|CalendarCard|ScheduleSummaryCard|SnowfallBackground/)
	assert.match(workbench, /Bookmarks|GitHub|Yumi|Calendar|Tasks|Focus/)
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
