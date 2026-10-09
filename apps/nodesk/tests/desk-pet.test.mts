import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
	FLOOR_ID,
	MOMO,
	NONO,
	SPEECH_MAX_LENGTH,
	cheer,
	chooseSpeech,
	createPet,
	createShake,
	dragTo,
	extractTerrain,
	feedShake,
	headPlatform,
	launchTumble,
	makeDizzy,
	peekClip,
	releaseDrag,
	resolveCollisions,
	runTo,
	setGoal,
	startDrag,
	startPeek,
	step,
	surfaceRotation,
	travelToPlatform,
	withPeerHeads,
	type Block,
	type PetInput,
	type PetState,
	type Platform,
	type Species,
	type SpeechContext,
	type Terrain
} from '../src/app/(home)/desk-pet/desk-pet-model.ts'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const constant = (value: number) => () => value
const awake: PetInput = { sleepy: false, panelKey: null, reducedMotion: false, compact: false, restSlot: 0, pointer: null }
const FRAME = 1 / 60

function world(platforms: Platform[], extra: Partial<Terrain> = {}): Terrain {
	return { width: 1000, height: 800, platforms: [{ id: FLOOR_ID, y: 800, x1: 0, x2: 1000 }, ...platforms], walls: [], ceilings: [], blocks: [], ...extra }
}

function placeOn(terrain: Terrain, id: string, x: number, species: Species = NONO): PetState {
	const platform = terrain.platforms.find(item => item.id === id)!
	const pet = createPet(terrain, species, constant(0.5))
	return { ...pet, x, y: platform.y - pet.height / 2, surface: { kind: 'platform', id } }
}

function run(state: PetState, seconds: number, terrain: Terrain, input: PetInput) {
	let current = state
	const events: string[] = []
	for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
		const result = step(current, FRAME, terrain, input, constant(0.5))
		current = result.state
		events.push(...result.events)
	}
	return { state: current, events }
}

const clock: Platform = { id: 'clock', y: 300, x1: 400, x2: 700 }
const upcoming: Platform = { id: 'upcoming', y: 420, x1: 450, x2: 650 }
const panel: Platform = { id: 'panel', y: 500, x1: 300, x2: 800 }
const platformById = (terrain: Terrain, id: string) => terrain.platforms.find(item => item.id === id)!

test('turns visible element rects into platforms, walls and ceilings', () => {
	const terrain = extractTerrain([
		{ id: 'clock', rect: { left: 400, top: 300, width: 300, height: 120 }, opacity: 1 },
		{ id: 'search', rect: { left: 300, top: 20, width: 400, height: 44 }, opacity: 1 },
		{ id: 'dock', rect: { left: 300, top: 650, width: 400, height: 96 }, opacity: 0.24 },
		{ id: 'chip', rect: { left: 100, top: 200, width: 30, height: 20 }, opacity: 1 }
	], { width: 1000, height: 800 }, NONO.size.height)

	assert.deepEqual(terrain.platforms.map(item => item.id), [FLOOR_ID, 'clock'])
	assert.deepEqual(terrain.walls.map(item => `${item.id}:${item.side}`), ['clock:left', 'clock:right', 'search:left', 'search:right'])
	assert.deepEqual(terrain.ceilings.map(item => [item.id, item.y]), [['clock', 420], ['search', 64]])
})

test('falls onto the platform below and stands on its top edge', () => {
	const terrain = world([{ id: 'dock', y: 600, x1: 300, x2: 700 }])
	const pet: PetState = { ...createPet(terrain, NONO, constant(0.5)), x: 500, y: 100, surface: { kind: 'air' }, pose: 'fall' }
	const { state } = run(pet, 3, terrain, awake)

	assert.deepEqual(state.surface, { kind: 'platform', id: 'dock' })
	assert.equal(state.y, 600 - NONO.size.height / 2)
})

