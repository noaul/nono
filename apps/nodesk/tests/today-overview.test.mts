import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { formatMoney, summarizeOverview } from '../src/app/(home)/today-overview-model.ts'

const ok = (data: unknown) => ({ state: 'ok', data })

test('the today panel puts overdue items first and links to each app', () => {
	const rows = summarizeOverview({
		notifications: ok({ unread: 5, urgent: 1 }),
		nomoney: ok({
			due: { buckets: { overdue: 1, today: 0, week: 1, month: 0 }, next: [{ name: '主卡', daysLeft: -2 }] },
			spending: { predictedMonthly: { currency: 'CNY', amountMinorUnits: 15000, complete: true } }
		}),
		links: ok({ total: 20, broken: 0 }),
		nostar: ok({ unreadReleases: 3 }),
		backup: ok({ enabled: true, lastSuccessAt: '2026-10-01T19:00:00.000Z', lastFailureAt: null, lastError: null })
	}, '/nodesk')

	assert.deepEqual(rows.map(row => [row.id, row.tone]), [
		['nomoney', 'critical'], ['notifications', 'warning'], ['links', 'ok'], ['nostar', 'ok'], ['backup', 'ok']
	])
	assert.equal(rows[0].subtitle, `1 项逾期，1 项 7 天内到期 · 最近：主卡（已逾期 2 天） · 每月约 ${formatMoney(15000, 'CNY')}`)
	assert.equal(rows[0].href, '/nomoney/dashboard')
	assert.equal(rows[1].href, '/nodesk/?settings=notifications')
	assert.match(rows[4].subtitle, /^自动备份已开启，最近成功 10\/2/)
})

test('unreadable blocks stay visible as muted rows and a backup failure is critical', () => {
	const rows = summarizeOverview({
		notifications: { state: 'unavailable', error: 'x' },
		nomoney: ok({ due: { buckets: {}, next: [] } }),
		links: ok({ total: 2, broken: 2 }),
		nostar: ok({ unreadReleases: 0 }),
		backup: ok({ enabled: true, lastSuccessAt: '2026-09-01T00:00:00.000Z', lastFailureAt: '2026-09-02T00:00:00.000Z', lastError: 'WebDAV 401' })
	})
	const byId = Object.fromEntries(rows.map(row => [row.id, row]))
	assert.equal(byId.backup.tone, 'critical')
	assert.equal(byId.backup.subtitle, '最近一次自动备份失败：WebDAV 401')
	assert.equal(byId.notifications.tone, 'muted')
	assert.equal(byId.yumi, undefined)
	assert.equal(byId.notifications.subtitle, '暂时无法读取')
	assert.equal(byId.links.subtitle, '2 个书签无法访问')
	assert.equal(byId.nomoney.subtitle, '30 天内没有到期项目')
	assert.deepEqual(rows.slice(-1).map(row => row.tone), ['muted'])
	assert.equal(summarizeOverview(null).length, 5)
})

test('items due in 8 to 30 days, including domains, remain visible in the NoMoney summary', () => {
	for (const daysLeft of [8, 19, 30]) {
		const due = { buckets: { overdue: 0, today: 0, week: 0, month: 1 }, next: [{ assetType: 'domain', name: 'example.com', daysLeft }] }
		const rows = summarizeOverview({
			nomoney: ok({ due, assetCounts: { phones: 1, subscriptions: 2, domains: 3 } }),
			yumi: ok({ due, status: { overall: 'major_outage', down: ['tokyo'] } })
		})
		const row = rows.find(row => row.id === 'nomoney')!
		assert.match(row.subtitle, /1 项 8～30 天内到期/)
		assert.ok(row.subtitle.includes(`最近：example.com（${daysLeft} 天后到期）`))
		assert.doesNotMatch(row.subtitle, /没有到期项目/)
		assert.equal(row.tone, 'ok')
		assert.equal(rows.some(row => (row.id as string) === 'yumi'), false)
	}
})

test('the workbench opens the today panel from the dock and refreshes it with notifications', async () => {
	const workbench = await readFile(new URL('../src/app/(home)/ambient-workbench.tsx', import.meta.url), 'utf8')
	assert.match(workbench, /\{ id: 'today', label: '今日'/)
	assert.match(workbench, /fetch\('\/api\/admin\/overview'/)
	assert.match(workbench, /void loadNotifications\(\)\n\t\t\tvoid loadOverview\(false\)/)
})
