import assert from 'node:assert/strict'
import test from 'node:test'

import { islandMode, nextSeenKeys, readSeenKeys } from '../src/app/(home)/notification-island-model.ts'

test('hides the island while nothing is unread and lets the open list win over a peek', () => {
	assert.equal(islandMode(0, true, true), 'hidden')
	assert.equal(islandMode(2, false, false), 'compact')
	assert.equal(islandMode(2, false, true), 'peek')
	assert.equal(islandMode(2, true, true), 'expanded')
})

test('remembers seen notifications across reloads and tolerates a corrupt store', () => {
	assert.deepEqual([...readSeenKeys('["a","b",3]')], ['a', 'b'])
	assert.deepEqual([...readSeenKeys('not json')], [])
	assert.deepEqual(nextSeenKeys(new Set(['a', 'b']), ['b', 'c']), ['a', 'b', 'c'])
	const many = Array.from({ length: 320 }, (_, index) => `k${index}`)
	const kept = nextSeenKeys(new Set(many), ['new'])
	assert.equal(kept.length, 300)
	assert.equal(kept.at(-1), 'new')
	assert.ok(!kept.includes('k0'))
})
