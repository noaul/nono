'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
	cheer,
	chooseSpeech,
	createPet,
	createShake,
	dragTo,
	extractTerrain,
	feedShake,
	makeDizzy,
	peekClip,
	releaseDrag,
	resolveCollisions,
	startDrag,
	step,
	surfaceRotation,
	withPeerHeads,
	type PetInput,
	type PetState,
	type Point,
	type ShakeMeter,
	type Species,
	type SpeechTrigger,
	type Terrain
} from './desk-pet-model'
import { createSocial, socialStep, type SocialState } from './desk-pet-social'
import { DeskPetSprite } from './desk-pet-sprite'

type Props = {
	rootRef: React.RefObject<HTMLElement | null>
	species: Species[]
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
const OUCH_GAP_MS = 5000
const SLING_DRAW = 240
const DIZZY_LINES = ['晕乎乎…', '眼冒金星～', '别晃啦！']

type PointerSample = { x: number; y: number; t: number }
type DragSession = { petId: string; pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; startedAt: number; dragging: boolean; samples: PointerSample[]; shake: ShakeMeter }

const restSlot = (index: number, count: number) => count < 2 ? 0 : index === 0 ? -1 : 1

function effectiveOpacity(element: HTMLElement, root: HTMLElement) {
	let opacity = 1
	for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
		const style = getComputedStyle(node)
		if (style.display === 'none' || style.visibility === 'hidden') return 0
		opacity *= Number(style.opacity)
	}
	return opacity
}

function readTerrain(root: HTMLElement, petHeight: number): Terrain {
	const sources = Array.from(root.querySelectorAll<HTMLElement>('[data-pet-terrain]')).map(element => ({
		id: element.dataset.petTerrain || '',
		rect: element.getBoundingClientRect(),
		opacity: effectiveOpacity(element, root)
	}))
	return extractTerrain(sources, { width: root.clientWidth, height: root.clientHeight }, petHeight)
}

function setData(element: HTMLElement, key: string, value: string) {
	if (element.dataset[key] !== value) element.dataset[key] = value
}

function paint(pet: HTMLDivElement | undefined, bubble: HTMLDivElement | undefined, state: PetState, terrain: Terrain | null) {
	if (!pet) return
	const rotation = surfaceRotation(state.surface) + (state.pose === 'tumble' ? state.spin : 0)
	pet.style.transform = `translate3d(${state.x - state.width / 2}px, ${state.y - state.height / 2}px, 0) rotate(${rotation}deg)`
	const clip = terrain ? peekClip(state, terrain) : null
	const clipPath = clip ? `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px)` : ''
	if (pet.dataset.clip !== clipPath) {
		pet.dataset.clip = clipPath
		pet.style.clipPath = clipPath
	}
	const pull = state.tension ? Math.min(1, Math.hypot(state.tension.x, state.tension.y) / SLING_DRAW) : 0
	setData(pet, 'tense', pull > 0.02 ? 'true' : 'false')
	if (pull > 0.02 && state.tension) {
		pet.style.setProperty('--pet-tension', pull.toFixed(3))
		pet.style.setProperty('--pet-tension-angle', `${Math.atan2(state.tension.y, state.tension.x)}rad`)
	}
	setData(pet, 'pose', state.pose)
	setData(pet, 'facing', state.facing)
	setData(pet, 'dizzy', state.dizzyFor > 0 ? 'true' : 'false')
	setData(pet, 'ready', 'true')
	if (!bubble) return
	const viewportWidth = terrain?.width ?? window.innerWidth
	const reach = Math.max(state.width, state.height) / 2
	const x = Math.min(viewportWidth - 96, Math.max(96, state.x))
	const below = state.y - reach < 64
	bubble.style.transform = below
		? `translate3d(${x}px, ${state.y + reach + 8}px, 0) translate(-50%, 0)`
		: `translate3d(${x}px, ${state.y - reach - 8}px, 0) translate(-50%, -100%)`
}

