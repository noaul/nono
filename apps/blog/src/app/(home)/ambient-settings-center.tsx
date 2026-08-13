'use client'

import {
	Archive,
	Bookmark,
	CheckCircle2,
	Download,
	ExternalLink,
	Github,
	HardDriveDownload,
	LoaderCircle,
	Settings,
	ShieldCheck,
	Smile,
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

type Props = {
	open: boolean
	onClose: () => void
	quickEntriesVisible: boolean
	onQuickEntriesVisibleChange: (visible: boolean) => Promise<void>
}

const MODULE_BACKUPS = [
	{ id: 'bookmarks', label: '书签', description: '浏览器书签 HTML', icon: Bookmark, href: '/api/admin/bookmarks/export', action: '下载' },
	{ id: 'nodesk', label: 'NoDesk', description: '内容与运行时配置，由全站备份覆盖', icon: HardDriveDownload, href: '/admin/backups', action: '管理' },
	{ id: 'nostar', label: 'NoStar', description: '仓库、分类、Release 与设置', icon: Github, action: '下载' },
	{ id: 'nomoney', label: 'NoMoney', description: '资产、费用和账户的加密备份', icon: WalletCards, href: '/nomoney/api/export/json', action: '下载' },
	{ id: 'yumi', label: 'Yumi', description: 'VPS、域名、监控和提醒的加密备份', icon: Smile, href: '/yumi/api/export/json', action: '下载' }
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

function formatDate(value: string) {
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

export function AmbientSettingsCenter({ open, onClose, quickEntriesVisible, onQuickEntriesVisibleChange }: Props) {
	const [tab, setTab] = useState<'desktop' | 'backups'>('desktop')
	const [backups, setBackups] = useState<BackupRecord[]>([])
	const [backupLoading, setBackupLoading] = useState(false)
	const [creatingBackup, setCreatingBackup] = useState(false)
	const [savingVisibility, setSavingVisibility] = useState(false)
	const [exportingModule, setExportingModule] = useState<string | null>(null)
	const [message, setMessage] = useState('')
	const [error, setError] = useState('')
	const [settingsDialog, setSettingsDialog] = useState<HTMLElement | null>(null)
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	const loadBackups = async () => {
		setBackupLoading(true)
		setError('')
		try {
			const response = await fetch('/api/admin/backups', { credentials: 'same-origin', cache: 'no-store' })
			if (!response.ok) throw new Error(response.status === 403 ? '备份中心仅管理员可用。' : '无法读取备份列表。')
			const value = apiData(await response.json()) as { backups?: BackupRecord[] }
			setBackups(Array.isArray(value?.backups) ? value.backups : [])
		} catch (event) {
			setError(event instanceof Error ? event.message : '无法读取备份列表。')
		} finally {
			setBackupLoading(false)
		}
	}

	useEffect(() => {
		if (!open || tab !== 'backups') return
		void loadBackups()
	}, [open, tab])

	useEffect(() => {
		if (!open) return
		const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
		const focusable = () => Array.from(settingsDialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
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
			const value = apiData(await response.json()) as { backup?: BackupRecord }
			if (value?.backup) setBackups(current => [value.backup!, ...current.filter(item => item.id !== value.backup!.id)])
			setMessage('全站备份已创建并校验。')
		} catch (event) {
			setError(event instanceof Error ? event.message : '全站备份创建失败。')
		} finally {
			setCreatingBackup(false)
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
			setMessage('NoStar 独立备份已下载。')
		} catch (event) {
			setError(event instanceof Error ? event.message : 'NoStar 备份导出失败。')
		} finally {
			setExportingModule(null)
		}
	}

	const latest = backups[0]

	return <div className='ambient-settings-backdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
		<section ref={setSettingsDialog} className='ambient-settings-dialog' role='dialog' aria-modal='true' aria-label='NoDesk 设置'>
			<header className='ambient-settings-header'>
				<div><span><Settings size={15} /> NoDesk</span><h2>设置</h2></div>
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
							<div><h3>全站备份</h3><p>包含 PostgreSQL、NoDesk 内容、NoMoney 和 Yumi 数据。</p></div>
							<button type='button' disabled={creatingBackup} onClick={() => void createFullBackup()}>{creatingBackup ? <LoaderCircle className='is-spinning' size={17} /> : <Archive size={17} />}立即备份</button>
						</div>
						{backupLoading ? <div className='ambient-backup-loading'><LoaderCircle className='is-spinning' size={20} /> 正在读取备份</div> : latest ? <div className='ambient-backup-latest'>
							<span><CheckCircle2 size={17} />最近备份已校验</span>
							<strong>{formatDate(latest.createdAt)}</strong>
							<small>{formatBytes(latest.size)} · {latest.components.join(' / ')}</small>
							<a href={`/api/admin/backups/${latest.id}/download`}><Download size={16} />下载</a>
						</div> : <div className='ambient-backup-empty'>还没有全站备份。</div>}
						<a className='ambient-settings-text-link' href='/admin/backups'>查看历史、自动备份与恢复 <ExternalLink size={15} /></a>
					</section>

					<section className='ambient-settings-section'>
						<div className='ambient-settings-section-copy'><h3>模块独立备份</h3><p>各模块继续使用自己的备份格式和恢复流程。</p></div>
						<div className='ambient-module-backups'>
							{MODULE_BACKUPS.map(item => {
								const Icon = item.icon
								return <div className='ambient-module-backup' key={item.id}>
									<span className='ambient-module-icon'><Icon size={19} /></span>
									<span><strong>{item.label}</strong><small>{item.description}</small></span>
									{item.id === 'nostar' ? <button type='button' disabled={exportingModule === item.id} onClick={() => void exportNoStar()}>{exportingModule === item.id ? <LoaderCircle className='is-spinning' size={16} /> : <Download size={16} />}<span>{item.action}</span></button> : <a href={item.href}><ExternalLink size={16} /><span>{item.action}</span></a>}
								</div>
							})}
						</div>
						<div className='ambient-backup-note'><ShieldCheck size={17} /><span>独立导出默认不展示明文密钥；恢复请在对应模块中完成。</span></div>
					</section>
				</div>}
			</div>
		</section>
	</div>
}
