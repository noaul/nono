export type TodayTone = 'ok' | 'warning' | 'critical' | 'muted'

export type TodayRow = {
	id: 'notifications' | 'nomoney' | 'yumi' | 'links' | 'nostar' | 'backup'
	title: string
	subtitle: string
	href: string
	tone: TodayTone
}

type Block = { state: 'ok'; data: Record<string, unknown> } | { state: 'unavailable'; error?: string }

type DueBuckets = { overdue?: number; today?: number; week?: number; month?: number }
type DueItem = { name?: string; daysLeft?: number }

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {})
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function block(value: unknown): Block {
	const entry = record(value)
	return entry.state === 'ok' ? { state: 'ok', data: record(entry.data) } : { state: 'unavailable' }
}

function daysLabel(days: number) {
	if (days < 0) return `已逾期 ${-days} 天`
	if (days === 0) return '今天到期'
	return `${days} 天后到期`
}

function dueSummary(due: Record<string, unknown>) {
	const buckets = record(due.buckets) as DueBuckets
	const next = (Array.isArray(due.next) ? due.next : []).map(record) as DueItem[]
	const overdue = count(buckets.overdue)
	const today = count(buckets.today)
	const week = count(buckets.week)
	const parts = [overdue ? `${overdue} 项逾期` : '', today ? `${today} 项今天到期` : '', week ? `${week} 项 7 天内到期` : ''].filter(Boolean)
	const first = next[0]
	const firstLabel = first?.name ? `最近：${first.name}（${daysLabel(count(first.daysLeft))}）` : ''
	return {
		text: parts.length ? [parts.join('，'), firstLabel].filter(Boolean).join(' · ') : '30 天内没有到期项目',
		tone: (overdue ? 'critical' : today || week ? 'warning' : 'ok') as TodayTone
	}
}

export function formatMoney(amountMinorUnits: number, currency: string) {
	try {
		return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountMinorUnits / 100)
	} catch {
		return `${(amountMinorUnits / 100).toFixed(2)} ${currency}`
	}
}

function formatShanghaiDate(value: unknown) {
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return ''
	return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date(value))
}

const STATUS_LABELS: Record<string, string> = {
	operational: '全部正常',
	degraded: '部分节点性能下降',
	partial_outage: '部分节点宕机',
	major_outage: '全部节点宕机',
	no_data: '暂无探测数据'
}

/**
 * Turns /api/admin/overview into the rows of the NoDesk "today" panel, worst news first.
 * Any block NoNo could not read becomes a muted row rather than disappearing.
 */
export function summarizeOverview(raw: unknown, basePath = ''): TodayRow[] {
	const overview = record(raw)
	const rows: TodayRow[] = []
	const unavailable = (id: TodayRow['id'], title: string, href: string) => rows.push({ id, title, subtitle: '暂时无法读取', href, tone: 'muted' })

	const notifications = block(overview.notifications)
	if (notifications.state === 'ok') {
		const unread = count(notifications.data.unread)
		const urgent = count(notifications.data.urgent)
		rows.push({
			id: 'notifications',
			title: '通知',
			subtitle: unread ? `${unread} 条未读${urgent ? `，其中 ${urgent} 条需要处理` : ''}` : '没有未读通知',
			href: `${basePath}/?settings=notifications`,
			tone: urgent ? 'warning' : 'ok'
		})
	} else unavailable('notifications', '通知', `${basePath}/?settings=notifications`)

	const nomoney = block(overview.nomoney)
	if (nomoney.state === 'ok') {
		const due = dueSummary(record(nomoney.data.due))
		const monthly = record(record(nomoney.data.spending).predictedMonthly)
		const spend = typeof monthly.amountMinorUnits === 'number' && typeof monthly.currency === 'string'
			? `每月约 ${formatMoney(monthly.amountMinorUnits, monthly.currency)}${monthly.complete === false ? '（部分币种未换算）' : ''}`
			: ''
		rows.push({ id: 'nomoney', title: 'NoMoney', subtitle: [due.text, spend].filter(Boolean).join(' · '), href: '/nomoney/dashboard', tone: due.tone })
	} else unavailable('nomoney', 'NoMoney', '/nomoney/dashboard')

	const yumi = block(overview.yumi)
	if (yumi.state === 'ok') {
		const status = record(yumi.data.status)
		const down = (Array.isArray(status.down) ? status.down : []).filter((name): name is string => typeof name === 'string')
		const overall = typeof status.overall === 'string' ? status.overall : 'no_data'
		const due = dueSummary(record(yumi.data.due))
		const health = down.length ? `宕机：${down.slice(0, 3).join('、')}${down.length > 3 ? ` 等 ${down.length} 台` : ''}` : STATUS_LABELS[overall] || overall
		const tone: TodayTone = down.length ? 'critical' : overall === 'degraded' || due.tone === 'warning' ? 'warning' : due.tone
		rows.push({ id: 'yumi', title: 'Yumi', subtitle: `${health} · ${due.text}`, href: '/yumi/dashboard', tone })
	} else unavailable('yumi', 'Yumi', '/yumi/dashboard')

	const links = block(overview.links)
	if (links.state === 'ok') {
		const broken = count(links.data.broken)
		rows.push({ id: 'links', title: '书签', subtitle: broken ? `${broken} 个书签无法访问` : `${count(links.data.total)} 个书签均可访问`, href: '/admin/links#bookmark-tools', tone: broken ? 'warning' : 'ok' })
	} else unavailable('links', '书签', '/admin/links')

	const nostar = block(overview.nostar)
	if (nostar.state === 'ok') {
		const releases = count(nostar.data.unreadReleases)
		rows.push({ id: 'nostar', title: 'NoStar', subtitle: releases ? `${releases} 个新 Release 未读` : '没有新的 Release', href: '/nostar/', tone: 'ok' })
	} else unavailable('nostar', 'NoStar', '/nostar/')

	const backup = block(overview.backup)
	if (backup.state === 'ok') {
		const lastSuccess = formatShanghaiDate(backup.data.lastSuccessAt)
		const failedAfterSuccess = typeof backup.data.lastFailureAt === 'string'
			&& (!backup.data.lastSuccessAt || Date.parse(backup.data.lastFailureAt) > Date.parse(String(backup.data.lastSuccessAt)))
		const subtitle = failedAfterSuccess
			? `最近一次自动备份失败${backup.data.lastError ? `：${String(backup.data.lastError)}` : ''}`
			: backup.data.enabled
				? (lastSuccess ? `自动备份已开启，最近成功 ${lastSuccess}` : '自动备份已开启，尚未成功运行')
				: '自动备份未开启'
		rows.push({ id: 'backup', title: '备份', subtitle, href: `${basePath}/?settings=backups`, tone: failedAfterSuccess ? 'critical' : backup.data.enabled ? 'ok' : 'warning' })
	} else unavailable('backup', '备份', `${basePath}/?settings=backups`)

	const rank: Record<TodayTone, number> = { critical: 0, warning: 1, ok: 2, muted: 3 }
	return rows.map((row, index) => ({ row, index })).sort((a, b) => rank[a.row.tone] - rank[b.row.tone] || a.index - b.index).map(entry => entry.row)
}
