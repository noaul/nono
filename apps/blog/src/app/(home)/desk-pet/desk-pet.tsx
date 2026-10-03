'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
	PET_SIZE,
	PET_SIZE_COMPACT,
	cheer,
	chooseSpeech,
	createPet,
	dragTo,
	extractTerrain,
	releaseDrag,
	startDrag,
	step,
	surfaceRotation,
	type PetInput,
	type PetSize,
	type PetState,
	type SpeechTrigger,
	type Terrain
} from './desk-pet-model'
import { DeskPetSprite } from './desk-pet-sprite'

type Props = {
	rootRef: React.RefObject<HTMLElement | null>
	sleepy: boolean
	panelKey: string | null
	notificationUnreadCount: number
	upcomingTitle: string | null
	focusRunning: boolean
	hour: number
	reducedMotion: boolean
	hidden: boolean
}

const COMPACT_QUERY = '(max-width: 720px)'
const SPEECH_DURATION_MS = 4000
const GREETING_DELAY_MS = 3000
/** Unread counts that arrive with the first load are not "new". */
const NOTIFICATION_GRACE_MS = 5000
const TERRAIN_REFRESH_MS = 2000
const CLICK_DISTANCE = 5
const CLICK_DURATION_MS = 250
const THROW_SAMPLE_MS = 100
const LOOK_RANGE = 400

type PointerSample = { x: number; y: number; t: number }
type DragSession = { pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; startedAt: number; dragging: boolean; samples: PointerSample[] }

function effectiveOpacity(element: HTMLElement, root: HTMLElement) {
	let opacity = 1
	for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
		const style = getComputedStyle(node)
		if (style.display === 'none' || style.visibility === 'hidden') return 0
		opacity *= Number(style.opacity)
	}
	return opacity
}

function readTerrain(root: HTMLElement, size: PetSize): Terrain {
	const sources = Array.from(root.querySelectorAll<HTMLElement>('[data-pet-terrain]')).map(element => ({
		id: element.dataset.petTerrain || '',
		rect: element.getBoundingClientRect(),
		opacity: effectiveOpacity(element, root)
	}))
	return extractTerrain(sources, { width: root.clientWidth, height: root.clientHeight }, size.height)
}

function paint(pet: HTMLDivElement | null, bubble: HTMLDivElement | null, state: PetState, viewportWidth: number) {
	if (!pet) return
	pet.style.transform = `translate3d(${state.x - state.width / 2}px, ${state.y - state.height / 2}px, 0) rotate(${surfaceRotation(state.surface)}deg)`
	if (pet.dataset.pose !== state.pose) pet.dataset.pose = state.pose
	if (pet.dataset.facing !== state.facing) pet.dataset.facing = state.facing
	if (pet.dataset.ready !== 'true') pet.dataset.ready = 'true'
	if (!bubble) return
	const reach = Math.max(state.width, state.height) / 2
	const x = Math.min(viewportWidth - 96, Math.max(96, state.x))
	const below = state.y - reach < 64
	bubble.style.transform = below
		? `translate3d(${x}px, ${state.y + reach + 8}px, 0) translate(-50%, 0)`
		: `translate3d(${x}px, ${state.y - reach - 8}px, 0) translate(-50%, -100%)`
}

