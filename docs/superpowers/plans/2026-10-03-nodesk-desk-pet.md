# NoDesk 桌面宠物 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 NoDesk 首页环境桌面加入小团子精灵「Nono」。它把组件当作地形走、跑、跳、爬、挂、飞，可以被拖拽抛出，并与空闲、调暗、面板和通知联动，偶尔说话。

**Architecture:** 纯逻辑模块 `desk-pet-model.ts` 负责地形提取、物理、行为状态机和说话选择，不访问 DOM，用 `node --test` 测试。客户端组件 `desk-pet.tsx` 读取带 `data-pet-terrain` 标记的元素矩形，用 rAF 推进模型，每帧只改 ref 上的 `transform` 和 `data-*` 属性。SVG 角色和 CSS 姿态动画分别放在 `desk-pet-sprite.tsx` 和 `desk-pet.css`。

**Tech Stack:** Next.js 16 / React 19 客户端组件、内联 SVG、纯 CSS 动画、Node `--experimental-strip-types` 测试。

**Spec:** [NoDesk 桌面宠物设计](../specs/2026-10-03-nodesk-desk-pet-design.md)

## Global Constraints

- 不引入新依赖。
- 宠物只在 `privateWorkbenchVisible` 时渲染；设置中心或搜索打开时隐藏并暂停。
- 显示开关存放在 localStorage 的 `nodesk.ambient.pet.v1` 中，默认开启，不改服务端。
- 尺寸：桌面端 44×38，≤720px 时 34×29。
- 物理参数：重力 1800 px/s²；走 40、跑 110、爬 30 px/s；抛出速度上限 2200 px/s；反弹系数 0.4。
- 跳跃条件：水平距离 ≤ 260px 且需要上升 ≤ 160px；不满足时用飞行，时长 0.8–1.6s。
- 气泡：显示 4 秒，最多 18 个字；两次随机说话至少间隔 3 分钟；`focusRunning` 时不随机说话；休息提醒每 60 分钟最多一次。
- `prefers-reduced-motion` 时宠物固定在时钟块上，只保留眨眼和说话。
- 层级：z-index 32，高于 dock（30）和面板（25），低于搜索遮罩（80）和设置中心（90）。设计稿写的是 28，但那样会低于 dock，所以以本计划为准。
- 视口左右边只做反弹，不能攀爬：攀爬视口边缘没有终点。这一点修正了设计稿。
- 顶栏本身没有可见背景，不作为地形，改为标记搜索框 `.ambient-command-trigger`。时钟地形标记的是 `.ambient-time` 数字块。
- 在 `apps/nodesk` 下用 `npm test`、`npm run typecheck` 和 `node node_modules/next/dist/bin/next build` 验证（容器里没有 pnpm）。
- 提交时使用 `git -c user.name=noaul -c user.email=aosinap@gmail.com commit`，提交到 main，用户要求后再推送。

## File Structure

- Create `apps/nodesk/src/app/(home)/desk-pet/desk-pet-model.ts`：类型、地形、物理与行为、外部动作（拖拽、点击）、说话选择。
- Create `apps/nodesk/tests/desk-pet.test.mts`：模型单测和源码契约测试。
- Create `apps/nodesk/src/app/(home)/desk-pet/desk-pet-sprite.tsx`：SVG 角色。
- Create `apps/nodesk/src/app/(home)/desk-pet/desk-pet.tsx`：rAF 循环、地形读取、指针、气泡和联动。
- Create `apps/nodesk/src/styles/desk-pet.css`：图层、姿态动画、配色、气泡和 reduced motion。
- Modify `apps/nodesk/src/styles/globals.css`：引入 `desk-pet.css`。
- Modify `apps/nodesk/src/app/(home)/ambient-workbench.tsx`：添加地形标记、开关状态和渲染 `<DeskPet>`。
- Modify `apps/nodesk/src/app/(home)/ambient-settings-center.tsx`：添加宠物开关。

