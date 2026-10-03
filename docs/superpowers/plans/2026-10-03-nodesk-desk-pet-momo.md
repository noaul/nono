# NoDesk Momo 与双宠互动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增不会飞但跳得高的小猫 Momo，让它和 Nono 同时出现在 NoDesk 桌面上，并实现打招呼、追逐、一起睡觉和叠罗汉四种互动。

**Architecture:** 把物种能力抽成 `Species` 配置。宠物头顶作为动态平台 `pet:<id>` 加进地形，叠罗汉因此可以复用现有的落地和贴附逻辑。新增纯函数社交协调器 `desk-pet-social.ts` 给两只下指令。渲染改成一个 rAF 循环驱动多只宠物。

**Tech Stack:** 与 Nono 相同：React 19 客户端组件、SVG、CSS、`node --test`。

**Spec:** [Momo 设计](../specs/2026-10-03-nodesk-desk-pet-momo-design.md)，基于 [Nono 设计](../specs/2026-10-03-nodesk-desk-pet-design.md)。

## Global Constraints

- 不引入新依赖。所有物种数值取自设计文档里的表格。
- 社交逻辑每 0.3 秒检查一次。打招呼：距离小于 70px，冷却 25 秒。叠罗汉：距离小于 90px，触发概率 8%，冷却 45 秒。追逐：间隔 60 到 120 秒，距离小于 36px 算追上，12 秒超时。
- localStorage 键：新键 `nodesk.ambient.pets.v2`，旧键 `nodesk.ambient.pet.v1` 的值为 `false` 时迁移为两只都关。
- 宠物只在 `privateWorkbenchVisible` 时显示。设置或搜索打开时隐藏。开启 reduced motion 时不移动，也不做社交互动。
- `desk-pet-social.ts` 和 `desk-pet-prefs.ts` 在导入模型时写 `.ts` 扩展名，这样 node 测试可以直接加载；tsconfig 已开启 `allowImportingTsExtensions`。
- 验证命令和提交方式同上一份计划。这次不单独推送，等用户要求后，和模糊修复一起推送部署。

## File Structure

- Modify `apps/nodesk/src/app/(home)/desk-pet/desk-pet-model.ts`：加入 Species、头顶平台、路线搜索、restSlot 和导出的指令函数。
- Create `apps/nodesk/src/app/(home)/desk-pet/desk-pet-social.ts`：社交协调器。
- Create `apps/nodesk/src/app/(home)/desk-pet/desk-pet-prefs.ts`：开关偏好的读取和迁移。
- Modify `apps/nodesk/src/app/(home)/desk-pet/desk-pet-sprite.tsx`：加入 Momo 的 SVG，按物种选择角色。
- Modify `apps/nodesk/src/app/(home)/desk-pet/desk-pet.tsx`：`DeskPet` 改为 `DeskPets`，驱动多只宠物。
- Modify `apps/nodesk/src/styles/desk-pet.css`：物种配色、Momo 的部件和动画。
- Modify `ambient-workbench.tsx`、`ambient-settings-center.tsx`：接入两个开关。
- Tests：
  - 重写 `apps/nodesk/tests/desk-pet.test.mts`
  - 新增 `apps/nodesk/tests/desk-pet-social.test.mts`

---

### Task 1: 多物种模型、头顶平台与路线

**Files:** Modify `desk-pet-model.ts`; Test `apps/nodesk/tests/desk-pet.test.mts`

**Interfaces（Produces）：**
- 类型 `Species`；常量 `NONO`、`MOMO`、`SPECIES`、`PET_PLATFORM_PREFIX`。
- `PetState` 新增 `id`、`species`、`goalAge` 三个字段，删除 `goalWait`。`PetInput` 新增 `restSlot`。
- `createPet(terrain, species, rng, { compact?, restSlot? })`。
- `travelToPlatform(s, platform, x, terrain, forceFly?)`，返回 `PetState | null`。
- `nextHop`、`headPlatform`、`withPeerHeads`、`isPetPlatform`、`setGoal`、`runTo`、`holdStill`、`restX`。

- [ ] **Step 1: 重写测试** `apps/nodesk/tests/desk-pet.test.mts`

