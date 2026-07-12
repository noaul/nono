import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('does not expose or cache the GitHub private key', async () => {
	const [constants, auth, authStore, settings] = await Promise.all([
		read('src/consts.ts'),
		read('src/lib/auth.ts'),
		read('src/hooks/use-auth.ts'),
		read('src/app/(home)/config-dialog/site-settings/index.tsx')
	])

	assert.doesNotMatch(constants, /ENCRYPT_KEY|NEXT_PUBLIC_GITHUB_ENCRYPT_KEY/)
	assert.doesNotMatch(auth, /GITHUB_PEM_CACHE_KEY|savePemToCache|getPemFromCache/)
	assert.doesNotMatch(authStore, /savePemToCache|getPemFromCache/)
	assert.doesNotMatch(settings, /isCachePem|缓存PEM/)
})

test('adds baseline response security headers', async () => {
	const config = await read('next.config.ts')

	for (const header of ['Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy']) {
		assert.match(config, new RegExp(header))
	}
})

test('keeps production log sampling at ten percent or lower', async () => {
	const wrangler = await read('wrangler.toml')
	const samplingRate = Number(wrangler.match(/head_sampling_rate\s*=\s*([0-9.]+)/)?.[1])

	assert.ok(Number.isFinite(samplingRate))
	assert.ok(samplingRate <= 0.1, `expected sampling <= 0.1, received ${samplingRate}`)
	assert.match(wrangler, /invocation_logs\s*=\s*false/)
})
