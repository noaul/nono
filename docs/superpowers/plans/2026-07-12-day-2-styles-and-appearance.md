# Day 2: Styles, Shared Tokens, And Appearance Controls

> **For agentic workers:** REQUIRED SUB-SKILL: Use `dispatching-parallel-agents` for independent test reconnaissance, then use `test-driven-development` and `verification-before-completion` while implementing each task.

**Goal:** 在一个集中开发日内拆分 Nono 的 59.6KB 全局样式表，建立 Vue 导航、Vue 后台与内置 Blog 共用的视觉 token，并让公开弹窗、文件夹标签栏和后台表面的圆角、透明度、高斯模糊可以在站点配置页即时预览、保存和安全恢复。

**Architecture:** `packages/web/src/main.ts` 只加载共享 token 与基础样式；公开导航和后台布局分别在 `NavigationPage.vue`、`AdminLayout.vue` 加载自己的样式边界，以便 Vite 分离后台 CSS。外观值继续保存在 `Site.settings.appearance`，客户端负责类型化预览，Fastify 使用 Zod 归一化输入并保留无关设置键。Blog 不复用 Vue 组件样式，只通过同名 `--nono-*` CSS 变量映射已有主题色，保持一个镜像内两套前端的视觉语言一致。

**Tech Stack:** Vue 3、Vite 7、Vitest 4、Fastify 5、Zod 4、Prisma 6、Next.js 16、React 19、Tailwind CSS 4、Playwright、Docker Compose。

---

## Day 2 Scope

今天完成：

- 将 `packages/web/src/styles.css` 拆成 token、基础、公开页、后台四个边界。
- Vue 与 Blog 建立同名核心视觉 token。
- 保持拆分前后的界面视觉和功能一致。
- 将现有卡片、搜索框外观配置扩展到公开弹窗、文件夹标签栏和后台表面。
- 为站点设置接口增加服务端归一化，防止绕过前端写入异常模糊和透明度值。
- 在本地与 RN 的 `8188` 部署上复测 200 条书签拖动。

今天不做：

- 不抽离公开页弹窗组件，不实现焦点圈定。
- 不实现 sticky tabs 的 Scrollspy。
- 不增加搜索引擎选择、搜索 debounce 或搜索缓存。
- 不实现 favicon 代理。
- 不改文件夹卡片高度和内容布局。
- 不重构后台导航信息架构。

## Starting Baseline

- 开始提交：`fd6f81283795d4aa25fc2520280b879e1b4b4621`
- RN 验收地址：`http://192.129.159.194:8188`
- 当前全局样式：`packages/web/src/styles.css`，59,644 bytes。
- 当前外观参数：文件夹卡片和搜索框，共 6 个数值。
- Day 1 实测 200 条书签：
  - 首行位移：188.2ms
  - DOM 稳定：77.9ms
  - 保存完成：1596ms
  - 拖动期间 0 个请求，保存时 1 个请求
- Day 2 性能债务：样式拆分后重新测量首行位移，目标低于 150ms；若仍高于 150ms，只做有性能剖析证据支持的局部修复，不扩大到虚拟列表重写。

## Appearance Contract

保留现有 6 个字段：

```ts
cardRadius: number;
cardOpacity: number;
cardBlur: number;
searchRadius: number;
searchOpacity: number;
searchBlur: number;
```

新增 9 个字段：

```ts
modalRadius: number;
modalOpacity: number;
modalBlur: number;
tabRadius: number;
tabOpacity: number;
tabBlur: number;
adminRadius: number;
adminOpacity: number;
adminBlur: number;
```

新增运行时变量：

```css
--public-modal-radius
--public-modal-opacity
--public-modal-blur
--public-tab-radius
--public-tab-opacity
--public-tab-blur
--admin-surface-radius
--admin-surface-opacity
--admin-surface-blur
```

Vue 与 Blog 必须共同定义：

```css
--nono-accent
--nono-radius-sm
--nono-radius-md
--nono-radius-lg
--nono-surface-opacity
--nono-surface-blur
--nono-ease-standard
--nono-focus-ring
```

---

## 8-Hour Schedule