```ts
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
	extractTerrain,
	headPlatform,
	releaseDrag,
	runTo,
	setGoal,
	startDrag,
	step,
	surfaceRotation,
	travelToPlatform,
	withPeerHeads,
	type PetInput,
	type PetState,
	type Platform,
	type Species,
	type SpeechContext,
	type Terrain
} from '../src/app/(home)/desk-pet/desk-pet-model.ts'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const constant = (value: number) => () => value
const awake: PetInput = { sleepy: false, panelKey: null, reducedMotion: false, compact: false, restSlot: 0 }
const FRAME = 1 / 60

function world(platforms: Platform[], extra: Partial<Terrain> = {}): Terrain {
	return { width: 1000, height: 800, platforms: [{ id: FLOOR_ID, y: 800, x1: 0, x2: 1000 }, ...platforms], walls: [], ceilings: [], ...extra }
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
	assert.equal(releaseDrag(startDrag(pet), 5000, 0).vx, 2200)
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

test('wires both pets into the workbench and the settings center', async () => {
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')

	for (const id of ['search', 'clock', 'upcoming', 'panel', 'notifications', 'appdock', 'dock']) assert.match(workbench, new RegExp(`data-pet-terrain='${id}'`))
	assert.match(workbench, /readPetPrefs/)
	assert.match(workbench, /<DeskPets/)
	assert.match(settings, /显示 Nono/)
	assert.match(settings, /显示 Momo/)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/nodesk && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/desk-pet.test.mts`
Expected: 因为 `NONO`、`MOMO`、`headPlatform` 等导出还不存在，模块加载失败。

- [ ] **Step 3: 重写模型** `desk-pet-model.ts`

```ts
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
		return travelToPlatform({ ...s, goalTries: s.goalTries + 1 }, goal, x, terrain, s.goalTries >= 1) ?? giveUpGoal(s, input)
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
```

- [ ] **Step 4: 运行模型测试**：除最后一条契约测试外全部通过。
- [ ] **Step 5: 提交** `feat(nodesk): pet species, head platforms and jump routes`

---

### Task 2: 社交协调器与偏好

**Files:**
- Create `desk-pet-social.ts`、`desk-pet-prefs.ts`
- Test `apps/nodesk/tests/desk-pet-social.test.mts`

**Interfaces（Produces）：**
- `SocialState`、`SocialSpeech`
- `createSocial(rng)`、`socialStep(pets, social, dt, terrain, input, rng)`、`isFree(pet)`
- `PetPrefs`、`PET_PREFS_KEY`、`LEGACY_PET_KEY`、`readPetPrefs(stored, legacy)`

- [ ] **Step 1: 写失败测试** `apps/nodesk/tests/desk-pet-social.test.mts`

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { FLOOR_ID, MOMO, NONO, createPet, step, withPeerHeads, type PetInput, type PetState, type Platform, type Species, type Terrain } from '../src/app/(home)/desk-pet/desk-pet-model.ts'
import { createSocial, socialStep, type SocialState } from '../src/app/(home)/desk-pet/desk-pet-social.ts'
import { readPetPrefs } from '../src/app/(home)/desk-pet/desk-pet-prefs.ts'

const constant = (value: number) => () => value
const awake = { sleepy: false, reducedMotion: false }
const petInput: PetInput = { sleepy: false, panelKey: null, reducedMotion: false, compact: false, restSlot: 0 }
const clock: Platform = { id: 'clock', y: 300, x1: 400, x2: 700 }
const terrain: Terrain = { width: 1000, height: 800, platforms: [{ id: FLOOR_ID, y: 800, x1: 0, x2: 1000 }, clock], walls: [], ceilings: [] }

function placeOn(id: string, x: number, species: Species): PetState {
	const platform = terrain.platforms.find(item => item.id === id)!
	const pet = createPet(terrain, species, constant(0.5))
	return { ...pet, x, y: platform.y - pet.height / 2, surface: { kind: 'platform', id }, pose: 'idle' }
}

const quiet = (overrides: Partial<SocialState> = {}): SocialState => ({ ...createSocial(constant(0.5)), checkIn: 0, greetCooldown: 99, stackCooldown: 99, nextChaseIn: 99, ...overrides })

test('pets that meet say hello and face each other', () => {
	const result = socialStep([placeOn('clock', 520, NONO), placeOn('clock', 570, MOMO)], quiet({ greetCooldown: 0 }), 0.016, terrain, awake, constant(0.5))
	const [nono, momo] = result.pets

	assert.deepEqual([nono.pose, momo.pose], ['happy', 'happy'])
	assert.deepEqual([nono.facing, momo.facing], ['right', 'left'])
	assert.deepEqual(result.speech.map(item => [item.petId, item.delayMs]), [['nono', 0], ['momo', 1200]])
	assert.equal(result.social.greetCooldown, 25)
})

test('leaves sleeping pets alone', () => {
	const pets = [placeOn('clock', 520, NONO), placeOn('clock', 570, MOMO)]
	const result = socialStep(pets, quiet({ greetCooldown: 0, nextChaseIn: 0 }), 0.016, terrain, { ...awake, sleepy: true }, constant(0.5))

	assert.deepEqual(result.pets, pets)
	assert.equal(result.social.chase, null)
	assert.deepEqual(result.speech, [])
})

