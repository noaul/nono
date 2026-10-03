# NoDesk 桌面宠物物理与外观 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给两只宠物加上互相碰撞、甩晕、躲在组件后面探头、拉弓弹射后到处反弹这几种行为，并精修两只的外观。

**Architecture:**
- 模型新增组件矩形 `blocks`、`tumble` 翻滚物理、`peek` 探头 surface、`dizzyFor` 晕眩计时、`tension` 拉弓张力、`resolveCollisions` 碰撞处理和 `feedShake` 甩动检测，全部是纯函数，可以测试。
- 组件负责每帧在社交逻辑之后调用碰撞处理，把张力、晕眩和裁剪写到元素上。
- CSS 负责新增的表情、星星、阴影、拉伸效果和各种细节动画。

**Tech Stack:** 同前两份计划。

**Spec:** [物理与外观设计](../specs/2026-10-03-nodesk-desk-pet-physics-design.md)

## Global Constraints

- 数值以设计文档为准，下面列出主要的：
  - 碰撞判定系数 0.8，上下错开超过 55% 时交给头顶平台处理；碰撞恢复系数 0.6，碰撞让对方翻滚的相对速度阈值 900。
  - 撞晕阈值 1100，晕眩 3 秒，碰撞造成的晕眩 2.5 秒；甩动判定为 900 px/s、1.2 秒内 4 次换向。
  - 弹射：张力至少 30px 才发射，力度为张力的 14 倍，张力上限 240px，速度上限 2600；直接扔出去超过 1800 也会翻滚。
  - 翻滚：重力 0.85 倍，恢复系数 0.72，速度低于 220 且持续超过 0.5 秒后结束。
  - 探头：侧边露出 38%，顶边露出 60%，鼠标 120px 内会躲。
  - 尺寸：Nono 48×42 / 36×32，Momo 50×44 / 38×34。
- 不引入新依赖。验证和提交方式同前，这次也不单独推送。

## File Structure

- Modify `desk-pet-model.ts`：加入上面列的所有模型能力。
- Modify `desk-pet-social.ts`：不需要改。`isFree` 只认 idle、walk、run，所以 dizzy、ouch、peek 状态的宠物自然不会被社交逻辑选中。
- Rewrite `desk-pet-sprite.tsx`、`desk-pet.tsx`、`apps/nodesk/src/styles/desk-pet.css`。
- Tests：
  - `apps/nodesk/tests/desk-pet.test.mts`：新增用例，并更新 `world()`、`awake` 和抛掷相关的断言。
  - `apps/nodesk/tests/desk-pet-social.test.mts`：测试用的 terrain 和 input 补上新增字段。

---

### Task 1: 模型（碰撞、晕眩、翻滚、拉弓、探头）

- [ ] **Step 1: 更新与新增测试**
  - `world()` 返回值加 `blocks: []`；`awake` 加 `pointer: null`。
  - 「bounces off the viewport edge and caps throw speed」最后一行改为：
    `const thrown = releaseDrag(startDrag(pet), 5000, 0); assert.equal(thrown.pose, 'tumble'); assert.equal(thrown.vx, 2600)`。
  - 社交测试的 `terrain` 加 `blocks: []`，`petInput` 加 `pointer: null`。
  - 在 `desk-pet.test.mts` 文件末尾的契约测试之前，插入下面这些用例；import 补上 `createShake`、`feedShake`、`dragTo`、`launchTumble`、`makeDizzy`、`peekClip`、`resolveCollisions`、`startPeek`、`type Block`。

```ts
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

test('Momo only peeks behind components it can leap to', () => {
	const near: Block = { id: 'near', left: 600, top: 650, right: 800, bottom: 760 }
	const far: Block = { id: 'far', left: 600, top: 60, right: 800, bottom: 160 }
	const momo = placeOn(blockWorld([near]), FLOOR_ID, 400, MOMO)

	const leap = startPeek(momo, blockWorld([near]), constant(0))!
	assert.equal(leap.pose, 'jump')
	assert.equal(startPeek(momo, blockWorld([far]), constant(0.99)), null)
})
```

- [ ] **Step 2: 运行测试确认失败**：缺少新的导出。