test('passes up through a platform and lands on it on the way down', () => {
	const terrain = world([{ id: 'dock', y: 600, x1: 300, x2: 700 }])
	const pet: PetState = { ...createPet(terrain, NONO, constant(0.5)), x: 500, y: 700, vy: -900, surface: { kind: 'air' }, pose: 'jump' }

	const rising = run(pet, 0.2, terrain, awake).state
	assert.equal(rising.surface.kind, 'air')
	assert.ok(rising.y + NONO.size.height / 2 < 600)
	assert.deepEqual(run(rising, 2, terrain, awake).state.surface, { kind: 'platform', id: 'dock' })
})

test('bounces off the viewport edge and caps throw speed', () => {
	const terrain = world([])
	const pet: PetState = { ...createPet(terrain, NONO, constant(0.5)), x: 960, y: 300, vx: 2000, surface: { kind: 'air' }, pose: 'fall' }
	const { state } = step(pet, FRAME, terrain, awake, constant(0.5))

	assert.equal(state.x, 1000 - NONO.size.width / 2)
	assert.ok(state.vx < 0)
	const thrown = releaseDrag(startDrag(pet), 5000, 0)
	assert.equal(thrown.pose, 'tumble')
	assert.equal(thrown.vx, 2600)
})

test('jumps to near platforms and flies to far ones', () => {
	const terrain = world([{ id: 'a', y: 600, x1: 100, x2: 300 }, { id: 'b', y: 500, x1: 400, x2: 600 }, { id: 'c', y: 200, x1: 800, x2: 950 }])
	const pet = placeOn(terrain, 'a', 200)

	const near = travelToPlatform(pet, platformById(terrain, 'b'), 450, terrain)!
	assert.equal(near.pose, 'crouch')
	assert.deepEqual(run(near, 2, terrain, awake).state.surface, { kind: 'platform', id: 'b' })

	const far = travelToPlatform(pet, platformById(terrain, 'c'), 870, terrain)!
	assert.equal(far.pose, 'fly')
	assert.ok(far.flight)
	assert.deepEqual(run(far, 3, terrain, awake).state.surface, { kind: 'platform', id: 'c' })
})

test('falls when the platform it stands on disappears', () => {
	const pet = placeOn(world([panel]), 'panel', 550)
	const { state } = step(pet, FRAME, world([]), awake, constant(0.5))

	assert.equal(state.pose, 'fall')
	assert.equal(state.surface.kind, 'air')
})

test('goes to sleep on the clock when the desk is idle and wakes with a stretch', () => {
	const terrain = world([clock, upcoming])
	const asleep = run(placeOn(terrain, 'upcoming', 550), 5, terrain, { ...awake, sleepy: true }).state

	assert.equal(asleep.pose, 'sleep')
	assert.deepEqual(asleep.surface, { kind: 'platform', id: 'clock' })

	const waking = step(asleep, FRAME, terrain, awake, constant(0.5)).state
	assert.equal(waking.pose, 'stretch')
	assert.equal(run(waking, 1, terrain, awake).state.pose, 'idle')
})

test('heads to an opened panel and drops when it closes', () => {
	const terrain = world([clock, panel])
	const onPanel = run(placeOn(terrain, 'clock', 550), 5, terrain, { ...awake, panelKey: 'today' }).state
	assert.deepEqual(onPanel.surface, { kind: 'platform', id: 'panel' })

	const dropped = step(onPanel, FRAME, world([clock]), awake, constant(0.5)).state
	assert.equal(dropped.pose, 'fall')
})

test('cheers when poked and stretches awake from sleep', () => {
	const terrain = world([clock])
	const pet = placeOn(terrain, 'clock', 550)

	assert.equal(cheer(pet).pose, 'happy')
	assert.equal(cheer({ ...pet, pose: 'sleep' }).pose, 'stretch')
	assert.equal(cheer({ ...pet, surface: { kind: 'air' }, pose: 'fall' }).pose, 'fall')
})

test('stays put on the clock under reduced motion', () => {
	const terrain = world([clock, upcoming, panel])
	const input = { ...awake, reducedMotion: true, panelKey: 'today' }
	const { state } = run(placeOn(terrain, 'upcoming', 500), 2, terrain, input)

	assert.deepEqual(state.surface, { kind: 'platform', id: 'clock' })
	assert.equal(state.x, 550)
	assert.equal(state.pose, 'idle')
	assert.equal(run(state, 1, terrain, { ...input, sleepy: true }).state.pose, 'sleep')
})

