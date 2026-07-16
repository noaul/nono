import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { clearAllAuthCache, getAuthToken, hasAuth } from '../src/lib/auth.ts'
import {
	createBlob,
	createCommit,
	createTree,
	listRepoFilesRecursive,
	putFile,
	readTextFileFromRepo,
	toBase64Utf8,
	updateRef
} from '../src/lib/github-client.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	clearAllAuthCache()
})

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ code: status, data }), {
		status,
		headers: { 'content-type': 'application/json' }
	})
}

test('uses the same-origin Nono admin session without exposing a credential', async () => {
	let requestedUrl = ''
	globalThis.fetch = async input => {
		requestedUrl = String(input)
		return jsonResponse({ authenticated: true, user: { role: 'admin' } })
	}

	assert.equal(await hasAuth(), true)
	assert.equal(await getAuthToken(), 'nono-session')
	assert.equal(requestedUrl, '/api/auth/session')
})

test('converts the legacy blob-tree-commit flow into one local batch write', async () => {
	const calls: Array<{ url: string; init?: RequestInit }> = []
	globalThis.fetch = async (input, init) => {
		calls.push({ url: String(input), init })
		return jsonResponse({ written: 2 })
	}

	const blob = await createBlob('ignored', 'ignored', 'ignored', toBase64Utf8('青春 Nodesk'), 'base64')
	const tree = await createTree('ignored', 'ignored', 'ignored', [
		{ path: 'apps/blog/src/config/site-content.json', mode: '100644', type: 'blob', sha: blob.sha },
		{ path: 'public/images/old.png', mode: '100644', type: 'blob', sha: null }
	])
	const commit = await createCommit('ignored', 'ignored', 'ignored', 'Save local content', tree.sha, ['ignored'])
	await updateRef('ignored', 'ignored', 'ignored', 'heads/main', commit.sha)

	assert.equal(calls.length, 1)
	assert.equal(calls[0].url, '/api/admin/nodesk/files/batch')
	assert.equal(calls[0].init?.credentials, 'include')
	assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
		files: [
			{ path: 'src/config/site-content.json', contentBase64: toBase64Utf8('青春 Nodesk') },
			{ path: 'public/images/old.png', contentBase64: null }
		],
		message: 'Save local content'
	})
})

test('reads, lists, and directly writes through the local content API', async () => {
	const calls: Array<{ url: string; init?: RequestInit }> = []
	globalThis.fetch = async (input, init) => {
		const url = String(input)
		calls.push({ url, init })
		if (url.includes('/list?')) return jsonResponse(['src/app/projects/list.json'])
		if (url.includes('?path=')) return jsonResponse({ contentBase64: toBase64Utf8('本地内容') })
		return jsonResponse({ written: 1 })
	}

	assert.equal(await readTextFileFromRepo('', '', '', 'src/config/site-content.json', ''), '本地内容')
	assert.deepEqual(await listRepoFilesRecursive('', '', '', 'src/app/projects', ''), ['src/app/projects/list.json'])
	await putFile('', '', '', 'apps/blog/src/config/site-content.json', toBase64Utf8('{}'), 'Save', '')

	assert.match(calls[0].url, /^\/api\/admin\/nodesk\/files\?path=/)
	assert.match(calls[1].url, /^\/api\/admin\/nodesk\/files\/list\?path=/)
	assert.equal(calls[2].url, '/api/admin/nodesk/files/batch')
})
