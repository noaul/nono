'use client'

import { Check, Laptop, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type ColorModePreference = 'system' | 'light' | 'dark'
type ResolvedColorMode = 'light' | 'dark'

const STORAGE_KEY = 'nono:color-mode'
const CHANGE_EVENT = 'nono-color-mode-change'
const options = [
	{ value: 'system' as const, label: '跟随系统', Icon: Laptop },
	{ value: 'light' as const, label: '浅色', Icon: Sun },
	{ value: 'dark' as const, label: '深色', Icon: Moon }
]

function normalizeMode(value: unknown): ColorModePreference {
	return value === 'light' || value === 'dark' ? value : 'system'
}

function applyMode(preference: ColorModePreference, mediaQuery?: MediaQueryList | null): ResolvedColorMode {
	const mode = preference === 'system' ? (mediaQuery?.matches ? 'dark' : 'light') : preference
	const root = document.documentElement
	root.dataset.colorMode = mode
	root.dataset.colorModePreference = preference
	root.style.colorScheme = mode
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#111318' : '#eeeeee')
	return mode
}

export function ColorModeControl() {
	const [preference, setPreference] = useState<ColorModePreference>('system')
	const [resolvedMode, setResolvedMode] = useState<ResolvedColorMode>('light')
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
		const readPreference = () => {
			try {
				return normalizeMode(window.localStorage.getItem(STORAGE_KEY))
			} catch {
				return 'system' as const
			}
		}
		const syncPreference = (nextPreference = readPreference()) => {
			setPreference(nextPreference)
			setResolvedMode(applyMode(nextPreference, mediaQuery))
		}
		const onSystemChange = () => {
			if (readPreference() === 'system') syncPreference('system')
		}
		const onStorage = () => syncPreference()
		const onSharedChange = (event: Event) => syncPreference(normalizeMode((event as CustomEvent).detail))
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}

		syncPreference()
		mediaQuery?.addEventListener('change', onSystemChange)
		window.addEventListener('storage', onStorage)
		window.addEventListener(CHANGE_EVENT, onSharedChange)
		document.addEventListener('pointerdown', onPointerDown)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			mediaQuery?.removeEventListener('change', onSystemChange)
			window.removeEventListener('storage', onStorage)
			window.removeEventListener(CHANGE_EVENT, onSharedChange)
			document.removeEventListener('pointerdown', onPointerDown)
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [])

	const selectMode = (nextPreference: ColorModePreference) => {
		try {
			window.localStorage.setItem(STORAGE_KEY, nextPreference)
		} catch {
			// The current page can still use the selected mode without persistence.
		}
		setPreference(nextPreference)
		setResolvedMode(applyMode(nextPreference, typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null))
		window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: nextPreference }))
		setOpen(false)
	}

	const CurrentIcon = preference === 'system' ? Laptop : resolvedMode === 'dark' ? Moon : Sun
	const currentLabel = options.find(option => option.value === preference)?.label ?? '跟随系统'

	return (
		<div ref={rootRef} className='nodesk-color-mode'>
			<button
				type='button'
				className='nodesk-color-mode-trigger'
				aria-label='切换显示模式'
				aria-haspopup='menu'
				aria-expanded={open}
				title={`显示模式：${currentLabel}`}
				onClick={() => setOpen(value => !value)}>
				<CurrentIcon className='size-[18px]' />
			</button>
			{open && (
				<div className='nodesk-color-mode-menu' role='menu'>
					{options.map(({ value, label, Icon }) => (
						<button key={value} type='button' role='menuitemradio' aria-checked={preference === value} onClick={() => selectMode(value)}>
							<Icon className='size-4' />
							<span>{label}</span>
							{preference === value && <Check className='text-brand size-4' />}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
