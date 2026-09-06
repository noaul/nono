'use client'

import {
	Archive,
	CheckCircle2,
	Cloud,
	DatabaseBackup,
	Download,
	FolderArchive,
	Github,
	History,
	LoaderCircle,
	RefreshCcw,
	Save,
	ServerCog,
	Settings2,
	ShieldCheck,
	Trash2,
	Upload,
	WalletCards
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { runBackupJob, type BackupJob } from './backup-job-client'

type BackupModule = 'nono' | 'nodesk' | 'nostar' | 'nomoney' | 'yumi'
type Destination = 'webdav' | 'local'
type WebDavPage = 'operations' | 'automatic' | 'history' | 'connection'
type LocalPage = 'download' | 'restore'

type WebDavConfig = {
	url: string
	username: string
	passwordConfigured: boolean
	rootPath: '/nono/'
}
type BatchModule = {
	module: BackupModule
	path: string
	filename: string
	size: number
	sha256: string
	status: 'verified'
}

type BackupBatch = {
	id: string
	scope: 'full' | 'module'
	createdAt: string
	sourceCommit: string
	modules: Partial<Record<BackupModule, BatchModule>>
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

const MODULES: Array<{ id: BackupModule; label: string; description: string; icon: typeof Archive }> = [
	{ id: 'nono', label: 'Nono', description: '站点、文件夹与书签', icon: DatabaseBackup },
	{ id: 'nodesk', label: 'NoDesk', description: '桌面内容与资源文件', icon: FolderArchive },
	{ id: 'nostar', label: 'NoStar', description: '仓库、分类、Release 与设置', icon: Github },
	{ id: 'nomoney', label: 'NoMoney', description: '资产、费用与账户', icon: WalletCards },
	{ id: 'yumi', label: 'Yumi', description: 'VPS、域名、监控与提醒', icon: ServerCog }
]

const DEFAULT_CONFIG: WebDavConfig = { url: '', username: '', passwordConfigured: false, rootPath: '/nono/' }
const DEFAULT_AUTOMATION: BackupAutomationSnapshot = {
	settings: { enabled: false, cadence: 'daily', hour: 3, weekday: 0, retentionDays: 30, maxBackups: 7 },
	status: { lastSuccessAt: null, lastFailureAt: null, lastError: null }
}

const WEBDAV_PAGES: Array<{ id: WebDavPage; label: string; icon: typeof Archive }> = [
	{ id: 'operations', label: '备份与恢复', icon: RefreshCcw },
	{ id: 'automatic', label: '自动备份', icon: DatabaseBackup },
	{ id: 'history', label: '历史记录', icon: History },
	{ id: 'connection', label: '连接设置', icon: Settings2 }
]

const LOCAL_PAGES: Array<{ id: LocalPage; label: string; icon: typeof Archive }> = [
	{ id: 'download', label: '下载备份', icon: Download },
	{ id: 'restore', label: '上传与恢复', icon: Upload }
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

function formatDate(value: string | null) {
	if (!value) return '暂无'
	return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(value))
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AmbientBackupCenter() {
	const [destination, setDestination] = useState<Destination>('webdav')
	const [webDavPage, setWebDavPage] = useState<WebDavPage>('operations')
	const [localPage, setLocalPage] = useState<LocalPage>('download')
	const [config, setConfig] = useState<WebDavConfig>(DEFAULT_CONFIG)
	const [connectionForm, setConnectionForm] = useState({ url: '', username: '', password: '' })
	const [automation, setAutomation] = useState<BackupAutomationSnapshot>(DEFAULT_AUTOMATION)
	const [batches, setBatches] = useState<BackupBatch[]>([])
	const [fullRestoreId, setFullRestoreId] = useState('')
	const [moduleRestoreIds, setModuleRestoreIds] = useState<Partial<Record<BackupModule, string>>>({})
	const [localRestoreModule, setLocalRestoreModule] = useState<BackupModule | 'all'>('all')
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState('')
	const [message, setMessage] = useState('')
	const [error, setError] = useState('')
	const [jobs, setJobs] = useState<BackupJob[]>([])
	const fileInputRef = useRef<HTMLInputElement>(null)

	const fullBatches = useMemo(() => batches.filter(batch => MODULES.every(module => batch.modules[module.id])), [batches])

	const load = async () => {
		setLoading(true)
		setError('')
		try {
			const [nextConfig, nextAutomation] = await Promise.all([
				requestData<WebDavConfig>('/api/admin/backup-center/webdav/config'),
				requestData<BackupAutomationSnapshot>('/api/admin/backups/automation')
			])
			setConfig(nextConfig)
			setConnectionForm({ url: nextConfig.url, username: nextConfig.username, password: '' })
			setAutomation(nextAutomation?.settings ? nextAutomation : DEFAULT_AUTOMATION)
			if (nextConfig.passwordConfigured) {
				const history = await requestData<{ batches: BackupBatch[] }>('/api/admin/backup-center/webdav/history')
				const nextBatches = Array.isArray(history.batches) ? history.batches : []
				setBatches(nextBatches)
				setFullRestoreId(nextBatches.find(batch => MODULES.every(module => batch.modules[module.id]))?.id || '')
			} else {
				setBatches([])
			}
		} catch (event) {
			setError(event instanceof Error ? event.message : '备份中心加载失败。')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void load()
		let active = true
		const refresh = async () => {
			try {
				const data = await requestData<{ jobs: BackupJob[] }>('/api/admin/backup-center/jobs')
				if (active) setJobs(data.jobs)
			} catch { /* A disconnected poll must not turn a running job into a failure. */ }
		}
		void refresh()
		const timer = setInterval(() => void refresh(), 3000)
		return () => { active = false; clearInterval(timer) }
	}, [])

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

	const backupWebDav = (modules?: BackupModule[]) => run(`backup-${modules?.join('-') || 'all'}`, async () => {
		const job = await runBackupJob('/api/admin/backup-center/webdav/backups', {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(modules ? { modules } : {})
		}, setMessage)
		const batch = job.result as BackupBatch
		setBatches(current => [batch, ...current.filter(item => item.id !== batch.id)])
		if (batch.scope === 'full') setFullRestoreId(batch.id)
		setMessage(modules ? `${MODULES.find(item => item.id === modules[0])?.label} 已备份到 WebDAV。` : '五个模块已分别备份并写入同一批次清单。')
	})

	const restoreWebDav = (batchId: string, modules?: BackupModule[]) => {
		if (!batchId) return
		const label = modules ? MODULES.find(item => item.id === modules[0])?.label : '当前账户完整数据'
		if (!window.confirm(`从批次 ${batchId} 恢复${label}？系统会先制作安全快照，失败时自动回滚。`)) return
		void run(`restore-${modules?.join('-') || 'all'}`, async () => {
			await runBackupJob('/api/admin/backup-center/webdav/restore', {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ batchId, ...(modules ? { modules } : {}) })
			}, setMessage)
			setMessage(`${label}恢复完成，校验与安全快照均已通过。`)
		})
	}

	const saveConnection = () => run('save-connection', async () => {
		const next = await requestData<WebDavConfig>('/api/admin/backup-center/webdav/config', {
			method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(connectionForm)
		})
		setConfig(next)
		setConnectionForm(current => ({ ...current, password: '' }))
		setMessage('WebDAV 连接已保存，固定目录无需额外设置。')
	})

	const testConnection = () => run('test-connection', async () => {
		await requestData('/api/admin/backup-center/webdav/test', { method: 'POST' })
		setMessage('WebDAV 连接正常，/nono/ 目录可用。')
	})

	const saveAutomation = () => run('save-automation', async () => {
		const next = await requestData<BackupAutomationSnapshot>('/api/admin/backups/automation', {
			method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(automation.settings)
		})
		setAutomation(next)
		setMessage('WebDAV 自动备份策略已保存，历史数量会按策略清理。')
	})

	const removeBatch = (batch: BackupBatch) => {
		if (!window.confirm(`删除 WebDAV 批次 ${batch.id} 及其模块文件？`)) return
		void run(`delete-${batch.id}`, async () => {
			await requestData(`/api/admin/backup-center/webdav/history/${batch.id}`, { method: 'DELETE' })
			setBatches(current => current.filter(item => item.id !== batch.id))
			setMessage('WebDAV 备份批次已删除。')
		})
	}

	const updateAutomation = <K extends keyof BackupAutomationSettings>(key: K, value: BackupAutomationSettings[K]) => {
		setAutomation(current => ({ ...current, settings: { ...current.settings, [key]: value } }))
	}

	const downloadLocalBackup = (module: BackupModule | 'all') => void run(`local-download-${module}`, async () => {
		const job = await runBackupJob(`/api/admin/backup-center/local/${module}`, { method: 'POST' }, setMessage)
		const response = await fetch(`/api/admin/backup-center/jobs/${job.id}/download`, { credentials: 'same-origin', cache: 'no-store' })
		if (!response.ok) {
			const payload = await response.json().catch(() => null) as { message?: string } | null
			throw new Error(payload?.message || `下载失败（HTTP ${response.status}）`)
		}
		const blob = await response.blob()
		const disposition = response.headers.get('content-disposition') || ''
		const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
			|| (module === 'all' ? 'nono-local-backup.json' : `${module}-local-backup.json`)
		const href = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = href
		anchor.download = filename
		document.body.appendChild(anchor)
		anchor.click()
		anchor.remove()
		URL.revokeObjectURL(href)
		setMessage(`${module === 'all' ? '当前账户完整' : MODULES.find(item => item.id === module)?.label}备份已开始下载。`)
	})

	const restoreLocalFile = async (file: File) => {
		await run(`local-restore-${localRestoreModule}`, async () => {
			const parsed = JSON.parse(await file.text())
			await runBackupJob(`/api/admin/backup-center/local/${localRestoreModule}/restore`, {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed)
			}, setMessage)
			setMessage(`${localRestoreModule === 'all' ? '当前账户完整数据' : MODULES.find(item => item.id === localRestoreModule)?.label}本地备份已恢复。`)
		})
	}

	const pages = destination === 'webdav' ? WEBDAV_PAGES : LOCAL_PAGES
	const activePage = destination === 'webdav' ? webDavPage : localPage

	return <div className='ambient-backup-center'>
		<div className='ambient-backup-destinations' role='tablist' aria-label='备份位置'>
			<button type='button' className={destination === 'webdav' ? 'is-active' : ''} onClick={() => setDestination('webdav')}><Cloud size={18} />WebDAV 备份</button>
			<button type='button' className={destination === 'local' ? 'is-active' : ''} onClick={() => setDestination('local')}><Archive size={18} />本地备份</button>
		</div>

		<div className='ambient-backup-subnav' role='tablist' aria-label='备份功能'>
			{pages.map(page => {
				const Icon = page.icon
				return <button type='button' key={page.id} className={activePage === page.id ? 'is-active' : ''} onClick={() => destination === 'webdav' ? setWebDavPage(page.id as WebDavPage) : setLocalPage(page.id as LocalPage)}><Icon size={15} />{page.label}</button>
			})}
		</div>

		{message && <div className='ambient-settings-message is-success'>{message}</div>}
		{error && <div className='ambient-settings-message is-error'>{error}</div>}
		{jobs.length > 0 && <details className='ambient-backup-page'><summary>任务记录（关闭页面后仍可查看）</summary>{jobs.map(job => <div key={job.id} role='status'><code>{job.id}</code> · {job.kind} · {job.status}{job.error && <p>{job.error}</p>}{job.downloadAvailable && <a href={`/api/admin/backup-center/jobs/${job.id}/download`}>下载备份</a>}</div>)}</details>}
		{loading ? <div className='ambient-backup-loading'><LoaderCircle className='is-spinning' size={20} />正在读取备份设置</div> : <>
			{destination === 'webdav' && webDavPage === 'operations' && <div className='ambient-backup-page'>
				<div className='ambient-backup-page-header'><h3>备份与恢复</h3><p>完整操作覆盖当前账户的五个模块，也可以单独处理某个模块。</p></div>
				<section className='ambient-backup-hero'>
					<div><span className='ambient-backup-icon'><Cloud size={21} /></span><span><strong>当前账户完整备份</strong><small>不包含其他账户、登录凭据或系统级配置。</small></span></div>
					<div className='ambient-backup-actions'><button type='button' disabled={Boolean(busy) || !config.passwordConfigured} onClick={() => void backupWebDav()}>{busy === 'backup-all' ? <LoaderCircle className='is-spinning' size={16} /> : <Upload size={16} />}备份全部</button></div>
					<div className='ambient-full-restore'><select value={fullRestoreId} onChange={event => setFullRestoreId(event.target.value)} aria-label='当前账户完整恢复批次'><option value=''>选择完整批次</option>{fullBatches.map(batch => <option value={batch.id} key={batch.id}>{formatDate(batch.createdAt)}</option>)}</select><button type='button' disabled={!fullRestoreId || Boolean(busy)} onClick={() => restoreWebDav(fullRestoreId)}><RefreshCcw size={16} />恢复全部</button></div>
				</section>

				<div className='ambient-backup-module-list'>
					{MODULES.map(module => {
						const Icon = module.icon
						const available = batches.filter(batch => batch.modules[module.id])
						const selected = moduleRestoreIds[module.id] || available[0]?.id || ''
						return <article className='ambient-backup-module-row' key={module.id}>
							<div><span className='ambient-module-icon'><Icon size={18} /></span><span><strong>{module.label}</strong><small>{module.description}</small></span></div>
							<div className='ambient-module-actions'>
								<button type='button' title={`备份 ${module.label}`} disabled={Boolean(busy) || !config.passwordConfigured} onClick={() => void backupWebDav([module.id])}>{busy === `backup-${module.id}` ? <LoaderCircle className='is-spinning' size={15} /> : <Upload size={15} />}<span>备份</span></button>
								<select value={selected} aria-label={`${module.label} 恢复批次`} onChange={event => setModuleRestoreIds(current => ({ ...current, [module.id]: event.target.value }))}><option value=''>选择恢复批次</option>{available.map(batch => <option value={batch.id} key={batch.id}>{formatDate(batch.createdAt)}</option>)}</select>
								<button type='button' title={`恢复 ${module.label}`} disabled={!selected || Boolean(busy)} onClick={() => restoreWebDav(selected, [module.id])}><RefreshCcw size={15} /><span>恢复</span></button>
							</div>
						</article>
					})}
				</div>
				{!config.passwordConfigured && <button type='button' className='ambient-backup-callout' onClick={() => setWebDavPage('connection')}><Settings2 size={16} />先完成 WebDAV 连接设置</button>}
			</div>}

			{destination === 'webdav' && webDavPage === 'automatic' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header'><h3>自动备份</h3><p>按计划上传当前账户的五个模块；本地下载始终由你手动触发。</p></div>
				<div className='ambient-backup-policy-block'>
					<div className='ambient-backup-policy-toolbar'>
						<label className='ambient-policy-toggle'><input type='checkbox' checked={automation.settings.enabled} onChange={event => updateAutomation('enabled', event.target.checked)} /><span>启用自动备份</span></label>
						<button type='button' disabled={Boolean(busy) || !config.passwordConfigured} onClick={saveAutomation}>{busy === 'save-automation' ? <LoaderCircle className='is-spinning' size={16} /> : <Save size={16} />}保存策略</button>
					</div>
					<div className='ambient-backup-policy-grid'>
						<label><span>频率</span><select value={automation.settings.cadence} onChange={event => updateAutomation('cadence', event.target.value as 'daily' | 'weekly')}><option value='daily'>每天</option><option value='weekly'>每周</option></select></label>
						{automation.settings.cadence === 'weekly' && <label><span>星期</span><select value={automation.settings.weekday} onChange={event => updateAutomation('weekday', Number(event.target.value))}>{['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>}
						<label><span>执行小时</span><input type='number' min={0} max={23} value={automation.settings.hour} onChange={event => updateAutomation('hour', Number(event.target.value))} /></label>
						<label><span>保留天数</span><input data-testid='backup-retention-days' type='number' min={1} max={3650} value={automation.settings.retentionDays} onChange={event => updateAutomation('retentionDays', Number(event.target.value))} /></label>
						<label><span>最多份数</span><input data-testid='backup-max-count' type='number' min={2} max={365} value={automation.settings.maxBackups} onChange={event => updateAutomation('maxBackups', Number(event.target.value))} /></label>
					</div>
				</div>
				<div className='ambient-backup-status'><span>最近成功<strong>{formatDate(automation.status.lastSuccessAt)}</strong></span><span className={automation.status.lastError ? 'is-error' : ''}>最近失败<strong>{automation.status.lastError || '暂无'}</strong></span></div>
			</section>}

			{destination === 'webdav' && webDavPage === 'history' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header ambient-backup-history-head'><span><h3>历史记录</h3><p>批次清单会验证每个模块的大小和 SHA-256。</p></span><b>{batches.length} 份</b></div>
				{batches.length ? <div className='ambient-batch-history'>{batches.map(batch => <div className='ambient-batch-row' key={batch.id}>
					<span className='ambient-batch-state'><CheckCircle2 size={16} /></span>
					<span><strong>{formatDate(batch.createdAt)}</strong><small>{batch.scope === 'full' ? '当前账户完整' : '模块'} · {Object.keys(batch.modules).join(' / ')}</small></span>
					<span>{Object.values(batch.modules).reduce((sum, module) => sum + Number(module?.size || 0), 0) ? formatBytes(Object.values(batch.modules).reduce((sum, module) => sum + Number(module?.size || 0), 0)) : ''}</span>
					<button type='button' title='删除批次' disabled={Boolean(busy)} onClick={() => removeBatch(batch)}>{busy === `delete-${batch.id}` ? <LoaderCircle className='is-spinning' size={15} /> : <Trash2 size={15} />}</button>
				</div>)}</div> : <div className='ambient-backup-empty'>还没有 WebDAV 备份。</div>}
			</section>}

			{destination === 'webdav' && webDavPage === 'connection' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header'><h3>连接设置</h3><p>完整备份与五个模块共用这一套 WebDAV 凭据。</p></div>
				<div className='ambient-webdav-grid'>
					<label className='is-wide'><span>WebDAV 地址</span><input type='url' value={connectionForm.url} onChange={event => setConnectionForm(current => ({ ...current, url: event.target.value }))} placeholder='https://dav.example.com/remote.php/dav/files/user/' /></label>
					<label><span>用户名</span><input value={connectionForm.username} onChange={event => setConnectionForm(current => ({ ...current, username: event.target.value }))} /></label>
					<label><span>密码 / 应用密码</span><input type='password' value={connectionForm.password} onChange={event => setConnectionForm(current => ({ ...current, password: event.target.value }))} placeholder={config.passwordConfigured ? '已保存，留空不修改' : '请输入密码'} /></label>
				</div>
				<div className='ambient-fixed-tree' aria-label='固定备份目录'><strong>固定目录</strong><code>/nono/batches/</code>{MODULES.map(module => <code key={module.id}>/nono/{module.id}/</code>)}</div>
				<div className='ambient-webdav-actions'><button type='button' disabled={Boolean(busy)} onClick={saveConnection}>{busy === 'save-connection' ? <LoaderCircle className='is-spinning' size={16} /> : <Save size={16} />}保存连接</button><button type='button' disabled={Boolean(busy) || !config.passwordConfigured} onClick={testConnection}>{busy === 'test-connection' ? <LoaderCircle className='is-spinning' size={16} /> : <CheckCircle2 size={16} />}测试连接</button></div>
			</section>}

			{destination === 'local' && localPage === 'download' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header'><h3>下载备份</h3><p>本地备份不会自动执行，也不占用服务器保留份数。</p></div>
				<button type='button' className='ambient-local-all-download' disabled={Boolean(busy)} onClick={() => downloadLocalBackup('all')}>{busy === 'local-download-all' ? <LoaderCircle className='is-spinning' size={20} /> : <Archive size={20} />}<span><strong>下载当前账户完整备份</strong><small>一个文件内按五个模块保存当前账户数据并附带校验值。</small></span><Download size={17} /></button>
				<div className='ambient-module-backups'>{MODULES.map(module => {
					const Icon = module.icon
					return <div className='ambient-module-backup' key={module.id}><span className='ambient-module-icon'><Icon size={18} /></span><span><strong>{module.label}</strong><small>{module.description}</small></span><button type='button' disabled={Boolean(busy)} onClick={() => downloadLocalBackup(module.id)} title={`下载 ${module.label}`}>{busy === `local-download-${module.id}` ? <LoaderCircle className='is-spinning' size={16} /> : <Download size={16} />}</button></div>
				})}</div>
			</section>}

			{destination === 'local' && localPage === 'restore' && <section className='ambient-backup-page'>
				<div className='ambient-backup-page-header'><h3>上传与恢复</h3><p>选择备份类型后上传对应文件；恢复前会自动制作安全快照。</p></div>
				<div className='ambient-local-restore-types'><button type='button' className={localRestoreModule === 'all' ? 'is-active' : ''} onClick={() => setLocalRestoreModule('all')}>当前账户完整数据</button>{MODULES.map(module => <button type='button' className={localRestoreModule === module.id ? 'is-active' : ''} onClick={() => setLocalRestoreModule(module.id)} key={module.id}>{module.label}</button>)}</div>
				<input ref={fileInputRef} type='file' accept='application/json,.json' hidden onChange={event => { const file = event.target.files?.[0]; if (file && window.confirm(`上传 ${file.name} 并恢复${localRestoreModule === 'all' ? '当前账户完整数据' : localRestoreModule}？`)) void restoreLocalFile(file); event.currentTarget.value = '' }} />
				<button type='button' className='ambient-local-upload' disabled={Boolean(busy)} onClick={() => fileInputRef.current?.click()}>{busy.startsWith('local-restore') ? <LoaderCircle className='is-spinning' size={20} /> : <Upload size={20} />}<span><strong>选择备份文件</strong><small>当前恢复类型：{localRestoreModule === 'all' ? '当前账户完整数据' : MODULES.find(item => item.id === localRestoreModule)?.label}</small></span></button>
				<div className='ambient-backup-note'><ShieldCheck size={17} /><span>文件类型、模块、版本、大小与 SHA-256 全部通过后才会开始恢复。</span></div>
			</section>}
		</>}
	</div>
}
