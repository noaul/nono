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
