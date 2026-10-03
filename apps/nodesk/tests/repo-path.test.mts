import assert from 'node:assert/strict'
import test from 'node:test'
import { fromRepoPath, toRepoPath } from '../src/lib/repo-path.ts'

test('adds the monorepo root to logical NoDesk paths', () => {
	assert.equal(toRepoPath('src/app/projects/list.json', 'apps/nodesk'), 'apps/nodesk/src/app/projects/list.json')
	assert.equal(toRepoPath('/src/config/site-content.json', '/apps/nodesk/'), 'apps/nodesk/src/config/site-content.json')
})

test('does not add the monorepo root twice', () => {
	assert.equal(toRepoPath('apps/nodesk/src/app/projects/list.json', 'apps/nodesk'), 'apps/nodesk/src/app/projects/list.json')
})

test('returns logical paths from GitHub API paths', () => {
	assert.equal(fromRepoPath('apps/nodesk/src/app/about/list.json', 'apps/nodesk'), 'src/app/about/list.json')
	assert.equal(fromRepoPath('src/app/about/list.json', ''), 'src/app/about/list.json')
})