---

### Task 1: 宠物模型（地形、物理、行为、说话）

**Files:**
- Create: `apps/nodesk/src/app/(home)/desk-pet/desk-pet-model.ts`
- Test: `apps/nodesk/tests/desk-pet.test.mts`

**Interfaces:**
- Produces（Task 2 使用）：
  - 类型：`TerrainSource`、`Terrain`、`PetState`、`PetInput`、`PetSize`、`Pose`、`Surface`、`SpeechTrigger`、`Speech`
  - 常量：`PET_SIZE`、`PET_SIZE_COMPACT`、`REST_ID = 'clock'`、`PANEL_ID = 'panel'`、`FLOOR_ID`
  - `extractTerrain(sources, viewport, petHeight): Terrain`
  - `createPet(terrain, size, rng): PetState`
  - `step(state, dt, terrain, input, rng): { state: PetState; events: PetEvent[] }`
  - `startDrag(state)`、`dragTo(state, x, y)`、`releaseDrag(state, vx, vy)`、`cheer(state)`
  - `surfaceRotation(surface): number`
  - `chooseSpeech(context, rng): Speech | null`

- [ ] **Step 1: 写失败测试** `apps/nodesk/tests/desk-pet.test.mts`

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/nodesk && npm test -- 2>&1 | tail -20`（`npm test` 会运行 `tests/*.test.mts`）
Expected: `desk-pet.test.mts` 因 `Cannot find module .../desk-pet-model.ts` 失败。

- [ ] **Step 3: 实现模型** `apps/nodesk/src/app/(home)/desk-pet/desk-pet-model.ts`

```ts
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
```

- [ ] **Step 4: 运行模型测试确认通过**

Run: `cd apps/nodesk && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/desk-pet.test.mts`
Expected: 只有最后一条契约测试（`wires the pet into the workbench...`）失败，其余都通过。契约测试要到 Task 3 才会通过。

- [ ] **Step 5: 提交**

```bash
git add apps/nodesk/src/app/\(home\)/desk-pet/desk-pet-model.ts apps/nodesk/tests/desk-pet.test.mts
git -c user.name=noaul -c user.email=aosinap@gmail.com commit -m "feat(nodesk): desk pet terrain, physics and behaviour model"
```

---

### Task 2: SVG 角色、样式和客户端组件

**Files:**
- Create: `apps/nodesk/src/app/(home)/desk-pet/desk-pet-sprite.tsx`
- Create: `apps/nodesk/src/app/(home)/desk-pet/desk-pet.tsx`
- Create: `apps/nodesk/src/styles/desk-pet.css`
- Modify: `apps/nodesk/src/styles/globals.css`（在 `@import './ambient-workbench.css';` 之后添加 `@import './desk-pet.css';`）

**Interfaces:**
- Consumes：Task 1 的全部导出。
- Produces（Task 3 使用）：`DeskPet` 组件，props 如下：
  `{ rootRef: React.RefObject<HTMLElement | null>; sleepy: boolean; panelKey: string | null; notificationUnreadCount: number; upcomingTitle: string | null; focusRunning: boolean; hour: number; reducedMotion: boolean; hidden: boolean }`。组件会查询 `rootRef` 下所有 `[data-pet-terrain]` 元素作为地形。

- [ ] **Step 1: 写 SVG 角色** `desk-pet-sprite.tsx`

```tsx
/** The Nono sprite: parts are separate so CSS can animate them per pose (see desk-pet.css). */
export function DeskPetSprite() {
	return <span className='desk-pet-facing'>
		<span className='desk-pet-figure'>
			<svg className='desk-pet-svg' viewBox='0 0 44 38' width='100%' height='100%' focusable='false'>
				<defs>
					<linearGradient id='desk-pet-body-fill' x1='0' y1='0' x2='0' y2='1'>
						<stop offset='0%' stopColor='var(--pet-body-top)' />
						<stop offset='100%' stopColor='var(--pet-body-bottom)' />
					</linearGradient>
				</defs>
				<path className='desk-pet-wing desk-pet-wing-left' d='M9 17 C2 9 -1 18 4 22 C6 23.5 9 22 10 20 Z' />
				<path className='desk-pet-wing desk-pet-wing-right' d='M35 17 C42 9 45 18 40 22 C38 23.5 35 22 34 20 Z' />
				<ellipse className='desk-pet-foot desk-pet-foot-left' cx='16' cy='34.4' rx='4' ry='2.6' />
				<ellipse className='desk-pet-foot desk-pet-foot-right' cx='28' cy='34.4' rx='4' ry='2.6' />
				<path className='desk-pet-body' d='M22 4 C33 4 39 11 39 21 C39 30 32 34 22 34 C12 34 5 30 5 21 C5 11 11 4 22 4 Z' fill='url(#desk-pet-body-fill)' />
				<ellipse className='desk-pet-shine' cx='16' cy='10' rx='5' ry='2.4' />
				<ellipse className='desk-pet-blush' cx='11.5' cy='23' rx='3.4' ry='2' />
				<ellipse className='desk-pet-blush' cx='32.5' cy='23' rx='3.4' ry='2' />
				<g className='desk-pet-eyes desk-pet-eyes-open'>
					<ellipse cx='16.5' cy='18' rx='2.3' ry='2.8' />
					<ellipse cx='27.5' cy='18' rx='2.3' ry='2.8' />
					<circle className='desk-pet-glint' cx='17.3' cy='16.9' r='0.8' />
					<circle className='desk-pet-glint' cx='28.3' cy='16.9' r='0.8' />
				</g>
				<g className='desk-pet-eyes desk-pet-eyes-happy'>
					<path d='M14 19 Q16.5 15.5 19 19' />
					<path d='M25 19 Q27.5 15.5 30 19' />
				</g>
				<g className='desk-pet-eyes desk-pet-eyes-sleep'>
					<path d='M14 18 Q16.5 20.5 19 18' />
					<path d='M25 18 Q27.5 20.5 30 18' />
				</g>
				<g className='desk-pet-eyes desk-pet-eyes-surprised'>
					<circle cx='16.5' cy='18' r='2.6' />
					<circle cx='27.5' cy='18' r='2.6' />
				</g>
				<path className='desk-pet-mouth' d='M20 24.5 Q22 26.5 24 24.5' />
			</svg>
			<span className='desk-pet-fx' />
		</span>
	</span>
}
```

- [ ] **Step 2: 写客户端组件** `desk-pet.tsx`

```tsx
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
```

- [ ] **Step 3: 写样式** `apps/nodesk/src/styles/desk-pet.css`

```css
.desk-pet-layer {
	--pet-body-top: #a8e6d4;
	--pet-body-bottom: #6cc4b0;
	--pet-blush: #ffb3b3;
	--pet-ink: #1d3b34;
	inset: 0;
	pointer-events: none;
	position: absolute;
	z-index: 32;
}