test('starts a chase: the chaser calls out and the other runs away', () => {
	const result = socialStep([placeOn('clock', 430, NONO), placeOn('clock', 600, MOMO)], quiet({ nextChaseIn: 0 }), 0.016, terrain, awake, constant(0.3))

	assert.deepEqual(result.social.chase && [result.social.chase.chaserId, result.social.chase.targetId], ['nono', 'momo'])
	assert.equal(result.pets[1].pose, 'run')
	assert.equal(result.pets[1].walkTo, 700 - MOMO.size.width / 2)
	assert.deepEqual(result.speech.map(item => item.text), ['等等我！', '抓不到～'])
})

test('the chaser follows the target to another platform', () => {
	const chase = { chaserId: 'momo', targetId: 'nono', time: 1 }
	const result = socialStep([placeOn('clock', 550, NONO), placeOn(FLOOR_ID, 300, MOMO)], quiet({ chase }), 0.016, terrain, awake, constant(0.5))

	assert.equal(result.pets[1].goalId, 'clock')
})

test('catching up ends the chase with a happy hop', () => {
	const chase = { chaserId: 'nono', targetId: 'momo', time: 3 }
	const result = socialStep([placeOn('clock', 540, NONO), placeOn('clock', 560, MOMO)], quiet({ chase }), 0.016, terrain, awake, constant(0.5))

	assert.equal(result.social.chase, null)
	assert.deepEqual(result.pets.map(pet => pet.pose), ['happy', 'happy'])
	assert.ok(result.social.nextChaseIn >= 60)
	assert.deepEqual(result.speech.map(item => item.text), ['抓到啦！'])
})

test('a chase that drags on is called off', () => {
	const chase = { chaserId: 'nono', targetId: 'momo', time: 13 }
	const result = socialStep([placeOn('clock', 420, NONO), placeOn(FLOOR_ID, 900, MOMO)], quiet({ chase }), 0.016, terrain, awake, constant(0.5))

	assert.equal(result.social.chase, null)
})

test('one pet jumps onto the other and rides on its head', () => {
	let pets = [placeOn(FLOOR_ID, 500, NONO), placeOn(FLOOR_ID, 560, MOMO)]
	const result = socialStep(pets, quiet({ stackCooldown: 0 }), 0.016, terrain, awake, constant(0.05))

	assert.equal(result.pets[0].pose, 'crouch')
	assert.equal(result.pets[1].walkTo, null)
	assert.deepEqual(result.speech.map(item => item.text), ['嘿咻！'])
	assert.equal(result.social.stackCooldown, 45)

	pets = result.pets
	for (let elapsed = 0; elapsed < 1.5; elapsed += 1 / 60) {
		pets = pets.map(pet => step(pet, 1 / 60, withPeerHeads(terrain, pets, pet), petInput, constant(0.5)).state)
	}
	assert.deepEqual(pets[0].surface, { kind: 'platform', id: 'pet:momo' })
})

test('reads pet preferences with a legacy fallback', () => {
	assert.deepEqual(readPetPrefs(null, null), { nono: true, momo: true })
	assert.deepEqual(readPetPrefs(null, 'false'), { nono: false, momo: false })
	assert.deepEqual(readPetPrefs('{"nono":false,"momo":true}', 'false'), { nono: false, momo: true })
	assert.deepEqual(readPetPrefs('not json', null), { nono: true, momo: true })
})
```

- [ ] **Step 2: 运行测试确认失败**：模块不存在。

- [ ] **Step 3: 实现** `desk-pet-social.ts`

```ts
/**
 * Pet-to-pet interactions for the desk pets: greetings, chases and stacking.
 * Pure like the model; it only issues commands that the model then carries out.
 */
import {
	FLOOR_ID,
	cheer,
	headPlatform,
	holdStill,
	isPetPlatform,
	runTo,
	setGoal,
	travelToPlatform,
	withPeerHeads,
	type PetState,
	type Platform,
	type Rng,
	type Terrain
} from './desk-pet-model.ts'

export type SocialState = {
	chase: { chaserId: string; targetId: string; time: number } | null
	nextChaseIn: number
	greetCooldown: number
	stackCooldown: number
	checkIn: number
}
export type SocialSpeech = { petId: string; text: string; delayMs: number }
export type SocialInput = { sleepy: boolean; reducedMotion: boolean }

const CHECK_INTERVAL = 0.3
const GREET_DISTANCE = 70
const GREET_COOLDOWN = 25
const STACK_DISTANCE = 90
const STACK_CHANCE = 0.08
const STACK_COOLDOWN = 45
const STACK_WAIT = 2.5
const CATCH_DISTANCE = 36
const FLEE_DISTANCE = 120
const CHASE_TIMEOUT = 12
const REPLY_DELAY_MS = 1200
const TAUNT_DELAY_MS = 900

