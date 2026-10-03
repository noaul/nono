# NoDesk 桌面宠物「Nono」设计

状态：设计已确认（方案 A），待写实现计划。日期：2026-10-03。

## 目标

在 NoDesk 首页环境桌面（`apps/blog/src/app/(home)/ambient-workbench.tsx`）加一只小团子精灵。它把桌面上的组件当作地形：在顶边上走、跑、跳，沿侧边爬，挂在底边，在组件之间飞；可以被鼠标拖拽和抛出；会跟随桌面状态睡觉、跑到打开的面板上、对新通知做出反应，偶尔冒说话气泡。

不做：多只宠物、换装或换皮肤、服务端存储宠物状态、在 NoDesk 以外的页面出现、Live2D。

## 方案

采用方案 A：读取组件 DOM 矩形生成地形，自写轻量物理和行为状态机，SVG 角色，不引入新依赖。

不选的方案：Canvas + matter.js 体积更大，矢量画质和配色都更难做；只用 motion 预设路径无法适应布局变化，宠物站不到真实的组件上。

## 形象

小团子「Nono」，全部由内联 SVG 绘制，部件拆分以便单独做动画：

- **身体**：略扁的圆角软糖形（约 44×38，手机端缩放到 34px 宽）。主色是薄荷绿渐变（顶 `#a8e6d4` → 底 `#6cc4b0`），头顶有椭圆高光，描边为半透明深绿。
- **腮红**：两团 `#ffb3b3`，透明度 0.7。
- **眼睛**：两颗黑豆眼，瞳孔跟随指针最多偏移 2px，每 3–7 秒随机眨眼。表情眼型有 `normal`、`happy`（^ ^）、`sleep`（︶ ︶）、`surprised`（○ ○）四种。
- **翅膀**：身后两片半透明白色叶片翅膀。平时收拢、几乎看不见；飞行、缓降和被抛出时展开扑扇。
- **脚**：两只小椭圆脚，走路时交替抬起。

颜色写成 CSS 变量 `--pet-body-top`、`--pet-body-bottom`、`--pet-blush`、`--pet-ink`。工作台为调暗模式（`data-dimmed='true'`）时，主色降低亮度和饱和度。工作台目前没有主题色系统，因此「跟随主题」落实为适配调暗模式。

挤压和拉伸统一用整体 `scale(x, y)` 实现：起跳前压扁 (1.15, 0.85)，腾空拉长 (0.9, 1.12)，落地压扁后回弹。

## 动作（姿态）

`pose` 决定 SVG 部件动画，由 CSS 根据 `data-pose` 驱动：

| pose | 表现 |
|---|---|
| `idle` | 呼吸起伏（scaleY 1↔1.03，2.4s），偶尔左右张望 |
| `walk` / `run` | 脚交替，身体左右轻晃；`run` 时身体前倾 8°、频率加倍 |
| `crouch` | 起跳前 120ms 压扁 |
| `jump` | 腾空拉长，翅膀微张 |
| `land` | 落地压扁 160ms 后回到 idle |
| `climb` | 身体旋转 90° 贴墙，脚交替 |
| `hang` | 倒挂在底边，轻摆 |
| `fly` | 翅膀快速扑扇，身体上下浮动 |
| `fall` | 惊讶眼，脚乱蹬；超过 0.4s 自动展开翅膀缓降 |
| `drag` | 身体被拉长，脚乱蹬 |
| `happy` | 原地小跳两下，happy 眼，飘出爱心或音符 |
| `sleep` | 趴下（scaleY 0.85），sleep 眼，飘 `z` |
| `stretch` | 醒来时先伸懒腰（拉长 600ms），再回到 idle |

朝向用 `data-facing='left'|'right'`，通过水平镜像实现。

## 地形