- [ ] **Step 3: 模型改动**（按顺序）
  1. **类型**：
     - 新增 `PeekSide = Side | 'top'`、`Block = { id, left, top, right, bottom }`、`Point = { x, y }`、`Peek = { offset, tuck, until, wait }`。
     - `Terrain` 加 `blocks: Block[]`。
     - `Pose` 加 `'tumble' | 'ouch' | 'peek' | 'dizzy'`。
     - `Surface` 加 `{ kind: 'peek'; id: string; side: PeekSide }`。
     - `Flight` 加 `arc: number`。
     - `PetState` 加 `dizzyFor`、`spin`、`tension: Point | null`、`peek: Peek | null`。
     - `PetInput` 加 `pointer: Point | null`。
  2. **物种尺寸**：Nono 改为 48×42 / 36×32，Momo 改为 50×44 / 38×34。
  3. **`extractTerrain`**：可见的组件都 push 一个 block。
  4. **`createPet`**：新字段的初始值为 `dizzyFor: 0, spin: 0, tension: null, peek: null`。`standOn` 和 `fallFrom` 都清掉 `peek`。
  5. **`flyTo(s, x, y, surface, pose = 'fly', arc = FLIGHT_ARC)`**：把 `arc` 写进 flight，`stepFlight` 里用 `flight.arc`。
  6. **`step`**：
     - 每帧 `dizzyFor` 递减到 0 为止。
     - 在空中且姿态是 `tumble` 时走 `stepTumble`。
     - surface 是 `peek` 时走 `stepPeek`。
     - `reattach` 遇到 peek surface 时，block 不存在就让宠物掉下来。
     - `restInPlace` 把 `spin` 置 0。
  7. **`stepPlatform`**：
     - 开头加：仍在晕眩，且姿态是 idle、walk、run 或 happy 时，切换到 `dizzy`。
     - 新增 `case 'dizzy'`：还在晕就保持，晕完回到 `idle`。
     - 新增 `case 'ouch'`：0.35 秒后回到 `idle`。
  8. **`finishFlight`**：新增 peek 分支，把宠物放到探头位置，设置 `pose: 'peek'`，朝向与探头的边一致。
  9. **`decide`**：在「飞去远处」分支之后加一个探头分支，阈值是 `roll < 0.93 + climbWeight` 时调用 `startPeek(...)`，返回 null 时退回到 `startWalk`。
  10. **`dragTo` 和 `releaseDrag`**：按设计文档实现张力、发射和用力扔出时的翻滚；删除 `MAX_THROW_SPEED`。
  11. **新增导出函数**：
      - `launchTumble`、`makeDizzy`
      - `createShake`、`feedShake`
      - `resolveCollisions`
      - `startPeek`、`peekClip`
  12. **新增内部函数**：`stepTumble`、`stepPeek`、`placePeek`、`leavePeek`、`shove`、`knock`。

  这些函数的完整代码会写进实现提交里，行为以 Step 1 的测试为准，所有数值都取自 Global Constraints。

- [ ] **Step 4: 运行两份测试**：全部通过。
- [ ] **Step 5: 提交** `feat(nodesk): pet collisions, dizziness, slingshot and peeking`

### Task 2: 外观与渲染

- [ ] **Step 1: 重写 `desk-pet-sprite.tsx`**：
  - 两只都用径向渐变的身体、加反光、更大的眼睛（两个高光点）。
  - 每只都有六套眼睛：普通、开心、睡觉、惊讶、蚊香、吃痛。
  - 共用部件：星星、特效和阴影。
  - Nono 加叶芽和小短手。
  - Momo 加两颊蓬毛、白色嘴部、项圈和铃铛、带条纹和白尖的尾巴、肉垫，以及探头时露出的爪子。
- [ ] **Step 2: 重写 `desk-pet.tsx`**：
  - 每帧在社交逻辑之后调用 `resolveCollisions`。
  - `paint` 负责写入：翻滚的旋转、探头时的 `clip-path`、`data-dizzy`、`data-tense` 以及 `--pet-tension` 和 `--pet-tension-angle`。
  - 拖拽时用 `dragTo` 并传入屏幕尺寸，同时把轨迹喂给 `feedShake`，甩够了就 `makeDizzy`。
  - 鼠标位置作为 `input.pointer` 传给模型。
  - 说话：
    - 刚晕时说一句。
    - 碰撞时说「哎哟」，每只 5 秒内最多一次。
    - 弹射时说「咻——！」。
- [ ] **Step 3: 重写 `desk-pet.css`**：
  - 新增 pose 动画：dizzy 摇晃、ouch 挤扁、tumble 开心飞（Nono 扇翅膀，Momo 张开四肢）、peek。
  - 蚊香眼的优先级最高。
  - 星星绕头转圈。
  - 脚下的阴影在空中等状态隐藏。
  - 拉弓时身体沿张力方向拉长。
  - 叶芽摆动、铃铛摇晃。
  - Momo 的新部件配色。
  - reduced motion 时关闭所有新增动画。
- [ ] **Step 4:** 运行 `npm test`、typecheck 和 build，全部通过后提交 `feat(nodesk): polished pet looks and the new reactions`。

### Task 3: 浏览器实测

- [ ] 用 Playwright 模拟登录后检查：
  - 快速来回拖动宠物，`data-dizzy` 变为 `true`。
  - 把宠物拖到屏幕外 120px 再松手，`data-pose` 变为 `tumble`，最后能落到平台上。
  - 两只宠物的矩形重叠不超过阈值。
  - 用 page.evaluate 无法直接控制宠物进入探头，所以等待自然发生，或者用较长时间观察 `data-pose='peek'` 和 clip-path 的值。
  - 在 4 倍缩放下给新外观和各种表情截图。
- [ ] 发现问题就修复，并以 `fix(nodesk): ...` 提交。
