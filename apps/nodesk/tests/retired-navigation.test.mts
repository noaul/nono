import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWorkbenchNavigation } from '../src/app/(home)/ambient-workbench-settings.ts'

test('NoDesk offers only supported applications by default', () => {
  assert.deepEqual(normalizeWorkbenchNavigation(null).entries.map(entry => entry.id), ['nomoney', 'nostar'])
})

test('NoDesk removes retired saved app routes while preserving bookmarks', () => {
  assert.deepEqual(normalizeWorkbenchNavigation({ navigationEntriesVersion: 5, navigationEntries: [
    { id: 'clipper', label: 'Clipper', url: '/clipper/' },
    { id: 'reading', label: 'Reading', url: '/clipper/?clip=1' },
    { id: 'yumi', label: 'Yumi', url: '/yumi', icon: 'server-cog' },
    { id: 'yumi-domains', label: 'Domains', url: '/yumi/domains?q=a' },
    { id: 'bookmarks', label: 'Bookmarks', url: '/' }
  ] }).entries.map(entry => entry.url), ['/'])
})

test('NoDesk does not bring back Yumi when migrating older saved navigation', () => {
  assert.deepEqual(normalizeWorkbenchNavigation({ navigationEntriesVersion: 3, navigationEntries: [
    { id: 'yumi', label: 'Yumi', url: '/yumi', icon: 'server-cog' },
    { id: 'yumiko', label: 'Yumiko', url: '/yumiko' }
  ] }).entries.map(entry => entry.id), ['yumiko', 'nomoney', 'nostar'])
})
