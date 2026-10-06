export type Severity = 'info' | 'warning' | 'critical'
export type ChannelType = 'email' | 'webhook' | 'telegram' | 'bark'

export type NotificationFeedItem = {
	key: string
	source: string
	severity: Severity
	title: string
	description: string
	href: string
	targetUrl?: string | null
	read: boolean
}

export type NotificationChannel = {
	id: number
	type: string
	name: string
	enabled: boolean
	minSeverity: string
	/** Broken links arrive as one weekly digest instead of one push each. */
	linkDigest?: boolean
	config: Record<string, unknown>
	lastSuccessAt: string | null
	lastError: string | null
}

export type NotificationDelivery = {
	id: number
	source: string
	title: string
	status: 'sent' | 'failed'
	error: string | null
	attempts: number
	channel: { name: string; type: string }
	updatedAt: string
}

type ChannelField = { key: string; label: string; placeholder?: string; secret?: boolean; wide?: boolean; type?: string }

export const SEVERITY_LABELS: Record<Severity, string> = { info: '普通', warning: '重要', critical: '紧急' }

export const NOTIFICATION_SOURCES = [
	{ id: 'links', label: '书签' },
	{ id: 'nostar', label: 'NoStar' },
	{ id: 'nodesk', label: '日程' },
	{ id: 'nomoney', label: 'NoMoney' },
	{ id: 'yumi', label: 'Yumi' },
	{ id: 'backup', label: '备份' }
]

export const CHANNEL_TYPES: Record<ChannelType, { label: string; fields: ChannelField[]; hint?: string }> = {
	bark: {
		label: 'Bark（iPhone 推送）',
		fields: [{ key: 'url', label: 'Bark 推送地址', placeholder: 'https://api.day.app/你的 Key', secret: true, wide: true }],
		hint: '在 Bark App 中复制推送地址，包含你的 Key。'
	},
	telegram: {
		label: 'Telegram',
		fields: [
			{ key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC…', secret: true },
			{ key: 'chatId', label: 'Chat ID', placeholder: '例如 123456789' }
		],
		hint: '先用 @BotFather 创建机器人并给它发一条消息，再填写 Chat ID。'
	},
	webhook: {
		label: 'Webhook',
		fields: [{ key: 'url', label: 'Webhook 地址', placeholder: 'https://hooks.example.com/…', wide: true, type: 'url' }],
		hint: '以 JSON POST 发送 subject、text 和 content 字段，可直接用于 Slack、Discord 等兼容地址。'
	},
	email: {
		label: '邮件（SMTP）',
		fields: [
			{ key: 'host', label: 'SMTP 服务器', placeholder: 'smtp.example.com' },
			{ key: 'port', label: '端口', placeholder: '587', type: 'number' },
			{ key: 'user', label: '用户名' },
			{ key: 'password', label: '密码', secret: true },
			{ key: 'from', label: '发件人', placeholder: 'NoNo <noreply@example.com>' },
			{ key: 'to', label: '收件人', placeholder: 'me@example.com' }
		],
		hint: '端口 465 使用 SSL，其他端口按服务器支持自动升级到 STARTTLS。'
	}
}

export type ChannelDraft = {
	id?: number
	type: ChannelType
	name: string
	minSeverity: Severity
	linkDigest: boolean
	config: Record<string, string>
	/** Secret fields already stored on the server; a blank input keeps them. */
	secretsSet: Record<string, boolean>
}

export function emptyChannelDraft(type: ChannelType): ChannelDraft {
	return { type, name: '', minSeverity: 'warning', linkDigest: false, config: type === 'email' ? { port: '587' } : {}, secretsSet: {} }
}

export function channelDraftFromChannel(channel: NotificationChannel): ChannelDraft {
	const type = (channel.type in CHANNEL_TYPES ? channel.type : 'webhook') as ChannelType
	const config: Record<string, string> = {}
	const secretsSet: Record<string, boolean> = {}
	for (const field of CHANNEL_TYPES[type].fields) {
		const value = channel.config[field.key]
		config[field.key] = value === undefined || value === null ? '' : String(value)
		if (field.secret) secretsSet[field.key] = channel.config[`${field.key}Set`] === true
	}
	return { id: channel.id, type, name: channel.name, minSeverity: (channel.minSeverity as Severity) || 'warning', linkDigest: Boolean(channel.linkDigest), config, secretsSet }
}

/** The body for POST/PATCH; an empty name falls back to the channel type's label. */
export function channelPayload(draft: ChannelDraft) {
	const config: Record<string, string | number> = {}
	for (const field of CHANNEL_TYPES[draft.type].fields) {
		const value = (draft.config[field.key] || '').trim()
		if (field.type === 'number') {
			if (value) config[field.key] = Number(value)
			continue
		}
		config[field.key] = value
	}
	return { name: draft.name.trim() || CHANNEL_TYPES[draft.type].label, minSeverity: draft.minSeverity, linkDigest: draft.linkDigest, config }
}
