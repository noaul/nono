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

test('shares the Nono visual token contract before Blog theme rules', async () => {
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

test('runs the same quality gates in GitHub Actions', async () => {
	const workflow = await readRepositoryFile('.github/workflows/ci.yml')

	for (const command of ['pnpm install --frozen-lockfile', 'pnpm test', 'pnpm typecheck', 'pnpm build']) {
		assert.match(workflow, new RegExp(command.replaceAll(' ', '\\s+')))
	}

	assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/)
	assert.match(workflow, /timeout-minutes:/)
})

test('uses patched mutually compatible deployment dependencies', async () => {
	const packageJson = JSON.parse(await read('package.json'))

	assert.ok(isAtLeast(packageJson.dependencies.next, '16.2.6'))
	assert.ok(isAtLeast(packageJson.dependencies['@opennextjs/cloudflare'], '1.20.1'))
	assert.ok(isAtLeast(packageJson.dependencies.jsrsasign, '11.1.1'))
	assert.ok(isAtLeast(packageJson.devDependencies.wrangler, '4.86.0'))
})

test('pins patched transitive build dependencies', async () => {
	const workspace = await read('pnpm-workspace.yaml')

	for (const override of [
		'"@babel/core@>=7.0.0 <7.29.1": 7.29.7',
		'"@babel/plugin-transform-modules-systemjs@>=7.12.0 <7.29.4": 7.29.4',
		'"js-yaml@>=4.0.0 <4.1.2": 4.3.0',
		'"picomatch@<2.3.2": 2.3.2',
		'"svgo@>=3.0.0 <3.3.3": 3.3.3'
	]) {
		assert.match(workspace, new RegExp(override.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
	}
})

test('deploys the integrated site at /nodesk with legacy /blog redirects', async () => {
	const nextConfig = await read('next.config.ts')
	const compose = await readRepositoryFile('docker-compose.yml')
	const gateway = await readRepositoryFile('docker/gateway.mjs')

	assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH === '\/nodesk'/)
	assert.match(compose, /NEXT_PUBLIC_BASE_PATH:\s*\/nodesk/)
	assert.match(compose, /BLOG_NAVIGATION_URL:-\/nodesk/)
	assert.match(compose, /nodesk_content:\/app\/nodesk-content/)
	assert.match(gateway, /url === '\/nodesk'/)
	assert.match(gateway, /replace\('\/blog', '\/nodesk'\)/)
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
		['src/app/bloggers/page.tsx', 'bloggers'],
		['src/app/about/page.tsx', 'about'],
		['src/app/snippets/page.tsx', 'snippets']
	] as const) {
		assert.match(await read(file), new RegExp(`loadNodeskContent.*${key}`, 's'))
	}
})

test('keeps the home navigation focused on articles and projects', async () => {
	const navCard = await read('src/components/nav-card.tsx')

	assert.match(navCard, /label: '近期文章'/)
	assert.match(navCard, /label: '我的项目'/)
	assert.doesNotMatch(navCard, /label: '关于网站'/)
	assert.doesNotMatch(navCard, /label: '推荐分享'/)
	assert.doesNotMatch(navCard, /label: '优秀博客'/)
})

test('supports persisted calendar schedules and cache-safe avatar assets', async () => {
	const siteContent = await read('src/config/site-content.json')
	const calendar = await read('src/app/(home)/calendar-card.tsx')
	const sitePush = await read('src/app/(home)/services/push-site-content.ts')

	assert.match(siteContent, /"calendarEvents"/)
	assert.match(calendar, /管理日程/)
	assert.match(calendar, /pushSiteContent/)
	assert.match(sitePush, /avatarAssetPath/)
	assert.match(sitePush, /meta\.avatarUrl/)
})

test('places music on the lower left and summarizes the next three days beside it', async () => {
	const music = await read('src/components/music-card.tsx')
	const styles = await read('src/config/card-styles.json')
	const summary = await read('src/components/schedule-summary-card.tsx')

	assert.match(music, /navCardStyles/)
	assert.match(music, /cardKey='musicCard'/)
	assert.match(styles, /"scheduleCard"/)
	assert.match(summary, /最近日程/)
	assert.match(summary, /未来三天/)
	assert.match(summary, /cardKey='scheduleCard'/)
})
