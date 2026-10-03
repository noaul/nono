/**
 * Pure logic for the NoDesk desk pet: terrain from element rects, physics and behaviour.
 * Nothing here touches the DOM so the whole pet can be exercised with node --test.
 */

export type Rect = { left: number; top: number; width: number; height: number }
export type TerrainSource = { id: string; rect: Rect; opacity: number }
export type Side = 'left' | 'right'
/** Top edge of an element; one-way, only collides while falling. */
export type Platform = { id: string; y: number; x1: number; x2: number }
/** `side` is the element side the wall belongs to; a pet on a left wall sits left of the element. */
export type Wall = { id: string; side: Side; x: number; y1: number; y2: number }
export type Ceiling = { id: string; y: number; x1: number; x2: number }
export type Terrain = { width: number; height: number; platforms: Platform[]; walls: Wall[]; ceilings: Ceiling[] }

export type Pose = 'idle' | 'walk' | 'run' | 'crouch' | 'jump' | 'land' | 'climb' | 'hang' | 'fly' | 'fall' | 'drag' | 'happy' | 'sleep' | 'stretch'
export type Surface =
	| { kind: 'platform'; id: string }
	| { kind: 'wall'; id: string; side: Side }
	| { kind: 'ceiling'; id: string }
	| { kind: 'air' }
export type Flight = { fromX: number; fromY: number; toX: number; toY: number; t: number; duration: number; surface: Surface }
export type PetSize = { width: number; height: number }

/** Position is the body centre in viewport px; velocity is px/s. */
export type PetState = PetSize & {
	x: number
	y: number
	vx: number
	vy: number
	pose: Pose
	poseTime: number
	facing: Side
	surface: Surface
	decisionIn: number
	walkTo: number | null
	edge: Side | null
	climbDir: 'up' | 'down'
	hangFor: number
	launch: { vx: number; vy: number } | null
	flight: Flight | null
	goalId: string | null
	goalTries: number
	goalWait: number
	lastPanelKey: string | null
}

export type PetInput = { sleepy: boolean; panelKey: string | null; reducedMotion: boolean; compact: boolean }
export type PetEvent = 'speak'
export type Rng = () => number

export const FLOOR_ID = 'floor'
export const REST_ID = 'clock'
export const PANEL_ID = 'panel'
export const PET_SIZE: PetSize = { width: 44, height: 38 }
export const PET_SIZE_COMPACT: PetSize = { width: 34, height: 29 }

export const GRAVITY = 1800
const WALK_SPEED = 40
const RUN_SPEED = 110
const CLIMB_SPEED = 30
const MAX_THROW_SPEED = 2200
const BOUNCE = 0.4
const GLIDE_AFTER = 0.4
const GLIDE_SPEED = 200
const JUMP_REACH_X = 260
const JUMP_REACH_UP = 160
const JUMP_CLEARANCE = 40
const FLIGHT_ARC = 40
const CROUCH_TIME = 0.12
const LAND_TIME = 0.16
const HAPPY_TIME = 0.9
const STRETCH_TIME = 0.6
const GOAL_WAIT_LIMIT = 1.5
const GOAL_MAX_TRIES = 4
const MIN_OPACITY = 0.5
const MIN_PLATFORM_WIDTH = 48
const MIN_WALL_HEIGHT = 40
const MIN_CEILING_WIDTH = 60

