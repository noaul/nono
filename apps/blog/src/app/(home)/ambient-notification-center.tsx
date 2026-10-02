'use client'

import { Bell, BellRing, CheckCheck, CheckCircle2, History, LoaderCircle, Pencil, Plus, Save, Send, Trash2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
	CHANNEL_TYPES,
	channelDraftFromChannel,
	channelPayload,
	emptyChannelDraft,
	NOTIFICATION_SOURCES,
	SEVERITY_LABELS,
	type ChannelDraft,
	type ChannelType,
	type NotificationChannel,
	type NotificationDelivery,
	type NotificationFeedItem,
	type Severity
} from './notification-center-model'

type Page = 'feed' | 'channels' | 'deliveries'

const PAGES: Array<{ id: Page; label: string; icon: typeof Bell }> = [
	{ id: 'feed', label: '通知', icon: Bell },
	{ id: 'channels', label: '推送渠道', icon: BellRing },
	{ id: 'deliveries', label: '发送记录', icon: History }
]

function unwrap<T>(value: unknown): T {
	if (value && typeof value === 'object' && 'data' in value) return (value as { data: T }).data
	return value as T
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init })
	const payload = await response.json().catch(() => null) as { message?: string } | null
	if (!response.ok) throw new Error(payload?.message || `请求失败（HTTP ${response.status}）`)
	return unwrap<T>(payload)
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
	method,
	headers: { 'content-type': 'application/json' },
	body: body === undefined ? undefined : JSON.stringify(body)
})

function formatDate(value: string | null) {
	if (!value) return '暂无'
	return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(value))
}

