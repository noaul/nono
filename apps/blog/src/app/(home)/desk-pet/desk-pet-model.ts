/**
 * Pure logic for the NoDesk desk pets: terrain from element rects, physics and behaviour.
 * Nothing here touches the DOM so the pets can be exercised with node --test.
 */

export type Rect = { left: number; top: number; width: number; height: number }
export type TerrainSource = { id: string; rect: Rect; opacity: number }
export type Side = 'left' | 'right'
/** Top edge of an element (or of another pet's head); one-way, only collides while falling. */
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

export type Species = {
	id: string
	size: PetSize
	compactSize: PetSize
	canFly: boolean
	walkSpeed: number
	runSpeed: number
	climbSpeed: number
	jumpReachX: number
	jumpReachUp: number
	climbWeight: number
}

export const NONO: Species = {
	id: 'nono',
	size: { width: 44, height: 38 },
	compactSize: { width: 34, height: 29 },
	canFly: true,
	walkSpeed: 40,
	runSpeed: 110,
	climbSpeed: 30,
	jumpReachX: 260,
	jumpReachUp: 160,
	climbWeight: 0.1
}

export const MOMO: Species = {
	id: 'momo',
	size: { width: 46, height: 40 },
	compactSize: { width: 36, height: 31 },
	canFly: false,
	walkSpeed: 45,
	runSpeed: 160,
	climbSpeed: 60,
	jumpReachX: 380,
	jumpReachUp: 300,
	climbWeight: 0.15
}

export const SPECIES: Species[] = [NONO, MOMO]

/** Position is the body centre in viewport px; velocity is px/s. */
export type PetState = PetSize & {
	id: string
	species: Species
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
	goalAge: number
	lastPanelKey: string | null
}

/** `restSlot` spreads several pets across the clock when they go to sleep (-1 left, 0 centre, 1 right). */
export type PetInput = { sleepy: boolean; panelKey: string | null; reducedMotion: boolean; compact: boolean; restSlot: number }
export type PetEvent = 'speak'
export type Rng = () => number

export const FLOOR_ID = 'floor'
export const REST_ID = 'clock'
export const PANEL_ID = 'panel'
export const PET_PLATFORM_PREFIX = 'pet:'

export const GRAVITY = 1800
const MAX_THROW_SPEED = 2200
const BOUNCE = 0.4
const GLIDE_AFTER = 0.4
const GLIDE_SPEED = 200
const JUMP_CLEARANCE = 40
const FLIGHT_ARC = 40
const CROUCH_TIME = 0.12
const LAND_TIME = 0.16
const HAPPY_TIME = 0.9
const STRETCH_TIME = 0.6
const GOAL_WAIT_LIMIT = 1.5
const GOAL_TIMEOUT = 20
const REST_SPACING = 0.8
const MIN_OPACITY = 0.5
const MIN_PLATFORM_WIDTH = 48
const MIN_WALL_HEIGHT = 40
const MIN_CEILING_WIDTH = 60