.ambient-workbench[data-dimmed='true'] .desk-pet-layer {
	--pet-body-top: #86bfb0;
	--pet-body-bottom: #4f9585;
	--pet-blush: #d99595;
}

.desk-pet-layer[data-hidden='true'] {
	display: none;
}

.desk-pet {
	cursor: grab;
	left: 0;
	pointer-events: auto;
	position: absolute;
	top: 0;
	touch-action: none;
	transform-origin: center;
	user-select: none;
	will-change: transform;
}

.desk-pet:not([data-ready]) {
	opacity: 0;
}

.desk-pet[data-pose='drag'] {
	cursor: grabbing;
}

.desk-pet-facing,
.desk-pet-figure {
	display: block;
	height: 100%;
	position: relative;
	width: 100%;
}

.desk-pet[data-facing='left'] .desk-pet-facing {
	transform: scaleX(-1);
}

.desk-pet-figure {
	transform-origin: 50% 92%;
}

.desk-pet-svg {
	display: block;
	filter: drop-shadow(0 3px 4px rgba(20, 50, 44, 0.22));
	overflow: visible;
}

.desk-pet-body {
	stroke: color-mix(in srgb, var(--pet-ink) 28%, transparent);
	stroke-width: 0.8;
}

.desk-pet-shine {
	fill: rgba(255, 255, 255, 0.72);
}

