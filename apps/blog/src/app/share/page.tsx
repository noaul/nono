'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import GridView from './grid-view'
import CreateDialog from './components/create-dialog'
import { pushShares } from './services/push-shares'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import initialList from './list.json'
import type { Share } from './components/share-card'
import type { LogoItem } from './components/logo-upload-dialog'
import { loadNodeskContent } from '@/lib/nodesk-content'
import { useI18n } from '@/i18n'

export default function Page() {

	const { copy } = useI18n()
	const [shares, setShares] = useState<Share[]>(initialList as Share[])
	const [originalShares, setOriginalShares] = useState<Share[]>(initialList as Share[])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [editingShare, setEditingShare] = useState<Share | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [logoItems, setLogoItems] = useState<Map<string, LogoItem>>(new Map())
	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		void loadNodeskContent<Share[]>('shares', initialList as Share[]).then(items => {
			setShares(items)
			setOriginalShares(items)
		})
	}, [])

	const handleUpdate = (updatedShare: Share, oldShare: Share, logoItem?: LogoItem) => {
		setShares(prev => prev.map(s => (s.url === oldShare.url ? updatedShare : s)))
		if (logoItem) {
			setLogoItems(prev => {
				const newMap = new Map(prev)
				newMap.set(updatedShare.url, logoItem)
				return newMap
			})
		}
	}

	const handleAdd = () => {
		setEditingShare(null)
		setIsCreateDialogOpen(true)
	}

	const handleSaveShare = (updatedShare: Share, logoItem?: LogoItem) => {
		if (editingShare) {
			setShares(shares.map(s => (s.url === editingShare.url ? updatedShare : s)))
		} else {
			setShares([...shares, updatedShare])
		}
		if (logoItem) {
			setLogoItems(prev => {
				const newMap = new Map(prev)
				newMap.set(updatedShare.url, logoItem)
				return newMap
			})
		}
	}

	const handleDelete = (share: Share) => {
		if (confirm(`确定要删除 ${share.name} 吗？`)) {
			setShares(shares.filter(s => s.url !== share.url))
		}
	}

	const handleSaveClick = () => {
		if (!isAuth) {
			toast.error(copy('请先登录 Nono 后台', 'Sign in to the Nono admin first'))
			return
		}
		void handleSave()
	}

	const handleSave = async () => {
		setIsSaving(true)

		try {
			const updatedShares = await pushShares({
				shares,
				logoItems
			})

			setShares(updatedShares)
			setOriginalShares(updatedShares)
			setLogoItems(new Map())
			setIsEditMode(false)
			toast.success(copy('保存成功！', 'Saved'))
		} catch (error: any) {
			console.error('Failed to save:', error)
			toast.error(`保存失败: ${error?.message || copy('未知错误', 'Unknown error')}`)
		} finally {
			setIsSaving(false)
		}
	}

	const handleCancel = () => {
		setShares(originalShares)
		setLogoItems(new Map())
		setIsEditMode(false)
	}

	const buttonText = copy('保存', 'Save')

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isAuth && !isEditMode && (e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault()
				setIsEditMode(true)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isAuth, isEditMode])

	useEffect(() => {
		if (!isAuth && isEditMode) handleCancel()
	}, [isAuth, isEditMode])

	return (
		<>
			<GridView shares={shares} isEditMode={isEditMode} onUpdate={handleUpdate} onDelete={handleDelete} />

			{isAuth && (
				<motion.div
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					className='absolute top-4 right-6 z-40 flex gap-3 max-sm:fixed max-sm:top-auto max-sm:right-4 max-sm:bottom-4 max-sm:flex-wrap max-sm:justify-end max-sm:rounded-2xl max-sm:border max-sm:bg-white/75 max-sm:p-2 max-sm:shadow-lg max-sm:backdrop-blur-xl'>
					{isEditMode ? (
						<>
							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleCancel}
								disabled={isSaving}
								className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
								{copy('取消', 'Cancel')}
							</motion.button>
							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleAdd}
								className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
								{copy('添加', 'Add')}
							</motion.button>
							<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSaveClick} disabled={isSaving} className='brand-btn px-6'>
								{isSaving ? copy('保存中...', 'Saving…') : buttonText}
							</motion.button>
						</>
					) : (
						!hideEditButton && (
							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={() => setIsEditMode(true)}
								className='bg-card rounded-xl border px-6 py-2 text-sm backdrop-blur-sm transition-colors hover:bg-white/80'>
								{copy('编辑', 'Edit')}
							</motion.button>
						)
					)}
				</motion.div>
			)}

			{isCreateDialogOpen && <CreateDialog share={editingShare} onClose={() => setIsCreateDialogOpen(false)} onSave={handleSaveShare} />}
		</>
	)
}