const GREETINGS: Record<string, string[]> = {
	nono: ['嗨 Momo～', '一起玩吗？', '今天也很可爱嘛'],
	momo: ['喵～', '嗯！', '喵呜～']
}

const pickOne = <T>(items: T[], rng: Rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
const chaseDelay = (rng: Rng) => 60 + rng() * 60
const platformOf = (pet: PetState) => pet.surface.kind === 'platform' ? pet.surface.id : null
const findPlatform = (terrain: Terrain, id: string | null) => id === null ? undefined : terrain.platforms.find(item => item.id === id)
const facingToward = (pet: PetState, x: number) => ({ ...pet, facing: x < pet.x ? 'left' as const : 'right' as const })

export function createSocial(rng: Rng): SocialState {
	return { chase: null, nextChaseIn: chaseDelay(rng), greetCooldown: 8, stackCooldown: 20, checkIn: CHECK_INTERVAL }
}

/** Standing on an ordinary platform with nothing better to do. */
export function isFree(pet: PetState) {
	const platform = platformOf(pet)
	return platform !== null && !isPetPlatform(platform) && ['idle', 'walk', 'run'].includes(pet.pose) && pet.goalId === null && pet.flight === null
}

export function socialStep(pets: PetState[], social: SocialState, dt: number, terrain: Terrain, input: SocialInput, rng: Rng): { pets: PetState[]; social: SocialState; speech: SocialSpeech[] } {
	const speech: SocialSpeech[] = []
	const next: SocialState = {
		...social,
		chase: social.chase && { ...social.chase, time: social.chase.time + dt },
		nextChaseIn: social.nextChaseIn - dt,
		greetCooldown: Math.max(0, social.greetCooldown - dt),
		stackCooldown: Math.max(0, social.stackCooldown - dt),
		checkIn: social.checkIn - dt
	}
	if (pets.length < 2 || input.sleepy || input.reducedMotion) return { pets, social: { ...next, chase: null }, speech }
	if (next.checkIn > 0) return { pets, social: next, speech }
	next.checkIn = CHECK_INTERVAL

	let [a, b] = pets
	const rest = pets.slice(2)
	const samePlatform = platformOf(a) !== null && platformOf(a) === platformOf(b)
	const distance = Math.abs(a.x - b.x)

	if (next.chase) {
		const chaserIsA = next.chase.chaserId === a.id
		let chaser = chaserIsA ? a : b
		let target = chaserIsA ? b : a
		if (next.chase.time > CHASE_TIMEOUT) {
			next.chase = null
			next.nextChaseIn = chaseDelay(rng)
		} else if (samePlatform && distance < CATCH_DISTANCE) {
			chaser = cheer(chaser)
			target = cheer(target)
			speech.push({ petId: chaser.id, text: '抓到啦！', delayMs: 0 })
			next.chase = null
			next.nextChaseIn = chaseDelay(rng)
		} else {
			const platform = findPlatform(terrain, platformOf(target))
			if (isFree(chaser) && platform && !isPetPlatform(platform.id)) {
				chaser = samePlatform ? runTo(chaser, target.x, platform) : setGoal(chaser, platform.id)
			}
			if (isFree(target) && samePlatform && distance < FLEE_DISTANCE && platform) target = flee(target, chaser, platform, terrain, rng)
		}
		;[a, b] = chaserIsA ? [chaser, target] : [target, chaser]
		return { pets: [a, b, ...rest], social: next, speech }
	}

	const bothFree = isFree(a) && isFree(b)
	if (bothFree && samePlatform && distance < GREET_DISTANCE && next.greetCooldown <= 0) {
		a = facingToward(cheer(a), b.x)
		b = facingToward(cheer(b), a.x)
		speech.push({ petId: a.id, text: pickOne(GREETINGS[a.id] ?? ['你好呀'], rng), delayMs: 0 })
		speech.push({ petId: b.id, text: pickOne(GREETINGS[b.id] ?? ['你好呀'], rng), delayMs: REPLY_DELAY_MS })
		next.greetCooldown = GREET_COOLDOWN
		return { pets: [a, b, ...rest], social: next, speech }
	}

	if (bothFree && samePlatform && distance < STACK_DISTANCE && next.stackCooldown <= 0 && rng() < STACK_CHANCE) {
		const riderIsA = rng() < 0.5
		const rider = riderIsA ? a : b
		const carrier = holdStill(riderIsA ? b : a, STACK_WAIT)
		const head = headPlatform(carrier)
		const jump = head && travelToPlatform(rider, head, carrier.x, withPeerHeads(terrain, [rider, carrier], rider))
		if (jump && jump.pose === 'crouch') {
			;[a, b] = riderIsA ? [jump, carrier] : [carrier, jump]
			speech.push({ petId: rider.id, text: '嘿咻！', delayMs: 0 })
			next.stackCooldown = STACK_COOLDOWN
			return { pets: [a, b, ...rest], social: next, speech }
		}
	}

	if (bothFree && next.nextChaseIn <= 0) {
		const chaserIsA = rng() < 0.5
		const chaser = chaserIsA ? a : b
		let target = chaserIsA ? b : a
		const platform = findPlatform(terrain, platformOf(target))
		if (platform) target = flee(target, chaser, platform, terrain, rng)
		;[a, b] = chaserIsA ? [chaser, target] : [target, chaser]
		next.chase = { chaserId: chaser.id, targetId: target.id, time: 0 }
		speech.push({ petId: chaser.id, text: '等等我！', delayMs: 0 })
		speech.push({ petId: target.id, text: '抓不到～', delayMs: TAUNT_DELAY_MS })
	}
	return { pets: [a, b, ...rest], social: next, speech }
}

/** Run to the far end of the platform, or leave for another one (flying if it can). */
function flee(target: PetState, chaser: PetState, platform: Platform, terrain: Terrain, rng: Rng): PetState {
	if (rng() < 0.5) return runTo(target, chaser.x < target.x ? platform.x2 : platform.x1, platform)
	const others = terrain.platforms.filter(item => item.id !== platform.id && !isPetPlatform(item.id) && item.id !== FLOOR_ID)
	if (!others.length) return runTo(target, chaser.x < target.x ? platform.x2 : platform.x1, platform)
	const destination = pickOne(others, rng)
	if (!target.species.canFly) return setGoal(target, destination.id)
	return travelToPlatform(target, destination, (destination.x1 + destination.x2) / 2, terrain, true) ?? target
}
```

`desk-pet-prefs.ts`：

```ts
/** Which desk pets are shown, stored per browser. */
export const PET_PREFS_KEY = 'nodesk.ambient.pets.v2'
/** The single on/off switch from before Momo; `false` turns both pets off. */
export const LEGACY_PET_KEY = 'nodesk.ambient.pet.v1'

export type PetPrefs = { nono: boolean; momo: boolean }

export function readPetPrefs(stored: string | null, legacy: string | null): PetPrefs {
	const fallback: PetPrefs = legacy === 'false' ? { nono: false, momo: false } : { nono: true, momo: true }
	if (!stored) return fallback
	try {
		const value = JSON.parse(stored) as Partial<Record<keyof PetPrefs, unknown>> | null
		return {
			nono: typeof value?.nono === 'boolean' ? value.nono : fallback.nono,
			momo: typeof value?.momo === 'boolean' ? value.momo : fallback.momo
		}
	} catch {
		return fallback
	}
}
```

- [ ] **Step 4: 运行两份测试**：除契约测试外全部通过。
- [ ] **Step 5: 提交** `feat(nodesk): pet greetings, chases and stacking`

---

### Task 3: Momo 角色、多宠渲染与接线

**Files:** sprite、desk-pet.tsx、desk-pet.css、ambient-workbench.tsx、ambient-settings-center.tsx

- [ ] **Step 1: 角色** `desk-pet-sprite.tsx`

```tsx
import type { Species } from './desk-pet-model'

/** The pet sprites: parts are separate so CSS can animate them per pose (see desk-pet.css). */
export function DeskPetSprite({ species }: { species: Species }) {
	return <span className='desk-pet-facing'>
		<span className='desk-pet-figure'>
			{species.id === 'momo' ? <MomoSvg /> : <NonoSvg />}
			<span className='desk-pet-fx' />
		</span>
	</span>
}

function Eyes({ left, right, y }: { left: number; right: number; y: number }) {
	return <>
		<g className='desk-pet-eyes desk-pet-eyes-open'>
			<ellipse cx={left} cy={y} rx='2.3' ry='2.8' />
			<ellipse cx={right} cy={y} rx='2.3' ry='2.8' />
			<circle className='desk-pet-glint' cx={left + 0.8} cy={y - 1.1} r='0.8' />
			<circle className='desk-pet-glint' cx={right + 0.8} cy={y - 1.1} r='0.8' />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-happy'>
			<path d={`M${left - 2.5} ${y + 1} Q${left} ${y - 2.5} ${left + 2.5} ${y + 1}`} />
			<path d={`M${right - 2.5} ${y + 1} Q${right} ${y - 2.5} ${right + 2.5} ${y + 1}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-sleep'>
			<path d={`M${left - 2.5} ${y} Q${left} ${y + 2.5} ${left + 2.5} ${y}`} />
			<path d={`M${right - 2.5} ${y} Q${right} ${y + 2.5} ${right + 2.5} ${y}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-surprised'>
			<circle cx={left} cy={y} r='2.6' />
			<circle cx={right} cy={y} r='2.6' />
		</g>
	</>
}

function NonoSvg() {
	return <svg className='desk-pet-svg' viewBox='0 0 44 38' width='100%' height='100%' focusable='false'>
		<defs>
			<linearGradient id='desk-pet-nono-fill' x1='0' y1='0' x2='0' y2='1'>
				<stop offset='0%' stopColor='var(--pet-body-top)' />
				<stop offset='100%' stopColor='var(--pet-body-bottom)' />
			</linearGradient>
		</defs>
		<path className='desk-pet-wing desk-pet-wing-left' d='M9 16 C1 3 -7 14 -1 22 C2 25.5 7 24 10 20 Z' />
		<path className='desk-pet-wing desk-pet-wing-right' d='M35 16 C43 3 51 14 45 22 C42 25.5 37 24 34 20 Z' />
		<ellipse className='desk-pet-foot desk-pet-foot-left' cx='16' cy='34.4' rx='4' ry='2.6' />
		<ellipse className='desk-pet-foot desk-pet-foot-right' cx='28' cy='34.4' rx='4' ry='2.6' />
		<path className='desk-pet-body' d='M22 4 C33 4 39 11 39 21 C39 30 32 34 22 34 C12 34 5 30 5 21 C5 11 11 4 22 4 Z' fill='url(#desk-pet-nono-fill)' />
		<ellipse className='desk-pet-shine' cx='16' cy='10' rx='5' ry='2.4' />
		<ellipse className='desk-pet-blush' cx='11.5' cy='23' rx='3.4' ry='2' />
		<ellipse className='desk-pet-blush' cx='32.5' cy='23' rx='3.4' ry='2' />
		<Eyes left={16.5} right={27.5} y={18} />
		<path className='desk-pet-mouth' d='M20 24.5 Q22 26.5 24 24.5' />
	</svg>
}

function MomoSvg() {
	return <svg className='desk-pet-svg' viewBox='0 0 46 40' width='100%' height='100%' focusable='false'>
		<defs>
			<linearGradient id='desk-pet-momo-fill' x1='0' y1='0' x2='0' y2='1'>
				<stop offset='0%' stopColor='var(--pet-body-top)' />
				<stop offset='100%' stopColor='var(--pet-body-bottom)' />
			</linearGradient>
		</defs>
		<path className='desk-pet-tail' d='M35 31 C44 31 47 22 43 15 C41.6 12.8 38.6 13.8 39.6 16.4 C41.6 21 40 26.6 34.6 27 Z' />
		<ellipse className='desk-pet-foot desk-pet-foot-left' cx='16.5' cy='36.6' rx='4.2' ry='2.6' />
		<ellipse className='desk-pet-foot desk-pet-foot-right' cx='29.5' cy='36.6' rx='4.2' ry='2.6' />
		<path className='desk-pet-ear' d='M9.5 17 L11 2.5 L21 9.5 Z' />
		<path className='desk-pet-ear' d='M36.5 17 L35 2.5 L25 9.5 Z' />
		<path className='desk-pet-ear-inner' d='M12.4 13 L13 6.4 L17.6 9.6 Z' />
		<path className='desk-pet-ear-inner' d='M33.6 13 L33 6.4 L28.4 9.6 Z' />
		<path className='desk-pet-body' d='M23 7.5 C33.5 7.5 39 14 39 23.5 C39 32.5 32.5 36.5 23 36.5 C13.5 36.5 7 32.5 7 23.5 C7 14 12.5 7.5 23 7.5 Z' fill='url(#desk-pet-momo-fill)' />
		<ellipse className='desk-pet-belly' cx='23' cy='29.5' rx='9.5' ry='6.5' />
		<path className='desk-pet-stripe' d='M19.6 9.6 L20.6 13.6 M23 9 V13.4 M26.4 9.6 L25.4 13.6' />
		<ellipse className='desk-pet-blush' cx='12.6' cy='25.6' rx='3.2' ry='1.9' />
		<ellipse className='desk-pet-blush' cx='33.4' cy='25.6' rx='3.2' ry='1.9' />
		<Eyes left={17.5} right={28.5} y={20.5} />
		<path className='desk-pet-nose' d='M21.8 24.2 L24.2 24.2 L23 25.6 Z' />
		<path className='desk-pet-mouth' d='M20.8 26.4 Q21.9 27.6 23 26.4 Q24.1 27.6 25.2 26.4' />
		<path className='desk-pet-whisker' d='M6.5 24 L13.5 25 M6.8 27.4 L13.6 26.6 M39.5 24 L32.5 25 M39.2 27.4 L32.4 26.6' />
	</svg>
}
```

- [ ] **Step 2: 多宠组件** `desk-pet.tsx`

```tsx
'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
	cheer,
	chooseSpeech,
	createPet,
	dragTo,
	extractTerrain,
	releaseDrag,
	startDrag,
	step,
	surfaceRotation,
	withPeerHeads,
	type PetInput,
	type PetState,
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

type PointerSample = { x: number; y: number; t: number }
type DragSession = { petId: string; pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; startedAt: number; dragging: boolean; samples: PointerSample[] }

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

function paint(pet: HTMLDivElement | undefined, bubble: HTMLDivElement | undefined, state: PetState, viewportWidth: number) {
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

export function DeskPets({ rootRef, species, sleepy, panelKey, notificationUnreadCount, upcomingTitle, focusRunning, hour, reducedMotion, hidden }: Props) {
	const petEls = useRef(new Map<string, HTMLDivElement>())
	const bubbleEls = useRef(new Map<string, HTMLDivElement>())
	const petsRef = useRef<PetState[]>([])
	const socialRef = useRef<SocialState>(createSocial(Math.random))
	const terrainRef = useRef<Terrain | null>(null)
	const dragRef = useRef<DragSession | null>(null)
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
				const petInput: PetInput = { ...input, restSlot: restSlot(index, pets.length) }
				const result = step(pet, dt, withPeerHeads(terrain, pets, pet), petInput, Math.random)
				if (result.events.includes('speak')) speakRef.current('idle', pet.id)
				return result.state
			})
			const social = socialStep(stepped, socialRef.current, dt, terrain, input, Math.random)
			socialRef.current = social.social
			petsRef.current = social.pets
			for (const line of social.speech) {
				const timer = window.setTimeout(() => {
					speechRef.current.pending.delete(timer)
					sayRef.current(line.petId, line.text)
				}, line.delayMs)
				speechRef.current.pending.add(timer)
			}
			for (const pet of social.pets) paint(petEls.current.get(pet.id), bubbleEls.current.get(pet.id), pet, terrain.width)
		}
		frame = requestAnimationFrame(tick)

		const interval = window.setInterval(refresh, TERRAIN_REFRESH_MS)
		const observer = new ResizeObserver(refresh)
		observer.observe(root)
		const look = (event: PointerEvent) => {
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
		petsRef.current = petsRef.current.map(pet => pet.id === petId ? change(pet) : pet)
		const pet = petsRef.current.find(item => item.id === petId)
		if (pet) paint(petEls.current.get(petId), bubbleEls.current.get(petId), pet, terrainRef.current?.width ?? window.innerWidth)
	}

	const onPointerDown = (petId: string, event: ReactPointerEvent<HTMLDivElement>) => {
		const pet = petsRef.current.find(item => item.id === petId)
		if (!pet || event.button !== 0 || dragRef.current) return
		event.currentTarget.setPointerCapture(event.pointerId)
		const t = performance.now()
		dragRef.current = { petId, pointerId: event.pointerId, offsetX: event.clientX - pet.x, offsetY: event.clientY - pet.y, startX: event.clientX, startY: event.clientY, startedAt: t, dragging: false, samples: [{ x: event.clientX, y: event.clientY, t }] }
	}

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== event.pointerId) return
		const t = performance.now()
		drag.samples = [...drag.samples.filter(sample => t - sample.t <= THROW_SAMPLE_MS), { x: event.clientX, y: event.clientY, t }]
		if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < CLICK_DISTANCE) return
		const starting = !drag.dragging
		drag.dragging = true
		updatePet(drag.petId, pet => dragTo(starting ? startDrag(pet) : pet, event.clientX - drag.offsetX, event.clientY - drag.offsetY))
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
```

- [ ] **Step 3: 在 `desk-pet.css` 加 Momo 的样式**：追加到文件末尾，`@media (prefers-reduced-motion)` 之前。并在 reduced-motion 块的选择器里加上 `.desk-pet .desk-pet-tail`。

```css
/* Momo, the orange cat */
.desk-pet[data-species='momo'] {
	--pet-body-top: #ffd09c;
	--pet-body-bottom: #f29a4b;
	--pet-blush: #ff9e9e;
	--pet-belly: #fff6ec;
	--pet-stripe: #d9782a;
	--pet-ink: #3a2414;
}