.desk-pet-blush {
	fill: var(--pet-blush);
	opacity: 0.7;
}

.desk-pet-foot {
	fill: var(--pet-body-bottom);
	stroke: color-mix(in srgb, var(--pet-ink) 24%, transparent);
	stroke-width: 0.6;
}

.desk-pet-wing {
	fill: rgba(255, 255, 255, 0.78);
	stroke: rgba(150, 205, 192, 0.9);
	stroke-width: 0.6;
	transform: scale(0.45);
	transition: transform 160ms ease;
}

.desk-pet-wing-left {
	transform-origin: 10px 20px;
}

.desk-pet-wing-right {
	transform-origin: 34px 20px;
}

.desk-pet-eyes {
	display: none;
	fill: var(--pet-ink);
}

.desk-pet-eyes path {
	fill: none;
	stroke: var(--pet-ink);
	stroke-linecap: round;
	stroke-width: 1.6;
}

.desk-pet-eyes-open {
	animation: desk-pet-blink 5.3s infinite;
	display: inline;
	transform: translate(var(--pet-look-x, 0), var(--pet-look-y, 0));
	transform-box: fill-box;
	transform-origin: center;
	transition: transform 120ms ease;
}

.desk-pet-glint {
	fill: #fff;
}

.desk-pet-mouth {
	fill: none;
	stroke: var(--pet-ink);
	stroke-linecap: round;
	stroke-width: 1.3;
}

.desk-pet:is([data-pose='happy'], [data-pose='stretch']) .desk-pet-eyes-open,
.desk-pet[data-pose='sleep'] .desk-pet-eyes-open,
.desk-pet:is([data-pose='fall'], [data-pose='drag']) .desk-pet-eyes-open {
	display: none;
}

.desk-pet:is([data-pose='happy'], [data-pose='stretch']) .desk-pet-eyes-happy,
.desk-pet[data-pose='sleep'] .desk-pet-eyes-sleep,
.desk-pet:is([data-pose='fall'], [data-pose='drag']) .desk-pet-eyes-surprised {
	display: inline;
}

.desk-pet-fx {
	color: var(--pet-ink);
	font-size: 12px;
	font-weight: 700;
	left: 70%;
	pointer-events: none;
	position: absolute;
	top: -10px;
}

.desk-pet[data-pose='sleep'] .desk-pet-fx::before {
	animation: desk-pet-float 2.4s ease-in-out infinite;
	content: 'z';
	display: block;
}

.desk-pet[data-pose='happy'] .desk-pet-fx::before {
	animation: desk-pet-float 0.9s ease-out;
	color: #ff7a9a;
	content: '♥';
	display: block;
}