- 工作台中可站立的组件加上 `data-pet-terrain` 标记，包括：顶栏、时钟块（`.ambient-clock-stack`）、「接下来」列表、浮动面板、通知栏、应用 dock、工具 dock。另外视口底边作为地面，视口左右边作为墙。
- `extractTerrain(rects, viewport)` 是纯函数，输入矩形列表，输出：
  - `platforms`：每个组件的顶边，单向平台，只在从上往下落时产生碰撞。
  - `walls`：高度不小于 40px 的组件左右侧边。
  - `ceilings`：宽度不小于 60px 的组件底边。
- 以下组件不计入地形：尺寸为 0、`visibility: hidden`、计算后 opacity < 0.5 的组件。空闲时被淡化的 `.ambient-wakeable` 会因此自动消失，而时钟块不会被淡化，始终可以站。
- 地形刷新时机：`ResizeObserver`、窗口 resize、`activePanel` 变化后延迟 300ms（等面板入场动画结束），以及每 2 秒兜底一次。刷新后，如果宠物原来站的平台已经不存在，切换为 `fall`。

## 运动与行为

`desk-pet-model.ts` 是纯逻辑模块，可以单测。它维护宠物状态：位置（脚底中心）、速度、所处表面（`platform | wall | ceiling | air`）、`pose`、`facing` 和当前目标。对外提供 `step(state, dt, terrain, input, rng)`。

- **物理**：重力 1800 px/s²；走 40 px/s，跑 110 px/s，爬 30 px/s；被抛出时初速度上限 2200 px/s；撞到视口边以 0.4 的系数反弹；空中只和平台顶边碰撞。
- **跳跃与飞行的选择**：目标平台水平距离 ≤ 260px 且需要上升的高度 ≤ 160px 时用跳跃，并按抛物线解出初速度；否则用飞行，沿缓动曲线移动约 0.8–1.6s，翅膀扑扇，结束时落到目标平台上。
- **自主行为**：处于 idle 时，每 2–6 秒按权重随机选择下一步（`rng` 可注入，便于单测）：
  - 闲逛走动 35%
  - 原地张望 25%
  - 跳到附近平台 15%
  - 走到边缘去爬墙 10%
  - 飞到远处平台 10%
  - 说话 5%
- **走到平台边缘时**：随机选择掉头、跳下，或在有墙时沿侧边爬下。
- **爬墙**：沿侧边向上爬，爬到顶后翻上顶边；向下爬到底角时，如果有底边，就进入 `hang`，挂 2–5 秒后松手进入 `fall`。

## 互动

- **拖拽**：宠物本体设置 `pointer-events: auto` 和 `touch-action: none`，用 `setPointerCapture` 跟随指针，同时记录最近 100ms 的速度。松手后按该速度抛出，进入 `fall`/`fly` 物理，落地时做挤压回弹。
- **点击**：位移小于 5px 且时长小于 250ms 视为点击，触发 `happy`。
- **注视**：指针距离宠物 400px 以内时，瞳孔朝指针偏移。
- **与工作台状态的联动**：`AmbientWorkbench` 通过 props 传入 `idleDepth`、`dimmed`、`activePanel`、`notificationUnreadCount`、`upcomingItems`、`focusRunning`。
  - `idleDepth !== 'awake'` 或 `dimmed` 时：宠物前往时钟块顶部，到达后进入 `sleep`。
  - 回到 `awake` 且不再调暗时：先 `stretch`，再恢复自主行为。
  - `activePanel` 由空变为有值时：把目标设为面板顶边，沿途用跑、跳或飞前往。
  - 面板关闭时：所站平台消失，宠物进入 `fall`，缓降后继续自主行为。
  - `notificationUnreadCount` 增加时：触发 `happy`，并说「有新通知啦」。
- **打开设置中心或搜索框时**：宠物隐藏并暂停，避免盖住对话框。

## 说话气泡