export function DeskPet({ rootRef, sleepy, panelKey, notificationUnreadCount, upcomingTitle, focusRunning, hour, reducedMotion, hidden }: Props) {
	const petRef = useRef<HTMLDivElement>(null)
	const bubbleRef = useRef<HTMLDivElement>(null)
	const stateRef = useRef<PetState | null>(null)
	const terrainRef = useRef<Terrain | null>(null)
	const dragRef = useRef<DragSession | null>(null)
	const [compact, setCompact] = useState(false)
	const [speech, setSpeech] = useState<string | null>(null)
	const inputRef = useRef<PetInput>({ sleepy, panelKey, reducedMotion, compact })
	inputRef.current = { sleepy, panelKey, reducedMotion, compact }
	const contextRef = useRef({ upcomingTitle, focusRunning, hour })
	contextRef.current = { upcomingTitle, focusRunning, hour }
	const speechRef = useRef({ pageStartMs: 0, lastIdleSpeechMs: null as number | null, lastBreakMs: null as number | null, timer: 0 })

	const speak = (trigger: SpeechTrigger) => {
		const nowMs = Date.now()
		const memory = speechRef.current
		const result = chooseSpeech({ trigger, nowMs, pageStartMs: memory.pageStartMs, lastIdleSpeechMs: memory.lastIdleSpeechMs, lastBreakMs: memory.lastBreakMs, ...contextRef.current }, Math.random)
		if (!result) return
		if (trigger === 'idle') memory.lastIdleSpeechMs = nowMs
		if (result.kind === 'break') memory.lastBreakMs = nowMs
		setSpeech(result.text)
		window.clearTimeout(memory.timer)
		memory.timer = window.setTimeout(() => setSpeech(null), SPEECH_DURATION_MS)
	}
	const speakRef = useRef(speak)
	speakRef.current = speak

	useEffect(() => {
		const query = window.matchMedia(COMPACT_QUERY)
		const update = () => setCompact(query.matches)
		update()
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])

	useEffect(() => {
		const memory = speechRef.current
		memory.pageStartMs = Date.now()
		const greeting = window.setTimeout(() => speakRef.current('greeting'), GREETING_DELAY_MS)
		return () => {
			window.clearTimeout(greeting)
			window.clearTimeout(memory.timer)
		}
	}, [])

	const previousUnreadRef = useRef(notificationUnreadCount)
	useEffect(() => {
		const previous = previousUnreadRef.current
		previousUnreadRef.current = notificationUnreadCount
		if (notificationUnreadCount <= previous || Date.now() - speechRef.current.pageStartMs < NOTIFICATION_GRACE_MS) return
		if (stateRef.current) stateRef.current = cheer(stateRef.current)
		speakRef.current('notification')
	}, [notificationUnreadCount])

	useEffect(() => {
		const root = rootRef.current
		if (!root || hidden) return
		const size = compact ? PET_SIZE_COMPACT : PET_SIZE
		const refresh = () => { terrainRef.current = readTerrain(root, size) }
		refresh()
		if (!stateRef.current || stateRef.current.width !== size.width) stateRef.current = createPet(terrainRef.current!, size, Math.random)

		let frame = 0
		let last = performance.now()
		const tick = (now: number) => {
			frame = requestAnimationFrame(tick)
			const dt = Math.min(0.05, (now - last) / 1000)
			last = now
			if (document.hidden || !stateRef.current || !terrainRef.current) return
			const result = step(stateRef.current, dt, terrainRef.current, inputRef.current, Math.random)
			stateRef.current = result.state
			paint(petRef.current, bubbleRef.current, result.state, terrainRef.current.width)
			if (result.events.includes('speak')) speakRef.current('idle')
		}
		frame = requestAnimationFrame(tick)

		const interval = window.setInterval(refresh, TERRAIN_REFRESH_MS)
		const observer = new ResizeObserver(refresh)
		observer.observe(root)
		const look = (event: PointerEvent) => {
			const pet = petRef.current
			const state = stateRef.current
			if (!pet || !state) return
			const dx = event.clientX - state.x
			const dy = event.clientY - state.y
			const distance = Math.hypot(dx, dy)
			const near = distance > 1 && distance < LOOK_RANGE
			pet.style.setProperty('--pet-look-x', `${near ? (dx / distance) * 1.6 : 0}px`)
			pet.style.setProperty('--pet-look-y', `${near ? (dy / distance) * 1.2 : 0}px`)
		}
		window.addEventListener('pointermove', look, { passive: true })
		return () => {
			cancelAnimationFrame(frame)
			window.clearInterval(interval)
			observer.disconnect()
			window.removeEventListener('pointermove', look)
		}
	}, [rootRef, hidden, compact])

	useEffect(() => {
		const root = rootRef.current
		if (!root || hidden) return
		const size = compact ? PET_SIZE_COMPACT : PET_SIZE
		// Panels animate in and idle fades take ~0.9s; measure again once they settle.
		const timers = [320, 1000].map(delay => window.setTimeout(() => { terrainRef.current = readTerrain(root, size) }, delay))
		return () => timers.forEach(timer => window.clearTimeout(timer))
	}, [rootRef, hidden, compact, panelKey, sleepy])

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = stateRef.current
		if (!state || event.button !== 0) return
		event.currentTarget.setPointerCapture(event.pointerId)
		const t = performance.now()
		dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - state.x, offsetY: event.clientY - state.y, startX: event.clientX, startY: event.clientY, startedAt: t, dragging: false, samples: [{ x: event.clientX, y: event.clientY, t }] }
	}

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		const state = stateRef.current
		if (!drag || !state || drag.pointerId !== event.pointerId) return
		const t = performance.now()
		drag.samples = [...drag.samples.filter(sample => t - sample.t <= THROW_SAMPLE_MS), { x: event.clientX, y: event.clientY, t }]
		if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < CLICK_DISTANCE) return
		const next = drag.dragging ? state : startDrag(state)
		drag.dragging = true
		stateRef.current = dragTo(next, event.clientX - drag.offsetX, event.clientY - drag.offsetY)
		paint(petRef.current, bubbleRef.current, stateRef.current, terrainRef.current?.width ?? window.innerWidth)
	}

	const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		const state = stateRef.current
		if (!drag || !state || drag.pointerId !== event.pointerId) return
		dragRef.current = null
		if (drag.dragging) {
			const first = drag.samples[0]
			const last = drag.samples[drag.samples.length - 1]
			const seconds = Math.max(0.016, (last.t - first.t) / 1000)
			const throwing = event.type === 'pointerup' && drag.samples.length > 1
			stateRef.current = releaseDrag(state, throwing ? (last.x - first.x) / seconds : 0, throwing ? (last.y - first.y) / seconds : 0)
			return
		}
		if (event.type === 'pointerup' && performance.now() - drag.startedAt < CLICK_DURATION_MS) stateRef.current = cheer(state)
	}

	return <div className='desk-pet-layer' aria-hidden='true' data-hidden={hidden ? 'true' : 'false'}>
		<div
			ref={petRef}
			className='desk-pet'
			data-pose='idle'
			data-facing='right'
			style={compact ? { width: PET_SIZE_COMPACT.width, height: PET_SIZE_COMPACT.height } : { width: PET_SIZE.width, height: PET_SIZE.height }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endPointer}
			onPointerCancel={endPointer}>
			<DeskPetSprite />
		</div>
		<div ref={bubbleRef} className='desk-pet-bubble' data-visible={speech ? 'true' : 'false'}>{speech}</div>
	</div>
}
