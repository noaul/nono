import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
	FLOOR_ID,
	PET_SIZE,
	SPEECH_MAX_LENGTH,
	cheer,
	chooseSpeech,
	createPet,
	extractTerrain,
	releaseDrag,
	startDrag,
	step,
	surfaceRotation,
	travelToPlatform,
	type PetInput,
	type PetState,
	type Platform,
	type SpeechContext,
	type Terrain
} from '../src/app/(home)/desk-pet/desk-pet-model.ts'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const constant = (value: number) => () => value
const awake: PetInput = { sleepy: false, panelKey: null, reducedMotion: false, compact: false }
const FRAME = 1 / 60

function world(platforms: Platform[], extra: Partial<Terrain> = {}): Terrain {
	return { width: 1000, height: 800, platforms: [{ id: FLOOR_ID, y: 800, x1: 0, x2: 1000 }, ...platforms], walls: [], ceilings: [], ...extra }
}

function placeOn(terrain: Terrain, id: string, x: number): PetState {
	const platform = terrain.platforms.find(item => item.id === id)!
	return { ...createPet(terrain, PET_SIZE, constant(0.5)), x, y: platform.y - PET_SIZE.height / 2, surface: { kind: 'platform', id } }
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

test('turns visible element rects into platforms, walls and ceilings', () => {
	const terrain = extractTerrain([
		{ id: 'clock', rect: { left: 400, top: 300, width: 300, height: 120 }, opacity: 1 },
		{ id: 'search', rect: { left: 300, top: 20, width: 400, height: 44 }, opacity: 1 },
		{ id: 'dock', rect: { left: 300, top: 650, width: 400, height: 96 }, opacity: 0.24 },
		{ id: 'chip', rect: { left: 100, top: 200, width: 30, height: 20 }, opacity: 1 }
	], { width: 1000, height: 800 }, PET_SIZE.height)

	assert.deepEqual(terrain.platforms.map(item => item.id), [FLOOR_ID, 'clock'])
	assert.deepEqual(terrain.walls.map(item => `${item.id}:${item.side}`), ['clock:left', 'clock:right', 'search:left', 'search:right'])
	assert.deepEqual(terrain.ceilings.map(item => [item.id, item.y]), [['clock', 420], ['search', 64]])
})

test('falls onto the platform below and stands on its top edge', () => {
	const terrain = world([{ id: 'dock', y: 600, x1: 300, x2: 700 }])
	const pet: PetState = { ...createPet(terrain, PET_SIZE, constant(0.5)), x: 500, y: 100, surface: { kind: 'air' }, pose: 'fall' }
	const { state } = run(pet, 3, terrain, awake)

	assert.deepEqual(state.surface, { kind: 'platform', id: 'dock' })
	assert.equal(state.y, 600 - PET_SIZE.height / 2)
})

test('passes up through a platform and lands on it on the way down', () => {
	const terrain = world([{ id: 'dock', y: 600, x1: 300, x2: 700 }])
	const pet: PetState = { ...createPet(terrain, PET_SIZE, constant(0.5)), x: 500, y: 700, vy: -900, surface: { kind: 'air' }, pose: 'jump' }

	const rising = run(pet, 0.2, terrain, awake).state
	assert.equal(rising.surface.kind, 'air')
	assert.ok(rising.y + PET_SIZE.height / 2 < 600)
	assert.deepEqual(run(rising, 2, terrain, awake).state.surface, { kind: 'platform', id: 'dock' })
})

test('bounces off the viewport edge and caps throw speed', () => {
	const terrain = world([])
	const pet: PetState = { ...createPet(terrain, PET_SIZE, constant(0.5)), x: 960, y: 300, vx: 2000, surface: { kind: 'air' }, pose: 'fall' }
	const { state } = step(pet, FRAME, terrain, awake, constant(0.5))

	assert.equal(state.x, 1000 - PET_SIZE.width / 2)
	assert.ok(state.vx < 0)
	assert.equal(releaseDrag(startDrag(pet), 5000, 0).vx, 2200)
})

test('jumps to near platforms and flies to far ones', () => {
	const terrain = world([{ id: 'a', y: 600, x1: 100, x2: 300 }, { id: 'b', y: 500, x1: 400, x2: 600 }, { id: 'c', y: 200, x1: 800, x2: 950 }])
	const pet = placeOn(terrain, 'a', 200)

	const near = travelToPlatform(pet, terrain.platforms.find(item => item.id === 'b')!, 450)
	assert.equal(near.pose, 'crouch')
	assert.deepEqual(run(near, 2, terrain, awake).state.surface, { kind: 'platform', id: 'b' })

	const far = travelToPlatform(pet, terrain.platforms.find(item => item.id === 'c')!, 870)
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

test('wires the pet into the workbench and the settings center', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')

	for (const id of ['search', 'clock', 'upcoming', 'panel', 'notifications', 'appdock', 'dock']) assert.match(workbench, new RegExp(`data-pet-terrain='${id}'`))
	assert.match(workbench, /nodesk\.ambient\.pet\.v1/)
	assert.match(workbench, /<DeskPet/)
	assert.match(settings, /显示桌面宠物/)
})