test('rotates the sprite to hug walls and ceilings', () => {
	assert.equal(surfaceRotation({ kind: 'platform', id: 'clock' }), 0)
	assert.equal(surfaceRotation({ kind: 'wall', id: 'clock', side: 'left' }), -90)
	assert.equal(surfaceRotation({ kind: 'wall', id: 'clock', side: 'right' }), 90)
	assert.equal(surfaceRotation({ kind: 'ceiling', id: 'clock' }), 180)
})

test('Momo drops without gliding while Nono opens its wings', () => {
	const terrain = world([])
	const falling = (species: Species): PetState => ({ ...createPet(terrain, species, constant(0.5)), x: 500, y: 60, surface: { kind: 'air' }, pose: 'fall' })

	const momo = run(falling(MOMO), 0.6, terrain, awake).state
	assert.equal(momo.pose, 'fall')
	assert.ok(momo.vy > 200)

	const nono = run(falling(NONO), 0.6, terrain, awake).state
	assert.equal(nono.pose, 'fly')
	assert.ok(nono.vy <= 200)
})

test('Momo hops from platform to platform to reach a far goal, Nono flies there', () => {
	const terrain = world([{ id: 'a', y: 650, x1: 100, x2: 300 }, { id: 'b', y: 420, x1: 150, x2: 350 }, { id: 'c', y: 200, x1: 600, x2: 800 }])

	const momo = run(setGoal(placeOn(terrain, FLOOR_ID, 500, MOMO), 'c'), 15, terrain, awake).state
	assert.deepEqual(momo.surface, { kind: 'platform', id: 'c' })
	assert.equal(momo.goalId, null)

	const nono = step(setGoal(placeOn(terrain, FLOOR_ID, 500), 'c'), FRAME, terrain, awake, constant(0.5)).state
	assert.equal(nono.pose, 'fly')
})

test('Momo gives up on a goal it cannot reach', () => {
	const terrain = world([{ id: 'high', y: 300, x1: 100, x2: 200 }])
	const { state } = step(setGoal(placeOn(terrain, FLOOR_ID, 500, MOMO), 'high'), FRAME, terrain, awake, constant(0.5))

	assert.equal(state.goalId, null)
	assert.deepEqual(state.surface, { kind: 'platform', id: FLOOR_ID })
})

test('Momo takes a big leap to the clock or a panel when no route exists', () => {
	const terrain = world([{ id: 'clock', y: 150, x1: 100, x2: 300 }, { id: 'dock', y: 760, x1: 50, x2: 350 }])

	const asleep = run(placeOn(terrain, 'dock', 200, MOMO), 5, terrain, { ...awake, sleepy: true }).state
	assert.equal(asleep.pose, 'sleep')
	assert.deepEqual(asleep.surface, { kind: 'platform', id: 'clock' })

	const wander = step(setGoal(placeOn(terrain, 'dock', 200, MOMO), 'clock'), FRAME, terrain, awake, constant(0.5)).state
	assert.equal(wander.goalId, null)
})

test('lands on another pet, rides along and falls when the carrier leaves', () => {
	const terrain = world([])
	const carrier = placeOn(terrain, FLOOR_ID, 500, MOMO)
	const head = headPlatform(carrier)!
	assert.equal(head.id, 'pet:momo')

	const dropped: PetState = { ...createPet(terrain, NONO, constant(0.5)), x: 505, y: 400, surface: { kind: 'air' }, pose: 'fall' }
	const rider = run(dropped, 2, withPeerHeads(terrain, [carrier, dropped], dropped), awake).state
	assert.deepEqual(rider.surface, { kind: 'platform', id: 'pet:momo' })
	assert.equal(rider.y, head.y - NONO.size.height / 2)

	const moved = { ...carrier, x: 560 }
	const carried = step(rider, FRAME, withPeerHeads(terrain, [moved, rider], rider), awake, constant(0.5)).state
	assert.equal(carried.x, 560)
	assert.equal(withPeerHeads(terrain, [moved, carried], moved).platforms.some(item => item.id === 'pet:nono'), false)

	const lifted = startDrag(moved)
	const fell = step(carried, FRAME, withPeerHeads(terrain, [lifted, carried], carried), awake, constant(0.5)).state
	assert.equal(fell.pose, 'fall')
})