| Time | Work |
|---|---|
| 00:00-00:30 | 核对工作树、运行聚焦测试、记录构建产物 CSS 基线 |
| 00:30-01:15 | 编写样式边界与共享 token 的失败测试 |
| 01:15-03:15 | 拆分 Vue 样式并接入 Blog token，不主动改变视觉 |
| 03:15-03:45 | 单测、构建、桌面/移动截图对比，完成提交 1 |
| 03:45-04:30 | 编写外观归一化、API 保存和预览的失败测试 |
| 04:30-06:30 | 实现 9 个新增参数、服务端校验、完整实时预览 |
| 06:30-07:15 | 全量回归、200 条书签复测、必要的有界性能修复 |
| 07:15-07:40 | 完成提交 2 并推送 |
| 07:40-08:00 | RN 构建部署到 `8188`，健康检查与当日验收记录 |

---

### Task 1: Capture The Focused Day 2 Baseline

**Files:**
- Modify: `docs/quality/ui-performance-baseline.md`
- Read: `packages/web/dist/.vite/manifest.json`
- Read: `packages/web/src/styles.css`

- [ ] **Step 1: Confirm the worktree without touching user files**

Run:

```powershell
git status --short
git rev-parse HEAD
(Get-Item packages/web/src/styles.css).Length
```

Expected:

- HEAD is `fd6f81283795d4aa25fc2520280b879e1b4b4621`.
- `styles.css` is 59,644 bytes.
- Existing untracked `design-qa*`, `design-qa.md` and plan files remain untouched.

