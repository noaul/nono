'use client'

import HiCard from '@/app/(home)/hi-card'
import ArtCard from '@/app/(home)/art-card'
import ClockCard from '@/app/(home)/clock-card'
import CalendarCard from '@/app/(home)/calendar-card'
import SocialButtons from '@/app/(home)/social-buttons'
import ShareCard from '@/app/(home)/share-card'
import AritcleCard from '@/app/(home)/aritcle-card'
import WriteButtons from '@/app/(home)/write-buttons'
import LikePosition from './like-position'
import HatCard from './hat-card'
import BeianCard from './beian-card'
import { useSize } from '@/hooks/use-size'
import { motion } from 'motion/react'
import { useLayoutEditStore } from './stores/layout-edit-store'
import { useConfigStore } from './stores/config-store'
import { toast } from 'sonner'
import ConfigDialog from './config-dialog/index'
import { useEffect } from 'react'
import SnowfallBackground from '@/layout/backgrounds/snowfall'
import { PortalShortcut } from './portal-shortcut'
import ScheduleSummaryCard from '@/components/schedule-summary-card'
import { useAuthStore } from '@/hooks/use-auth'
import { PenLine, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/i18n'

export default function Home() {

	const { copy } = useI18n()
	const { maxSM } = useSize()
	const isAuth = useAuthStore(state => state.isAuth)
	const { cardStyles, configDialogOpen, setConfigDialogOpen, siteContent } = useConfigStore()
	const editing = useLayoutEditStore(state => state.editing)
	const saveEditing = useLayoutEditStore(state => state.saveEditing)
	const cancelEditing = useLayoutEditStore(state => state.cancelEditing)

	const handleSave = () => {
		saveEditing()
		toast.success('首页布局偏移已保存（尚未提交到远程配置）')
	}

	const handleCancel = () => {
		cancelEditing()
		toast.info('已取消此次拖拽布局修改')
	}

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isAuth && (e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === ',')) {
				e.preventDefault()
				setConfigDialogOpen(true)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isAuth, setConfigDialogOpen])

	useEffect(() => {
		if (!isAuth) {
			setConfigDialogOpen(false)
			cancelEditing()
		}
	}, [cancelEditing, isAuth, setConfigDialogOpen])

	return (
		<>
			{siteContent.enableChristmas && <SnowfallBackground zIndex={0} count={!maxSM ? 125 : 20} />}
			<PortalShortcut />

			{editing && isAuth && (
				<div className='pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-6'>
					<div className='pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-2 shadow-lg backdrop-blur'>
						<span className='text-xs text-gray-600'>正在编辑首页布局，拖拽卡片调整位置</span>
						<div className='flex gap-2'>
							<motion.button
								type='button'
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleCancel}
								className='rounded-xl border bg-white px-3 py-1 text-xs font-medium text-gray-700'>
								{copy('取消', 'Cancel')}
							</motion.button>
							<motion.button type='button' whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSave} className='brand-btn px-3 py-1 text-xs'>
								保存偏移
							</motion.button>
						</div>
					</div>
				</div>
			)}

			<div className='max-sm:flex max-sm:flex-col max-sm:items-center max-sm:gap-4 max-sm:px-4 max-sm:pt-28 max-sm:pb-28'>
				{cardStyles.artCard?.enabled !== false && <ArtCard />}
				{cardStyles.hiCard?.enabled !== false && <HiCard />}
				{cardStyles.clockCard?.enabled !== false && <ClockCard />}
				{cardStyles.calendarCard?.enabled !== false && <CalendarCard />}
				{cardStyles.scheduleCard?.enabled !== false && <ScheduleSummaryCard />}
				{cardStyles.socialButtons?.enabled !== false && <SocialButtons />}
				{cardStyles.shareCard?.enabled !== false && <ShareCard />}
				{cardStyles.articleCard?.enabled !== false && <AritcleCard />}
				{!maxSM && isAuth && cardStyles.writeButtons?.enabled !== false && <WriteButtons />}
				{cardStyles.likePosition?.enabled !== false && <LikePosition />}
				{cardStyles.hatCard?.enabled !== false && <HatCard />}
				{cardStyles.beianCard?.enabled !== false && <BeianCard />}
			</div>

			{maxSM && isAuth && (
				<div className='fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-2xl border bg-white/75 p-2 shadow-lg backdrop-blur-xl'>
					<Link href='/write' className='brand-btn h-10 px-3' aria-label='写文章'>
						<PenLine className='size-4' />
						<span>写文章</span>
					</Link>
					<button
						type='button'
						onClick={() => setConfigDialogOpen(true)}
						className='grid size-10 place-items-center rounded-xl border bg-white/70'
						aria-label='网站设置'>
						<Settings2 className='size-4' />
					</button>
				</div>
			)}

			{siteContent.enableChristmas && <SnowfallBackground zIndex={2} count={!maxSM ? 125 : 20} />}
			<ConfigDialog open={configDialogOpen && isAuth} onClose={() => setConfigDialogOpen(false)} />
		</>
	)
}