/* Poses */
.desk-pet[data-pose='idle'] .desk-pet-figure { animation: desk-pet-breathe 2.4s ease-in-out infinite; }
.desk-pet[data-pose='walk'] .desk-pet-figure,
.desk-pet[data-pose='climb'] .desk-pet-figure { animation: desk-pet-waddle 0.5s ease-in-out infinite; }
.desk-pet[data-pose='run'] .desk-pet-figure { animation: desk-pet-run 0.28s ease-in-out infinite; }
.desk-pet[data-pose='crouch'] .desk-pet-figure { transform: scale(1.15, 0.85); }
.desk-pet[data-pose='jump'] .desk-pet-figure { transform: scale(0.9, 1.12); }
.desk-pet[data-pose='land'] .desk-pet-figure { animation: desk-pet-land 0.16s ease-out; }
.desk-pet[data-pose='hang'] .desk-pet-figure { animation: desk-pet-sway 1.6s ease-in-out infinite; }
.desk-pet[data-pose='fly'] .desk-pet-figure { animation: desk-pet-bob 0.6s ease-in-out infinite; }
.desk-pet[data-pose='drag'] .desk-pet-figure { transform: scale(0.88, 1.18); }
.desk-pet[data-pose='happy'] .desk-pet-figure { animation: desk-pet-hop 0.45s ease-out 2; }
.desk-pet[data-pose='sleep'] .desk-pet-figure { transform: scale(1.06, 0.85); }
.desk-pet[data-pose='stretch'] .desk-pet-figure { animation: desk-pet-stretch 0.6s ease-in-out; }

.desk-pet:is([data-pose='walk'], [data-pose='run'], [data-pose='climb']) .desk-pet-foot-left { animation: desk-pet-step 0.5s ease-in-out infinite; }
.desk-pet:is([data-pose='walk'], [data-pose='run'], [data-pose='climb']) .desk-pet-foot-right { animation: desk-pet-step 0.5s ease-in-out 0.25s infinite; }
.desk-pet[data-pose='run'] .desk-pet-foot { animation-duration: 0.28s; }
.desk-pet:is([data-pose='fall'], [data-pose='drag']) .desk-pet-foot-left { animation: desk-pet-step 0.18s linear infinite; }
.desk-pet:is([data-pose='fall'], [data-pose='drag']) .desk-pet-foot-right { animation: desk-pet-step 0.18s linear 0.09s infinite; }

.desk-pet:is([data-pose='fly'], [data-pose='jump']) .desk-pet-wing { transform: scale(1); }
.desk-pet[data-pose='fly'] .desk-pet-wing-left { animation: desk-pet-flap-left 0.18s ease-in-out infinite; }
.desk-pet[data-pose='fly'] .desk-pet-wing-right { animation: desk-pet-flap-right 0.18s ease-in-out infinite; }

.desk-pet-foot {
	transform-box: fill-box;
	transform-origin: center;
}

.desk-pet-bubble {
	background: var(--ambient-glass-strong, rgba(248, 252, 255, 0.86));
	border: 1px solid var(--ambient-line, rgba(255, 255, 255, 0.64));
	border-radius: 12px;
	box-shadow: 0 8px 22px rgba(54, 91, 125, 0.18);
	color: var(--ambient-ink, #13233a);
	font-size: 12px;
	left: 0;
	line-height: 1.4;
	opacity: 0;
	padding: 5px 10px;
	pointer-events: none;
	position: absolute;
	top: 0;
	transition: opacity 200ms ease;
	white-space: nowrap;
}

.desk-pet-bubble[data-visible='true'] {
	opacity: 1;
}

@keyframes desk-pet-blink {
	0%, 94%, 100% { transform: translate(var(--pet-look-x, 0), var(--pet-look-y, 0)) scaleY(1); }
	96% { transform: translate(var(--pet-look-x, 0), var(--pet-look-y, 0)) scaleY(0.1); }
}

@keyframes desk-pet-breathe {
	0%, 100% { transform: scaleY(1); }
	50% { transform: scale(1.01, 1.03); }
}

@keyframes desk-pet-waddle {
	0%, 100% { transform: rotate(-4deg); }
	50% { transform: rotate(4deg) translateY(-1px); }
}

@keyframes desk-pet-run {
	0%, 100% { transform: rotate(6deg); }
	50% { transform: rotate(10deg) translateY(-2px); }
}

@keyframes desk-pet-step {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-1.8px); }
}

@keyframes desk-pet-land {
	0% { transform: scale(1.18, 0.8); }
	100% { transform: scale(1); }
}

