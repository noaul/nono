'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const COVER_HOVER_DELAY_MS = 1500
const PREVIEW_OFFSET_PX = 16

export type BlogCoverPreviewState = { src: string } | null

export function useBlogCoverHover(editMode: boolean) {
	const [hoverCoverPreview, setHoverCoverPreview] = useState<BlogCoverPreviewState>(null)
	const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
	const coverHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const clearCoverHoverSchedule = useCallback(() => {
		if (coverHoverTimerRef.current !== null) {
			clearTimeout(coverHoverTimerRef.current)
			coverHoverTimerRef.current = null
		}
	}, [])

	const cancelCoverPreview = useCallback(() => {
		clearCoverHoverSchedule()
		setHoverCoverPreview(null)
	}, [clearCoverHoverSchedule])

	useEffect(() => {
		return () => clearCoverHoverSchedule()
	}, [clearCoverHoverSchedule])

	useEffect(() => {
		if (editMode) cancelCoverPreview()
	}, [editMode, cancelCoverPreview])

	useEffect(() => {
		let rafId = 0
		const latest = { x: 0, y: 0 }
		const flush = () => {
			rafId = 0
			setMousePosition({ x: latest.x, y: latest.y })
		}
		const handleMouseMove = (e: MouseEvent) => {
			latest.x = e.clientX
			latest.y = e.clientY
			if (rafId === 0) rafId = requestAnimationFrame(flush)
		}
		window.addEventListener('mousemove', handleMouseMove, { passive: true })
		return () => {
			window.removeEventListener('mousemove', handleMouseMove)
			if (rafId !== 0) cancelAnimationFrame(rafId)
		}
	}, [])

	const onCoverLinkMouseEnter = useCallback(
		(cover?: string) => {
			if (editMode || !cover) return
			clearCoverHoverSchedule()
			coverHoverTimerRef.current = setTimeout(() => {
				coverHoverTimerRef.current = null
				setHoverCoverPreview({ src: cover })
			}, COVER_HOVER_DELAY_MS)
		},
		[editMode, clearCoverHoverSchedule]
	)

	return {
		cancelCoverPreview,
		onCoverLinkMouseEnter,
		hoverCoverPreview,
		mousePosition
	}
}

type BlogCoverHoverPreviewProps = {
	preview: BlogCoverPreviewState
	position: { x: number; y: number } | null
}

export function BlogCoverHoverPreview({ preview, position }: BlogCoverHoverPreviewProps) {
	return (
		<AnimatePresence>
			{preview && position && (
				<motion.div
					key={preview.src}
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.6 }}
					className='bg-card pointer-events-none fixed z-100 min-h-[80px] w-[160px] overflow-hidden rounded-3xl p-4 shadow-sm backdrop-blur-sm'
					style={{
						left: position.x + PREVIEW_OFFSET_PX,
						top: position.y + PREVIEW_OFFSET_PX
					}}>
					<img src={preview.src} alt='' className='w-full rounded-xl object-cover' draggable={false} />
				</motion.div>
			)}
		</AnimatePresence>
	)
}
