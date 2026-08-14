import assert from 'node:assert/strict'
import test from 'node:test'

const siteUrlModuleUrl = new URL('../src/lib/site-url.ts', import.meta.url)
const siteUrlModule = await import(siteUrlModuleUrl.href).catch(error => {
	assert.fail(`site URL module is required: ${String(error)}`)
})

const { getSiteUrl, normalizeSiteUrl } = siteUrlModule

test('uses the public site URL as the canonical source', () => {
	assert.equal(
		getSiteUrl({
			NEXT_PUBLIC_SITE_URL: 'https://notes.example.com/',
			SITE_URL: 'https://ignored.example',
			VERCEL_URL: 'preview.vercel.app'
		}),
		'https://notes.example.com'
	)
})

test('supports server-only and Vercel URL fallbacks', () => {
	assert.equal(getSiteUrl({ SITE_URL: 'https://site.example/path/' }), 'https://site.example/path')
	assert.equal(getSiteUrl({ VERCEL_URL: 'preview.vercel.app' }), 'https://preview.vercel.app')
	assert.equal(getSiteUrl({}), 'http://localhost:3000/nodesk')
})

test('normalizes hostnames and rejects unsafe protocols', () => {
	assert.equal(normalizeSiteUrl('notes.example.com/'), 'https://notes.example.com')
	assert.throws(() => normalizeSiteUrl('javascript:alert(1)'), /http or https/)
})
