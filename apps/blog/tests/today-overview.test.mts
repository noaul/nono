import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { formatMoney, summarizeOverview } from '../src/app/(home)/today-overview-model.ts'

const ok = (data: unknown) => ({ state: 'ok', data })

test('the today panel puts outages and overdue items first and links to each app', () => {
	const rows = summarizeOverview({
		notifications: ok({ unread: 5, urgent: 1 }),
		nomoney: ok({
			due: { buckets: { overdue: 1, today: 0, week: 1, month: 0 }, next: [{ name: '主卡', daysLeft: -2 }] },
			spending: { predictedMonthly: { currency: 'CNY', amountMinorUnits: 15000, complete: true } }
		}),
		yumi: ok({ due: { buckets: {}, next: [] }, status: { overall: 'partial_outage', down: ['tokyo'], degraded: [] } }),
		links: ok({ total: 20, broken: 0 }),
		nostar: ok({ unreadReleases: 3 }),
		backup: ok({ enabled: true, lastSuccessAt: '2026-10-01T19:00:00.000Z', lastFailureAt: null, lastError: null })
	}, '/nodesk')

	assert.deepEqual(rows.map(row => [row.id, row.tone]), [
		['nomoney', 'critical'], ['yumi', 'critical'], ['notifications', 'warning'], ['links', 'ok'], ['nostar', 'ok'], ['backup', 'ok']
	])
	assert.equal(rows[0].subtitle, `1 项逾期，1 项 7 天内到期 · 最近：主卡（已逾期 2 天） · 每月约 ${formatMoney(15000, 'CNY')}`)
	assert.equal(rows[0].href, '/nomoney/dashboard')
	assert.match(rows[1].subtitle, /^宕机：tokyo · 30 天内没有到期项目$/)
	assert.equal(rows[2].href, '/nodesk/?settings=notifications')
	assert.match(rows[5].subtitle, /^自动备份已开启，最近成功 10\/2/)
})

test('unreadable blocks stay visible as muted rows and a backup failure is critical', () => {
	const rows = summarizeOverview({
		notifications: { state: 'unavailable', error: 'x' },
		nomoney: ok({ due: { buckets: {}, next: [] } }),
		yumi: { state: 'unavailable' },
		links: ok({ total: 2, broken: 2 }),
		nostar: ok({ unreadReleases: 0 }),
		backup: ok({ enabled: true, lastSuccessAt: '2026-09-01T00:00:00.000Z', lastFailureAt: '2026-09-02T00:00:00.000Z', lastError: 'WebDAV 401' })
	})
	const byId = Object.fromEntries(rows.map(row => [row.id, row]))
	assert.equal(byId.backup.tone, 'critical')
	assert.equal(byId.backup.subtitle, '最近一次自动备份失败：WebDAV 401')
	assert.equal(byId.yumi.tone, 'muted')
	assert.equal(byId.notifications.subtitle, '暂时无法读取')
	assert.equal(byId.links.subtitle, '2 个书签无法访问')
	assert.equal(byId.nomoney.subtitle, '30 天内没有到期项目')
	assert.deepEqual(rows.slice(-2).map(row => row.tone), ['muted', 'muted'])
	assert.equal(summarizeOverview(null).length, 6)
})

test('the workbench opens the today panel from the dock and refreshes it with notifications', async () => {
	const workbench = await readFile(new URL('../src/app/(home)/ambient-workbench.tsx', import.meta.url), 'utf8')
	assert.match(workbench, /\{ id: 'today', label: '今日'/)
	assert.match(workbench, /fetch\('\/api\/admin\/overview'/)
	assert.match(workbench, /void loadNotifications\(\)\n\t\t\tvoid loadOverview\(false\)/)
})