.ambient-workbench[data-dimmed='true'] .desk-pet[data-species='momo'] {
	--pet-body-top: #d8ad7f;
	--pet-body-bottom: #bf7a3f;
	--pet-belly: #e3d8cc;
	--pet-blush: #d48c8c;
}

.desk-pet-ear,
.desk-pet-tail {
	fill: var(--pet-body-bottom);
	stroke: color-mix(in srgb, var(--pet-ink) 24%, transparent);
	stroke-linejoin: round;
	stroke-width: 0.7;
}

.desk-pet-ear-inner {
	fill: #ffb9b0;
}

.desk-pet-belly {
	fill: var(--pet-belly);
}

.desk-pet[data-species='momo'] .desk-pet-foot {
	fill: var(--pet-belly);
}

.desk-pet-stripe {
	fill: none;
	stroke: var(--pet-stripe);
	stroke-linecap: round;
	stroke-width: 1.4;
}

.desk-pet-nose {
	fill: #ff8f9a;
}

.desk-pet-whisker {
	fill: none;
	stroke: color-mix(in srgb, var(--pet-ink) 45%, transparent);
	stroke-linecap: round;
	stroke-width: 0.6;
}

.desk-pet-tail {
	animation: desk-pet-tail 2.2s ease-in-out infinite;
	transform-origin: 35px 29px;
}

