import assert from 'node:assert/strict'
import test from 'node:test'

import { plannerKey, readRemotePlanner, reconcilePlanner } from '../src/app/(home)/planner-sync.ts'

const task = { id: 'task-1', title: 'Write the report', completed: false, createdAt: '2026-10-03T08:00:00.000Z' }
const event = { id: 'event-1', title: 'Stand-up', date: '2026-10-04', time: '09:30' }

test('reads the server copy and drops malformed items', () => {
	const remote = readRemotePlanner({ tasks: [task, { id: '', title: 'x' }], events: [event], updatedAt: '2026-10-03T09:00:00.000Z' })

	assert.deepEqual(remote, { tasks: [task], events: [event], updatedAt: '2026-10-03T09:00:00.000Z' })
	assert.equal(readRemotePlanner(null), null)
	assert.equal(readRemotePlanner({ tasks: [], events: [], updatedAt: 42 })?.updatedAt, null)
})

test('the first sync uploads this browser\'s tasks when the server has none yet', () => {
	const local = { tasks: [task], events: [] }

	assert.deepEqual(reconcilePlanner(local, { tasks: [], events: [], updatedAt: null }), { snapshot: local, upload: true })
	assert.deepEqual(reconcilePlanner({ tasks: [], events: [] }, { tasks: [], events: [], updatedAt: null }), { snapshot: { tasks: [], events: [] }, upload: false })
})

test('once the server has a copy it wins over what this browser cached', () => {
	const remote = { tasks: [], events: [event], updatedAt: '2026-10-03T09:00:00.000Z' }

	assert.deepEqual(reconcilePlanner({ tasks: [task], events: [] }, remote), { snapshot: { tasks: [], events: [event] }, upload: false })
})

test('the sync key ignores key order and the timestamp', () => {
	assert.equal(plannerKey({ tasks: [task], events: [event] }), plannerKey({ events: [event], tasks: [task] }))
	assert.notEqual(plannerKey({ tasks: [task], events: [] }), plannerKey({ tasks: [{ ...task, completed: true }], events: [] }))
})
