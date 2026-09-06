import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWorkbenchNavigation } from '../src/app/(home)/ambient-workbench-settings.ts'

test('NoDesk offers only supported applications by default', () => {
  assert.deepEqual(normalizeWorkbenchNavigation(null).entries.map(entry => entry.id), ['nomoney', 'nostar', 'yumi'])
})

test('NoDesk removes retired saved app routes while preserving bookmarks', () => {
  assert.deepEqual(normalizeWorkbenchNavigation({ navigationEntriesVersion: 5, navigationEntries: [
    { id: 'clipper', label: 'Clipper', url: '/clipper/' },
    { id: 'reading', label: 'Reading', url: '/clipper/?clip=1' },
    { id: 'bookmarks', label: 'Bookmarks', url: '/' }
  ] }).entries.map(entry => entry.url), ['/'])
})
