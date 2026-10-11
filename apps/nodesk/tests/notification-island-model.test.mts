import assert from 'node:assert/strict'
import test from 'node:test'

import { islandColumns, islandPages, nextSeenKeys, readSeenKeys } from '../src/app/(home)/notification-island-model.ts'

test('fits two or three columns into the strip and never fewer than one', () => {
	assert.equal(islandColumns(100), 1)
	assert.equal(islandColumns(274), 2)
	assert.equal(islandColumns(404), 3)
	assert.equal(islandColumns(2000), 3)
})

test('pages fill every column and stop after three turns per column', () => {
	const items = Array.from({ length: 11 }, (_, index) => index)
	assert.deepEqual(islandPages(items, 3), [[0, 1, 2], [3, 4, 5], [6, 7, 8]])
	assert.deepEqual(islandPages(items.slice(0, 5), 2), [[0, 1], [2, 3], [4]])
	assert.deepEqual(islandPages([], 2), [])
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
