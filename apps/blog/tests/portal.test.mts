import assert from 'node:assert/strict'
import test from 'node:test'
import * as portal from '../src/lib/portal.ts'

const { getPortalSettings, normalizePortalHref, normalizePortalImage } = portal

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

	assert.equal(getPortalSettings({ url: 'https://saved.example.com', label: '自定义导航' }, 'https://fallback.example.com').url, 'https://saved.example.com/')
})

test('portal URLs allow web and same-site paths while rejecting unsafe protocols', () => {
	assert.equal(normalizePortalHref('/admin'), '/admin')
	assert.equal(normalizePortalHref('https://example.com/navigation'), 'https://example.com/navigation')
	assert.equal(normalizePortalHref('javascript:alert(1)'), '')
	assert.equal(normalizePortalImage('data:image/svg+xml,test'), '')
})

test('top image settings select the active image and a safe configurable link', () => {
	const getArtCardSettings = (
		portal as typeof portal & {
			getArtCardSettings?: (content: unknown) => { imageUrl: string; href: string }
		}
	).getArtCardSettings
	assert.equal(typeof getArtCardSettings, 'function')

	assert.deepEqual(
		getArtCardSettings({
			artImages: [
				{ id: 'first', url: 'https://img.example.com/first.webp' },
				{ id: 'active', url: 'https://img.example.com/active.webp' }
			],
			currentArtImageId: 'active',
			artLinkUrl: 'https://example.com/gallery'
		}),
		{
			imageUrl: 'https://img.example.com/active.webp',
			href: 'https://example.com/gallery'
		}
	)

	assert.equal(getArtCardSettings({ artLinkUrl: 'javascript:alert(1)' }).href, '')
	assert.equal(
		getArtCardSettings({ artImages: [{ id: 'unsafe', url: 'javascript:alert(1)' }] }).imageUrl,
		'/images/art/cat.png'
	)
})