test('hops down from a head after a while', () => {
	const terrain = world([])
	const carrier = placeOn(terrain, FLOOR_ID, 500, MOMO)
	const head = headPlatform(carrier)!
	const rider: PetState = { ...createPet(terrain, NONO, constant(0.5)), x: 500, y: head.y - NONO.size.height / 2, surface: { kind: 'platform', id: head.id } }

	const { state } = run(rider, 8, withPeerHeads(terrain, [carrier, rider], rider), awake)
	assert.deepEqual(state.surface, { kind: 'platform', id: FLOOR_ID })
})

test('two pets sleep side by side on the clock', () => {
	const terrain = world([clock, upcoming])
	const nono = run(placeOn(terrain, 'upcoming', 550), 8, terrain, { ...awake, sleepy: true, restSlot: -1 }).state
	const momo = run(placeOn(terrain, 'upcoming', 560, MOMO), 8, terrain, { ...awake, sleepy: true, restSlot: 1 }).state

	assert.equal(nono.pose, 'sleep')
	assert.equal(momo.pose, 'sleep')
	assert.deepEqual([nono.surface, momo.surface], [{ kind: 'platform', id: 'clock' }, { kind: 'platform', id: 'clock' }])
	assert.ok(momo.x - nono.x >= (NONO.size.width + MOMO.size.width) / 2 - 6)
})

test('runs along its own platform on command', () => {
	const terrain = world([clock])
	const pet = runTo(placeOn(terrain, 'clock', 500), 2000, platformById(terrain, 'clock'))

	assert.equal(pet.pose, 'run')
	assert.equal(pet.walkTo, 700 - NONO.size.width / 2)
})

test('chooses short, well-timed speech', () => {
	const base: SpeechContext = { trigger: 'idle', nowMs: 10 * 60_000, pageStartMs: 0, lastIdleSpeechMs: null, lastBreakMs: null, hour: 8, upcomingTitle: null, focusRunning: false }

	assert.equal(chooseSpeech({ ...base, trigger: 'greeting' }, constant(0.5))?.text, '早上好，今天也加油')
	assert.equal(chooseSpeech({ ...base, trigger: 'notification' }, constant(0.5))?.text, '有新通知啦')
	assert.equal(chooseSpeech({ ...base, focusRunning: true }, constant(0.5)), null)
	assert.equal(chooseSpeech({ ...base, lastIdleSpeechMs: base.nowMs - 60_000 }, constant(0.5)), null)
	assert.equal(chooseSpeech({ ...base, nowMs: 61 * 60_000 }, constant(0.5))?.kind, 'break')

	const upcomingSpeech = chooseSpeech({ ...base, upcomingTitle: '和设计团队一起评审下一季度的路线图' }, constant(0.1))
	assert.equal(upcomingSpeech?.kind, 'upcoming')
	assert.ok(upcomingSpeech?.text.startsWith('等下有：'))
	assert.ok(Array.from(upcomingSpeech!.text).length <= SPEECH_MAX_LENGTH)
	assert.equal(chooseSpeech(base, constant(0.9))?.kind, 'chatter')
})

const blockWorld = (blocks: Block[], platforms: Platform[] = []): Terrain => world([...platforms, ...blocks.map(block => ({ id: block.id, y: block.top, x1: block.left, x2: block.right }))], { blocks })

