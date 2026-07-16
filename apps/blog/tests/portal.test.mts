import assert from 'node:assert/strict'
import test from 'node:test'
import { getPortalSettings, normalizePortalHref, normalizePortalImage } from '../src/lib/portal.ts'

test('portal settings return to the same-origin navigation by default', () => {
	assert.equal(getPortalSettings({}).url, '/')
})

test('portal settings prefer saved values and fall back to the deployment URL', () => {
	assert.deepEqual(getPortalSettings({}, 'https://nono.example.com'), {
		enabled: true,
		url: 'https://nono.example.com/',
		label: '返回网址导航',
		imageUrl: '/images/avatar.png',
		openInNewTab: false
	})

	assert.equal(
		getPortalSettings({ url: 'https://saved.example.com', label: '自定义导航' }, 'https://fallback.example.com').url,
		'https://saved.example.com/'
	)
})

test('portal URLs allow web and same-site paths while rejecting unsafe protocols', () => {
	assert.equal(normalizePortalHref('/admin'), '/admin')
	assert.equal(normalizePortalHref('https://example.com/navigation'), 'https://example.com/navigation')
	assert.equal(normalizePortalHref('javascript:alert(1)'), '')
	assert.equal(normalizePortalImage('data:image/svg+xml,test'), '')
})