/** NoDesk is the one place to read notifications and decide where NoNo, NoMoney and Yumi push them. */
export function AmbientNotificationCenter() {
	const [page, setPage] = useState<Page>('feed')
	const [feed, setFeed] = useState<NotificationFeedItem[]>([])
	const [source, setSource] = useState('')
	const [channels, setChannels] = useState<NotificationChannel[]>([])
	const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([])
	const [draft, setDraft] = useState<ChannelDraft | null>(null)
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState('')
	const [message, setMessage] = useState('')
	const [error, setError] = useState('')

	const visibleFeed = useMemo(() => source ? feed.filter(item => item.source === source) : feed, [feed, source])
	const unread = feed.filter(item => !item.read).length

	const load = async () => {
		setLoading(true)
		setError('')
		try {
			const [nextFeed, nextChannels, nextDeliveries] = await Promise.all([
				requestData<{ items: NotificationFeedItem[] }>('/api/admin/notifications?limit=100'),
				requestData<{ items: NotificationChannel[] }>('/api/admin/notification-channels'),
				requestData<{ items: NotificationDelivery[] }>('/api/admin/notification-deliveries?limit=50')
			])
			setFeed(nextFeed.items)
			setChannels(nextChannels.items)
			setDeliveries(nextDeliveries.items)
		} catch (event) {
			setError(event instanceof Error ? event.message : '通知中心加载失败。')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => { void load() }, [])

	const run = async (key: string, action: () => Promise<void>) => {
		if (busy) return
		setBusy(key)
		setMessage('')
		setError('')
		try {
			await action()
		} catch (event) {
			setError(event instanceof Error ? event.message : '操作失败。')
		} finally {
			setBusy('')
		}
	}

	const markRead = (item: NotificationFeedItem) => run(`read-${item.key}`, async () => {
		await requestData(`/api/admin/notifications/${encodeURIComponent(item.key)}/read`, jsonInit('PUT', { read: !item.read }))
		setFeed(current => current.map(entry => entry.key === item.key ? { ...entry, read: !item.read } : entry))
	})

	const dismiss = (item: NotificationFeedItem) => run(`dismiss-${item.key}`, async () => {
		await requestData(`/api/admin/notifications/${encodeURIComponent(item.key)}`, { method: 'DELETE' })
		setFeed(current => current.filter(entry => entry.key !== item.key))
	})

	const markAllRead = () => run('read-all', async () => {
		await requestData('/api/admin/notifications/mark-all-read', jsonInit('POST', source ? { sources: [source] } : {}))
		setFeed(current => current.map(entry => !source || entry.source === source ? { ...entry, read: true } : entry))
		setMessage('已全部标记为已读。')
	})

	const saveChannel = () => {
		if (!draft) return
		void run('save-channel', async () => {
			const payload = channelPayload(draft)
			const saved = draft.id
				? await requestData<NotificationChannel>(`/api/admin/notification-channels/${draft.id}`, jsonInit('PATCH', payload))
				: await requestData<NotificationChannel>('/api/admin/notification-channels', jsonInit('POST', { type: draft.type, ...payload }))
			setChannels(current => draft.id ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
			setDraft(null)
			setMessage(`渠道“${saved.name}”已保存。`)
		})
	}

	const toggleChannel = (channel: NotificationChannel) => run(`toggle-${channel.id}`, async () => {
		const saved = await requestData<NotificationChannel>(`/api/admin/notification-channels/${channel.id}`, jsonInit('PATCH', { enabled: !channel.enabled }))
		setChannels(current => current.map(item => item.id === saved.id ? saved : item))
	})

	const testChannel = (channel: NotificationChannel) => run(`test-${channel.id}`, async () => {
		const result = await requestData<{ ok: boolean; error?: string }>(`/api/admin/notification-channels/${channel.id}/test`, jsonInit('POST', {}))
		if (!result.ok) throw new Error(`测试失败：${result.error || '渠道没有接受消息'}`)
		setMessage(`测试消息已发送到“${channel.name}”，请检查是否收到。`)
		setChannels(current => current.map(item => item.id === channel.id ? { ...item, lastError: null, lastSuccessAt: new Date().toISOString() } : item))
	})

	const removeChannel = (channel: NotificationChannel) => {
		if (!window.confirm(`删除推送渠道“${channel.name}”？`)) return
		void run(`delete-${channel.id}`, async () => {
			await requestData(`/api/admin/notification-channels/${channel.id}`, { method: 'DELETE' })
			setChannels(current => current.filter(item => item.id !== channel.id))
			setMessage('渠道已删除。')
		})
	}

	const updateDraft = (field: string, value: string) => setDraft(current => current && ({ ...current, config: { ...current.config, [field]: value } }))
	const typeInfo = draft ? CHANNEL_TYPES[draft.type] : null

	return <div className='ambient-backup-center ambient-notification-center'>
		<div className='ambient-backup-subnav' role='tablist' aria-label='通知中心功能'>
			{PAGES.map(item => {
				const Icon = item.icon
				return <button type='button' role='tab' aria-selected={page === item.id} key={item.id} className={page === item.id ? 'is-active' : ''} onClick={() => setPage(item.id)}><Icon size={15} />{item.label}{item.id === 'feed' && unread > 0 && <b className='ambient-notification-count'>{unread}</b>}</button>
			})}
		</div>

		{message && <div className='ambient-settings-message is-success'>{message}</div>}
		{error && <div className='ambient-settings-message is-error'>{error}</div>}

		{loading ? <div className='ambient-backup-loading'><LoaderCircle className='is-spinning' size={20} />正在读取通知</div> : <>
			{page === 'feed' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header ambient-backup-history-head'>
					<span><h3>通知</h3><p>书签、NoStar、日程、NoMoney、Yumi 与备份的提醒集中在这里。</p></span>
					<span className='ambient-notification-toolbar'>
						<select value={source} onChange={event => setSource(event.target.value)} aria-label='按来源筛选'><option value=''>全部来源</option>{NOTIFICATION_SOURCES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
						<button type='button' disabled={Boolean(busy) || !visibleFeed.some(item => !item.read)} onClick={() => void markAllRead()}><CheckCheck size={15} />全部已读</button>
					</span>
				</div>
				{visibleFeed.length ? <div className='ambient-batch-history'>{visibleFeed.map(item => <div className={`ambient-batch-row ambient-notification-row is-${item.severity}${item.read ? ' is-read' : ''}`} key={item.key}>
					<span className='ambient-batch-state' title={SEVERITY_LABELS[item.severity]}>{item.severity === 'critical' ? <XCircle size={16} /> : <Bell size={16} />}</span>
					<span><strong>{item.href ? <a href={item.targetUrl || item.href}>{item.title}</a> : item.title}</strong><small>{NOTIFICATION_SOURCES.find(entry => entry.id === item.source)?.label || item.source} · {item.description}</small></span>
					<button type='button' title={item.read ? '标记为未读' : '标记为已读'} disabled={Boolean(busy)} onClick={() => void markRead(item)}><CheckCircle2 size={15} /></button>
					<button type='button' title='忽略这条通知' disabled={Boolean(busy)} onClick={() => void dismiss(item)}><Trash2 size={15} /></button>
				</div>)}</div> : <div className='ambient-backup-empty'>没有需要处理的通知。</div>}
			</section>}

			{page === 'channels' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header ambient-backup-history-head'>
					<span><h3>推送渠道</h3><p>NoNo 的新通知每 5 分钟汇总推送一次；NoMoney 到期提醒和 Yumi 宕机告警会立即推送到管理员的渠道。</p></span>
					{!draft && <button type='button' onClick={() => setDraft(emptyChannelDraft('bark'))}><Plus size={15} />添加渠道</button>}
				</div>

				{draft && typeInfo && <div className='ambient-backup-policy-block'>
					<div className='ambient-webdav-grid'>
						<label><span>类型</span><select value={draft.type} disabled={Boolean(draft.id)} onChange={event => setDraft(emptyChannelDraft(event.target.value as ChannelType))}>{(Object.keys(CHANNEL_TYPES) as ChannelType[]).map(type => <option key={type} value={type}>{CHANNEL_TYPES[type].label}</option>)}</select></label>
						<label><span>名称</span><input value={draft.name} maxLength={80} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={typeInfo.label} /></label>
						<label><span>推送级别</span><select value={draft.minSeverity} onChange={event => setDraft({ ...draft, minSeverity: event.target.value as Severity })}>{(Object.keys(SEVERITY_LABELS) as Severity[]).map(level => <option key={level} value={level}>{SEVERITY_LABELS[level]}及以上</option>)}</select></label>
						{typeInfo.fields.map(field => <label key={field.key} className={field.wide ? 'is-wide' : ''}>
							<span>{field.label}</span>
							<input type={field.secret ? 'password' : field.type || 'text'} autoComplete='off' value={draft.config[field.key] || ''} placeholder={field.secret && draft.secretsSet[field.key] ? '已保存，留空不修改' : field.placeholder} onChange={event => updateDraft(field.key, event.target.value)} />
						</label>)}
					</div>
					{typeInfo.hint && <p className='ambient-notification-hint'>{typeInfo.hint}</p>}
					<div className='ambient-webdav-actions'>
						<button type='button' disabled={Boolean(busy)} onClick={saveChannel}>{busy === 'save-channel' ? <LoaderCircle className='is-spinning' size={16} /> : <Save size={16} />}保存渠道</button>
						<button type='button' disabled={Boolean(busy)} onClick={() => setDraft(null)}>取消</button>
					</div>
				</div>}

				{channels.length ? <div className='ambient-batch-history'>{channels.map(channel => <div className='ambient-batch-row ambient-channel-row' key={channel.id}>
					<span className='ambient-batch-state'>{channel.lastError ? <XCircle size={16} /> : <CheckCircle2 size={16} />}</span>
					<span><strong>{channel.name}</strong><small>{CHANNEL_TYPES[channel.type as ChannelType]?.label || channel.type} · {SEVERITY_LABELS[channel.minSeverity as Severity] || channel.minSeverity}及以上 · {channel.lastError ? `最近失败：${channel.lastError}` : `最近成功：${formatDate(channel.lastSuccessAt)}`}</small></span>
					<label className='ambient-policy-toggle' title={channel.enabled ? '已启用' : '已停用'}><input type='checkbox' checked={channel.enabled} disabled={Boolean(busy)} onChange={() => void toggleChannel(channel)} /><span>{channel.enabled ? '启用' : '停用'}</span></label>
					<button type='button' title='发送测试消息' disabled={Boolean(busy)} onClick={() => void testChannel(channel)}>{busy === `test-${channel.id}` ? <LoaderCircle className='is-spinning' size={15} /> : <Send size={15} />}</button>
					<button type='button' title='编辑' disabled={Boolean(busy)} onClick={() => setDraft(channelDraftFromChannel(channel))}><Pencil size={15} /></button>
					<button type='button' title='删除' disabled={Boolean(busy)} onClick={() => removeChannel(channel)}><Trash2 size={15} /></button>
				</div>)}</div> : !draft && <div className='ambient-backup-empty'>还没有推送渠道。添加 Bark 或 Telegram 后，手机上就能收到提醒。</div>}
			</section>}

			{page === 'deliveries' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header'><h3>发送记录</h3><p>最近 50 次推送。失败的通知会在后续轮次重试，最多 3 次。</p></div>
				{deliveries.length ? <div className='ambient-batch-history'>{deliveries.map(item => <div className={`ambient-batch-row${item.status === 'failed' ? ' is-error' : ''}`} key={item.id}>
					<span className='ambient-batch-state'>{item.status === 'sent' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
					<span><strong>{item.title}</strong><small>{NOTIFICATION_SOURCES.find(entry => entry.id === item.source)?.label || item.source} → {item.channel.name} · {formatDate(item.updatedAt)}{item.status === 'failed' ? ` · 失败 ${item.attempts} 次：${item.error || ''}` : ''}</small></span>
				</div>)}</div> : <div className='ambient-backup-empty'>还没有推送记录。</div>}
			</section>}
		</>}
	</div>
}
