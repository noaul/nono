'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { DialogModal } from '@/components/dialog-modal'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import initialList from './list.json'
import { pushSnippets } from './services/push-snippets'
import { loadNodeskContent } from '@/lib/nodesk-content'
import { useI18n } from '@/i18n'

const getRandomSnippet = (list: string[]) => (list.length === 0 ? '' : list[Math.floor(Math.random() * list.length)])

export default function Page() {
	const { copy } = useI18n()
	const [snippets, setSnippets] = useState<string[]>(initialList as string[])
	const [originalSnippets, setOriginalSnippets] = useState<string[]>(initialList as string[])
	const [currentSnippet, setCurrentSnippet] = useState<string>(getRandomSnippet(initialList as string[]))
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isManageOpen, setIsManageOpen] = useState(false)
	const [draftSnippets, setDraftSnippets] = useState<string[]>([])
	const [newSnippet, setNewSnippet] = useState('')
	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		void loadNodeskContent<string[]>('snippets', initialList as string[]).then(items => {
			setSnippets(items)
			setOriginalSnippets(items)
			setCurrentSnippet(getRandomSnippet(items))
		})
	}, [])

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

	const handleSave = async () => {
		setIsSaving(true)
		try {
			await pushSnippets({ snippets })
			setOriginalSnippets(snippets)
			setIsEditMode(false)
			toast.success(copy('保存成功！', 'Saved'))
		} catch (error: any) {
			console.error('Failed to save snippets:', error)
			toast.error(`${copy('保存失败', 'Could not save')}: ${error?.message || copy('未知错误', 'Unknown error')}`)
		} finally {
			setIsSaving(false)
		}
	}

	const handleSaveClick = () => {
		if (!isAuth) {
			toast.error(copy('请先登录 NoNo 后台', 'Sign in to the NoNo admin first'))
			return
		}
		void handleSave()
	}

	const handleCancel = () => {
		setSnippets(originalSnippets)
		setIsEditMode(false)
	}

	const openManageDialog = () => {
		setDraftSnippets(snippets)
		setNewSnippet('')
		setIsManageOpen(true)
	}

	const handleAddDraft = () => {
		const value = newSnippet.trim()
		if (!value) {
			toast.error(copy('请输入句子', 'Enter a sentence'))
			return
		}
		setDraftSnippets(prev => [...prev, value])
		setNewSnippet('')
	}

	const handleRemoveDraft = (index: number) => {
		setDraftSnippets(prev => prev.filter((_, i) => i !== index))
	}

	const applyManageChanges = () => {
		const cleaned = draftSnippets.map(item => item.trim()).filter(Boolean)
		if (cleaned.length === 0) {
			toast.error(copy('请至少添加一句话', 'Add at least one sentence'))
			return
		}
		setSnippets(cleaned)
		setIsManageOpen(false)
		toast.success(copy('已更新列表', 'List updated'))
	}

	const cancelManageChanges = () => {
		setIsManageOpen(false)
		setDraftSnippets([])
		setNewSnippet('')
	}

	const buttonText = copy('保存', 'Save')

	return (
		<>
			<div className='flex min-h-[70vh] flex-col items-center justify-center px-6 py-24'>
				<div className='w-full max-w-3xl text-center'>
					<p className='text-2xl leading-relaxed font-semibold'>{currentSnippet || copy('无', 'None')}</p>
				</div>
			</div>

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
								onClick={openManageDialog}
								className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
								{copy('管理', 'Manage')}
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

			<DialogModal open={isManageOpen} onClose={cancelManageChanges} className='card static w-[520px] max-sm:w-full'>
				<div className='space-y-4'>
					<div className='flex items-center gap-3'>
						<input
							type='text'
							value={newSnippet}
							onChange={e => setNewSnippet(e.target.value)}
							placeholder={copy('新增', 'Add')}
							className='flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none'
						/>
						<button onClick={handleAddDraft} className='brand-btn flex items-center gap-1 px-4 py-2 text-sm'>
							<Plus className='h-4 w-4' />
							{copy('新增', 'Add')}
						</button>
					</div>

					<div className='max-h-[320px] space-y-2 overflow-y-auto pr-1'>
						{draftSnippets.length === 0 && <p className='text-secondary py-6 text-center text-sm'>{copy('暂无内容', 'Nothing here yet')}</p>}
						{draftSnippets.map((item, index) => (
							<div key={`${item}-${index}`} className='group flex items-start gap-3 rounded-lg px-3 py-2 text-sm'>
								<p className='flex-1 leading-relaxed text-gray-800'>{item}</p>
								<button onClick={() => handleRemoveDraft(index)} className='text-gray-400 transition-colors hover:text-red-500'>
									<X className='h-4 w-4' />
								</button>
							</div>
						))}
					</div>

					<div className='mt-4 flex gap-3'>
						<button
							onClick={cancelManageChanges}
							className='flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm transition-colors hover:bg-gray-50'>
							{copy('取消', 'Cancel')}
						</button>
						<button onClick={applyManageChanges} className='brand-btn flex-1 justify-center px-4'>
							{copy('保存', 'Save')}
						</button>
					</div>
				</div>
			</DialogModal>
		</>
	)
}
