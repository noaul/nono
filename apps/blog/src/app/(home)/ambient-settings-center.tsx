'use client'

import { Archive, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AmbientBackupCenter } from './ambient-backup-center'
import type { WorkbenchAppEntry } from './ambient-workbench-settings'

type Props = {
	open: boolean
	onClose: () => void
	quickEntriesVisible: boolean
	onQuickEntriesVisibleChange: (visible: boolean) => Promise<void>
	quickEntries: WorkbenchAppEntry[]
	onQuickEntriesChange: (entries: WorkbenchAppEntry[]) => Promise<void>
	initialTab?: 'desktop' | 'backups'
}
const quickEntryIcons = [
	{ value: 'app-window', label: '应用' },
	{ value: 'bookmark', label: '书签' },
	{ value: 'wallet-cards', label: '资产' },
	{ value: 'star', label: '星标' },
	{ value: 'server-cog', label: '服务器' },
	{ value: 'scissors', label: '剪藏' },
	{ value: 'github', label: 'GitHub' },
	{ value: 'globe', label: '网站' },
	{ value: 'link', label: '链接' }
]

export function AmbientSettingsCenter({ open, onClose, quickEntriesVisible, onQuickEntriesVisibleChange, quickEntries, onQuickEntriesChange, initialTab = 'desktop' }: Props) {
	const [tab, setTab] = useState<'desktop' | 'backups'>(initialTab)
	const [savingVisibility, setSavingVisibility] = useState(false)
	const [savingEntries, setSavingEntries] = useState(false)
	const [draftEntries, setDraftEntries] = useState<WorkbenchAppEntry[]>(quickEntries)
	const [message, setMessage] = useState('')
	const [error, setError] = useState('')
	const [settingsDialog, setSettingsDialog] = useState<HTMLElement | null>(null)
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	useEffect(() => {
		if (!open) return
		setTab(initialTab)
		setDraftEntries(quickEntries.map(entry => ({ ...entry })))
	}, [initialTab, open, quickEntries])

	useEffect(() => {
		if (!open) return
		const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
		const focusable = () => Array.from(settingsDialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
		focusable()[0]?.focus()
		const handleKeyDown = (event: KeyboardEvent) => {
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
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			previouslyFocused?.focus()
		}
	}, [open, settingsDialog])

	if (!open) return null

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

	const updateEntry = <Key extends keyof WorkbenchAppEntry>(index: number, key: Key, value: WorkbenchAppEntry[Key]) => {
		setDraftEntries(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, [key]: value } : entry))
	}

	const addEntry = () => {
		setDraftEntries(current => [...current, {
			id: `quick-${Date.now()}-${current.length + 1}`,
			label: '',
			url: '/',
			icon: 'app-window',
			openInNewTab: false
		}])
	}

	const saveEntries = async () => {
		if (savingEntries) return
		const entries = draftEntries.map(entry => ({ ...entry, label: entry.label.trim(), url: entry.url.trim() }))
		if (entries.some(entry => !entry.label || !entry.url)) {
			setError('请填写每个快捷应用的名称和跳转链接。')
			return
		}
		setSavingEntries(true)
		setMessage('')
		setError('')
		try {
			await onQuickEntriesChange(entries)
			setDraftEntries(entries)
			setMessage('快捷应用已保存。')
		} catch (event) {
			setError(event instanceof Error ? event.message : '快捷应用保存失败。')
		} finally {
			setSavingEntries(false)
		}
	}

	return <div className='ambient-settings-backdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
		<section ref={setSettingsDialog} className='ambient-settings-dialog' role='dialog' aria-modal='true' aria-label='NoDesk 设置'>
			<header className='ambient-settings-header'>
				<div><span><Archive size={15} /> NoDesk</span><h2>设置</h2></div>
				<button type='button' onClick={onClose} aria-label='关闭设置'><X size={20} /></button>
			</header>

			<div className='ambient-settings-tabs' role='tablist' aria-label='设置分类'>
				<button type='button' role='tab' aria-selected={tab === 'desktop'} tabIndex={tab === 'desktop' ? 0 : -1} className={tab === 'desktop' ? 'is-active' : ''} onClick={() => setTab('desktop')}>桌面</button>
				<button type='button' role='tab' aria-selected={tab === 'backups'} tabIndex={tab === 'backups' ? 0 : -1} className={tab === 'backups' ? 'is-active' : ''} onClick={() => setTab('backups')}>备份中心</button>
			</div>

			<div className='ambient-settings-body'>
				{message && <div className='ambient-settings-message is-success'>{message}</div>}
				{error && <div className='ambient-settings-message is-error'>{error}</div>}

				{tab === 'desktop' && <section className='ambient-settings-section'>
					<div className='ambient-settings-section-copy'><h3>快捷应用</h3><p>入口显示在桌面左下角。</p></div>
					<label className='ambient-settings-toggle'>
						<span><strong>显示应用快捷入口</strong><small>关闭后仍可从书签和各模块地址直接访问。</small></span>
						<input type='checkbox' checked={quickEntriesVisible} disabled={savingVisibility} onChange={event => void updateVisibility(event.target.checked)} />
						<i aria-hidden='true' />
					</label>

					<div className='ambient-quick-app-list'>
						{draftEntries.map((entry, index) => <div className='ambient-quick-app-row' key={entry.id}>
							<label><span>应用名称</span><input value={entry.label} maxLength={60} onChange={event => updateEntry(index, 'label', event.target.value)} /></label>
							<label className='ambient-quick-app-url'><span>跳转链接</span><input value={entry.url} maxLength={2048} placeholder='https://example.com 或 /path' onChange={event => updateEntry(index, 'url', event.target.value)} /></label>
							<label><span>图标</span><select value={entry.icon} onChange={event => updateEntry(index, 'icon', event.target.value)}>{quickEntryIcons.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
							<label className='ambient-quick-app-checkbox'><input type='checkbox' checked={entry.openInNewTab} onChange={event => updateEntry(index, 'openInNewTab', event.target.checked)} /><span>新标签页打开</span></label>
							<button type='button' className='ambient-quick-app-remove' onClick={() => setDraftEntries(current => current.filter((_, entryIndex) => entryIndex !== index))} aria-label={`删除快捷应用 ${entry.label || index + 1}`} title='删除快捷应用'><Trash2 size={16} /></button>
						</div>)}
					</div>
					<div className='ambient-quick-app-actions'>
						<button type='button' onClick={addEntry}><Plus size={16} />添加快捷应用</button>
						<button type='button' className='is-primary' disabled={savingEntries} onClick={() => void saveEntries()}><Save size={16} />{savingEntries ? '保存中...' : '保存快捷应用'}</button>
					</div>
				</section>}

				{tab === 'backups' && <AmbientBackupCenter />}
			</div>
		</section>
	</div>
}
