'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from '../app/(home)/stores/config-store'
import { CARD_SPACING } from '@/consts'
import MusicSVG from '@/svgs/music.svg'
import PlaySVG from '@/svgs/play.svg'
import { HomeDraggableLayer } from '../app/(home)/home-draggable-layer'
import { Pause, SkipForward } from 'lucide-react'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const MUSIC_FILES = [
	{ name: '五月天拥抱', url: '/music/五月天拥抱.mp3' },
	{ name: '上海彩虹室内合唱团 - 彩虹', url: '/music/上海彩虹室内合唱团 - 彩虹.mp3' },
	{ name: '房东的猫 - 云烟成雨', url: '/music/房东的猫 - 云烟成雨.mp3' },
	{ name: '以冬 - 我的一个道姑朋友', url: '/music/以冬 - 我的一个道姑朋友.mp3' },
	{ name: '六哲 _ 贺敬轩 - 让全世界知道我爱你', url: '/music/六哲 _ 贺敬轩 - 让全世界知道我爱你.mp3' },
	{ name: '双笙 (陈元汐) - 长安忆', url: '/music/双笙 (陈元汐) - 长安忆.mp3' },
	{ name: '周杰伦 - 最伟大的作品', url: '/music/周杰伦 - 最伟大的作品.mp3' },
	{ name: '周杰伦 - 粉色海洋', url: '/music/周杰伦 - 粉色海洋.mp3' },
	{ name: '周杰伦 _ 陈奕迅 - 明明就+淘汰 (Live)', url: '/music/周杰伦 _ 陈奕迅 - 明明就+淘汰 (Live).mp3' },
	{ name: '周深 - 风吹过的晨曦', url: '/music/周深 - 风吹过的晨曦.mp3' },
	{ name: '孙燕姿 - 我怀念的', url: '/music/孙燕姿 - 我怀念的.mp3' },
	{ name: '张泽熙 - 那个女孩', url: '/music/张泽熙 - 那个女孩.mp3' },
	{ name: '张紫豪 - 可不可以', url: '/music/张紫豪 - 可不可以.mp3' },
	{ name: 'Daniel Powter - Free Loop', url: '/music/Daniel Powter - Free Loop.mp3' },
	{ name: '李宇春 - 1987我不知会遇见你', url: '/music/李宇春 - 1987我不知会遇见你.mp3' },
	{ name: '林俊杰 - Too Bad', url: '/music/林俊杰 - Too Bad.flac' },
	{ name: '林俊杰 - 弹唱', url: '/music/林俊杰 - 弹唱.flac' },
	{ name: '筷子兄弟 - 老男孩', url: '/music/筷子兄弟 - 老男孩.mp3' },
	{ name: '邱霖BigL - 我的歌声里 (remix：T_back)', url: '/music/邱霖BigL - 我的歌声里 (remix：T_back).mp3' }
]

