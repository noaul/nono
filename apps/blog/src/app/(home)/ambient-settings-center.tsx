'use client'

import {
	Archive,
	Bookmark,
	CheckCircle2,
	Cloud,
	Download,
	Github,
	LoaderCircle,
	Plus,
	Save,
	ShieldCheck,
	Smile,
	Trash2,
	UploadCloud,
	WalletCards,
	X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type BackupRecord = {
	id: string
	filename: string
	createdAt: string
	size: number
	status: 'verified'
	components: string[]
}

type BackupAutomationSettings = {
	enabled: boolean
	cadence: 'daily' | 'weekly'
	hour: number
	weekday: number
	retentionDays: number
	maxBackups: number
}

type BackupAutomationSnapshot = {
	settings: BackupAutomationSettings
	status: {
		lastSuccessAt: string | null
		lastFailureAt: string | null
		lastError: string | null
	}
}

type WebDavConfig = {
	id: string
	name: string
	url: string
	username: string
	password: string
	path: string
	isActive: boolean
}

type Props = {
	open: boolean
	onClose: () => void
	quickEntriesVisible: boolean
	onQuickEntriesVisibleChange: (visible: boolean) => Promise<void>
	initialTab?: 'desktop' | 'backups'
}

const DEFAULT_AUTOMATION: BackupAutomationSnapshot = {
	settings: { enabled: false, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 7 },
	status: { lastSuccessAt: null, lastFailureAt: null, lastError: null }
}

const EMPTY_WEBDAV: WebDavConfig = {
	id: '', name: '', url: '', username: '', password: '', path: '/nostar/', isActive: true
}

const MODULE_BACKUPS = [
	{ id: 'bookmarks', label: '书签', description: '浏览器书签 HTML', icon: Bookmark, href: '/api/admin/bookmarks/export' },
	{ id: 'nostar', label: 'NoStar', description: '仓库、分类、Release 与设置的 JSON', icon: Github },
	{ id: 'nomoney', label: 'NoMoney', description: '资产、费用和账户的加密 JSON', icon: WalletCards, href: '/nomoney/api/export/json' },
	{ id: 'yumi', label: 'Yumi', description: 'VPS、域名、监控和提醒的加密 JSON', icon: Smile, href: '/yumi/api/export/json' }
] as const

function apiData(value: unknown): unknown {
	if (!value || typeof value !== 'object') return value
	const record = value as Record<string, unknown>
	return 'data' in record ? record.data : value
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDate(value: string | null) {
	if (!value) return '暂无'
	return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function downloadJson(value: unknown, filename: string) {
	const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	URL.revokeObjectURL(url)
}

function webDavPath(base: string, filename = '') {
	const clean = base.trim().replace(/^\/+|\/+$/g, '')
	const prefix = clean ? `/${clean}` : ''
	return filename ? `${prefix}/${filename}` : `${prefix}/`
}

export function AmbientSettingsCenter({ open, onClose, quickEntriesVisible, onQuickEntriesVisibleChange, initialTab = 'desktop' }: Props) {
	const [tab, setTab] = useState<'desktop' | 'backups'>(initialTab)
	const [backups, setBackups] = useState<BackupRecord[]>([])
	const [automation, setAutomation] = useState<BackupAutomationSnapshot>(DEFAULT_AUTOMATION)
	const [webDavConfigs, setWebDavConfigs] = useState<WebDavConfig[]>([])
	const [webDavForm, setWebDavForm] = useState<WebDavConfig>(EMPTY_WEBDAV)
	const [backupLoading, setBackupLoading] = useState(false)
	const [creatingBackup, setCreatingBackup] = useState(false)
	const [savingAutomation, setSavingAutomation] = useState(false)
	const [savingVisibility, setSavingVisibility] = useState(false)
	const [savingWebDav, setSavingWebDav] = useState(false)
	const [testingWebDav, setTestingWebDav] = useState(false)
	const [uploadingWebDav, setUploadingWebDav] = useState(false)
	const [exportingModule, setExportingModule] = useState<string | null>(null)
	const [deletingBackup, setDeletingBackup] = useState('')
	const [message, setMessage] = useState('')
	const [error, setError] = useState('')
	const [settingsDialog, setSettingsDialog] = useState<HTMLElement | null>(null)
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	const loadBackups = async () => {
		setBackupLoading(true)
		setError('')
		try {
			const [backupResponse, automationResponse, webDavResponse] = await Promise.all([
				fetch('/api/admin/backups', { credentials: 'same-origin', cache: 'no-store' }),
				fetch('/api/admin/backups/automation', { credentials: 'same-origin', cache: 'no-store' }),
				fetch('/api/nostar/configs/webdav', { credentials: 'same-origin', cache: 'no-store' })
			])
			if (!backupResponse.ok || !automationResponse.ok) throw new Error(backupResponse.status === 403 ? '备份中心仅管理员可用。' : '无法读取本地备份设置。')
			if (!webDavResponse.ok) throw new Error('无法读取 WebDAV 设置。')
			const backupValue = apiData(await backupResponse.json()) as { backups?: BackupRecord[] }
			const automationValue = apiData(await automationResponse.json()) as BackupAutomationSnapshot
			const webDavValue = apiData(await webDavResponse.json()) as WebDavConfig[]
			const configs = Array.isArray(webDavValue) ? webDavValue : []
			setBackups(Array.isArray(backupValue?.backups) ? backupValue.backups : [])
			setAutomation(automationValue?.settings ? automationValue : DEFAULT_AUTOMATION)
			setWebDavConfigs(configs)
			setWebDavForm(configs.find(config => config.isActive) || configs[0] || EMPTY_WEBDAV)
		} catch (event) {
			setError(event instanceof Error ? event.message : '无法读取备份设置。')
		} finally {
			setBackupLoading(false)
		}
	}

	useEffect(() => {
		if (!open) return
		setTab(initialTab)
	}, [initialTab, open])

	useEffect(() => {
		if (!open || tab !== 'backups') return
		void loadBackups()
	}, [open, tab])

	useEffect(() => {
		if (!open) return
		const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
		const focusable = () => Array.from(settingsDialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
		focusable()[0]?.focus()
		const close = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault()
				onCloseRef.current()
				return
			}
			if (event.key !== 'Tab') return
			const items = focusable()
			if (!items.length) return
			const first = items[0]
			const last = items[items.length - 1]
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault()
				first.focus()
			}
		}
		window.addEventListener('keydown', close)
		return () => {
			window.removeEventListener('keydown', close)
			previouslyFocused?.focus()
		}
	}, [open, settingsDialog])

	if (!open) return null

	const createFullBackup = async () => {
		if (creatingBackup) return
		setCreatingBackup(true)
		setMessage('')
		setError('')
		try {
			const response = await fetch('/api/admin/backups', { method: 'POST', credentials: 'same-origin' })
			if (!response.ok) throw new Error('全站备份创建失败。')
			const value = apiData(await response.json()) as { backup?: BackupRecord; automation?: BackupAutomationSnapshot }
			if (value?.backup) setBackups(current => [value.backup!, ...current.filter(item => item.id !== value.backup!.id)])
			if (value?.automation) setAutomation(value.automation)
			setMessage('全站备份已创建并校验。')
		} catch (event) {
			setError(event instanceof Error ? event.message : '全站备份创建失败。')
		} finally {
			setCreatingBackup(false)
		}
	}

	const saveAutomation = async () => {
		setSavingAutomation(true)
		setMessage('')
		setError('')
		try {
			const response = await fetch('/api/admin/backups/automation', {
				method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(automation.settings)
			})
			if (!response.ok) throw new Error('自动备份策略保存失败。')
			setAutomation(apiData(await response.json()) as BackupAutomationSnapshot)
			await loadBackups()
			setMessage('自动备份策略已保存，超出上限的旧备份已清理。')
		} catch (event) {
			setError(event instanceof Error ? event.message : '自动备份策略保存失败。')
		} finally {
			setSavingAutomation(false)
		}
	}

	const deleteBackup = async (backup: BackupRecord) => {
		if (!window.confirm(`删除备份 ${backup.filename}？`)) return
		setDeletingBackup(backup.id)
		setError('')
		try {
			const response = await fetch(`/api/admin/backups/${encodeURIComponent(backup.id)}`, { method: 'DELETE', credentials: 'same-origin' })
			if (!response.ok) throw new Error('备份删除失败。')
			setBackups(current => current.filter(item => item.id !== backup.id))
			setMessage('备份已删除。')
		} catch (event) {
			setError(event instanceof Error ? event.message : '备份删除失败。')
		} finally {
			setDeletingBackup('')
		}
	}

	const updateVisibility = async (visible: boolean) => {
		if (savingVisibility) return
		setSavingVisibility(true)
		setMessage('')
		setError('')
		try {
			await onQuickEntriesVisibleChange(visible)
			setMessage('桌面设置已保存。')
		} catch (event) {
			setError(event instanceof Error ? event.message : '桌面设置保存失败。')
		} finally {
			setSavingVisibility(false)
		}
	}

	const exportNoStar = async () => {
		setExportingModule('nostar')
		setMessage('')
		setError('')
		try {
			const response = await fetch('/api/nostar/sync/export', { method: 'POST', credentials: 'same-origin' })
			if (!response.ok) throw new Error('NoStar 备份导出失败。')
			downloadJson(await response.json(), `nostar-backup-${new Date().toISOString().slice(0, 10)}.json`)
			setMessage('NoStar JSON 备份已下载。')
		} catch (event) {
			setError(event instanceof Error ? event.message : 'NoStar 备份导出失败。')
		} finally {
			setExportingModule(null)
		}
	}

	const saveWebDav = async () => {
		if (!webDavForm.name.trim() || !webDavForm.url.trim() || !webDavForm.username.trim() || !webDavForm.password || !webDavForm.path.trim()) {
			setError('请完整填写 WebDAV 名称、地址、用户名、密码和路径。')
			return
		}
		setSavingWebDav(true)
		setMessage('')
		setError('')
		try {
			const saved = { ...webDavForm, id: webDavForm.id || crypto.randomUUID(), isActive: true, url: webDavForm.url.replace(/\/+$/, '') }
			const configs = [...webDavConfigs.filter(config => config.id !== saved.id).map(config => ({ ...config, isActive: false })), saved]
			const response = await fetch('/api/nostar/configs/webdav/bulk', {
				method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ configs })
			})
			if (!response.ok) throw new Error('WebDAV 设置保存失败。')
			setWebDavConfigs(configs)
			setWebDavForm(saved)
			setMessage('WebDAV 设置已保存。')
		} catch (event) {
			setError(event instanceof Error ? event.message : 'WebDAV 设置保存失败。')
		} finally {
			setSavingWebDav(false)
		}
	}

	const removeWebDav = async () => {
		if (!webDavForm.id || !window.confirm(`删除 WebDAV 配置 ${webDavForm.name}？`)) return
		setSavingWebDav(true)
		try {
			const configs = webDavConfigs.filter(config => config.id !== webDavForm.id)
			if (configs[0]) configs[0] = { ...configs[0], isActive: true }
			const response = await fetch('/api/nostar/configs/webdav/bulk', {
				method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ configs })
			})
			if (!response.ok) throw new Error('WebDAV 配置删除失败。')
			setWebDavConfigs(configs)
			setWebDavForm(configs[0] || EMPTY_WEBDAV)
			setMessage('WebDAV 配置已删除。')
		} catch (event) {
			setError(event instanceof Error ? event.message : 'WebDAV 配置删除失败。')
		} finally {
			setSavingWebDav(false)
		}
	}

	const callWebDav = async (body: Record<string, unknown>) => {
		if (!webDavForm.id) throw new Error('请先保存 WebDAV 配置。')
		const response = await fetch('/api/nostar/proxy/webdav', {
			method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ configId: webDavForm.id, ...body })
		})
		if (!response.ok) throw new Error(`WebDAV 请求失败（HTTP ${response.status}）。`)
		return response
	}

	const testWebDav = async () => {
		setTestingWebDav(true)
		setMessage('')
		setError('')
		try {
			await callWebDav({ method: 'PROPFIND', path: webDavPath(webDavForm.path), headers: { Depth: '0' } })
			setMessage('WebDAV 连接正常。')
		} catch (event) {
			setError(event instanceof Error ? event.message : 'WebDAV 连接测试失败。')
		} finally {
			setTestingWebDav(false)
		}
	}

	const uploadNoStarToWebDav = async () => {
		setUploadingWebDav(true)
		setMessage('')
		setError('')
		try {
			const exportResponse = await fetch('/api/nostar/sync/export', { method: 'POST', credentials: 'same-origin' })
			if (!exportResponse.ok) throw new Error('NoStar 数据导出失败。')
			const data = await exportResponse.json()
			const filename = `nostar-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
			await callWebDav({
				method: 'PUT', path: webDavPath(webDavForm.path, filename), body: JSON.stringify(data, null, 2), headers: { 'Content-Type': 'application/json' }
			})
			setMessage(`NoStar 已备份到 WebDAV：${filename}`)
		} catch (event) {
			setError(event instanceof Error ? event.message : 'WebDAV 备份失败。')
		} finally {
			setUploadingWebDav(false)
		}
	}

	const setAutomationSetting = <K extends keyof BackupAutomationSettings>(key: K, value: BackupAutomationSettings[K]) => {
		setAutomation(current => ({ ...current, settings: { ...current.settings, [key]: value } }))
	}

	return <div className='ambient-settings-backdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
		<section ref={setSettingsDialog} className='ambient-settings-dialog' role='dialog' aria-modal='true' aria-label='NoDesk 设置'>
			<header className='ambient-settings-header'>
				<div><span><Archive size={15} /> NoDesk</span><h2>设置</h2></div>
				<button type='button' onClick={onClose} aria-label='关闭设置'><X size={20} /></button>
			</header>

			<div className='ambient-settings-tabs' role='tablist' aria-label='设置分类'>
				<button type='button' role='tab' aria-selected={tab === 'desktop'} tabIndex={tab === 'desktop' ? 0 : -1} className={tab === 'desktop' ? 'is-active' : ''} onClick={() => setTab('desktop')}>桌面</button>
				<button type='button' role='tab' aria-selected={tab === 'backups'} tabIndex={tab === 'backups' ? 0 : -1} className={tab === 'backups' ? 'is-active' : ''} onClick={() => setTab('backups')}>备份与恢复</button>
			</div>

			<div className='ambient-settings-body'>
				{message && <div className='ambient-settings-message is-success'>{message}</div>}
				{error && <div className='ambient-settings-message is-error'>{error}</div>}

				{tab === 'desktop' && <section className='ambient-settings-section'>
					<div className='ambient-settings-section-copy'><h3>应用快捷入口</h3><p>顶部中央入口仅在鼠标移入或键盘聚焦时展开。</p></div>
					<label className='ambient-settings-toggle'>
						<span><strong>显示应用快捷入口</strong><small>关闭后仍可从书签和各模块地址直接访问。</small></span>
						<input type='checkbox' checked={quickEntriesVisible} disabled={savingVisibility} onChange={event => void updateVisibility(event.target.checked)} />
						<i aria-hidden='true' />
					</label>
				</section>}

				{tab === 'backups' && <div className='ambient-backup-stack'>
					<section className='ambient-settings-section ambient-full-backup'>
						<div className='ambient-backup-heading'>
							<span className='ambient-backup-icon'><Archive size={22} /></span>
							<div><h3>本地全站备份</h3><p>包含 PostgreSQL、NoDesk 内容、NoMoney 和 Yumi 数据。</p></div>
							<button type='button' disabled={creatingBackup} onClick={() => void createFullBackup()}>{creatingBackup ? <LoaderCircle className='is-spinning' size={17} /> : <Archive size={17} />}立即备份</button>
						</div>

						<div className='ambient-backup-policy'>
							<label className='ambient-policy-toggle'><input type='checkbox' checked={automation.settings.enabled} onChange={event => setAutomationSetting('enabled', event.target.checked)} /><span>自动备份</span></label>
							<label><span>频率</span><select value={automation.settings.cadence} onChange={event => setAutomationSetting('cadence', event.target.value as 'daily' | 'weekly')}><option value='daily'>每天</option><option value='weekly'>每周</option></select></label>
							{automation.settings.cadence === 'weekly' && <label><span>星期</span><select value={automation.settings.weekday} onChange={event => setAutomationSetting('weekday', Number(event.target.value))}><option value={0}>周日</option><option value={1}>周一</option><option value={2}>周二</option><option value={3}>周三</option><option value={4}>周四</option><option value={5}>周五</option><option value={6}>周六</option></select></label>}
							<label><span>执行小时</span><input type='number' min={0} max={23} value={automation.settings.hour} onChange={event => setAutomationSetting('hour', Number(event.target.value))} /></label>
							<label><span>保留天数</span><input data-testid='backup-retention-days' type='number' min={1} max={3650} value={automation.settings.retentionDays} onChange={event => setAutomationSetting('retentionDays', Number(event.target.value))} /></label>
							<label><span>最多份数</span><input data-testid='backup-max-count' type='number' min={2} max={365} value={automation.settings.maxBackups} onChange={event => setAutomationSetting('maxBackups', Number(event.target.value))} /></label>
							<button type='button' disabled={savingAutomation} onClick={() => void saveAutomation()}>{savingAutomation ? <LoaderCircle className='is-spinning' size={16} /> : <Save size={16} />}保存策略</button>
						</div>
						<div className='ambient-backup-status'>最近成功：{formatDate(automation.status.lastSuccessAt)}{automation.status.lastError && <span>最近失败：{automation.status.lastError}</span>}</div>

						<div className='ambient-backup-history-head'><strong>完整历史</strong><span>{backups.length} 份</span></div>
						{backupLoading ? <div className='ambient-backup-loading'><LoaderCircle className='is-spinning' size={20} /> 正在读取备份</div> : backups.length ? <div className='ambient-backup-history'>
							{backups.map(backup => <div className='ambient-backup-history-row' key={backup.id}>
								<span><CheckCircle2 size={16} /><strong>{formatDate(backup.createdAt)}</strong><small>{formatBytes(backup.size)} · {backup.components.join(' / ')}</small></span>
								<a href={`/api/admin/backups/${backup.id}/download`} title='下载备份' aria-label={`下载 ${backup.filename}`}><Download size={16} /></a>
								<button type='button' disabled={deletingBackup === backup.id} title='删除备份' aria-label={`删除 ${backup.filename}`} onClick={() => void deleteBackup(backup)}>{deletingBackup === backup.id ? <LoaderCircle className='is-spinning' size={16} /> : <Trash2 size={16} />}</button>
							</div>)}
						</div> : <div className='ambient-backup-empty'>还没有全站备份。</div>}
					</section>

					<section className='ambient-settings-section'>
						<div className='ambient-backup-heading'>
							<span className='ambient-backup-icon'><Cloud size={22} /></span>
							<div><h3>NoStar WebDAV 备份</h3><p>配置保存在 Nono 服务端，密码加密存储；这里只上传 NoStar JSON。</p></div>
							<button type='button' onClick={() => setWebDavForm(EMPTY_WEBDAV)}><Plus size={16} />新增</button>
						</div>
						{webDavConfigs.length > 0 && <label className='ambient-webdav-select'><span>已保存配置</span><select value={webDavForm.id} onChange={event => setWebDavForm(webDavConfigs.find(config => config.id === event.target.value) || EMPTY_WEBDAV)}>{webDavConfigs.map(config => <option value={config.id} key={config.id}>{config.name}{config.isActive ? ' · 当前' : ''}</option>)}</select></label>}
						<div className='ambient-webdav-grid'>
							<label><span>名称</span><input value={webDavForm.name} onChange={event => setWebDavForm(current => ({ ...current, name: event.target.value }))} placeholder='坚果云' /></label>
							<label><span>WebDAV 地址</span><input type='url' value={webDavForm.url} onChange={event => setWebDavForm(current => ({ ...current, url: event.target.value }))} placeholder='https://dav.example.com/' /></label>
							<label><span>用户名</span><input value={webDavForm.username} onChange={event => setWebDavForm(current => ({ ...current, username: event.target.value }))} /></label>
							<label><span>密码 / 应用密码</span><input type='password' value={webDavForm.password} onChange={event => setWebDavForm(current => ({ ...current, password: event.target.value }))} /></label>
							<label className='is-wide'><span>备份目录</span><input value={webDavForm.path} onChange={event => setWebDavForm(current => ({ ...current, path: event.target.value }))} placeholder='/nostar/' /></label>
						</div>
						<div className='ambient-webdav-actions'>
							<button type='button' disabled={savingWebDav} onClick={() => void saveWebDav()}>{savingWebDav ? <LoaderCircle className='is-spinning' size={16} /> : <Save size={16} />}保存</button>
							<button type='button' disabled={testingWebDav || !webDavForm.id} onClick={() => void testWebDav()}>{testingWebDav ? <LoaderCircle className='is-spinning' size={16} /> : <CheckCircle2 size={16} />}测试</button>
							<button type='button' disabled={uploadingWebDav || !webDavForm.id} onClick={() => void uploadNoStarToWebDav()}>{uploadingWebDav ? <LoaderCircle className='is-spinning' size={16} /> : <UploadCloud size={16} />}备份 NoStar</button>
							{webDavForm.id && <button className='is-danger' type='button' disabled={savingWebDav} onClick={() => void removeWebDav()}><Trash2 size={16} />删除</button>}
						</div>
					</section>

					<section className='ambient-settings-section'>
						<div className='ambient-settings-section-copy'><h3>模块独立下载</h3><p>模块备份使用各自格式；全站本地备份仍按上方策略统一保留。</p></div>
						<div className='ambient-module-backups'>
							{MODULE_BACKUPS.map(item => {
								const Icon = item.icon
								return <div className='ambient-module-backup' key={item.id}>
									<span className='ambient-module-icon'><Icon size={19} /></span>
									<span><strong>{item.label}</strong><small>{item.description}</small></span>
									{item.id === 'nostar' ? <button type='button' disabled={exportingModule === item.id} onClick={() => void exportNoStar()}>{exportingModule === item.id ? <LoaderCircle className='is-spinning' size={16} /> : <Download size={16} />}<span>下载</span></button> : <a href={item.href}><Download size={16} /><span>下载</span></a>}
								</div>
							})}
						</div>
						<div className='ambient-backup-note'><ShieldCheck size={17} /><span>独立导出默认不展示明文密钥；NoStar WebDAV 备份使用上方当前配置。</span></div>
					</section>
				</div>}
			</div>
		</section>
	</div>
}
