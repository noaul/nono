import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('keeps every backup control inside the NoDesk settings center', async () => {
	const source = await read('src/app/(home)/ambient-settings-center.tsx')
	const backupCenter = await read('src/app/(home)/ambient-backup-center.tsx')

	assert.match(source, /AmbientBackupCenter/)
	assert.match(backupCenter, /\/api\/admin\/backups\/automation/)
	assert.match(backupCenter, /\/api\/admin\/backup-center\/webdav\/config/)
	assert.match(backupCenter, /\/api\/admin\/backup-center\/webdav\/backups/)
	assert.match(backupCenter, /\/api\/admin\/backup-center\/webdav\/restore/)
	assert.match(backupCenter, /\/api\/admin\/backup-center\/local\/\$\{localRestoreModule\}\/restore/)
	assert.match(backupCenter, /nono[\s\S]*clipper[\s\S]*nodesk[\s\S]*nostar[\s\S]*nomoney[\s\S]*yumi/)
	assert.match(backupCenter, /六个模块/)
	assert.match(backupCenter, /当前账户完整备份/)
	assert.doesNotMatch(backupCenter, /全站备份|全站与|恢复全站|>全站</)
	assert.match(backupCenter, /\/nono\/batches\//)
	assert.match(backupCenter, /WebDAV 备份|WebDAV/)
	assert.match(backupCenter, /本地备份/)
	assert.match(backupCenter, /备份与恢复[\s\S]*自动备份[\s\S]*历史记录[\s\S]*连接设置/)
	assert.doesNotMatch(backupCenter, /\/api\/nostar\/configs\/webdav/)
	assert.doesNotMatch(backupCenter, /<span>备份目录<\/span>\s*<input/)
	assert.doesNotMatch(source, /href=['"]\/admin\/backups/)
})

test('uses a labeled application rail and supports backup deep links', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const styles = await read('src/styles/ambient-workbench.css')

	assert.match(workbench, /<AppWindow size=\{17\} \/><strong>应用<\/strong>/)
	assert.match(workbench, /<strong>\{entry\.label\}<\/strong>/)
	assert.match(workbench, /settings=backups|searchParams\.get\('settings'\)[\s\S]*backups/)
	assert.match(styles, /\.ambient-app-list\s*\{[^}]*display: grid/)
})

test('keeps quick application CRUD inside the NoDesk desktop settings tab', async () => {
	const source = await read('src/app/(home)/ambient-settings-center.tsx')

	assert.match(source, /quickEntries: WorkbenchAppEntry\[\]/)
	assert.match(source, /onQuickEntriesChange: \(entries: WorkbenchAppEntry\[\]\) => Promise<void>/)
	assert.match(source, /应用名称/)
	assert.match(source, /跳转链接/)
	assert.match(source, /添加快捷应用/)
	assert.match(source, /删除快捷应用/)
	assert.match(source, /value: 'scissors'/)
})
