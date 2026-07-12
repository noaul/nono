import assert from 'node:assert/strict'
import test from 'node:test'
import { fromRepoPath, toRepoPath } from '../src/lib/repo-path.ts'

test('adds the monorepo root to logical blog paths', () => {
	assert.equal(toRepoPath('public/blogs/index.json', 'apps/blog'), 'apps/blog/public/blogs/index.json')
	assert.equal(toRepoPath('/src/config/site-content.json', '/apps/blog/'), 'apps/blog/src/config/site-content.json')
})

test('does not add the monorepo root twice', () => {
	assert.equal(toRepoPath('apps/blog/public/blogs/index.json', 'apps/blog'), 'apps/blog/public/blogs/index.json')
})

test('returns logical paths from GitHub API paths', () => {
	assert.equal(fromRepoPath('apps/blog/public/blogs/readme/index.md', 'apps/blog'), 'public/blogs/readme/index.md')
	assert.equal(fromRepoPath('public/blogs/readme/index.md', ''), 'public/blogs/readme/index.md')
})
