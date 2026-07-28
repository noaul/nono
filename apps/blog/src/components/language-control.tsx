'use client'

import { Check, Languages } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n, type Language } from '@/i18n'

/** Sits beside ColorModeControl and reuses its styling so the two read as one pair. */
export function LanguageControl() {
	const { language, setLanguage, copy } = useI18n()
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', onPointerDown)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [])

	const options: { value: Language; label: string }[] = [
		{ value: 'zh', label: '中文' },
		{ value: 'en', label: 'English' }
	]

	return (
		<div ref={rootRef} className='nodesk-language-mode'>
			<button
				type='button'
				className='nodesk-color-mode-trigger'
				aria-label={copy('切换界面语言', 'Change language')}
				aria-haspopup='menu'
				aria-expanded={open}
				title={copy('界面语言', 'Language')}
				onClick={() => setOpen(value => !value)}>
				<Languages className='size-[18px]' />
			</button>
			{open && (
				<div className='nodesk-color-mode-menu' role='menu'>
					{options.map(({ value, label }) => (
						<button
							key={value}
							type='button'
							role='menuitemradio'
							aria-checked={language === value}
							onClick={() => {
								setLanguage(value)
								setOpen(false)
							}}>
							<Languages className='size-4' />
							<span>{label}</span>
							{language === value && <Check className='text-brand size-4' />}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