- 气泡显示在宠物头顶，持续 4 秒，单行不超过 18 个字，超出用省略号截断。宠物靠近视口边缘时，气泡向内侧偏移。
- 触发时机：
  - 页面加载 3 秒后，说一句按时段生成的问候。
  - 自主行为抽到「说话」时，随机说一句；两次随机说话至少间隔 3 分钟。
  - 有即将到来的事项时，说「等下有：{第一项标题}」。
  - 连续停留满 60 分钟后，说「看了一小时屏幕啦，起来走走吧」，每小时最多一次。
  - 新通知到来时，说「有新通知啦」。
- `focusRunning` 期间不随机说话，避免打扰专注。
- 文案池放在 `desk-pet-model.ts` 的 `pickSpeech(context, rng)` 里，便于单测。

## 显示开关与可见范围

- 设置中心「桌面」页新增一个「显示桌面宠物」开关，复用 `ambient-settings-toggle` 样式。值存在 localStorage 的 `nodesk.ambient.pet.v1` 中，默认开启，只对当前设备生效，不改服务端。
- 和 dock、面板一样，宠物只在 `privateWorkbenchVisible`（已登录）时渲染，未登录的访客看不到。

## 无障碍、性能与移动端

- **减少动态效果**（`useReducedMotion`）：宠物固定站在时钟块顶部，只保留眨眼和说话，不移动、不跳、不飞。
- 宠物外层设置 `aria-hidden='true'`，不进入 Tab 顺序。说话内容只是装饰，不进入读屏。
- **性能**：
  - 每帧只通过 ref 更新外层的 `transform` 和 `data-pose`/`data-facing` 属性，不触发 React 重渲染。只有说话文本放在 React state 里。
  - `document.hidden` 时暂停 rAF；`dt` 上限 50ms，防止切回标签页时宠物瞬移。
- **手机端（≤720px）**：缩小到 34px；爬墙权重减半；拖拽通过 pointer 事件同样支持触摸。
- **层级**：z-index 28，高于面板和 dock，低于搜索遮罩（80）和设置对话框。

## 文件

- `apps/blog/src/app/(home)/desk-pet/desk-pet-model.ts`：地形提取、物理 `step`、行为决策、`pickSpeech`。纯函数，无 DOM 依赖。
- `apps/blog/src/app/(home)/desk-pet/desk-pet-sprite.tsx`：SVG 角色（部件和表情）。
- `apps/blog/src/app/(home)/desk-pet/desk-pet.tsx`：客户端组件，负责 rAF 循环、读取地形、指针拖拽、气泡和状态联动。
- `apps/blog/src/styles/desk-pet.css`：部件动画、pose 和颜色变量。在 `globals.css` 中引入。
- 修改 `ambient-workbench.tsx`：给地形组件加 `data-pet-terrain`，渲染 `<DeskPet>`，读写宠物开关。
- 修改 `ambient-settings-center.tsx`：新增开关 props 和对应 UI。

## 测试

- `apps/blog/tests/desk-pet.test.mts`（`node --test`，注入种子随机数）覆盖：
  - 地形提取：过滤小尺寸和隐藏的组件；平台、墙、底边的划分正确。
  - 物理：从高处下落会落到下方平台的顶边；从下方向上穿过平台不会被挡住；被抛出撞墙会反弹。
  - 跳跃或飞行的选择阈值。
  - 平台消失后进入 `fall`。
  - 联动：idle/dimmed 时前往时钟块并进入 sleep；`activePanel` 打开后目标变为面板顶边；通知数增加时触发 happy。
  - reduced motion 下宠物不移动。
  - `pickSpeech`：专注期间不随机说话；文案长度不超过上限；即将到来事项的文案正确。
- 源码契约测试：`ambient-settings-center.tsx` 包含宠物开关；`ambient-workbench.tsx` 至少标记了时钟块、面板和 dock 三个地形组件。
- 在 `apps/blog` 中运行 `npm test`、`npm run typecheck`，再 `next build`。
- 本地起服务，用 Playwright 在 1440×900 和 393×851 两种尺寸下截图，并做一次拖拽检查：宠物可见，打开面板后会跑到面板上，拖拽抛出后能落回平台。
