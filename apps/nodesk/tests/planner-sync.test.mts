import assert from 'node:assert/strict'
import test from 'node:test'

import { hasLocalChanges, mergePlanner, plannerKey, readRemotePlanner, readSyncMeta } from '../src/app/(home)/planner-sync.ts'

const task = { id: 'task-1', title: 'Write the report', completed: false, createdAt: '2026-10-03T08:00:00.000Z' }
const other = { id: 'task-2', title: 'Water the plants', completed: false, createdAt: '2026-10-03T08:05:00.000Z' }
const event = { id: 'event-1', title: 'Stand-up', date: '2026-10-04', time: '09:30' }
const later = { id: 'event-2', title: 'Review', date: '2026-10-05', time: '15:00' }

test('reads the server copy and drops malformed items', () => {
	const remote = readRemotePlanner({ tasks: [task, { id: '', title: 'x' }], events: [event], updatedAt: '2026-10-03T09:00:00.000Z' })

	assert.deepEqual(remote, { tasks: [task], events: [event], updatedAt: '2026-10-03T09:00:00.000Z' })
	assert.equal(readRemotePlanner(null), null)
	assert.equal(readRemotePlanner({ tasks: [], events: [], updatedAt: 42 })?.updatedAt, null)
})

test('the sync key ignores key order and the timestamp', () => {
	assert.equal(plannerKey({ tasks: [task], events: [event] }), plannerKey({ events: [event], tasks: [task] }))
	assert.notEqual(plannerKey({ tasks: [task], events: [] }), plannerKey({ tasks: [{ ...task, completed: true }], events: [] }))
})

test('sync metadata belongs to one account', () => {
	const raw = JSON.stringify({ userId: '1', base: { tasks: [task], events: [] }, baseUpdatedAt: '2026-10-03T09:00:00.000Z' })

	assert.deepEqual(readSyncMeta(raw, '1'), { userId: '1', base: { tasks: [task], events: [] }, baseUpdatedAt: '2026-10-03T09:00:00.000Z' })
	assert.equal(readSyncMeta(raw, '2'), null)
	assert.equal(readSyncMeta('not json', '1'), null)
})

test('edits that were never accepted by the server count as local changes', () => {
	const meta = { userId: '1', base: { tasks: [task], events: [] }, baseUpdatedAt: 'x' }

	assert.equal(hasLocalChanges(meta, { tasks: [task], events: [] }), false)
	assert.equal(hasLocalChanges(meta, { tasks: [{ ...task, completed: true }], events: [] }), true)
	assert.equal(hasLocalChanges(null, { tasks: [], events: [] }), false)
})

test('the first sync uploads this browser\'s tasks when the server has none', () => {
	const local = { tasks: [task], events: [event] }

	assert.deepEqual(mergePlanner(null, local, { tasks: [], events: [] }), local)
})

test('keeps offline edits and takes what other devices changed meanwhile', () => {
	const base = { tasks: [task, other], events: [event] }
	// This browser completed task-1 and added an event; another device deleted task-2.
	const local = { tasks: [{ ...task, completed: true }, other], events: [event, later] }
	const remote = { tasks: [task], events: [event] }

	assert.deepEqual(mergePlanner(base, local, remote), { tasks: [{ ...task, completed: true }], events: [event, later] })
})

test('a stale browser does not bring back items another device deleted', () => {
	const base = { tasks: [task, other], events: [] }
	const fresh = { id: 'task-3', title: 'New elsewhere', completed: false, createdAt: '2026-10-03T09:00:00.000Z' }
	// Only task-1 was toggled here; elsewhere task-2 was deleted and task-3 added.
	const local = { tasks: [{ ...task, completed: true }, other], events: [] }
	const remote = { tasks: [fresh, task], events: [] }

	assert.deepEqual(mergePlanner(base, local, remote).tasks, [fresh, { ...task, completed: true }])
})

test('an edit wins over a deletion on the other side', () => {
	const base = { tasks: [task], events: [] }
	const edited = { ...task, title: 'Write the final report' }

	assert.deepEqual(mergePlanner(base, { tasks: [edited], events: [] }, { tasks: [], events: [] }).tasks, [edited])
	assert.deepEqual(mergePlanner(base, { tasks: [], events: [] }, { tasks: [edited], events: [] }).tasks, [edited])
})
