import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import * as fileUtils from '../src/lib/file-utils.ts'
import { avatarAssetPath } from '../src/lib/site-assets.ts'

test('generates a full SHA-256 hash for a cache-safe avatar path', async () => {
	const content = new TextEncoder().encode('normalized-avatar-webp')
	const file = {
		type: 'image/webp',
		arrayBuffer: async () => content.buffer
	} as File
	const hashFileSHA256Full = (fileUtils as typeof fileUtils & {
		hashFileSHA256Full?: (input: File) => Promise<string>
	}).hashFileSHA256Full

	assert.equal(typeof hashFileSHA256Full, 'function')
	const hash = await hashFileSHA256Full(file)
	assert.equal(hash, createHash('sha256').update(content).digest('hex'))
	assert.equal(avatarAssetPath({ type: 'file', file, hash }), `/images/avatar-${hash}.webp`)
})