@keyframes desk-pet-sway {
	0%, 100% { transform: rotate(-6deg); }
	50% { transform: rotate(6deg); }
}

@keyframes desk-pet-bob {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-2px); }
}

@keyframes desk-pet-hop {
	0%, 100% { transform: translateY(0) scale(1); }
	20% { transform: translateY(0) scale(1.12, 0.88); }
	55% { transform: translateY(-10px) scale(0.92, 1.1); }
}

@keyframes desk-pet-stretch {
	0%, 100% { transform: scale(1); }
	45% { transform: scale(0.9, 1.18); }
}

@keyframes desk-pet-flap-left {
	0%, 100% { transform: rotate(0deg); }
	50% { transform: rotate(-28deg); }
}

@keyframes desk-pet-flap-right {
	0%, 100% { transform: rotate(0deg); }
	50% { transform: rotate(28deg); }
}

@keyframes desk-pet-float {
	0% { opacity: 0; transform: translateY(4px); }
	30% { opacity: 1; }
	100% { opacity: 0; transform: translateY(-10px); }
}

@media (prefers-reduced-motion: reduce) {
	.desk-pet .desk-pet-figure,
	.desk-pet .desk-pet-foot,
	.desk-pet .desk-pet-wing,
	.desk-pet .desk-pet-fx::before {
		animation: none !important;
	}
}
```

- [ ] **Step 4: 在 `globals.css` 中引入样式**：在第 6 行 `@import './ambient-workbench.css';` 之后加一行 `@import './desk-pet.css';`。

- [ ] **Step 5: 类型检查**

Run: `cd apps/nodesk && npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add apps/nodesk/src/app/\(home\)/desk-pet apps/nodesk/src/styles/desk-pet.css apps/nodesk/src/styles/globals.css
git -c user.name=noaul -c user.email=aosinap@gmail.com commit -m "feat(nodesk): desk pet sprite, styles and animation loop"
```

---

### Task 3: 接入工作台和设置中心

**Files:**
- Modify: `apps/nodesk/src/app/(home)/ambient-workbench.tsx`
- Modify: `apps/nodesk/src/app/(home)/ambient-settings-center.tsx`

**Interfaces:**
- Consumes：Task 2 的 `DeskPet` props。
- Produces：`AmbientSettingsCenter` 新增 props `petVisible: boolean` 和 `onPetVisibleChange: (visible: boolean) => void`。

- [ ] **Step 1: 修改 workbench**
  - import：`import { DeskPet } from './desk-pet/desk-pet'`。
  - 常量：在 `DIM_STORAGE_KEY` 下面加 `const PET_STORAGE_KEY = 'nodesk.ambient.pet.v1'`。
  - state：加 `const [petVisible, setPetVisible] = useState(true)` 和 `const workbenchRef = useRef<HTMLElement>(null)`。
  - 在读取 dim 的 effect（`setDimmed(localStorage.getItem(DIM_STORAGE_KEY) === 'true')`）里加一行 `setPetVisible(localStorage.getItem(PET_STORAGE_KEY) !== 'false')`。
  - 函数：

```tsx
	const changePetVisible = (visible: boolean) => {
		localStorage.setItem(PET_STORAGE_KEY, String(visible))
		setPetVisible(visible)
	}
