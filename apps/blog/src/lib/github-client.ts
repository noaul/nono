'use client'

const FILES_API = '/api/admin/nodesk/files'
const LOCAL_AUTH_TOKEN = 'nono-session'

type ApiEnvelope<T> = {
	data?: T
	message?: string
}

type FilePayload = {
	contentBase64: string
	sha?: string
}

type FileChange = {
	path: string
	contentBase64: string | null
}

type LocalTree = {
	changes: FileChange[]
}

type LocalCommit = {
	message: string
	tree: string
}

const blobs = new Map<string, string>()
const trees = new Map<string, LocalTree>()
const commits = new Map<string, LocalCommit>()
let localSequence = 0

function localSha(kind: string): string {
	localSequence += 1
	return `local-${kind}-${Date.now().toString(36)}-${localSequence.toString(36)}`
}

function normalizeLocalPath(input: string): string {
	const path = input.replaceAll('\\', '/').replace(/^\/+/, '')
	const configuredRoot = (process.env.NEXT_PUBLIC_GITHUB_ROOT_PATH || 'apps/blog').replace(/^\/+|\/+$/g, '')
	return configuredRoot && path.startsWith(`${configuredRoot}/`) ? path.slice(configuredRoot.length + 1) : path
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...init,
		credentials: 'include',
		headers: {
			Accept: 'application/json',
			...(init?.body ? { 'Content-Type': 'application/json' } : {}),
			...init?.headers
		}
	})

	if (!response.ok) {
		let message = `Nodesk content request failed: ${response.status}`
		try {
			const payload = (await response.json()) as ApiEnvelope<unknown>
			if (payload.message) message = payload.message
		} catch {
			// Preserve the status-based fallback for non-JSON responses.
		}
		throw new Error(message)
	}

	const payload = (await response.json()) as ApiEnvelope<T> | T
	return typeof payload === 'object' && payload !== null && 'data' in payload && payload.data !== undefined ? payload.data : (payload as T)
}

async function writeFiles(files: FileChange[], message?: string): Promise<unknown> {
	return requestJson(`${FILES_API}/batch`, {
		method: 'POST',
		body: JSON.stringify({ files, message })
	})
}

export function toBase64Utf8(input: string): string {
	const bytes = new TextEncoder().encode(input)
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary)
}

function fromBase64Utf8(input: string): string {
	const binary = atob(input)
	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
	return new TextDecoder().decode(bytes)
}

export async function getFileSha(_token: string, _owner: string, _repo: string, path: string, _branch: string): Promise<string | undefined> {
	const content = await readTextFileFromRepo(LOCAL_AUTH_TOKEN, '', '', path, '')
	return content === null ? undefined : localSha('file')
}

export async function putFile(
	_token: string,
	_owner: string,
	_repo: string,
	path: string,
	contentBase64: string,
	message: string,
	_branch: string
) {
	const normalizedPath = normalizeLocalPath(path)
	await writeFiles([{ path: normalizedPath, contentBase64 }], message)
	const sha = localSha('commit')
	return { content: { path: normalizedPath, sha }, commit: { sha } }
}

export async function getRef(_token: string, _owner: string, _repo: string, _ref: string): Promise<{ sha: string }> {
	return { sha: localSha('ref') }
}

export type TreeItem = {
	path: string
	mode: '100644' | '100755' | '040000' | '160000' | '120000'
	type: 'blob' | 'tree' | 'commit'
	content?: string
	sha?: string | null
}

export async function createTree(
	_token: string,
	_owner: string,
	_repo: string,
	tree: TreeItem[],
	_baseTree?: string
): Promise<{ sha: string }> {
	const changes = tree.map<FileChange>(item => {
		if (item.type !== 'blob') throw new Error(`Unsupported local tree item type: ${item.type}`)

		let contentBase64: string | null
		if (item.sha === null) {
			contentBase64 = null
		} else if (item.content !== undefined) {
			contentBase64 = toBase64Utf8(item.content)
		} else if (item.sha && blobs.has(item.sha)) {
			contentBase64 = blobs.get(item.sha) || ''
		} else {
			throw new Error(`Unknown local blob: ${item.sha || item.path}`)
		}

		return { path: normalizeLocalPath(item.path), contentBase64 }
	})

	const sha = localSha('tree')
	trees.set(sha, { changes })
	return { sha }
}

export async function createCommit(
	_token: string,
	_owner: string,
	_repo: string,
	message: string,
	tree: string,
	_parents: string[]
): Promise<{ sha: string }> {
	if (!trees.has(tree)) throw new Error(`Unknown local tree: ${tree}`)
	const sha = localSha('commit')
	commits.set(sha, { message, tree })
	return { sha }
}

export async function updateRef(
	_token: string,
	_owner: string,
	_repo: string,
	_ref: string,
	sha: string,
	_force = false
): Promise<void> {
	const commit = commits.get(sha)
	if (!commit) throw new Error(`Unknown local commit: ${sha}`)
	const tree = trees.get(commit.tree)
	if (!tree) throw new Error(`Unknown local tree: ${commit.tree}`)

	await writeFiles(tree.changes, commit.message)
	commits.delete(sha)
	trees.delete(commit.tree)
	blobs.clear()
}

export async function readTextFileFromRepo(
	_token: string,
	_owner: string,
	_repo: string,
	path: string,
	_ref: string
): Promise<string | null> {
	try {
		const file = await requestJson<FilePayload>(`${FILES_API}?path=${encodeURIComponent(normalizeLocalPath(path))}`)
		return fromBase64Utf8(file.contentBase64)
	} catch (error) {
		if (error instanceof Error && /404|not found/i.test(error.message)) return null
		throw error
	}
}

export async function listRepoFilesRecursive(
	_token: string,
	_owner: string,
	_repo: string,
	path: string,
	_ref: string
): Promise<string[]> {
	try {
		const files = await requestJson<string[]>(`${FILES_API}/list?path=${encodeURIComponent(normalizeLocalPath(path))}`)
		return files.map(normalizeLocalPath)
	} catch (error) {
		if (error instanceof Error && /404|not found/i.test(error.message)) return []
		throw error
	}
}

export async function createBlob(
	_token: string,
	_owner: string,
	_repo: string,
	content: string,
	encoding: 'utf-8' | 'base64' = 'base64'
): Promise<{ sha: string }> {
	const sha = localSha('blob')
	blobs.set(sha, encoding === 'base64' ? content : toBase64Utf8(content))
	return { sha }
}