- [ ] **Step 2: Run the focused pre-change gates**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts test/appearance.test.ts test/site-config-view.test.ts test/sortable-list.test.ts
npm run test -w packages/server -- --run test/app.test.ts
npm run test:blog
npm run build:all
```

Expected: PASS with no source changes.

- [ ] **Step 3: Record the current CSS output**

Run:

```powershell
Get-ChildItem packages/web/dist/assets/*.css | Select-Object Name,Length
```

Add the filenames, byte sizes, current commit, and date to `docs/quality/ui-performance-baseline.md`. This is the comparison point for route-level CSS splitting.

---

### Task 2: Add Failing Style Boundary And Shared Token Contracts

**Files:**
- Modify: `packages/web/test/visual-contract.test.ts`
- Modify: `packages/web/test/sortable-list.test.ts`
- Modify: `apps/blog/tests/quality-gates.test.mts`

- [ ] **Step 1: Make web visual tests read the new style boundaries**

Add a helper in `visual-contract.test.ts` that reads:

```ts
const readStyle = (name: string) =>
  fs.readFileSync(path.resolve(process.cwd(), `src/styles/${name}.css`), 'utf8');
```

Add contracts requiring:

- `main.ts` imports `./styles/tokens.css` and `./styles/base.css`.
- `main.ts` no longer imports `./styles.css`.
- `NavigationPage.vue` imports `@/styles/public.css`.
- `AdminLayout.vue` imports `@/styles/admin.css`.
- `tokens.css` contains all eight `--nono-*` variables.
- `public.css` contains the public route shell, public feedback/empty states and public reduced-motion overrides.
- Component-specific modal and folder-tab rules remain in `NavigationPage.vue`.
- `admin.css` contains `.app-workbench`, `.admin-card`, sortable-row and admin feedback rules.
- No selectors beginning with `.app-workbench`, `.glass-workbench`, `.workbench-`, `.admin-` or `.sortable-` remain in `base.css` or `public.css`.

- [ ] **Step 2: Move the sortable CSS contract to `admin.css`**

Update `sortable-list.test.ts` to read `src/styles/admin.css`. Keep the existing requirements:

```ts
expect(css).toContain(".sortable-list[data-dragging='true'] .sortable-admin-row");
expect(css).toMatch(/sortable-row-dragging[\s\S]*?backdrop-filter:\s*none/);
expect(css).toMatch(/sortable-row-chosen[\s\S]*?contain:\s*paint/);
```

- [ ] **Step 3: Add the Blog token contract**

In `apps/blog/tests/quality-gates.test.mts`, assert:

- `src/styles/globals.css` imports `./nono-tokens.css` before `./theme.css`.
- `nono-tokens.css` defines the same eight `--nono-*` names.
- `nono-tokens.css` maps `--nono-accent` to the existing `--color-brand`.

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts test/sortable-list.test.ts
npm run test:blog
```

Expected: FAIL because the four Vue style files and Blog token file do not exist yet.

---

### Task 3: Split Vue Styles Without Visual Changes

**Files:**
- Create: `packages/web/src/styles/tokens.css`
- Create: `packages/web/src/styles/base.css`
- Create: `packages/web/src/styles/public.css`
- Create: `packages/web/src/styles/admin.css`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/src/components/AdminLayout.vue`
- Delete after parity: `packages/web/src/styles.css`

- [ ] **Step 1: Extract stable tokens**

Move root variables, color primitives, radii, focus rings, animation timing and typography constants into `tokens.css`. Preserve current computed values and add:

```css
:root {
  --nono-accent: #0f766e;
  --nono-radius-sm: 6px;
  --nono-radius-md: 8px;
  --nono-radius-lg: 12px;
  --nono-surface-opacity: 0.62;
  --nono-surface-blur: 10px;
  --nono-ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --nono-focus-ring: 0 0 0 3px rgb(15 118 110 / 18%);
}
```

- [ ] **Step 2: Extract application-wide foundations**

Move only these concerns to `base.css`:

- box sizing and document/body reset;
- shared typography;
- generic buttons, icon buttons, inputs, textarea and select foundations;
- focus-visible behavior;
- `.notice`, `.error` and screen-reader helpers that are not route-specific;
- global reduced-motion defaults.

Do not move admin shell, tables, public navigation layout, modals or sortable styles into `base.css`.

- [ ] **Step 3: Extract the public route boundary**

Move only existing global public-route selectors, loading and public empty-state rules from `styles.css` to `public.css`. Component-scoped modal, folder-tab, card and search rules already living in `NavigationPage.vue`, `FolderCard.vue` and `SearchBar.vue` remain scoped for Day 2.

Add at the top of `NavigationPage.vue`:

```ts
import '@/styles/public.css';
```

- [ ] **Step 4: Extract the admin route boundary**

Move these families to `admin.css`:

```text
.app-workbench
.glass-workbench
.figma-admin-shell
.workbench-*
.admin-*
.sortable-*
.bulk-*
.duplicate-*
.import-preview-*
.health-*
.token-*
.confirm-*
.toast-*
.loading-overlay
```

Add at the top of `AdminLayout.vue`:

```ts
import '@/styles/admin.css';
```

- [ ] **Step 5: Change global imports**

Replace the legacy import in `main.ts` with:

```ts
import './styles/tokens.css';
import './styles/base.css';
```

Delete `styles.css` only after every selector has an owner and the focused tests pass.

- [ ] **Step 6: Run GREEN tests**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts test/sortable-list.test.ts
npm run build -w packages/web
```

Expected: PASS. The build emits shared/base CSS plus a separately loadable admin CSS asset.

---

### Task 4: Add The Blog Token Adapter

**Files:**
- Create: `apps/blog/src/styles/nono-tokens.css`
- Modify: `apps/blog/src/styles/globals.css`
- Modify: `apps/blog/src/styles/theme.css`
- Modify: `apps/blog/tests/quality-gates.test.mts`

- [ ] **Step 1: Define the Blog side of the contract**

Create `nono-tokens.css` with the same eight names. Map values to Blog variables where appropriate:

```css
:root {
  --nono-accent: var(--color-brand, #35bfab);
  --nono-radius-sm: 8px;
  --nono-radius-md: 12px;
  --nono-radius-lg: 20px;
  --nono-surface-opacity: 0.4;
  --nono-surface-blur: 4px;
  --nono-ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --nono-focus-ring: 0 0 0 3px color-mix(in srgb, var(--nono-accent) 22%, transparent);
}
```

- [ ] **Step 2: Import tokens before theme rules**

The beginning of `globals.css` must be:

```css
@import 'tailwindcss';
@import 'katex/dist/katex.min.css';
@import './nono-tokens.css';
@import './theme.css';
@import './article.css';
```

- [ ] **Step 3: Map existing Blog utilities**

In `theme.css` and `globals.css`, replace only repeated cross-app values that clearly match the contract:

- brand focus rings use `--nono-focus-ring`;
- common small/medium radii use `--nono-radius-sm` or `--nono-radius-md`;
- common transition timing uses `--nono-ease-standard`.

Do not flatten Blog's 40px card identity into Nono's public folder card shape.

- [ ] **Step 4: Verify Blog**

Run:

```powershell
npm run test:blog
npm run typecheck:blog
npm run build:blog
```

Expected: PASS with no hydration or CSS parse errors.

- [ ] **Step 5: Compare desktop and mobile screenshots**

Capture:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'
npm run test:e2e -- tests/e2e/public-navigation.smoke.spec.ts tests/e2e/blog-portal.smoke.spec.ts
```

Expected: no missing styles, layout collapse or route-specific CSS flash.

- [ ] **Step 6: Commit style work**

Stage only files owned by Tasks 1-4:

```powershell
git add packages/web/src/styles packages/web/src/main.ts packages/web/src/views/NavigationPage.vue packages/web/src/components/AdminLayout.vue packages/web/test/visual-contract.test.ts packages/web/test/sortable-list.test.ts apps/blog/src/styles apps/blog/tests/quality-gates.test.mts docs/quality/ui-performance-baseline.md
git commit -m "refactor: split styles and share design tokens"
```

Do not stage `design-qa*`, `design-qa.md` or unrelated plan files.

---

### Task 5: Add Failing Appearance And API Normalization Tests

**Files:**
- Modify: `packages/web/test/appearance.test.ts`
- Modify: `packages/web/test/site-config-view.test.ts`
- Modify: `packages/web/test/navigation-page.test.ts`
- Modify: `packages/server/test/app.test.ts`
- Create: `packages/server/src/utils/site-settings.ts`

- [ ] **Step 1: Extend the client normalization contract**

Add all nine new fields to expected defaults and test:

- number values;
- numeric strings;
- values below and above limits;
- `NaN`, arrays and object values falling back to defaults;
- unknown sibling keys under `settings` are not altered.

Use these limits:

| Field group | Radius | Opacity | Blur |
|---|---:|---:|---:|
| Modal | 0-32px | 20-96% | 0-40px |
| Tabs | 0-28px | 12-96% | 0-32px |
| Admin | 0-20px | 40-100% | 0-24px |

- [ ] **Step 2: Extend the CSS variable contract**

Require `toAppearanceCssVars()` to emit all 15 variables with opacity represented as a two-decimal value.

- [ ] **Step 3: Extend the configuration view test**

Load a fixture containing all 15 fields, change at least one value in each group, submit, then assert:

- the preview style contains modal, tab and admin variables;
- the PUT body retains `settings.portal`;
- the PUT body retains an unrelated key such as `settings.analytics`;
- the PUT body contains all normalized appearance values.

- [ ] **Step 4: Add the API contract**

In `packages/server/test/app.test.ts`, add an authenticated PUT test that sends:

```ts
settings: {
  analytics: { enabled: true },
  appearance: {
    cardRadius: 999,
    modalOpacity: '38',
    tabBlur: -12,
    adminBlur: {},
  },
}
```

Expected response:

- `cardRadius` is clamped to 24;
- `modalOpacity` becomes 38;
- `tabBlur` becomes 0;
- `adminBlur` becomes its default;
- `analytics` survives unchanged.

Add a second assertion that an unsafe `portal.url` using `javascript:` returns 400.

- [ ] **Step 5: Run tests and verify RED**

Run:

```powershell
npm run test -w packages/web -- --run test/appearance.test.ts test/site-config-view.test.ts test/navigation-page.test.ts
npm run test -w packages/server -- --run test/app.test.ts
```

Expected: FAIL on missing fields, CSS variables and server normalization.

---

### Task 6: Implement Server-Safe Appearance Settings

**Files:**
- Create: `packages/server/src/utils/site-settings.ts`
- Modify: `packages/server/src/routes/admin/site.ts`
- Modify: `packages/server/src/services/repository.ts`
- Modify: `packages/server/src/services/prisma.repository.ts`
- Modify: `packages/server/test/app.test.ts`

- [ ] **Step 1: Define Zod schemas and defaults**

`site-settings.ts` exports:

```ts
export const appearanceDefaults;
export const appearanceSchema;
export const siteUpdateSchema;
export function normalizeSiteSettings(input: unknown): Record<string, unknown>;
```

Rules:

- coerce numeric strings;
- clamp each appearance value to its documented range;
- use defaults for invalid appearance members;
- preserve unknown top-level `settings` keys;
- allow portal URLs only with `http:` or `https:`;
- require `{query}` in `searchUrlTemplate`;
- limit site text and URL lengths to bounded values.

- [ ] **Step 2: Remove the untyped route body**

Replace:

```ts
request.body as any
```

with `siteUpdateSchema.parse(request.body)`. Pass the parsed and normalized value to the repository.

- [ ] **Step 3: Keep repository implementations persistence-only**

`MemoryRepository.updateSite()` and Prisma `updateSite()` receive already normalized data. Ensure both preserve `id` and `userId`, and that Prisma writes normalized JSON without changing the schema.

- [ ] **Step 4: Run server tests**

Run:

```powershell
npm run test -w packages/server -- --run test/app.test.ts
npm run build -w packages/server
```

Expected: PASS. Invalid protocol returns the unified 400 response and valid settings round-trip.

---

### Task 7: Expand The Admin Appearance Editor And Runtime Variables

**Files:**
- Modify: `packages/web/src/utils/appearance.ts`
- Modify: `packages/web/src/views/admin/SiteConfigView.vue`
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/src/components/AdminLayout.vue`
- Modify: `packages/web/src/styles/admin.css`
- Modify: `packages/web/test/appearance.test.ts`
- Modify: `packages/web/test/site-config-view.test.ts`
- Modify: `packages/web/test/navigation-page.test.ts`

- [ ] **Step 1: Extend the typed client contract**

Add the nine fields, defaults, limits and CSS variables to `appearance.ts`. Keep the client limits identical to `site-settings.ts`.

- [ ] **Step 2: Make presets complete**

Every preset must assign all 15 fields:

- `performance`: blur 0 for repeated/public surfaces and low admin blur;
- `balanced`: exact defaults;
- `clear`: higher blur with opacity high enough to preserve text contrast.

Add a reset icon button with tooltip and `aria-label="恢复默认外观"`.

- [ ] **Step 3: Add three grouped controls**

In `SiteConfigView.vue`, add fieldsets:

- `弹窗`
- `文件夹标签栏`
- `后台表面`

Each has radius, opacity and blur sliders with stable `data-testid` values:

```text
modal-radius, modal-opacity, modal-blur
tab-radius, tab-opacity, tab-blur
admin-radius, admin-opacity, admin-blur
```

- [ ] **Step 4: Make the preview representative**

The preview must show, in one bounded canvas:

- search input;
- folder tabs with one active tab;
- folder card;
- modal overlay and modal surface;
- a compact admin panel sample.

Use the real CSS variables. Do not put preview cards inside another card; the preview canvas is a framed tool, and each sample surface is a direct child.

- [ ] **Step 5: Apply variables to the actual UI**

Public:

- the scoped `.folder-tabs` rules in `NavigationPage.vue` use `--public-tab-*`;
- the scoped `.folder-expand-modal`, `.modal` and public confirmation surfaces in `NavigationPage.vue` use `--public-modal-*`;
- existing folder and search variables remain unchanged.

Admin:

- `AdminLayout.vue` reads the authenticated site's settings and applies `toAppearanceCssVars()` to `.app-workbench`;
- `.admin-card`, `.workbench-sidebar`, `.workbench-topbar`, dialogs and tool panels use `--admin-surface-*`;
- actively dragged rows continue to force `backdrop-filter: none`.

Fallback values must keep old database records usable.

- [ ] **Step 6: Run focused web tests**

Run:

```powershell
npm run test -w packages/web -- --run test/appearance.test.ts test/site-config-view.test.ts test/navigation-page.test.ts test/visual-contract.test.ts test/sortable-list.test.ts
npm run build -w packages/web
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit appearance work**

```powershell
git add packages/server/src/utils/site-settings.ts packages/server/src/routes/admin/site.ts packages/server/src/services/repository.ts packages/server/src/services/prisma.repository.ts packages/server/test/app.test.ts packages/web/src/utils/appearance.ts packages/web/src/views/admin/SiteConfigView.vue packages/web/src/views/NavigationPage.vue packages/web/src/components/AdminLayout.vue packages/web/src/styles/admin.css packages/web/test
git commit -m "feat: expand admin-controlled appearance settings"
```

---

### Task 8: Regression, Drag Re-Measurement, Push, And RN Deployment

**Files:**
- Modify: `docs/quality/ui-performance-baseline.md`
- Modify only if required: `.dockerignore`

- [ ] **Step 1: Run the complete local gates**

Run:

```powershell
npm test
npm run test:blog
npm run typecheck:blog
npm run build:all
```

Expected: all suites and builds pass.

- [ ] **Step 2: Verify CSS boundaries from the production build**

Inspect:

```powershell
Get-ChildItem packages/web/dist/assets/*.css | Select-Object Name,Length
Get-Content -Raw packages/web/dist/.vite/manifest.json
```

Acceptance:

- public entry does not eagerly load the complete admin stylesheet;
- no single replacement CSS asset silently contains the full legacy stylesheet;
- record before/after asset sizes in `docs/quality/ui-performance-baseline.md`.

- [ ] **Step 3: Re-run live drag acceptance**

Using the existing admin account and deterministic fixtures:

- measure 100 folders;
- measure 200 bookmarks;
- verify 0 requests during pointer movement;
- verify exactly 1 reorder request on save;
- reload and verify persistence.

Run the existing live acceptance spec against RN:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://192.129.159.194:8188'
npm run test:e2e -- tests/e2e/admin-sorting.live.spec.ts --project=desktop-chromium
```

Record:

```text
pointer down -> first row displacement
pointer down -> DOM stable
save click -> request complete
```

Acceptance:

- 100 folders remain at or below the Day 1 measurement of 103.4ms;
- 200 bookmarks improve from 188.2ms toward the Day 2 target below 150ms;
- if 200 bookmarks remain above 150ms, attach a Playwright trace and identify the dominant layout/style cost before changing code.

- [ ] **Step 4: Push both commits**

Run:

```powershell
git status --short
git push origin main
```

Expected: push succeeds and user-owned untracked files remain uncommitted.

- [ ] **Step 5: Deploy the single business image on RN port 8188**

Run:

```powershell
ssh rn "cd /opt/nono && git pull --ff-only && docker compose build app && docker compose up -d && docker compose ps"
```

Expected: application and PostgreSQL containers are healthy; the business app still serves Nono and Blog from one image.

- [ ] **Step 6: Verify RN endpoints**

Run:

```powershell
ssh rn "curl -fsS http://127.0.0.1:8188/healthz && curl -I -fsS http://127.0.0.1:8188/ && curl -I -fsS http://127.0.0.1:8188/admin/site && curl -I -fsS http://127.0.0.1:8188/blog && curl -fsS http://127.0.0.1:8188/blog/api/health"
```

Expected: health payload succeeds and page endpoints return 200 or the expected authenticated redirect without restart loops.

- [ ] **Step 7: Complete manual acceptance**

At `http://192.129.159.194:8188`:

- change every appearance group and confirm the preview updates immediately;
- save, hard reload, and confirm values persist;
- open public navigation and confirm card, search, modal and tabs use the saved values;
- open another admin page and confirm admin surface values apply;
- test desktop 1440x900 and mobile 390x844;
- confirm Nono-to-Blog and Blog-to-Nono links still work;
- confirm no overlapping text, clipped controls or unreadable low-opacity surfaces.

---

## Day 2 Definition Of Done

- `packages/web/src/styles.css` is removed and every selector has a clear owner.
- `main.ts` loads only token/base CSS; public and admin CSS follow route/layout boundaries.
- Vue and Blog expose the same eight `--nono-*` design tokens.
- All 15 appearance values are typed, normalized, previewable, persisted and backward compatible.
- Fastify no longer uses `request.body as any` for site updates.
- Unsafe portal protocols are rejected and unrelated `settings` keys survive saves.
- Web, server, Blog tests and all production builds pass.
- 200-bookmark drag is re-measured with request count and persistence verified.
- Two focused commits are pushed to `main`.
- RN port `8188` runs the new single-image build and passes endpoint/manual acceptance.

## Planned Commits

```text
refactor: split styles and share design tokens
feat: expand admin-controlled appearance settings
```