```

  - 根 `<section className='ambient-workbench'` 加上 `ref={workbenchRef}`。
  - 地形标记：
    - 搜索按钮 `ambient-command-trigger` 加 `data-pet-terrain='search'`
    - `<time className='ambient-time'` 加 `data-pet-terrain='clock'`
    - 两处 `className='ambient-now ...'`（专注按钮和「接下来」section）都加 `data-pet-terrain='upcoming'`
    - `motion.section className='ambient-panel ...'` 加 `data-pet-terrain='panel'`
    - `<aside className={`ambient-notification-rail ...`}` 加 `data-pet-terrain='notifications'`
    - `<nav className='ambient-app-dock ...'` 加 `data-pet-terrain='appdock'`
    - `<nav className='ambient-dock'` 加 `data-pet-terrain='dock'`
  - 在 `<AmbientSettingsCenter` 之前渲染：

```tsx
			{privateWorkbenchVisible && petVisible && <DeskPet
				rootRef={workbenchRef}
				sleepy={idleDepth !== 'awake' || dimmed}
				panelKey={activePanel}
				notificationUnreadCount={notificationUnreadCount}
				upcomingTitle={upcomingItems[0]?.title ?? null}
				focusRunning={focusRunning}
				hour={shanghaiClock.hourNumber}
				reducedMotion={Boolean(reducedMotion)}
				hidden={settingsOpen || searchOpen}
			/>}
```

  - 给 `<AmbientSettingsCenter` 传入 `petVisible={petVisible}` 和 `onPetVisibleChange={changePetVisible}`。

- [ ] **Step 2: 修改设置中心**
  - 在 `Props` 中加 `petVisible: boolean` 和 `onPetVisibleChange: (visible: boolean) => void`，并在组件参数中解构。
  - 在桌面 tab 的快捷应用 section 之后（`</section>}` 之后、`{tab === 'notifications' &&` 之前）加：

```tsx
				{tab === 'desktop' && <section className='ambient-settings-section'>
					<div className='ambient-settings-section-copy'><h3>桌面宠物</h3><p>小团子 Nono 会在桌面组件上走动、跳跃和飞行。</p></div>
					<label className='ambient-settings-toggle'>
						<span><strong>显示桌面宠物</strong><small>只对当前浏览器生效。</small></span>
						<input type='checkbox' checked={petVisible} onChange={event => onPetVisibleChange(event.target.checked)} />
						<i aria-hidden='true' />
					</label>
				</section>}
```

- [ ] **Step 3: 运行全部测试和类型检查**

Run: `cd apps/nodesk && npm test && npm run typecheck`
Expected: 全部通过，包括 `desk-pet.test.mts` 的契约测试。

- [ ] **Step 4: 构建**

Run: `cd apps/nodesk && node node_modules/next/dist/bin/next build`
Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add apps/nodesk/src/app/\(home\)/ambient-workbench.tsx apps/nodesk/src/app/\(home\)/ambient-settings-center.tsx
git -c user.name=noaul -c user.email=aosinap@gmail.com commit -m "feat(nodesk): put the desk pet on the ambient workbench"
```

---

### Task 4: 浏览器实测

**Files:** 不改代码。只在这一步发现问题时，才修改 Task 1–3 的文件。

- [ ] **Step 1: 启动本地服务**：按 [[nono-verification-environment]] 的流程，起临时 PG15、NoNo、`next build`/`next start`（`NEXT_PUBLIC_BASE_PATH=/nodesk`）和 :38000 网关，然后以管理员登录。
- [ ] **Step 2: Playwright 检查**，分别在 1440×900 和 393×851 两种视口下进行：
  1. 截图，确认 `.desk-pet[data-ready='true']` 可见，并且站在某个 `[data-pet-terrain]` 元素的顶边上。
  2. 点击 dock 的「任务」，等待 4 秒，确认宠物底边与 `.ambient-panel` 的顶边相差不超过 2px。
  3. 用 `page.mouse` 拖动宠物向右上甩出，等待 3 秒，确认 `data-pose` 回到 `idle`/`walk`/`land` 之一，且宠物底边落在某个平台的顶边上。
  4. 点击顶栏的「柔和画面」按钮，等待 6 秒，确认 `data-pose='sleep'`。
  5. 打开设置中心，关闭「显示桌面宠物」，确认 `.desk-pet` 不再存在。
- [ ] **Step 3: 把截图发给用户确认外观。**如果此前做过修复，用 `fix(nodesk): ...` 提交。
