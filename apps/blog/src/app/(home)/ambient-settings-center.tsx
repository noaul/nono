'use client'

import { Archive, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AmbientBackupCenter } from './ambient-backup-center'

type Props = {
	open: boolean
	onClose: () => void
	quickEntriesVisible: boolean
	onQuickEntriesVisibleChange: (visible: boolean) => Promise<void>
	initialTab?: 'desktop' | 'backups'
}
export function AmbientSettingsCenter({ open, onClose, quickEntriesVisible, onQuickEntriesVisibleChange, initialTab = 'desktop' }: Props) {
	const [tab, setTab] = useState<'desktop' | 'backups'>(initialTab)
	const [savingVisibility, setSavingVisibility] = useState(false)
	const [message, setMessage] = useState('')
	const [error, setError] = useState('')
	const [settingsDialog, setSettingsDialog] = useState<HTMLElement | null>(null)
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	useEffect(() => {
		if (open) setTab(initialTab)
	}, [initialTab, open])

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
					<div className='ambient-settings-section-copy'><h3>应用快捷入口</h3><p>顶部中央入口仅在鼠标移入或键盘聚焦时展开。</p></div>
					<label className='ambient-settings-toggle'>
						<span><strong>显示应用快捷入口</strong><small>关闭后仍可从书签和各模块地址直接访问。</small></span>
						<input type='checkbox' checked={quickEntriesVisible} disabled={savingVisibility} onChange={event => void updateVisibility(event.target.checked)} />
						<i aria-hidden='true' />
					</label>
				</section>}

				{tab === 'backups' && <AmbientBackupCenter />}
			</div>
		</section>
	</div>
}