export function DeskPets({ rootRef, species, sleepy, panelKey, notificationUnreadCount, upcomingTitle, focusRunning, hour, reducedMotion, hidden }: Props) {
	const petEls = useRef(new Map<string, HTMLDivElement>())
	const bubbleEls = useRef(new Map<string, HTMLDivElement>())
	const petsRef = useRef<PetState[]>([])
	const socialRef = useRef<SocialState>(createSocial(Math.random))
	const terrainRef = useRef<Terrain | null>(null)
	const dragRef = useRef<DragSession | null>(null)
	const pointerRef = useRef<Point | null>(null)
	const ouchRef = useRef(new Map<string, number>())
	const [compact, setCompact] = useState(false)
	const [speech, setSpeech] = useState<Record<string, string>>({})
	const inputRef = useRef({ sleepy, panelKey, reducedMotion, compact })
	inputRef.current = { sleepy, panelKey, reducedMotion, compact }
	const contextRef = useRef({ upcomingTitle, focusRunning, hour })
	contextRef.current = { upcomingTitle, focusRunning, hour }
	const speechRef = useRef({ pageStartMs: 0, lastIdleSpeechMs: null as number | null, lastBreakMs: null as number | null, timers: new Map<string, number>(), pending: new Set<number>() })
	const speciesKey = species.map(item => item.id).join(',')
	const firstPetId = species[0]?.id ?? null

	const say = (petId: string, text: string) => {
		const memory = speechRef.current
		setSpeech(current => ({ ...current, [petId]: text }))
		window.clearTimeout(memory.timers.get(petId))
		memory.timers.set(petId, window.setTimeout(() => setSpeech(current => {
			const next = { ...current }
			delete next[petId]
			return next
		}), SPEECH_DURATION_MS))
	}

	const speak = (trigger: SpeechTrigger, petId: string | null) => {
		if (!petId) return
		const nowMs = Date.now()
		const memory = speechRef.current
		const result = chooseSpeech({ trigger, nowMs, pageStartMs: memory.pageStartMs, lastIdleSpeechMs: memory.lastIdleSpeechMs, lastBreakMs: memory.lastBreakMs, ...contextRef.current }, Math.random)
		if (!result) return
		if (trigger === 'idle') memory.lastIdleSpeechMs = nowMs
		if (result.kind === 'break') memory.lastBreakMs = nowMs
		say(petId, result.text)
	}
	const speakRef = useRef(speak)
	speakRef.current = speak

	/** Reactions that come from physics rather than from the speech schedule. */
	const react = (before: PetState | undefined, after: PetState) => {
		if (before && before.dizzyFor === 0 && after.dizzyFor > 0) say(after.id, DIZZY_LINES[Math.floor(Math.random() * DIZZY_LINES.length)])
		else if (before && before.pose !== 'tumble' && after.pose === 'tumble' && before.pose === 'drag') say(after.id, '咻——！')
	}
	const reactRef = useRef(react)
	reactRef.current = react
	const sayRef = useRef(say)
	sayRef.current = say

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
		const greeting = window.setTimeout(() => speakRef.current('greeting', petsRef.current[0]?.id ?? null), GREETING_DELAY_MS)
		return () => {
			window.clearTimeout(greeting)
			memory.timers.forEach(timer => window.clearTimeout(timer))
			memory.pending.forEach(timer => window.clearTimeout(timer))
		}
	}, [])

	const previousUnreadRef = useRef(notificationUnreadCount)
	useEffect(() => {
		const previous = previousUnreadRef.current
		previousUnreadRef.current = notificationUnreadCount
		if (notificationUnreadCount <= previous || Date.now() - speechRef.current.pageStartMs < NOTIFICATION_GRACE_MS) return
		petsRef.current = petsRef.current.map(cheer)
		speakRef.current('notification', firstPetId)
	}, [notificationUnreadCount, firstPetId])

	useEffect(() => {
		const root = rootRef.current
		if (!root || hidden || !species.length) return
		const tallest = Math.max(...species.map(item => (compact ? item.compactSize : item.size).height))
		const refresh = () => { terrainRef.current = readTerrain(root, tallest) }
		refresh()
		petsRef.current = species.map((item, index) => {
			const size = compact ? item.compactSize : item.size
			const existing = petsRef.current.find(pet => pet.id === item.id && pet.width === size.width)
			return existing ?? createPet(terrainRef.current!, item, Math.random, { compact, restSlot: restSlot(index, species.length) })
		})

		let frame = 0
		let last = performance.now()
		const tick = (now: number) => {
			frame = requestAnimationFrame(tick)
			const dt = Math.min(0.05, (now - last) / 1000)
			last = now
			const terrain = terrainRef.current
			if (document.hidden || !terrain) return
			const pets = petsRef.current
			const input = inputRef.current
			const stepped = pets.map((pet, index) => {
				const petInput: PetInput = { ...input, restSlot: restSlot(index, pets.length), pointer: pointerRef.current }
				const result = step(pet, dt, withPeerHeads(terrain, pets, pet), petInput, Math.random)
				if (result.events.includes('speak')) speakRef.current('idle', pet.id)
				return result.state
			})
			const social = socialStep(stepped, socialRef.current, dt, terrain, input, Math.random)
			socialRef.current = social.social
			const collided = resolveCollisions(social.pets)
			const nowMs = Date.now()
			for (const id of new Set(collided.bumps)) {
				if (nowMs - (ouchRef.current.get(id) ?? 0) < OUCH_GAP_MS) continue
				ouchRef.current.set(id, nowMs)
				sayRef.current(id, '哎哟')
			}
			collided.pets.forEach((pet, index) => reactRef.current(pets[index], pet))
			petsRef.current = collided.pets
			for (const line of social.speech) {
				const timer = window.setTimeout(() => {
					speechRef.current.pending.delete(timer)
					sayRef.current(line.petId, line.text)
				}, line.delayMs)
				speechRef.current.pending.add(timer)
			}
			for (const pet of collided.pets) paint(petEls.current.get(pet.id), bubbleEls.current.get(pet.id), pet, terrain)
		}
		frame = requestAnimationFrame(tick)

		const interval = window.setInterval(refresh, TERRAIN_REFRESH_MS)
		const observer = new ResizeObserver(refresh)
		observer.observe(root)
		const look = (event: PointerEvent) => {
			pointerRef.current = { x: event.clientX, y: event.clientY }
			for (const pet of petsRef.current) {
				const element = petEls.current.get(pet.id)
				if (!element) continue
				const dx = event.clientX - pet.x
				const dy = event.clientY - pet.y
				const distance = Math.hypot(dx, dy)
				const near = distance > 1 && distance < LOOK_RANGE
				element.style.setProperty('--pet-look-x', `${near ? (dx / distance) * 1.6 : 0}px`)
				element.style.setProperty('--pet-look-y', `${near ? (dy / distance) * 1.2 : 0}px`)
			}
		}
		window.addEventListener('pointermove', look, { passive: true })
		return () => {
			cancelAnimationFrame(frame)
			window.clearInterval(interval)
			observer.disconnect()
			window.removeEventListener('pointermove', look)
		}
		// `speciesKey` stands in for `species`, which is a fresh array on every render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rootRef, hidden, compact, speciesKey])

	useEffect(() => {
		const root = rootRef.current
		if (!root || hidden || !species.length) return
		const tallest = Math.max(...species.map(item => (compact ? item.compactSize : item.size).height))
		// Panels animate in and idle fades take ~0.9s; measure again once they settle.
		const timers = [320, 1000].map(delay => window.setTimeout(() => { terrainRef.current = readTerrain(root, tallest) }, delay))
		return () => timers.forEach(timer => window.clearTimeout(timer))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rootRef, hidden, compact, speciesKey, panelKey, sleepy])

	const updatePet = (petId: string, change: (pet: PetState) => PetState) => {
		const before = petsRef.current.find(item => item.id === petId)
		petsRef.current = petsRef.current.map(pet => pet.id === petId ? change(pet) : pet)
		const pet = petsRef.current.find(item => item.id === petId)
		if (!pet) return
		react(before, pet)
		paint(petEls.current.get(petId), bubbleEls.current.get(petId), pet, terrainRef.current)
	}

	const onPointerDown = (petId: string, event: ReactPointerEvent<HTMLDivElement>) => {
		const pet = petsRef.current.find(item => item.id === petId)
		if (!pet || event.button !== 0 || dragRef.current) return
		event.currentTarget.setPointerCapture(event.pointerId)
		const t = performance.now()
		dragRef.current = { petId, pointerId: event.pointerId, offsetX: event.clientX - pet.x, offsetY: event.clientY - pet.y, startX: event.clientX, startY: event.clientY, startedAt: t, dragging: false, samples: [{ x: event.clientX, y: event.clientY, t }], shake: createShake(event.clientX, event.clientY, t) }
	}

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== event.pointerId) return
		const t = performance.now()
		drag.samples = [...drag.samples.filter(sample => t - sample.t <= THROW_SAMPLE_MS), { x: event.clientX, y: event.clientY, t }]
		if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < CLICK_DISTANCE) return
		const starting = !drag.dragging
		drag.dragging = true
		const shake = feedShake(drag.shake, event.clientX, event.clientY, t)
		drag.shake = shake.meter
		const bounds = terrainRef.current ?? { width: window.innerWidth, height: window.innerHeight }
		updatePet(drag.petId, pet => {
			const moved = dragTo(starting ? startDrag(pet) : pet, event.clientX - drag.offsetX, event.clientY - drag.offsetY, bounds)
			return shake.shaken ? makeDizzy(moved) : moved
		})
	}

	const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== event.pointerId) return
		dragRef.current = null
		if (drag.dragging) {
			const first = drag.samples[0]
			const last = drag.samples[drag.samples.length - 1]
			const seconds = Math.max(0.016, (last.t - first.t) / 1000)
			const throwing = event.type === 'pointerup' && drag.samples.length > 1
			updatePet(drag.petId, pet => releaseDrag(pet, throwing ? (last.x - first.x) / seconds : 0, throwing ? (last.y - first.y) / seconds : 0))
			return
		}
		if (event.type === 'pointerup' && performance.now() - drag.startedAt < CLICK_DURATION_MS) updatePet(drag.petId, cheer)
	}

	return <div className='desk-pet-layer' aria-hidden='true' data-hidden={hidden ? 'true' : 'false'}>
		{species.map(item => {
			const size = compact ? item.compactSize : item.size
			return <div
				key={item.id}
				ref={element => { if (element) petEls.current.set(item.id, element); else petEls.current.delete(item.id) }}
				className='desk-pet'
				data-species={item.id}
				data-pose='idle'
				data-facing='right'
				style={{ width: size.width, height: size.height }}
				onPointerDown={event => onPointerDown(item.id, event)}
				onPointerMove={onPointerMove}
				onPointerUp={endPointer}
				onPointerCancel={endPointer}>
				<DeskPetSprite species={item} />
			</div>
		})}
		{species.map(item => <div
			key={`${item.id}-bubble`}
			ref={element => { if (element) bubbleEls.current.set(item.id, element); else bubbleEls.current.delete(item.id) }}
			className='desk-pet-bubble'
			data-visible={speech[item.id] ? 'true' : 'false'}>{speech[item.id]}</div>)}
	</div>
}