test('keeps the full box of every visible component', () => {
	const terrain = extractTerrain([
		{ id: 'clock', rect: { left: 400, top: 300, width: 300, height: 120 }, opacity: 1 },
		{ id: 'dock', rect: { left: 300, top: 650, width: 400, height: 96 }, opacity: 0.24 }
	], { width: 1000, height: 800 }, NONO.size.height)

	assert.deepEqual(terrain.blocks, [{ id: 'clock', left: 400, top: 300, right: 700, bottom: 420 }])
})

test('pets on the same platform push each other apart with an ouch', () => {
	const terrain = world([])
	const nono = placeOn(terrain, FLOOR_ID, 500)
	const momo = placeOn(terrain, FLOOR_ID, 520, MOMO)
	const { pets, bumps } = resolveCollisions([nono, momo])

	assert.deepEqual(pets.map(pet => pet.pose), ['ouch', 'ouch'])
	assert.ok(pets[1].x - pets[0].x >= (NONO.size.width + MOMO.size.width) / 2 * 0.8 - 0.01)
	assert.deepEqual(bumps, ['nono', 'momo'])
	assert.deepEqual(resolveCollisions(pets).bumps, [])
})

test('a rider is not a collision', () => {
	const terrain = world([])
	const momo = placeOn(terrain, FLOOR_ID, 500, MOMO)
	const head = headPlatform(momo)!
	const nono: PetState = { ...createPet(terrain, NONO, constant(0.5)), x: 500, y: head.y - NONO.size.height / 2, surface: { kind: 'platform', id: head.id } }

	assert.deepEqual(resolveCollisions([nono, momo]).bumps, [])
})

test('a pet flying into a standing one knocks it over and both see stars', () => {
	const terrain = world([])
	const momo = placeOn(terrain, FLOOR_ID, 500, MOMO)
	const nono: PetState = { ...placeOn(terrain, FLOOR_ID, 470), surface: { kind: 'air' }, pose: 'tumble', vx: 1500, y: momo.y }
	const { pets } = resolveCollisions([nono, momo])

	assert.equal(pets[1].surface.kind, 'air')
	assert.ok(pets[1].vx > 0)
	assert.ok(pets[0].vx < 1500)
	assert.ok(pets[0].dizzyFor > 0 && pets[1].dizzyFor > 0)
})

test('a hard shake makes a pet dizzy, and it wobbles until it recovers', () => {
	let meter = createShake(0, 0, 0)
	let shaken = false
	for (let index = 1; index <= 6 && !shaken; index++) {
		const result = feedShake(meter, index % 2 ? 60 : 0, 0, index * 40)
		meter = result.meter
		shaken = result.shaken
	}
	assert.equal(shaken, true)
	assert.equal(feedShake(createShake(0, 0, 0), 10, 0, 100).shaken, false)

	const terrain = world([])
	const dizzy = step(makeDizzy(placeOn(terrain, FLOOR_ID, 500), 3), FRAME, terrain, awake, constant(0.5)).state
	assert.equal(dizzy.pose, 'dizzy')
	assert.equal(run(dizzy, 3.2, terrain, awake).state.pose, 'idle')
})

test('pulling a pet past the screen edge winds a slingshot that launches it back', () => {
	const terrain = world([])
	const held = dragTo(startDrag(placeOn(terrain, FLOOR_ID, 500)), -100, 400, { width: 1000, height: 800 })

	assert.equal(held.x, NONO.size.width / 2)
	assert.ok(held.tension && held.tension.x < -100)
	const launched = releaseDrag(held, 0, 0)
	assert.equal(launched.pose, 'tumble')
	assert.ok(launched.vx > 1500)
	assert.equal(launched.tension, null)
	assert.equal(releaseDrag(dragTo(startDrag(placeOn(terrain, FLOOR_ID, 500)), 300, 400, { width: 1000, height: 800 }), 100, 0).pose, 'fall')
})