/** Clamps into [min, max]; a range narrower than the pet collapses to its midpoint. */
const clamp = (value: number, min: number, max: number) => min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value))
const pickOne = <T>(items: T[], rng: Rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
const flip = (side: Side): Side => side === 'left' ? 'right' : 'left'

export function extractTerrain(sources: TerrainSource[], viewport: { width: number; height: number }, petHeight: number): Terrain {
	const platforms: Platform[] = [{ id: FLOOR_ID, y: viewport.height, x1: 0, x2: viewport.width }]
	const walls: Wall[] = []
	const ceilings: Ceiling[] = []
	for (const { id, rect, opacity } of sources) {
		if (opacity < MIN_OPACITY || rect.width <= 0 || rect.height <= 0) continue
		const right = rect.left + rect.width
		const bottom = rect.top + rect.height
		if (rect.top >= petHeight + 4 && rect.width >= MIN_PLATFORM_WIDTH) platforms.push({ id, y: rect.top, x1: rect.left, x2: right })
		if (rect.height >= MIN_WALL_HEIGHT) {
			if (rect.left >= petHeight) walls.push({ id, side: 'left', x: rect.left, y1: rect.top, y2: bottom })
			if (right <= viewport.width - petHeight) walls.push({ id, side: 'right', x: right, y1: rect.top, y2: bottom })
		}
		if (rect.width >= MIN_CEILING_WIDTH && bottom < viewport.height - petHeight) ceilings.push({ id, y: bottom, x1: rect.left, x2: right })
	}
	return { width: viewport.width, height: viewport.height, platforms, walls, ceilings }
}

export function surfaceRotation(surface: Surface) {
	if (surface.kind === 'wall') return surface.side === 'left' ? -90 : 90
	return surface.kind === 'ceiling' ? 180 : 0
}

const findPlatform = (terrain: Terrain, id: string) => terrain.platforms.find(item => item.id === id)
const floorOf = (terrain: Terrain): Platform => findPlatform(terrain, FLOOR_ID) ?? { id: FLOOR_ID, y: terrain.height, x1: 0, x2: terrain.width }
const restPlatform = (terrain: Terrain) => findPlatform(terrain, REST_ID) ?? floorOf(terrain)
const bottomOf = (s: PetState) => s.y + s.height / 2

function setPose(s: PetState, pose: Pose): PetState {
	return s.pose === pose ? s : { ...s, pose, poseTime: 0 }
}

function standOn(s: PetState, platform: Platform, x: number): PetState {
	return {
		...s,
		x: clamp(x, platform.x1 + s.width / 2, platform.x2 - s.width / 2),
		y: platform.y - s.height / 2,
		vx: 0,
		vy: 0,
		surface: { kind: 'platform', id: platform.id },
		walkTo: null,
		edge: null,
		launch: null,
		flight: null
	}
}

function fallFrom(s: PetState, vx = 0): PetState {
	return { ...setPose(s, 'fall'), surface: { kind: 'air' }, vx, vy: 0, walkTo: null, edge: null, launch: null, flight: null }
}

function wallAnchor(s: PetState, wall: Wall, y: number) {
	return {
		x: wall.side === 'left' ? wall.x - s.height / 2 : wall.x + s.height / 2,
		y: clamp(y, wall.y1 + s.width / 2, wall.y2 - s.width / 2)
	}
}

export function createPet(terrain: Terrain, size: PetSize, rng: Rng): PetState {
	const base: PetState = {
		...size,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		pose: 'idle',
		poseTime: 0,
		facing: rng() < 0.5 ? 'left' : 'right',
		surface: { kind: 'air' },
		decisionIn: 1 + rng() * 2,
		walkTo: null,
		edge: null,
		climbDir: 'up',
		hangFor: 0,
		launch: null,
		flight: null,
		goalId: null,
		goalTries: 0,
		goalWait: 0,
		lastPanelKey: null
	}
	const rest = restPlatform(terrain)
	return standOn(base, rest, rest.x1 + (rest.x2 - rest.x1) * (0.25 + rng() * 0.5))
}

export function canJump(s: PetState, platform: Platform, x: number) {
	return Math.abs(x - s.x) <= JUMP_REACH_X && bottomOf(s) - platform.y <= JUMP_REACH_UP
}

/** Launch velocity for a ballistic hop that clears the higher end by JUMP_CLEARANCE. */
export function jumpVelocity(fromX: number, fromBottom: number, toX: number, toTop: number) {
	const rise = fromBottom - toTop
	const peak = Math.max(rise, 0) + JUMP_CLEARANCE
	const vy = -Math.sqrt(2 * GRAVITY * peak)
	const duration = -vy / GRAVITY + Math.sqrt((2 * (peak - rise)) / GRAVITY)
	return { vx: (toX - fromX) / duration, vy }
}

function flyTo(s: PetState, toX: number, toY: number, surface: Surface): PetState {
	const duration = clamp(Math.hypot(toX - s.x, toY - s.y) / 500, 0.8, 1.6)
	return {
		...setPose(s, 'fly'),
		facing: toX < s.x ? 'left' : 'right',
		surface: { kind: 'air' },
		vx: 0,
		vy: 0,
		walkTo: null,
		edge: null,
		launch: null,
		flight: { fromX: s.x, fromY: s.y, toX, toY, t: 0, duration, surface }
	}
}

export function travelToPlatform(s: PetState, platform: Platform, x: number, forceFly = false): PetState {
	const toX = clamp(x, platform.x1 + s.width / 2, platform.x2 - s.width / 2)
	if (!forceFly && s.surface.kind === 'platform' && canJump(s, platform, toX)) {
		return {
			...setPose(s, 'crouch'),
			facing: toX < s.x ? 'left' : toX > s.x ? 'right' : s.facing,
			launch: jumpVelocity(s.x, bottomOf(s), toX, platform.y),
			walkTo: null,
			edge: null
		}
	}
	return flyTo(s, toX, platform.y - s.height / 2, { kind: 'platform', id: platform.id })
}

export function startDrag(s: PetState): PetState {
	return { ...setPose(s, 'drag'), surface: { kind: 'air' }, vx: 0, vy: 0, walkTo: null, edge: null, launch: null, flight: null }
}

export function dragTo(s: PetState, x: number, y: number): PetState {
	const facing = x < s.x - 1 ? 'left' : x > s.x + 1 ? 'right' : s.facing
	return { ...s, x, y, facing }
}

export function releaseDrag(s: PetState, vx: number, vy: number): PetState {
	const speed = Math.hypot(vx, vy)
	const scale = speed > MAX_THROW_SPEED ? MAX_THROW_SPEED / speed : 1
	return { ...setPose(s, 'fall'), surface: { kind: 'air' }, vx: vx * scale, vy: vy * scale }
}

/** A poke or a new notification: hop for joy, or stretch awake if asleep. */
export function cheer(s: PetState): PetState {
	if (s.pose === 'sleep') return setPose(s, 'stretch')
	if (s.surface.kind !== 'platform' || !['idle', 'walk', 'run', 'land', 'happy'].includes(s.pose)) return s
	return { ...setPose(s, 'happy'), walkTo: null, edge: null }
}

export function step(prev: PetState, dt: number, terrain: Terrain, input: PetInput, rng: Rng): { state: PetState; events: PetEvent[] } {
	const events: PetEvent[] = []
	let s: PetState = { ...prev, poseTime: prev.poseTime + dt }
	if (s.pose === 'drag') return { state: s, events }
	if (input.reducedMotion) return { state: restInPlace(s, terrain, input), events }
	s = followGoals(reattach(s, terrain), input)
	const surface = s.surface
	if (surface.kind === 'air') s = s.flight ? stepFlight(s, dt, terrain) : stepAir(s, dt, terrain)
	else if (surface.kind === 'wall') s = stepWall(s, dt, terrain, rng)
	else if (surface.kind === 'ceiling') s = s.poseTime >= s.hangFor ? fallFrom(s) : s
	else s = stepPlatform(s, dt, findPlatform(terrain, surface.id)!, terrain, input, rng, events)
	return { state: s, events }
}

function restInPlace(s: PetState, terrain: Terrain, input: PetInput): PetState {
	const rest = restPlatform(terrain)
	const placed = standOn(s, rest, (rest.x1 + rest.x2) / 2)
	return setPose(placed, input.sleepy ? 'sleep' : 'idle')
}

/** Re-snaps to a surface that moved, or drops the pet when it vanished. */
function reattach(s: PetState, terrain: Terrain): PetState {
	const surface = s.surface
	if (surface.kind === 'platform') {
		const platform = findPlatform(terrain, surface.id)
		if (!platform || s.x < platform.x1 - 2 || s.x > platform.x2 + 2) return fallFrom(s)
		const y = platform.y - s.height / 2
		return s.y === y ? s : { ...s, y }
	}
	if (surface.kind === 'wall') {
		const wall = terrain.walls.find(item => item.id === surface.id && item.side === surface.side)
		if (!wall || s.y < wall.y1 - s.width || s.y > wall.y2 + s.width) return fallFrom(s)
		return { ...s, x: wallAnchor(s, wall, s.y).x }
	}
	if (surface.kind === 'ceiling') {
		const ceiling = terrain.ceilings.find(item => item.id === surface.id)
		if (!ceiling || s.x < ceiling.x1 - 2 || s.x > ceiling.x2 + 2) return fallFrom(s)
		return { ...s, y: ceiling.y + s.height / 2 }
	}
	return s
}

function setGoal(s: PetState, id: string): PetState {
	const next = { ...s, goalId: id, goalTries: 0, goalWait: 0 }
	return next.pose === 'walk' || next.pose === 'run' ? { ...setPose(next, 'idle'), walkTo: null, edge: null } : next
}

function followGoals(s: PetState, input: PetInput): PetState {
	let next = s
	if (input.panelKey !== s.lastPanelKey) {
		next = { ...next, lastPanelKey: input.panelKey }
		if (input.panelKey && !input.sleepy) next = setGoal(next, PANEL_ID)
		else if (next.goalId === PANEL_ID) next = { ...next, goalId: null }
	}
	if (input.sleepy) {
		if (next.pose !== 'sleep' && next.goalId !== REST_ID) next = setGoal(next, REST_ID)
		return next
	}
	if (next.pose === 'sleep') next = setPose(next, 'stretch')
	return next.goalId === REST_ID ? { ...next, goalId: null } : next
}

function stepPlatform(s: PetState, dt: number, platform: Platform, terrain: Terrain, input: PetInput, rng: Rng, events: PetEvent[]): PetState {
	switch (s.pose) {
		case 'crouch':
			if (s.poseTime < CROUCH_TIME) return s
			return s.launch ? { ...setPose(s, 'jump'), surface: { kind: 'air' }, vx: s.launch.vx, vy: s.launch.vy, launch: null } : setPose(s, 'idle')
		case 'land':
			return s.poseTime >= LAND_TIME ? arrive(s, input) : s
		case 'happy':
			return s.poseTime >= HAPPY_TIME ? setPose(s, 'idle') : s
		case 'stretch':
			return s.poseTime >= STRETCH_TIME ? setPose(s, 'idle') : s
		case 'sleep':
			return s
		case 'walk':
		case 'run':
			return stepWalk(s, dt, platform, terrain, rng)
		default:
			return decideIfDue(s, dt, platform, terrain, input, rng, events)
	}
}

function arrive(s: PetState, input: PetInput): PetState {
	const onId = s.surface.kind === 'platform' ? s.surface.id : null
	const next = s.goalId !== null && s.goalId === onId ? { ...s, goalId: null, goalTries: 0 } : s
	if (input.sleepy && onId === REST_ID) return setPose(next, 'sleep')
	return { ...setPose(next, 'idle'), decisionIn: 1.2 }
}

function decideIfDue(s: PetState, dt: number, platform: Platform, terrain: Terrain, input: PetInput, rng: Rng, events: PetEvent[]): PetState {
	if (s.goalId === platform.id) return arrive(s, input)
	if (s.goalId) {
		const goal = findPlatform(terrain, s.goalId)
		if (!goal || s.goalTries >= GOAL_MAX_TRIES) {
			if (input.sleepy) return setPose({ ...s, goalId: null }, 'sleep')
			// A freshly opened panel needs a moment before its rect is measured.
			return goal || s.goalWait + dt > GOAL_WAIT_LIMIT ? { ...s, goalId: null } : { ...s, goalWait: s.goalWait + dt }
		}
		const x = (goal.x1 + goal.x2) / 2 + (rng() - 0.5) * (goal.x2 - goal.x1) * 0.5
		return travelToPlatform({ ...s, goalTries: s.goalTries + 1 }, goal, x, s.goalTries >= 1)
	}
	const decisionIn = s.decisionIn - dt
	if (decisionIn > 0) return { ...s, decisionIn }
	return decide({ ...s, decisionIn: 2 + rng() * 4 }, platform, terrain, input, rng, events)
}

function decide(s: PetState, platform: Platform, terrain: Terrain, input: PetInput, rng: Rng, events: PetEvent[]): PetState {
	const roll = rng()
	const climbWeight = input.compact ? 0.05 : 0.1
	if (roll < 0.35) return startWalk(s, platform, rng)
	if (roll < 0.6) return { ...s, facing: flip(s.facing), decisionIn: 1.5 + rng() * 1.5 }
	if (roll < 0.75) {
		const near = terrain.platforms.filter(other => other.id !== platform.id && canJump(s, other, clamp(s.x, other.x1, other.x2)))
		if (!near.length) return startWalk(s, platform, rng)
		const target = pickOne(near, rng)
		return travelToPlatform(s, target, clamp(s.x + (rng() - 0.5) * 160, target.x1, target.x2))
	}
	if (roll < 0.75 + climbWeight) return startClimb(s, platform, terrain, rng)
	if (roll < 0.85 + climbWeight) {
		const others = terrain.platforms.filter(other => other.id !== platform.id)
		if (!others.length) return startWalk(s, platform, rng)
		const target = pickOne(others, rng)
		return travelToPlatform(s, target, target.x1 + (target.x2 - target.x1) * rng(), true)
	}
	events.push('speak')
	return s
}

function startWalk(s: PetState, platform: Platform, rng: Rng): PetState {
	const min = platform.x1 + s.width / 2
	const max = platform.x2 - s.width / 2
	const walkTo = clamp(min + (max - min) * rng(), min, max)
	const run = Math.abs(walkTo - s.x) > 200 && rng() < 0.3
	return { ...setPose(s, run ? 'run' : 'walk'), walkTo, edge: null }
}

function startClimb(s: PetState, platform: Platform, terrain: Terrain, rng: Rng): PetState {
	const ownWalls = terrain.walls.filter(wall => wall.id === platform.id)
	if (ownWalls.length) {
		const wall = pickOne(ownWalls, rng)
		const walkTo = clamp(wall.side === 'left' ? platform.x1 : platform.x2, platform.x1 + s.width / 2, platform.x2 - s.width / 2)
		return { ...setPose(s, 'walk'), edge: wall.side, walkTo }
	}
	if (!terrain.walls.length) return startWalk(s, platform, rng)
	const wall = pickOne(terrain.walls, rng)
	const anchor = wallAnchor(s, wall, wall.y2)
	return { ...flyTo(s, anchor.x, anchor.y, { kind: 'wall', id: wall.id, side: wall.side }), climbDir: 'up' }
}

function stepWalk(s: PetState, dt: number, platform: Platform, terrain: Terrain, rng: Rng): PetState {
	if (s.walkTo === null) return setPose(s, 'idle')
	const direction = Math.sign(s.walkTo - s.x)
	const x = s.x + direction * (s.pose === 'run' ? RUN_SPEED : WALK_SPEED) * dt
	const arrived = direction === 0 || (direction > 0 ? x >= s.walkTo : x <= s.walkTo)
	if (!arrived) return { ...s, x, facing: direction < 0 ? 'left' : 'right' }
	const atTarget = { ...s, x: s.walkTo, walkTo: null }
	return atTarget.edge ? atEdge(atTarget, platform, terrain, rng) : setPose(atTarget, 'idle')
}

/** At a platform edge: climb down its side, turn back, or hop off. */
function atEdge(s: PetState, platform: Platform, terrain: Terrain, rng: Rng): PetState {
	const side = s.edge!
	const base = { ...s, edge: null }
	const wall = terrain.walls.find(item => item.id === platform.id && item.side === side)
	if (wall && rng() < 0.6) {
		const anchor = wallAnchor(s, wall, wall.y1)
		return { ...setPose(base, 'climb'), ...anchor, surface: { kind: 'wall', id: wall.id, side }, climbDir: 'down' }
	}
	if (rng() < 0.5) return { ...setPose(base, 'idle'), facing: flip(side) }
	return { ...setPose(base, 'crouch'), facing: side, launch: { vx: side === 'left' ? -120 : 120, vy: -280 } }
}

function stepWall(s: PetState, dt: number, terrain: Terrain, rng: Rng): PetState {
	const surface = s.surface as Extract<Surface, { kind: 'wall' }>
	const wall = terrain.walls.find(item => item.id === surface.id && item.side === surface.side)!
	const y = s.y + (s.climbDir === 'up' ? -1 : 1) * CLIMB_SPEED * dt
	if (s.climbDir === 'up' && y - s.width / 2 <= wall.y1) {
		const top = findPlatform(terrain, wall.id)
		if (!top) return fallFrom(s)
		const x = wall.side === 'left' ? top.x1 : top.x2
		return { ...setPose(standOn(s, top, x), 'land'), facing: flip(wall.side) }
	}
	if (s.climbDir === 'down' && y + s.width / 2 >= wall.y2) {
		const ceiling = terrain.ceilings.find(item => item.id === wall.id)
		if (!ceiling || rng() < 0.3) return fallFrom({ ...s, y }, wall.side === 'left' ? -60 : 60)
		const x = clamp(wall.side === 'left' ? ceiling.x1 : ceiling.x2, ceiling.x1 + s.width / 2, ceiling.x2 - s.width / 2)
		return { ...setPose(s, 'hang'), surface: { kind: 'ceiling', id: ceiling.id }, x, y: ceiling.y + s.height / 2, hangFor: 2 + rng() * 3 }
	}
	return { ...s, y }
}

function stepAir(s: PetState, dt: number, terrain: Terrain): PetState {
	let pose = s.pose
	let vy = s.vy + GRAVITY * dt
	if (pose === 'fall' && s.poseTime >= GLIDE_AFTER && vy > 0) pose = 'fly'
	if (pose === 'fly' && vy > GLIDE_SPEED) vy = GLIDE_SPEED
	let vx = s.vx
	let x = s.x + vx * dt
	let y = s.y + vy * dt
	const halfWidth = s.width / 2
	const halfHeight = s.height / 2
	if (x < halfWidth) { x = halfWidth; vx = Math.abs(vx) * BOUNCE }
	if (x > terrain.width - halfWidth) { x = terrain.width - halfWidth; vx = -Math.abs(vx) * BOUNCE }
	if (y < halfHeight) { y = halfHeight; vy = Math.abs(vy) * BOUNCE }
	if (vy > 0) {
		const before = s.y + halfHeight
		const after = y + halfHeight
		const landing = terrain.platforms
			.filter(platform => x >= platform.x1 && x <= platform.x2 && before <= platform.y && after >= platform.y)
			.sort((a, b) => a.y - b.y)[0]
		if (landing) return setPose(standOn(s, landing, x), 'land')
		if (after >= terrain.height) return setPose(standOn(s, floorOf(terrain), x), 'land')
	}
	const facing = Math.abs(vx) > 10 ? (vx < 0 ? 'left' : 'right') : s.facing
	return setPose({ ...s, x, y, vx, vy, facing }, pose)
}

function stepFlight(s: PetState, dt: number, terrain: Terrain): PetState {
	const flight = s.flight!
	const t = Math.min(1, flight.t + dt / flight.duration)
	if (t >= 1) return finishFlight({ ...s, x: flight.toX, y: flight.toY, flight: null }, flight.surface, terrain)
	const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
	return {
		...s,
		x: flight.fromX + (flight.toX - flight.fromX) * eased,
		y: flight.fromY + (flight.toY - flight.fromY) * eased - Math.sin(Math.PI * t) * FLIGHT_ARC,
		flight: { ...flight, t }
	}
}

function finishFlight(s: PetState, surface: Surface, terrain: Terrain): PetState {
	if (surface.kind === 'platform') {
		const platform = findPlatform(terrain, surface.id)
		return platform ? setPose(standOn(s, platform, s.x), 'land') : fallFrom(s)
	}
	if (surface.kind === 'wall') {
		const wall = terrain.walls.find(item => item.id === surface.id && item.side === surface.side)
		if (!wall) return fallFrom(s)
		return { ...setPose(s, 'climb'), ...wallAnchor(s, wall, s.y), surface, vx: 0, vy: 0, climbDir: 'up' }
	}
	return fallFrom(s)
}

export type SpeechTrigger = 'greeting' | 'idle' | 'notification'
export type SpeechContext = {
	trigger: SpeechTrigger
	nowMs: number
	pageStartMs: number
	lastIdleSpeechMs: number | null
	lastBreakMs: number | null
	hour: number
	upcomingTitle: string | null
	focusRunning: boolean
}
export type Speech = { kind: 'greeting' | 'notification' | 'break' | 'upcoming' | 'chatter'; text: string }

export const SPEECH_MAX_LENGTH = 18
const IDLE_SPEECH_GAP_MS = 3 * 60_000
const BREAK_AFTER_MS = 60 * 60_000
const CHATTER = ['摸鱼被我看到了哦', '我在这儿陪你', '今天也要开心呀', '伸个懒腰吧', '咕噜咕噜…', '这个时钟好高呀']

export function greetingFor(hour: number) {
	if (hour >= 5 && hour < 11) return '早上好，今天也加油'
	if (hour >= 11 && hour < 13) return '中午啦，记得吃饭'
	if (hour >= 13 && hour < 18) return '下午好，喝口水吧'
	if (hour >= 18 && hour < 23) return '晚上好，辛苦啦'
	return '夜深了，早点休息'
}

export function fitSpeech(text: string) {
	const chars = Array.from(text)
	return chars.length <= SPEECH_MAX_LENGTH ? text : `${chars.slice(0, SPEECH_MAX_LENGTH - 1).join('')}…`
}

export function chooseSpeech(context: SpeechContext, rng: Rng): Speech | null {
	if (context.trigger === 'notification') return { kind: 'notification', text: '有新通知啦' }
	if (context.trigger === 'greeting') return { kind: 'greeting', text: greetingFor(context.hour) }
	if (context.focusRunning) return null
	if (context.lastIdleSpeechMs !== null && context.nowMs - context.lastIdleSpeechMs < IDLE_SPEECH_GAP_MS) return null
	if (context.nowMs - (context.lastBreakMs ?? context.pageStartMs) >= BREAK_AFTER_MS) return { kind: 'break', text: '看了一小时屏幕啦，起来走走吧' }
	if (context.upcomingTitle && rng() < 0.4) return { kind: 'upcoming', text: fitSpeech(`等下有：${context.upcomingTitle}`) }
	return { kind: 'chatter', text: pickOne(CHATTER, rng) }
}