export default function MusicCard() {
	const pathname = usePathname()
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const styles = cardStyles.musicCard
	const hiCardStyles = cardStyles.hiCard
	const clockCardStyles = cardStyles.clockCard
	const calendarCardStyles = cardStyles.calendarCard

	const [isPlaying, setIsPlaying] = useState(false)
	const [currentIndex, setCurrentIndex] = useState(0)
	const [progress, setProgress] = useState(0)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const currentIndexRef = useRef(0)
	const isPlayingRef = useRef(false)
	const currentMusic = MUSIC_FILES[currentIndex]

	const isHomePage = pathname === '/'

	const position = useMemo(() => {
		// If not on home page, always position at bottom-right corner when playing
		if (!isHomePage) {
			return {
				x: center.width - styles.width - 16,
				y: center.height - styles.height - 16
			}
		}

		// Default position on home page
		return {
			x: styles.offsetX !== null ? center.x + styles.offsetX : center.x + CARD_SPACING + hiCardStyles.width / 2 - styles.offset,
			y: styles.offsetY !== null ? center.y + styles.offsetY : center.y - clockCardStyles.offset + CARD_SPACING + calendarCardStyles.height + CARD_SPACING
		}
	}, [isHomePage, center, styles, hiCardStyles, clockCardStyles, calendarCardStyles])

	const { x, y } = position

	// Initialize audio element
	useEffect(() => {
		if (!audioRef.current) {
			audioRef.current = new Audio()
		}

		const audio = audioRef.current

		const updateProgress = () => {
			if (audio.duration) {
				setProgress((audio.currentTime / audio.duration) * 100)
			}
		}

		const handleEnded = () => {
			const nextIndex = (currentIndexRef.current + 1) % MUSIC_FILES.length
			currentIndexRef.current = nextIndex
			setCurrentIndex(nextIndex)
			setProgress(0)
		}

		const handleTimeUpdate = () => {
			updateProgress()
		}

		const handleLoadedMetadata = () => {
			updateProgress()
		}

		audio.addEventListener('timeupdate', handleTimeUpdate)
		audio.addEventListener('ended', handleEnded)
		audio.addEventListener('loadedmetadata', handleLoadedMetadata)

		return () => {
			audio.removeEventListener('timeupdate', handleTimeUpdate)
			audio.removeEventListener('ended', handleEnded)
			audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
		}
	}, [])

	// Handle currentIndex change - load new audio
	useEffect(() => {
		currentIndexRef.current = currentIndex
		if (audioRef.current) {
			audioRef.current.pause()
			audioRef.current.src = currentMusic.url
			audioRef.current.loop = false
			setProgress(0)

			if (isPlayingRef.current) {
				audioRef.current.play().catch(console.error)
			}
		}
	}, [currentIndex, currentMusic.url])

	// Handle play/pause state change
	useEffect(() => {
		isPlayingRef.current = isPlaying
		if (!audioRef.current) return

		if (isPlaying) {
			audioRef.current.play().catch(console.error)
		} else {
			audioRef.current.pause()
		}
	}, [isPlaying])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause()
				audioRef.current.src = ''
			}
		}
	}, [])

	const togglePlayPause = () => {
		setIsPlaying(value => !value)
	}

	const playNext = () => {
		setCurrentIndex(index => (index + 1) % MUSIC_FILES.length)
	}

	// Hide component if not on home page and not playing
	if (!isHomePage && !isPlaying) {
		return null
	}

	return (
		<HomeDraggableLayer cardKey='musicCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card
				order={styles.order}
				width={styles.width}
				height={styles.height}
				x={x}
				y={y}
				className={clsx('flex items-center gap-3 max-sm:static', !isHomePage && 'fixed')}>
				{siteContent.enableChristmas && (
					<>
						<img
							src='/images/christmas/snow-10.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 120, left: -8, top: -12, opacity: 0.8 }}
						/>
						<img
							src='/images/christmas/snow-11.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 80, right: -10, top: -12, opacity: 0.8 }}
						/>
					</>
				)}

				<MusicSVG className='h-8 w-8' />

				<div className='flex-1'>
					<div className='text-secondary truncate text-sm'>{currentMusic.name}</div>

					<div className='mt-1 h-2 rounded-full bg-white/60'>
						<div className='bg-linear h-full rounded-full transition-all duration-300' style={{ width: `${progress}%` }} />
					</div>
				</div>

				<div className='flex items-center gap-2'>
					<button onClick={togglePlayPause} className='flex h-10 w-10 items-center justify-center rounded-full bg-white transition-opacity hover:opacity-80'>
						{isPlaying ? <Pause className='text-brand h-4 w-4' /> : <PlaySVG className='text-brand ml-1 h-4 w-4' />}
					</button>
					<button
						onClick={playNext}
						aria-label='下一首'
						className='flex h-8 w-8 items-center justify-center rounded-full bg-white/80 transition-opacity hover:opacity-80'>
						<SkipForward className='text-brand h-4 w-4' />
					</button>
				</div>
			</Card>
		</HomeDraggableLayer>
	)
}
