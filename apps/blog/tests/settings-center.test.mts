import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('keeps every backup control inside the NoDesk settings center', async () => {
	const source = await read('src/app/(home)/ambient-settings-center.tsx')

	assert.match(source, /\/api\/admin\/backups\/automation/)
	assert.match(source, /method:\s*'PUT'/)
	assert.match(source, /method:\s*'DELETE'/)
	assert.match(source, /backup-max-count/)
	assert.match(source, /backup-retention-days/)
	assert.match(source, /\/api\/nostar\/configs\/webdav/)
	assert.match(source, /\/api\/nostar\/proxy\/webdav/)
	assert.doesNotMatch(source, /href=['"]\/admin\/backups/)
})

test('uses an icon-only horizontal application launcher and supports backup deep links', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.doesNotMatch(workbench, /<AppWindow size=\{17\} \/><span>应用<\/span>/)
	assert.match(workbench, /aria-label=\{entry\.label\}/)
	assert.match(workbench, /settings=backups|searchParams\.get\('settings'\)[\s\S]*backups/)
	assert.match(styles, /\.ambient-app-switcher-menu\s*\{[^}]*grid-template-columns:/)
})