test('a tumbling pet bounces off components and the screen, and a hard hit makes it dizzy', () => {
	const block: Block = { id: 'panel', left: 600, top: 300, right: 900, bottom: 600 }
	const terrain = blockWorld([block])
	const pet = createPet(terrain, NONO, constant(0.5))

	const intoSide = step(launchTumble({ ...pet, x: 570, y: 450 }, 1500, 0), FRAME, terrain, awake, constant(0.5)).state
	assert.ok(intoSide.vx < 0)
	assert.ok(intoSide.x <= 600 - Math.min(NONO.size.width, NONO.size.height) / 2 + 0.01)
	assert.ok(intoSide.dizzyFor > 0)

	const intoTop = step(launchTumble({ ...pet, x: 300, y: 30 }, 0, -600), FRAME, terrain, awake, constant(0.5)).state
	assert.ok(intoTop.vy > 0)
	assert.equal(intoTop.dizzyFor, 0)

	const settled = run(launchTumble({ ...pet, x: 300, y: 200 }, 900, -400), 12, terrain, awake).state
	assert.equal(settled.surface.kind, 'platform')
	assert.notEqual(settled.pose, 'tumble')
})

test('hides behind a component, peeks out, ducks from the pointer and leaves', () => {
	const block: Block = { id: 'panel', left: 600, top: 300, right: 900, bottom: 600 }
	const terrain = blockWorld([block])
	const start = placeOn(terrain, FLOOR_ID, 400)

	const flying = startPeek(start, terrain, constant(0))!
	assert.equal(flying.pose, 'fly')
	assert.deepEqual(flying.flight?.surface, { kind: 'peek', id: 'panel', side: 'left' })

	const peeking = run(flying, 3.5, terrain, awake).state
	assert.equal(peeking.pose, 'peek')
	assert.equal(peeking.peek?.tuck, 0)
	assert.equal(peeking.facing, 'left')
	const clip = peekClip(peeking, terrain)!
	assert.ok(Math.abs(clip.right - NONO.size.width * 0.62) < 0.01)
	assert.equal(clip.left, 0)

	const ducked = run(peeking, 0.4, terrain, { ...awake, pointer: { x: peeking.x - 40, y: peeking.y } }).state
	assert.equal(ducked.peek?.tuck, 1)
	assert.ok(peekClip(ducked, terrain)!.right >= NONO.size.width)

	const leaving = run({ ...peeking, peek: { ...peeking.peek!, until: 0.01 } }, 0.5, terrain, awake).state
	assert.equal(leaving.surface.kind, 'air')
	assert.deepEqual(run(leaving, 3, terrain, awake).state.surface, { kind: 'platform', id: 'panel' })
})

test('both pets sometimes decide to go and peek', () => {
	const block: Block = { id: 'near', left: 600, top: 650, right: 800, bottom: 760 }
	const terrain = blockWorld([block])
	for (const species of [NONO, MOMO]) {
		const pet = { ...placeOn(terrain, FLOOR_ID, 400, species), decisionIn: 0 }
		const rolls = Array.from({ length: 100 }, (_, index) => index / 100)
		const peeks = rolls.filter(roll => {
			const next = step(pet, FRAME, terrain, awake, () => roll).state
			return next.flight?.surface.kind === 'peek'
		})
		assert.ok(peeks.length >= 5, `${species.id} peeked on ${peeks.length} of 100 rolls`)
	}
})

test('Momo only peeks behind components it can leap to', () => {
	const near: Block = { id: 'near', left: 600, top: 650, right: 800, bottom: 760 }
	const far: Block = { id: 'far', left: 600, top: 60, right: 800, bottom: 160 }
	const momo = placeOn(blockWorld([near]), FLOOR_ID, 400, MOMO)

	const leap = startPeek(momo, blockWorld([near]), constant(0))!
	assert.equal(leap.pose, 'jump')
	assert.equal(startPeek(momo, blockWorld([far]), constant(0.99)), null)
})

test('wires both pets into the workbench and the settings center', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')

	for (const id of ['search', 'clock', 'upcoming', 'panel', 'appdock', 'dock']) assert.match(workbench, new RegExp(`data-pet-terrain='${id}'`))
	assert.match(workbench, /readPetPrefs/)
	assert.match(workbench, /<DeskPets/)
	assert.match(settings, /显示 Nono/)
	assert.match(settings, /显示 Momo/)
})
