'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import TopSVG from '@/svgs/top.svg'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

type ScrollTopButtonProps = {
	className?: string
	delay?: number
}

export function ScrollTopButton({ className, delay }: ScrollTopButtonProps) {
	const { copy } = useI18n()
	const reducedMotion = useReducedMotion()
	const [show, setShow] = useState(false)
	const [active, setActive] = useState(false)
	useEffect(() => {
		const timer = window.setTimeout(() => setShow(true), delay || 1000)
		return () => window.clearTimeout(timer)
	}, [delay])

	useEffect(() => {
		const handleScroll = () => {
			setActive(window.scrollY > 200)
		}
		handleScroll()
		window.addEventListener('scroll', handleScroll, { passive: true })
		return () => window.removeEventListener('scroll', handleScroll)
	}, [])

	// Declared before the early return: hooks must run in the same order on every render.
	const handleClick = useCallback(() => {
		window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
		setTimeout(() => setActive(false), 1000)
	}, [reducedMotion])

	if (!show || !active) return null

	return (
		<motion.button
			initial={reducedMotion ? false : { opacity: 0, scale: 0.4 }}
			animate={{ opacity: 1, scale: 1 }}
			whileHover={reducedMotion ? undefined : { scale: 1.05 }}
			whileTap={reducedMotion ? undefined : { scale: 0.95 }}
			onClick={handleClick}
			type='button'
			aria-label={copy('回到顶部', 'Scroll to top')}
			title={copy('回到顶部', 'Scroll to top')}
			className={cn('card text-secondary static gap-2 rounded-full p-3 text-sm', className)}>
			<TopSVG className='w-7' aria-hidden='true' />
		</motion.button>
	)
}