.desk-pet:is([data-pose='walk'], [data-pose='climb']) .desk-pet-tail { animation-duration: 0.9s; }
.desk-pet[data-pose='run'] .desk-pet-tail { animation: none; transform: rotate(-24deg); }
.desk-pet:is([data-pose='fall'], [data-pose='drag'], [data-pose='jump']) .desk-pet-tail { animation: none; transform: rotate(-38deg); }
.desk-pet[data-pose='sleep'] .desk-pet-tail { animation: none; transform: rotate(38deg); }
.desk-pet[data-species='momo'][data-pose='land'] .desk-pet-figure { animation: desk-pet-land-hard 0.2s ease-out; }
.desk-pet[data-species='momo'][data-pose='sleep'] .desk-pet-figure { transform: scale(1.1, 0.8); }

@keyframes desk-pet-tail {
	0%, 100% { transform: rotate(-6deg); }
	50% { transform: rotate(10deg); }
}

@keyframes desk-pet-land-hard {
	0% { transform: scale(1.26, 0.72); }
	60% { transform: scale(0.96, 1.05); }
	100% { transform: scale(1); }
}
```

- [ ] **Step 4: 接线**
  - workbench：
    - 删除 `PET_STORAGE_KEY` 常量；import `DeskPets`、`SPECIES`（来自 model）、`readPetPrefs`、`PET_PREFS_KEY`、`LEGACY_PET_KEY`、`type PetPrefs`。
    - state 改为 `const [petPrefs, setPetPrefs] = useState<PetPrefs>({ nono: true, momo: true })`，加载处改为 `setPetPrefs(readPetPrefs(localStorage.getItem(PET_PREFS_KEY), localStorage.getItem(LEGACY_PET_KEY)))`。
    - `changePetVisible(id: keyof PetPrefs, visible: boolean)` 写入 `PET_PREFS_KEY` 的 JSON。
    - 渲染：`const visiblePets = useMemo(() => SPECIES.filter(item => petPrefs[item.id as keyof PetPrefs]), [petPrefs])`，然后 `{privateWorkbenchVisible && visiblePets.length > 0 && <DeskPets species={visiblePets} .../>}`。
    - 传给设置中心 `pets={petPrefs}` 和 `onPetChange={changePetVisible}`。
  - 设置中心：
    - props 改为 `pets: PetPrefs; onPetChange: (id: keyof PetPrefs, visible: boolean) => void`。
    - 「桌面宠物」区域改成两个 toggle：「显示 Nono」（小团子，会飞）和「显示 Momo」（橘猫，跳得高）。说明文字改为「两只都打开时，它们会打招呼、追逐和叠罗汉。只对当前浏览器生效。」

- [ ] **Step 5:** 运行 `npm test`、`npm run typecheck`、`next build`，全部通过后提交 `feat(nodesk): Momo the cat joins Nono on the desk`。

---

### Task 4: 浏览器实测

- [ ] 复用 `/tmp/pet` 下的 Playwright 方法：起 `next start`，拦截 `/api/**` 模拟登录。
  1. 在 1440×900 和 393×851 两种视口下截图，确认 `.desk-pet[data-species='nono']` 和 `.desk-pet[data-species='momo']` 都处于 ready 状态，且都站在某个平台上。
  2. 分别拖拽两只并抛出，确认都能落回平台。
  3. 点击「柔和画面」，等 7 秒，确认两只都是 `sleep`，并且在时钟上一左一右（Nono 的 x 小于 Momo 的 x）。
  4. 把 Momo 拖到 Nono 正上方松手，确认 Momo 落在 Nono 头顶，`data-pose` 回到 idle 或 land。
  5. 在 4 倍缩放下给 Momo 的各个姿态截图，检查外观。
  6. 关掉「显示 Momo」，确认只剩 Nono。
- [ ] 发现问题就修复，并以 `fix(nodesk): ...` 提交。
