'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { activateDialog } from '@/lib/dialog-behavior'

interface DialogModalProps {
	ariaLabel: string
	open: boolean
	onClose: () => void
	children: ReactNode
	className?: string
	overlayClassName?: string
	disableCloseOnOverlay?: boolean
	lockScroll?: boolean
	closeOnEsc?: boolean
}

export function DialogModal({ ariaLabel, open, onClose, children, className, disableCloseOnOverlay = false, lockScroll = true, closeOnEsc = true }: DialogModalProps) {
	const [mounted, setMounted] = useState(false)
	const reducedMotion = useReducedMotion()
	const panelRef = useRef<HTMLDivElement>(null)
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	useEffect(() => {
		setMounted(true)
	}, [])

	useEffect(() => {
		if (!open || !mounted || !panelRef.current) return
		return activateDialog(panelRef.current, {
			lockScroll,
			onClose: closeOnEsc ? () => onCloseRef.current() : undefined
		})
	}, [closeOnEsc, lockScroll, mounted, open])

	if (!mounted) return null

	return createPortal(
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={reducedMotion ? { duration: 0 } : undefined}
					className={'fixed inset-0 z-50 flex items-center justify-center bg-card p-4 backdrop-blur-xl'}
					onClick={disableCloseOnOverlay ? undefined : onClose}>
					<motion.div
						ref={panelRef}
						role='dialog'
						aria-modal='true'
						aria-label={ariaLabel}
						tabIndex={-1}
						initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={reducedMotion ? { duration: 0 } : undefined}
						exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
						className={cn('static outline-none focus-visible:ring-2 focus-visible:ring-brand/50', className)}
						onClick={e => e.stopPropagation()}>
						{children}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body
	)
}