/** Clamps into [min, max]; a range narrower than the pet collapses to its midpoint. */
const clamp = (value: number, min: number, max: number) => min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value))
const pickOne = <T>(items: T[], rng: Rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
const flip = (side: Side): Side => side === 'left' ? 'right' : 'left'
export const isPetPlatform = (id: string) => id.startsWith(PET_PLATFORM_PREFIX)

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

/** The top of a standing pet, which other pets can land and ride on. */
export function headPlatform(pet: PetState): Platform | null {
	if (pet.surface.kind !== 'platform' || pet.pose === 'drag') return null
	const half = pet.width * 0.4
	return { id: `${PET_PLATFORM_PREFIX}${pet.id}`, y: pet.y - pet.height / 2 + 2, x1: pet.x - half, x2: pet.x + half }
}

/** Terrain as seen by `self`: other pets' heads become platforms, except a pet riding on `self`. */
export function withPeerHeads(terrain: Terrain, pets: PetState[], self: PetState): Terrain {
	const heads = pets.flatMap(pet => {
		if (pet.id === self.id) return []
		if (pet.surface.kind === 'platform' && pet.surface.id === `${PET_PLATFORM_PREFIX}${self.id}`) return []
		const head = headPlatform(pet)
		return head ? [head] : []
	})
	return heads.length ? { ...terrain, platforms: [...terrain.platforms, ...heads] } : terrain
}

export function surfaceRotation(surface: Surface) {
	if (surface.kind === 'wall') return surface.side === 'left' ? -90 : 90
	return surface.kind === 'ceiling' ? 180 : 0
}

const findPlatform = (terrain: Terrain, id: string) => terrain.platforms.find(item => item.id === id)
const floorOf = (terrain: Terrain): Platform => findPlatform(terrain, FLOOR_ID) ?? { id: FLOOR_ID, y: terrain.height, x1: 0, x2: terrain.width }
const restPlatform = (terrain: Terrain) => findPlatform(terrain, REST_ID) ?? floorOf(terrain)
const bottomOf = (s: PetState) => s.y + s.height / 2

/** Where a pet sleeps on the clock, so two pets lie side by side instead of on top of each other. */
export function restX(platform: Platform, s: PetState, slot: number) {
	return clamp((platform.x1 + platform.x2) / 2 + slot * s.width * REST_SPACING, platform.x1 + s.width / 2, platform.x2 - s.width / 2)
}

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

export function createPet(terrain: Terrain, species: Species, rng: Rng, options: { compact?: boolean; restSlot?: number } = {}): PetState {
	const size = options.compact ? species.compactSize : species.size
	const base: PetState = {
		...size,
		id: species.id,
		species,
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
		goalAge: 0,
		lastPanelKey: null
	}
	const rest = restPlatform(terrain)
	const spread = (rest.x2 - rest.x1) * 0.25
	return standOn(base, rest, restX(rest, base, options.restSlot ?? 0) + (rng() - 0.5) * spread)
}

export function canJump(s: PetState, platform: Platform, x: number) {
	return Math.abs(x - s.x) <= s.species.jumpReachX && bottomOf(s) - platform.y <= s.species.jumpReachUp
}

/** Launch velocity for a ballistic hop that clears the higher end by JUMP_CLEARANCE. */
export function jumpVelocity(fromX: number, fromBottom: number, toX: number, toTop: number) {
	const rise = fromBottom - toTop
	const peak = Math.max(rise, 0) + JUMP_CLEARANCE
	const vy = -Math.sqrt(2 * GRAVITY * peak)
	const duration = -vy / GRAVITY + Math.sqrt((2 * (peak - rise)) / GRAVITY)
	return { vx: (toX - fromX) / duration, vy }
}

function jumpTo(s: PetState, platform: Platform, toX: number): PetState {
	return {
		...setPose(s, 'crouch'),
		facing: toX < s.x ? 'left' : toX > s.x ? 'right' : s.facing,
		launch: jumpVelocity(s.x, bottomOf(s), toX, platform.y),
		walkTo: null,
		edge: null
	}
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

/** First platform on the shortest chain of jumps from `from` to `to`, or null when unreachable. */
export function nextHop(s: PetState, terrain: Terrain, from: Platform, to: Platform): Platform | null {
	if (from.id === to.id) return null
	const candidates = terrain.platforms.filter(item => !isPetPlatform(item.id) || item.id === to.id)
	const reaches = (a: Platform, b: Platform) => Math.max(0, a.x1 - b.x2, b.x1 - a.x2) + s.width <= s.species.jumpReachX && a.y - b.y <= s.species.jumpReachUp
	const previous = new Map<string, Platform>()
	const seen = new Set([from.id])
	const queue = [from]
	while (queue.length && !seen.has(to.id)) {
		const current = queue.shift()!
		for (const next of candidates) {
			if (seen.has(next.id) || !reaches(current, next)) continue
			seen.add(next.id)
			previous.set(next.id, current)
			queue.push(next)
		}
	}
	if (!seen.has(to.id)) return null
	let hop = to
	while (previous.get(hop.id)!.id !== from.id) hop = previous.get(hop.id)!
	return hop
}

/**
 * Starts moving toward `platform`: a jump when in reach, a flight for pets with wings, otherwise
 * the next hop of a jump route (running to the launch edge first). Null when there is no way.
 */
export function travelToPlatform(s: PetState, platform: Platform, x: number, terrain: Terrain, forceFly = false): PetState | null {
	const toX = clamp(x, platform.x1 + s.width / 2, platform.x2 - s.width / 2)
	const grounded = s.surface.kind === 'platform'
	if (!(forceFly && s.species.canFly) && grounded && canJump(s, platform, toX)) return jumpTo(s, platform, toX)
	if (s.species.canFly) return flyTo(s, toX, platform.y - s.height / 2, { kind: 'platform', id: platform.id })
	const here = s.surface.kind === 'platform' ? findPlatform(terrain, s.surface.id) : undefined
	if (!here) return null
	const hop = nextHop(s, terrain, here, platform)
	if (!hop) return null
	const landX = clamp(s.x, hop.x1 + s.width / 2, hop.x2 - s.width / 2)
	if (canJump(s, hop, landX)) return jumpTo(s, hop, landX)
	const launchX = clamp(landX, here.x1 + s.width / 2, here.x2 - s.width / 2)
	if (Math.abs(launchX - s.x) < 1) return null
	return { ...setPose(s, 'run'), walkTo: launchX, edge: null, facing: launchX < s.x ? 'left' : 'right' }
}

export function setGoal(s: PetState, id: string): PetState {
	const next = { ...s, goalId: id, goalTries: 0, goalAge: 0 }
	return next.pose === 'walk' || next.pose === 'run' ? { ...setPose(next, 'idle'), walkTo: null, edge: null } : next
}

/** Runs along the current platform toward `x`, stopping short of its edges. */
export function runTo(s: PetState, x: number, platform: Platform): PetState {
	return { ...setPose(s, 'run'), walkTo: clamp(x, platform.x1 + s.width / 2, platform.x2 - s.width / 2), edge: null }
}

/** Stops and waits at least `seconds` before the next idle decision. */
export function holdStill(s: PetState, seconds: number): PetState {
	return { ...setPose(s, 'idle'), walkTo: null, edge: null, decisionIn: Math.max(s.decisionIn, seconds) }
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
	let s: PetState = { ...prev, poseTime: prev.poseTime + dt, goalAge: prev.goalId ? prev.goalAge + dt : 0 }
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
	const placed = standOn(s, rest, restX(rest, s, input.restSlot))
	return setPose(placed, input.sleepy ? 'sleep' : 'idle')
}

/** Re-snaps to a surface that moved, or drops the pet when it vanished. Riders stay centred on their carrier. */
function reattach(s: PetState, terrain: Terrain): PetState {
	const surface = s.surface
	if (surface.kind === 'platform') {
		const platform = findPlatform(terrain, surface.id)
		if (!platform) return fallFrom(s)
		const y = platform.y - s.height / 2
		if (isPetPlatform(platform.id)) return { ...s, x: (platform.x1 + platform.x2) / 2, y }
		if (s.x < platform.x1 - 2 || s.x > platform.x2 + 2) return fallFrom(s)
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
			return s.poseTime >= LAND_TIME ? arrive(s, platform, input) : s
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

function arrive(s: PetState, platform: Platform, input: PetInput): PetState {
	if (input.sleepy && platform.id === REST_ID) {
		const slotX = restX(platform, s, input.restSlot)
		if (Math.abs(s.x - slotX) > 6) return { ...setPose(s, 'walk'), walkTo: slotX, edge: null, goalId: REST_ID }
		return setPose({ ...s, goalId: null, goalTries: 0 }, 'sleep')
	}
	const next = s.goalId === platform.id ? { ...s, goalId: null, goalTries: 0 } : s
	return { ...setPose(next, 'idle'), decisionIn: 1.2 }
}

function giveUpGoal(s: PetState, input: PetInput): PetState {
	const next = { ...s, goalId: null, goalTries: 0 }
	return input.sleepy ? setPose(next, 'sleep') : next
}

function decideIfDue(s: PetState, dt: number, platform: Platform, terrain: Terrain, input: PetInput, rng: Rng, events: PetEvent[]): PetState {
	if (s.goalId === platform.id) return arrive(s, platform, input)
	if (s.goalId) {
		const goal = findPlatform(terrain, s.goalId)
		// A freshly opened panel needs a moment before its rect is measured.
		if (!goal) return input.sleepy || s.goalAge > GOAL_WAIT_LIMIT ? giveUpGoal(s, input) : s
		if (s.goalAge > GOAL_TIMEOUT) return giveUpGoal(s, input)
		const x = goal.id === REST_ID && input.sleepy
			? restX(goal, s, input.restSlot)
			: (goal.x1 + goal.x2) / 2 + (rng() - 0.5) * (goal.x2 - goal.x1) * 0.5
		const travel = travelToPlatform({ ...s, goalTries: s.goalTries + 1 }, goal, x, terrain, s.goalTries >= 1)
		if (travel) return travel
		// The clock and an opened panel are worth a leap past the usual reach; idle wanders are not.
		if (goal.id === REST_ID || goal.id === PANEL_ID) return jumpTo({ ...s, goalTries: s.goalTries + 1 }, goal, clamp(x, goal.x1 + s.width / 2, goal.x2 - s.width / 2))
		return giveUpGoal(s, input)
	}
	const decisionIn = s.decisionIn - dt
	if (decisionIn > 0) return { ...s, decisionIn }
	if (isPetPlatform(platform.id)) return decideOnHead({ ...s, decisionIn: 2 + rng() * 2 }, rng)
	return decide({ ...s, decisionIn: 2 + rng() * 4 }, platform, terrain, input, rng, events)
}

/** Riding on another pet: look around, or hop down sideways. */
function decideOnHead(s: PetState, rng: Rng): PetState {
	if (rng() < 0.5) return { ...s, facing: flip(s.facing) }
	const side: Side = rng() < 0.5 ? 'left' : 'right'
	return { ...setPose(s, 'crouch'), facing: side, launch: { vx: side === 'left' ? -140 : 140, vy: -300 } }
}

function decide(s: PetState, platform: Platform, terrain: Terrain, input: PetInput, rng: Rng, events: PetEvent[]): PetState {
	const roll = rng()
	const climbWeight = s.species.climbWeight * (input.compact ? 0.5 : 1)
	if (roll < 0.35) return startWalk(s, platform, rng)
	if (roll < 0.6) return { ...s, facing: flip(s.facing), decisionIn: 1.5 + rng() * 1.5 }
	if (roll < 0.75) {
		const near = terrain.platforms.filter(other => other.id !== platform.id && !isPetPlatform(other.id) && canJump(s, other, clamp(s.x, other.x1, other.x2)))
		if (!near.length) return startWalk(s, platform, rng)
		const target = pickOne(near, rng)
		return travelToPlatform(s, target, clamp(s.x + (rng() - 0.5) * 160, target.x1, target.x2), terrain) ?? startWalk(s, platform, rng)
	}
	if (roll < 0.75 + climbWeight) return startClimb(s, platform, terrain, rng)
	if (roll < 0.85 + climbWeight) {
		const others = terrain.platforms.filter(other => other.id !== platform.id && !isPetPlatform(other.id))
		if (!others.length) return startWalk(s, platform, rng)
		const target = pickOne(others, rng)
		if (!s.species.canFly) return setGoal(s, target.id)
		return travelToPlatform(s, target, target.x1 + (target.x2 - target.x1) * rng(), terrain, true) ?? startWalk(s, platform, rng)
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
	// Only winged pets can reach a wall that does not start at their own platform.
	if (!terrain.walls.length || !s.species.canFly) return startWalk(s, platform, rng)
	const wall = pickOne(terrain.walls, rng)
	const anchor = wallAnchor(s, wall, wall.y2)
	return { ...flyTo(s, anchor.x, anchor.y, { kind: 'wall', id: wall.id, side: wall.side }), climbDir: 'up' }
}

function stepWalk(s: PetState, dt: number, platform: Platform, terrain: Terrain, rng: Rng): PetState {
	if (s.walkTo === null) return setPose(s, 'idle')
	const direction = Math.sign(s.walkTo - s.x)
	const x = s.x + direction * (s.pose === 'run' ? s.species.runSpeed : s.species.walkSpeed) * dt
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
	const y = s.y + (s.climbDir === 'up' ? -1 : 1) * s.species.climbSpeed * dt
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
	if (pose === 'fall' && s.species.canFly && s.poseTime >= GLIDE_AFTER && vy > 0) pose = 'fly'
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
