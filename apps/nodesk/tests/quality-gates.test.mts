import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readRepositoryFile = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')

function parseVersion(version: string): [number, number, number] {
	const match = version.match(/(\d+)\.(\d+)\.(\d+)/)
	assert.ok(match, `expected a semantic version, received ${version}`)
	return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isAtLeast(version: string, minimum: string): boolean {
	const current = parseVersion(version)
	const required = parseVersion(minimum)

	for (let index = 0; index < current.length; index += 1) {
		if (current[index] !== required[index]) return current[index] > required[index]
	}

	return true
}

test('does not bypass TypeScript errors during production builds', async () => {
	const config = await read('next.config.ts')
	assert.doesNotMatch(config, /ignoreBuildErrors\s*:\s*true/)
})

test('defines repeatable local quality checks', async () => {
	const packageJson = JSON.parse(await read('package.json'))

	assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit')
	assert.match(packageJson.scripts.check, /pnpm test/)
	assert.match(packageJson.scripts.check, /pnpm typecheck/)
	assert.match(packageJson.scripts.check, /pnpm build/)
	assert.match(packageJson.packageManager, /^pnpm@\d+\.\d+\.\d+$/)
})

test('shares the Nono visual token contract before NoDesk theme rules', async () => {
	const globals = await read('src/styles/globals.css')
	const tokens = await read('src/styles/nono-tokens.css')
	const tokenImport = globals.indexOf("@import './nono-tokens.css';")
	const themeImport = globals.indexOf("@import './theme.css';")

	assert.ok(tokenImport >= 0)
	assert.ok(themeImport > tokenImport)

	for (const token of [
		'--nono-accent',
		'--nono-radius-sm',
		'--nono-radius-md',
		'--nono-radius-lg',
		'--nono-surface-opacity',
		'--nono-surface-blur',
		'--nono-ease-standard',
		'--nono-focus-ring'
	]) {
		assert.match(tokens, new RegExp(token))
	}

	assert.match(tokens, /--nono-accent:\s*var\(--color-brand/)
})

test('keeps keyboard, touch, motion, and mobile safe-area behavior consistent', async () => {
	const globals = await read('src/styles/globals.css')
	const theme = await read('src/styles/theme.css')

	assert.match(globals, /scrollbar-gutter:\s*stable/)
	assert.match(globals, /touch-action:\s*manipulation/)
	assert.match(globals, /:focus-visible/)
	assert.match(globals, /prefers-reduced-motion:\s*reduce/)
	assert.match(theme, /env\(safe-area-inset-top\)/)
})

test('keeps NoDesk in the repository quality gate', async () => {
	const packageJson = JSON.parse(await readRepositoryFile('package.json'))

	assert.match(packageJson.scripts['test:all'], /test:nodesk/)
	assert.match(packageJson.scripts['verify:all'], /typecheck:nodesk/)
	assert.match(packageJson.scripts['build:all'], /build:nodesk/)
})

test('uses patched mutually compatible deployment dependencies', async () => {
	const packageJson = JSON.parse(await read('package.json'))

	assert.ok(isAtLeast(packageJson.dependencies.next, '16.3.3'))
	assert.ok(isAtLeast(packageJson.dependencies['@opennextjs/cloudflare'], '1.20.1'))
	assert.ok(isAtLeast(packageJson.dependencies.jsrsasign, '11.1.1'))
	assert.ok(isAtLeast(packageJson.devDependencies.wrangler, '4.86.0'))
})

test('pins patched transitive build dependencies', async () => {
	const workspace = await read('pnpm-workspace.yaml')

	for (const override of [
		'"baseline-browser-mapping@<2.11.0": 2.11.21',
		'"@babel/core@>=7.0.0 <7.29.1": 7.29.7',
		'"@babel/plugin-transform-modules-systemjs@>=7.12.0 <7.29.4": 7.29.4',
		'"body-parser@>=2.0.0 <2.3.0": 2.3.0',
		'"brace-expansion@>=5.0.0 <5.0.12": 5.0.12',
		'"js-yaml@>=4.0.0 <4.3.2": 4.3.2',
		'"picomatch@<2.3.2": 2.3.2',
		'"postcss@<=8.5.22": 8.5.26',
		'"sharp@<0.35.4": 0.35.4',
		'"svgo@>=3.0.0 <3.3.5": 3.3.5',
		'"undici@>=7.0.0 <7.29.1": 7.29.1'
	]) {
		assert.match(workspace, new RegExp(override.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
	}
})

test('deploys the integrated site at /nodesk without legacy article redirects', async () => {
	const nextConfig = await read('next.config.ts')
	const compose = await readRepositoryFile('docker-compose.yml')
	const gateway = await readRepositoryFile('docker/gateway.mjs')
	const gatewayRouting = await readRepositoryFile('docker/gateway-routing.mjs')

	assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH === '\/nodesk'/)
	assert.match(compose, /NEXT_PUBLIC_BASE_PATH:\s*\/nodesk/)
	assert.match(compose, /NODESK_NAVIGATION_URL:-\/nodesk/)
	assert.match(compose, /nodesk_content:\/app\/nodesk-content/)
	assert.match(gatewayRouting, /url === '\/nodesk'/)
	assert.doesNotMatch(gateway, /replace\('\/blog'/)
})

test('uses the Nono session and local content API instead of GitHub tokens', async () => {
	const auth = await read('src/lib/auth.ts')
	const client = await read('src/lib/github-client.ts')

	assert.match(auth, /\/api\/auth\/session/)
	assert.doesNotMatch(auth, /privateKey|installationId|github_token/)
	assert.match(client, /\/api\/admin\/nodesk\/files/)
	assert.doesNotMatch(client, /api\.github\.com/)
})

test('hydrates editable Nodesk content from the VPS runtime store', async () => {
	const contentClient = await read('src/lib/nodesk-content.ts')
	const configStore = await read('src/app/(home)/stores/config-store.ts')

	assert.match(contentClient, /\/api\/nodesk\/content\//)
	assert.match(configStore, /hydrateRuntimeConfig/)
	for (const [file, key] of [
		['src/app/projects/page.tsx', 'projects'],
		['src/app/share/page.tsx', 'shares'],
		['src/app/friends/page.tsx', 'friends'],
		['src/app/about/page.tsx', 'about'],
		['src/app/snippets/page.tsx', 'snippets']
	] as const) {
		assert.match(await read(file), new RegExp(`loadNodeskContent.*${key}`, 's'))
	}
})

test('keeps the secondary navigation focused on friends and projects', async () => {
	const navCard = await read('src/components/nav-card.tsx')

	// Labels go through copy(zh, en) now, so assert the pair rather than a bare literal.
	assert.match(navCard, /label: copy\('朋友', '[^']+'\)/)
	assert.match(navCard, /label: copy\('我的项目', '[^']+'\)/)
	assert.doesNotMatch(navCard, /'关于网站'/)
	assert.doesNotMatch(navCard, /'推荐分享'/)
	assert.doesNotMatch(navCard, /'优秀博客'/)
})

test('keeps the calendar events the notification service reads in the site content', async () => {
	const siteContent = await read('src/config/site-content.json')

	assert.match(siteContent, /"calendarEvents"/)
})

test('keeps the retired card homepage out of NoDesk', async () => {
	const home = await read('src/app/(home)/page.tsx')
	const styles = JSON.parse(await read('src/config/card-styles.json'))
	const layout = await read('src/layout/index.tsx')

	assert.match(home, /<AmbientWorkbench \/>/)
	assert.deepEqual(Object.keys(styles).sort(), ['hiCard', 'navCard'])
	assert.doesNotMatch(layout, /MusicCard/)
	for (const retired of [
		'src/components/music-card.tsx',
		'src/components/schedule-summary-card.tsx',
		'src/app/(home)/hi-card.tsx',
		'src/app/(home)/calendar-card.tsx',
		'src/app/(home)/home-draggable-layer.tsx',
		'src/app/(home)/config-dialog/index.tsx'
	]) {
		await assert.rejects(read(retired))
	}
})

test('keeps NoDesk locale state and visible content actions bilingual', async () => {
	const provider = await read('src/i18n/index.tsx')
	const shares = await read('src/app/share/page.tsx')
	const projects = await read('src/app/projects/page.tsx')
	const wuthering = await read('src/app/wuthering-waves/page.tsx')
	const parser = wuthering.slice(wuthering.indexOf('function parseCardRecords'), wuthering.indexOf('function buildPitySegments'))

	assert.match(provider, /document\.documentElement\.lang\s*=[\s\S]*language/)
	assert.match(shares, /confirm\(copy\(`/)
	assert.match(projects, /confirm\(copy\(`/)
	assert.doesNotMatch(parser, /useI18n\(/)
})

test('shares the NoNo language choice', async () => {
	const language = await read('src/i18n/language.ts')
	const provider = await read('src/i18n/index.tsx')

	assert.match(language, /LANGUAGE_STORAGE_KEY = 'nono:locale'/)
	assert.doesNotMatch(provider, /'nono-blog-language'/)
})

test('removes article routes and fixtures while retaining supported content', async () => {
  for (const retired of ['src/app/blog/page.tsx', 'src/app/write/page.tsx', 'src/app/rss.xml/route.ts', 'public/blogs/index.json']) {
    await assert.rejects(read(retired), { code: 'ENOENT' })
  }
  for (const route of ['friends', 'pictures', 'projects', 'snippets', 'about']) {
    await read(`src/app/${route}/page.tsx`)
  }
  assert.doesNotMatch(await read('src/app/sitemap.ts'), /blog|rss|write/)
})
