# Nono UI Performance Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有导航、博客和后台功能的前提下，解决排序拖动卡顿，统一 Vue 导航与 Next.js Blog 的视觉变量，完善公开页交互、后台信息架构、favicon 可靠性、缓存和回归测试。

**Architecture:** 以 `packages/web` 为主要改造面，将全局样式拆为共享 token、公共页和后台三个边界；交互逻辑从 `NavigationPage.vue` 下沉为可测试组件和 composable。站点外观继续保存在 `Site.settings`，Fastify 负责规范化配置与安全 favicon 代理，Blog 通过共享 CSS 变量契约保持一致视觉；Docker 仍维持单业务镜像加 PostgreSQL 的部署结构。

**Tech Stack:** Vue 3、Vite、Pinia、SortableJS、Vitest、Fastify 5、Prisma/PostgreSQL、Next.js 16、React 19、Playwright、Docker Compose。

---

## Scope And Guardrails

- 保持 `/`、`/:username`、`/admin/*`、`/blog/*` 路由兼容。
- 保持一个 `nono-app` 业务镜像，PostgreSQL 继续作为独立基础设施容器。
- 不提交或删除仓库中现有未跟踪的 `design-qa*.png` 与 `design-qa.md`。
- 不使用实验性的 `grid-template-rows: masonry` 作为生产依赖。
- 不为本地搜索盲目增加 debounce；先通过基准证明过滤耗时超过一帧，再决定是否加入。
- favicon 代理必须阻止 SSRF、私网地址、重定向逃逸、超大响应和非图片内容。
- 缓存键必须包含站点 slug、数据版本和用户可见性上下文，禁止把受保护文件夹内容写入公共缓存。

## Target File Structure

```text
packages/web/src/
  styles/
    tokens.css                 # Vue 公共页与后台共享的静态设计变量
    base.css                   # reset、排版、按钮、表单和无障碍基础
    public.css                 # 公开导航页全局样式
    admin.css                  # 后台壳层、表格和反馈组件样式
  components/
    public/
      FolderExpandDialog.vue   # 展开文件夹弹窗
      FolderUnlockDialog.vue   # 密码验证弹窗
      FolderTabs.vue           # sticky tabs 与 Scrollspy
      SearchResultsSummary.vue # 搜索结果、高亮与外搜动作
  composables/
    useDialogFocus.ts          # 焦点圈定、Esc、滚动锁和焦点恢复
    useFolderScrollspy.ts      # IntersectionObserver 生命周期
  utils/
    navigation-cache.ts        # 版本化、按站点隔离的公开数据缓存
    favicon.ts                 # 同源 favicon URL 与稳定 fallback
packages/server/src/
  routes/favicon.ts            # favicon 代理端点
  services/favicon.service.ts  # URL 校验、抓取限制、缓存
  utils/network-address.ts     # DNS/IP 私网与保留地址判断
apps/blog/src/styles/
  nono-tokens.css              # 与 Vue token 名称一致的 Blog 变量入口
tests/e2e/
  public-navigation.spec.ts
  admin-sorting.spec.ts
  blog-portal.spec.ts
playwright.config.ts
```

## Phase 0 Acceptance Baseline

公开页与 Blog 均测试移动端和桌面端，并分别记录冷缓存、暖缓存结果。

| Route | Viewport | Required Baseline |
|---|---|---|
| `/` | 1440x900 | Lighthouse Performance、Accessibility、LCP、CLS、JS/CSS 体积 |
| `/` | 390x844 | 同上，并检查 tabs、搜索和右上角入口不遮挡 |
| `/admin/site` | 1440x900 | 首次可交互时间、保存设置流程、布局截图 |
| `/admin/folders` | 1440x900 | 30/100 行拖动响应与保存耗时 |
| `/blog` | 1440x900、390x844 | Lighthouse、导航入口、共享 token 截图 |

---

### Task 1: Establish Performance And Visual Baselines

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/public-navigation.spec.ts`
- Create: `tests/e2e/admin-sorting.spec.ts`
- Create: `tests/e2e/blog-portal.spec.ts`
- Create: `docs/quality/ui-performance-baseline.md`
- Modify: `package.json`

- [ ] **Step 1: Add the failing quality-gate test**

In `packages/web/test/visual-contract.test.ts`, add a contract asserting that root scripts expose `test:e2e` and that `playwright.config.ts` contains desktop and mobile projects.

```ts
it('defines desktop and mobile browser regression projects', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(process.cwd(), '../..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = fs.readFileSync(path.join(root, 'playwright.config.ts'), 'utf8');

  expect(packageJson.scripts['test:e2e']).toBe('playwright test');
  expect(config).toContain("name: 'desktop'");
  expect(config).toContain("name: 'mobile'");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts
```

Expected: FAIL because the root E2E script and Playwright config do not exist.

- [ ] **Step 3: Add Playwright and deterministic projects**

Add `@playwright/test` to root development dependencies, add:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:update": "playwright test --update-snapshots"
  }
}
```

Create `playwright.config.ts` with:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
```

- [ ] **Step 4: Add smoke paths and baseline documentation**

The public test must assert navigation rendering, search input, portal links, sticky tabs and screenshot output. The admin test must use a seeded login session, enter folder/link sorting mode, drag a row, save, reload and verify persisted order. The Blog test must assert `/blog` loads and its navigation shortcut points back to Nono.

Record commands, date, commit SHA, device, cold/warm cache and metrics in `docs/quality/ui-performance-baseline.md`. Do not invent target numbers before measuring.

- [ ] **Step 5: Run the baseline gates**

Run:

```powershell
npm test
npm run test:blog
npm run build:all
npm run test:e2e
```

Expected: all unit tests and builds pass; E2E produces stable desktop/mobile screenshots.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json playwright.config.ts tests/e2e docs/quality/ui-performance-baseline.md packages/web/test/visual-contract.test.ts
git commit -m "test: establish ui performance baselines"
```

---

### Task 2: Remove Drag Sorting Jank

**Files:**
- Modify: `packages/web/src/components/admin/SortableList.vue`
- Modify: `packages/web/src/views/admin/FoldersView.vue`
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Modify: `packages/web/src/styles.css`
- Modify: `packages/web/test/sortable-list.test.ts`
- Modify: `packages/web/test/admin-folders-view.test.ts`
- Modify: `packages/web/test/admin-links-view.test.ts`
- Modify: `tests/e2e/admin-sorting.spec.ts`

- [ ] **Step 1: Write failing SortableJS option tests**

Extend `sortable-list.test.ts` to require these behaviors:

```ts
expect(options).toMatchObject({
  animation: 120,
  forceFallback: false,
  fallbackOnBody: true,
  swapThreshold: 0.65,
  invertSwap: true,
  delayOnTouchOnly: true,
});
```

Also assert the component watches `itemIds` and calls `sortable.sort(ids.map(String), false)` only when the external order differs from the rendered order.

- [ ] **Step 2: Verify the new tests fail**

Run:

```powershell
npm run test -w packages/web -- --run test/sortable-list.test.ts test/admin-folders-view.test.ts test/admin-links-view.test.ts
```

Expected: FAIL on missing options and synchronization behavior.

- [ ] **Step 3: Make drag rendering cheap**

In `SortableList.vue`:

- reduce animation from 160ms to 120ms;
- keep native HTML5 drag on desktop;
- use fallback only when SortableJS requires it;
- set `fallbackOnBody`, `swapThreshold`, `invertSwap`, `emptyInsertThreshold`;
- expose `data-dragging` while `onStart`/`onEnd` run;
- avoid replacing the list during pointer movement;
- emit the final ID order exactly once in `onEnd`.

In admin CSS:

```css
.sortable-list[data-dragging='true'] .sortable-admin-row {
  transition: none;
}

.sortable-row-dragging {
  backdrop-filter: none;
  box-shadow: 0 8px 20px rgb(15 23 42 / 16%);
}

.sortable-row-chosen {
  contain: paint;
}
```

Do not apply blur or large animated shadows to the actively dragged row.

- [ ] **Step 4: Keep reordering optimistic and local**

`FoldersView.vue` and `LinksView.vue` must update only `draftFolders` or `draftLinks` during dragging. Saving sends one batch request, updates local `sortOrder`, exits sort mode and does not call a full `load()`.

The sort buttons must remain disabled only during the save request, and a failed save must retain the draft order for retry.

- [ ] **Step 5: Verify behavior at realistic list sizes**

Add component fixtures for 100 folders and 200 links. E2E must measure the time from pointer down to first row displacement and require it to stay below 100ms on the local test machine; record the observed value rather than treating it as a universal hardware guarantee.

Run:

```powershell
npm run test -w packages/web -- --run test/sortable-list.test.ts test/admin-folders-view.test.ts test/admin-links-view.test.ts
npm run test:e2e -- admin-sorting.spec.ts
```

Expected: PASS; one network request per saved order; no full-list reload after save.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/components/admin/SortableList.vue packages/web/src/views/admin/FoldersView.vue packages/web/src/views/admin/LinksView.vue packages/web/src/styles.css packages/web/test/sortable-list.test.ts packages/web/test/admin-folders-view.test.ts packages/web/test/admin-links-view.test.ts tests/e2e/admin-sorting.spec.ts
git commit -m "perf: make admin sorting responsive"
```

---

### Task 3: Split Styles And Establish Shared Tokens

**Files:**
- Create: `packages/web/src/styles/tokens.css`
- Create: `packages/web/src/styles/base.css`
- Create: `packages/web/src/styles/public.css`
- Create: `packages/web/src/styles/admin.css`
- Create: `apps/blog/src/styles/nono-tokens.css`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/router/index.ts`
- Modify: `packages/web/src/styles.css`
- Modify: `apps/blog/src/styles/globals.css`
- Modify: `apps/blog/src/styles/theme.css`
- Modify: `packages/web/test/visual-contract.test.ts`
- Modify: `apps/blog/tests/quality-gates.test.mts`

- [ ] **Step 1: Write failing token and CSS-boundary tests**

Require both apps to define the same public contract:

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

Add a web test asserting `main.ts` imports only `tokens.css` and `base.css`, while public/admin styles are imported by their route components or layout boundaries.

- [ ] **Step 2: Verify tests fail**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts
npm run test:blog
```

Expected: FAIL because the files and imports do not exist.

- [ ] **Step 3: Extract tokens without visual changes**

Move values from `styles.css` into `tokens.css`, initially preserving existing computed colors and dimensions. Map current runtime appearance variables onto stable tokens:

```css
:root {
  --nono-accent: #10b981;
  --nono-radius-sm: 8px;
  --nono-radius-md: 12px;
  --nono-radius-lg: 20px;
  --nono-surface-opacity: var(--public-card-opacity, 0.52);
  --nono-surface-blur: var(--public-card-blur, 8px);
  --nono-ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --nono-focus-ring: 0 0 0 3px rgb(52 211 153 / 18%);
}
```

Extract reset/forms/buttons into `base.css`, public global rules into `public.css`, and admin shell/table/feedback rules into `admin.css`. Keep component-specific rules scoped in their Vue files.

- [ ] **Step 4: Make style loading follow route boundaries**

Import public CSS from `NavigationPage.vue` and admin CSS from `AdminLayout.vue`. Confirm the production manifest places admin CSS in an async chunk and does not include it in the public entry chunk.

Copy the token names into `apps/blog/src/styles/nono-tokens.css`, import it before Blog theme rules, and map Blog-specific variables to the shared contract rather than forcing identical component layouts.

- [ ] **Step 5: Remove the legacy file only after parity**

Delete `packages/web/src/styles.css` only after:

```powershell
npm run test -w packages/web
npm run test:blog
npm run build:all
```

Expected: PASS; screenshots differ only where explicitly approved.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/styles packages/web/src/main.ts packages/web/src/router/index.ts packages/web/src/styles.css packages/web/test/visual-contract.test.ts apps/blog/src/styles apps/blog/tests/quality-gates.test.mts
git commit -m "refactor: split styles and share design tokens"
```

---

### Task 4: Complete Admin-Controlled Appearance Settings

**Files:**
- Modify: `packages/web/src/utils/appearance.ts`
- Modify: `packages/web/src/views/admin/SiteConfigView.vue`
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/src/components/SearchBar.vue`
- Modify: `packages/web/src/components/FolderCard.vue`
- Modify: `packages/server/src/routes/admin/site.ts`
- Modify: `packages/server/src/services/repository.ts`
- Modify: `packages/server/src/services/prisma.repository.ts`
- Modify: `packages/web/test/site-config-view.test.ts`
- Modify: `packages/web/test/appearance.test.ts`
- Modify: `packages/server/test/app.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Extend `AppearanceSettings` with:

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

Tests must verify numeric strings are accepted, values are clamped, unknown settings survive a save, and invalid objects fall back to defaults.

- [ ] **Step 2: Add server-side schema validation**

Replace `request.body as any` in `site.ts` with a Zod schema. Preserve unrelated `settings` keys, normalize appearance values, reject unsafe portal protocols and require `{query}` in external search templates.

- [ ] **Step 3: Add grouped controls and live previews**

In `SiteConfigView.vue`, keep the existing card/search controls and add modal, sticky tabs and admin surface groups. Use sliders for numeric values, segmented buttons for the three presets, and a reset button that restores defaults.

The preview must show search, folder card, tabs and modal together so blur stacking and text contrast can be judged before saving.

- [ ] **Step 4: Apply runtime variables**

`toAppearanceCssVars()` must return:

```ts
'--public-modal-radius'
'--public-modal-opacity'
'--public-modal-blur'
'--public-tab-radius'
'--public-tab-opacity'
'--public-tab-blur'
'--admin-surface-radius'
'--admin-surface-opacity'
'--admin-surface-blur'
```

Apply public variables on `.nav-page` and admin variables on `.app-workbench`. Keep fallback values so older records render correctly.

- [ ] **Step 5: Verify settings persist and remain usable**

Run:

```powershell
npm run test -w packages/server -- --run test/app.test.ts
npm run test -w packages/web -- --run test/site-config-view.test.ts test/appearance.test.ts test/navigation-page.test.ts
```

Expected: PASS; values persist through API, reload and public rendering.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/utils/appearance.ts packages/web/src/views/admin/SiteConfigView.vue packages/web/src/views/NavigationPage.vue packages/web/src/components/SearchBar.vue packages/web/src/components/FolderCard.vue packages/server/src/routes/admin/site.ts packages/server/src/services packages/web/test packages/server/test/app.test.ts
git commit -m "feat: expand admin-controlled appearance settings"
```

---

### Task 5: Extract Accessible Public Dialogs

**Files:**
- Create: `packages/web/src/components/public/FolderExpandDialog.vue`
- Create: `packages/web/src/components/public/FolderUnlockDialog.vue`
- Create: `packages/web/src/composables/useDialogFocus.ts`
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/test/navigation-page.test.ts`
- Create: `packages/web/test/public-dialogs.test.ts`

- [ ] **Step 1: Write failing keyboard and focus tests**

Tests must cover:

- opener focus is restored after close;
- Escape closes each dialog;
- Tab and Shift+Tab remain inside the active dialog;
- body scrolling is locked while open and restored after close;
- clicking the backdrop closes, clicking dialog content does not;
- password input receives initial focus;
- submit errors are announced through `aria-live`.

- [ ] **Step 2: Implement a reusable focus lifecycle**

`useDialogFocus.ts` owns document listeners and body scroll state:

```ts
export interface DialogFocusOptions {
  container: () => HTMLElement | null;
  onClose: () => void;
  initialFocus?: () => HTMLElement | null;
}
```

It must clean up listeners on close and unmount. Use a reusable Vue dialog component rather than assuming native `<dialog>` eliminates Safari, transition and focus-restoration work.

- [ ] **Step 3: Move markup and styles out of NavigationPage**

Each dialog receives typed props and emits `close`, `verify` or link actions. `NavigationPage.vue` keeps data orchestration only.

- [ ] **Step 4: Run focused tests**

```powershell
npm run test -w packages/web -- --run test/public-dialogs.test.ts test/navigation-page.test.ts
```

Expected: PASS; no persistent `keydown` listeners or body styles after unmount.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/public packages/web/src/composables/useDialogFocus.ts packages/web/src/views/NavigationPage.vue packages/web/test/public-dialogs.test.ts packages/web/test/navigation-page.test.ts
git commit -m "feat: make public dialogs accessible"
```

---

### Task 6: Add Sticky Folder Tabs And Scrollspy

**Files:**
- Create: `packages/web/src/components/public/FolderTabs.vue`
- Create: `packages/web/src/composables/useFolderScrollspy.ts`
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/test/navigation-page.test.ts`
- Create: `packages/web/test/folder-tabs.test.ts`

- [ ] **Step 1: Write failing observer and interaction tests**

Assert:

- the first visible folder becomes active;
- observer updates active tab as sections cross the root margin;
- clicking a tab scrolls with the sticky header offset;
- active tab receives `aria-current="location"`;
- overflow tabs can scroll horizontally;
- reduced-motion users receive instant scrolling.

- [ ] **Step 2: Implement the observer lifecycle**

Use one `IntersectionObserver` with a root margin based on the sticky bar height. Disconnect before rebuilding observations when search results or incremental folder batches change.

- [ ] **Step 3: Implement the stable tab indicator**

Use an unframed sticky navigation band with a shared blurred surface. The active indicator may animate with transform, but it must not resize the tab row. Add edge masks only when horizontal overflow exists.

- [ ] **Step 4: Verify desktop and mobile**

```powershell
npm run test -w packages/web -- --run test/folder-tabs.test.ts test/navigation-page.test.ts
npm run test:e2e -- public-navigation.spec.ts
```

Expected: PASS; tabs do not cover the page title or portal shortcut at 390px width.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/public/FolderTabs.vue packages/web/src/composables/useFolderScrollspy.ts packages/web/src/views/NavigationPage.vue packages/web/test/folder-tabs.test.ts packages/web/test/navigation-page.test.ts tests/e2e/public-navigation.spec.ts
git commit -m "feat: add sticky folder scrollspy"
```

---

### Task 7: Upgrade Search Without Adding Artificial Latency

**Files:**
- Modify: `packages/web/src/components/SearchBar.vue`
- Create: `packages/web/src/components/public/SearchResultsSummary.vue`
- Create: `packages/web/src/utils/search.ts`
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/src/api/types.ts`
- Modify: `packages/web/test/navigation-page.test.ts`
- Create: `packages/web/test/search.test.ts`

- [ ] **Step 1: Benchmark and test search behavior**

Create a deterministic benchmark fixture with 5,000 links. If local filtering remains below 8ms per query on the development machine, keep immediate computed filtering. Add debounce only if profiling shows repeated work exceeding that budget.

Tests must cover `/` focusing the input when the user is not already typing, Escape clearing the query, match highlighting without `v-html`, engine selection persistence, and a visible external-search action when local results are empty.

- [ ] **Step 2: Add safe text matching**

`search.ts` returns text segments:

```ts
export interface HighlightSegment {
  text: string;
  matched: boolean;
}
```

Render segments with Vue nodes and `<mark>`; never inject result text as HTML.

- [ ] **Step 3: Add engine selection**

Support Google, Bing, Baidu and DuckDuckGo as a menu. Persist only the engine key in `localStorage`; the server-provided template remains the site default. Validate templates before use and URL-encode the query.

- [ ] **Step 4: Add keyboard ergonomics**

The `/` shortcut must ignore inputs, textareas, selects and contenteditable elements. Show a compact key hint only when the input is not focused. Keep Enter behavior consistent with `localSearchFirst`.

- [ ] **Step 5: Run tests**

```powershell
npm run test -w packages/web -- --run test/search.test.ts test/navigation-page.test.ts
```

Expected: PASS; no user-visible delay is introduced for normal bookmark counts.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/components/SearchBar.vue packages/web/src/components/public/SearchResultsSummary.vue packages/web/src/utils/search.ts packages/web/src/views/NavigationPage.vue packages/web/src/api/types.ts packages/web/test/search.test.ts packages/web/test/navigation-page.test.ts
git commit -m "feat: improve public search workflow"
```

---

### Task 8: Make Folder Cards Flexible And Favicon Fallbacks Distinct

**Files:**
- Modify: `packages/web/src/components/FolderCard.vue`
- Create: `packages/web/src/components/public/FaviconBadge.vue`
- Modify: `packages/web/src/utils/favicon.ts`
- Modify: `packages/web/test/visual-contract.test.ts`
- Create: `packages/web/test/favicon-badge.test.ts`

- [ ] **Step 1: Replace fixed-height contract tests**

Remove assertions requiring `height: 358px` and internal scrolling. Require:

- natural height for small folders;
- a stable maximum preview row count;
- a `+N 更多` action for overflow;
- a two-column desktop and one-column mobile link grid;
- no experimental masonry declaration;
- fixed favicon dimensions to prevent CLS.

- [ ] **Step 2: Implement predictable flexible sizing**

Use a normal CSS grid and cap the preview by item count, not by nested scroll height. Example behavior:

```ts
const previewLimit = computed(() => props.compact ? 6 : 10);
const visibleLinks = computed(() => (folder.value.links || []).slice(0, previewLimit.value));
const hiddenCount = computed(() => Math.max(0, (folder.value.links?.length || 0) - visibleLinks.value.length));
```

Clicking `+N 更多` emits the existing `expand` event. This preserves reading order and avoids CSS columns or unreliable masonry.

- [ ] **Step 3: Add deterministic fallback badges**

`FaviconBadge.vue` displays the loaded image or a first letter with colors derived from a stable domain hash. It must keep an 18x18 box in loading, success and error states.

- [ ] **Step 4: Verify layout**

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts test/favicon-badge.test.ts
npm run test:e2e -- public-navigation.spec.ts
```

Expected: PASS; folders with 2, 10 and 30 links remain readable without inner scrollbars.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/FolderCard.vue packages/web/src/components/public/FaviconBadge.vue packages/web/src/utils/favicon.ts packages/web/test/visual-contract.test.ts packages/web/test/favicon-badge.test.ts tests/e2e/public-navigation.spec.ts
git commit -m "feat: make folder cards content-aware"
```

---

### Task 9: Simplify AdminLayout And Standardize View States

**Files:**
- Modify: `packages/web/src/components/AdminLayout.vue`
- Modify: `packages/web/src/styles/admin.css`
- Modify: `packages/web/src/views/admin/SiteConfigView.vue`
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Modify: `packages/web/src/views/admin/FoldersView.vue`
- Modify: `packages/web/src/components/admin/EmptyState.vue`
- Modify: `packages/web/src/components/admin/LoadingOverlay.vue`
- Modify: `packages/web/test/visual-contract.test.ts`
- Modify: `packages/web/test/admin-feedback.test.ts`

- [ ] **Step 1: Write failing layout contracts**

Require:

- no `.figma-control-strip`;
- no duplicate “查看主页” or logout commands;
- single-line navigation items with icon and name;
- one compact operator row at sidebar bottom;
- topbar with section breadcrumb, title and one account menu;
- mobile sidebar toggle with focus management;
- standardized loading, empty and error states.

- [ ] **Step 2: Simplify the shell**

Delete the control strip and page command card. Remove nav hints and chevrons. Keep section labels only where they aid scanning. Move homepage/logout actions into an account menu and ensure it is keyboard operable.

- [ ] **Step 3: Apply adjustable admin surfaces**

Use `--admin-surface-radius`, `--admin-surface-opacity` and `--admin-surface-blur` from Task 4. Limit cards to real repeated items, dialogs and tool panels; page sections remain unframed.

- [ ] **Step 4: Standardize loading, empty and error handling**

Each admin data view must expose:

- loading state that preserves layout dimensions;
- empty state with one clear primary action;
- inline error with retry;
- save state that disables only the affected command.

- [ ] **Step 5: Run tests and screenshots**

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts test/admin-feedback.test.ts test/site-config-view.test.ts test/admin-folders-view.test.ts test/admin-links-view.test.ts
npm run test:e2e
```

Expected: PASS; desktop and mobile screenshots show no overlapping navigation or controls.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/components/AdminLayout.vue packages/web/src/components/admin packages/web/src/styles/admin.css packages/web/src/views/admin packages/web/test tests/e2e
git commit -m "refactor: simplify admin workspace"
```

---

### Task 10: Add A Secure Same-Origin Favicon Proxy

**Files:**
- Create: `packages/server/src/utils/network-address.ts`
- Create: `packages/server/src/services/favicon.service.ts`
- Create: `packages/server/src/routes/favicon.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/types.ts`
- Modify: `packages/web/src/utils/favicon.ts`
- Modify: `packages/server/test/app.test.ts`
- Create: `packages/server/test/favicon.service.test.ts`

- [ ] **Step 1: Write failing SSRF and response-limit tests**

Tests must reject:

- non-HTTP protocols;
- localhost and loopback;
- RFC1918 private ranges;
- link-local, multicast, unspecified and IPv6 local addresses;
- redirect chains to blocked addresses;
- responses larger than 256KB;
- non-image content types;
- requests exceeding a 3-second timeout.

Tests must allow a public HTTPS domain, cache successful results and return a short cacheable negative response after repeated failures.

- [ ] **Step 2: Implement address validation before every request**

Resolve all A/AAAA records, reject the request if any resolved address is blocked, and repeat validation for each redirect target. Limit redirects to two.

The service interface:

```ts
export interface FaviconResult {
  status: 'hit' | 'miss';
  contentType?: string;
  body?: Buffer;
  etag?: string;
}
```

- [ ] **Step 3: Discover icons safely**

Try the origin HTML only when content type and size are acceptable, parse `<link rel="icon">` with URL resolution, then fall back to `/favicon.ico`. Do not rely solely on Google or `/favicon.ico`.

Cache by normalized origin, content hash and expiry. Keep the initial implementation in bounded memory; add disk/object storage only when deployment metrics justify it.

- [ ] **Step 4: Register the route**

Expose:

```text
GET /api/favicon?url=https%3A%2F%2Fexample.com
```

Return `Cache-Control`, `ETag`, a correct image content type and `X-Content-Type-Options: nosniff`. Rate-limit separately from normal API traffic.

- [ ] **Step 5: Switch the client to same-origin requests**

`getFaviconUrl()` must prefer an explicit safe icon, otherwise return `/api/favicon?url=...`. `FaviconBadge` remains the visual fallback.

- [ ] **Step 6: Run security and integration tests**

```powershell
npm run test -w packages/server -- --run test/favicon.service.test.ts test/app.test.ts
npm run test -w packages/web -- --run test/favicon-badge.test.ts test/visual-contract.test.ts
```

Expected: PASS; no test can make the service fetch a private address.

- [ ] **Step 7: Commit**

```powershell
git add packages/server/src/utils/network-address.ts packages/server/src/services/favicon.service.ts packages/server/src/routes/favicon.ts packages/server/src/app.ts packages/server/src/types.ts packages/server/test packages/web/src/utils/favicon.ts packages/web/test
git commit -m "feat: proxy favicons securely"
```

---

### Task 11: Add Versioned Navigation Cache

**Files:**
- Create: `packages/web/src/utils/navigation-cache.ts`
- Modify: `packages/web/src/stores/navigation.ts`
- Modify: `packages/server/src/routes/navigation.ts`
- Modify: `packages/web/test/navigation-page.test.ts`
- Create: `packages/web/test/navigation-cache.test.ts`
- Modify: `packages/server/test/app.test.ts`

- [ ] **Step 1: Write failing cache isolation tests**

Require cache entries to include:

```ts
interface NavigationCacheEntry {
  version: 1;
  slug: string;
  storedAt: number;
  etag: string;
  payload: NavigationPayload;
}
```

Tests must prove that `admin` and another slug cannot share data, schema version mismatches are discarded, expired entries are not treated as fresh, and locked folder contents are never persisted.

- [ ] **Step 2: Add HTTP validators**

The navigation route computes an ETag from public site/folder/link update state and responds to `If-None-Match` with 304. Do not include password hashes or private content in the hash payload.

- [ ] **Step 3: Implement stale-while-revalidate**

On load:

1. render a valid cached public payload immediately;
2. request with `If-None-Match`;
3. keep cached data on 304;
4. replace cache and UI on 200;
5. show a non-blocking stale indicator if refresh fails.

Use a short TTL such as 15 minutes and a namespaced key such as `nono:navigation:v1:<slug>`.

- [ ] **Step 4: Verify cold and warm behavior**

```powershell
npm run test -w packages/web -- --run test/navigation-cache.test.ts test/navigation-page.test.ts
npm run test -w packages/server -- --run test/app.test.ts
```

Expected: PASS; a warm visit paints from cache before the network response without exposing protected links.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/utils/navigation-cache.ts packages/web/src/stores/navigation.ts packages/web/test/navigation-cache.test.ts packages/web/test/navigation-page.test.ts packages/server/src/routes/navigation.ts packages/server/test/app.test.ts
git commit -m "perf: cache public navigation safely"
```

---

### Task 12: Final Regression, Docker Build And RN Deployment

**Files:**
- Modify: `docs/quality/ui-performance-baseline.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile` only if build caching or copied style files require it
- Modify: `docker-compose.yml` only if a new runtime variable is required

- [ ] **Step 1: Add complete CI gates**

CI must run:

```powershell
npm test
npm run test:blog
npm run build:all
```

Run Playwright against a built container in a separate job. Upload traces and screenshots only on failure.

- [ ] **Step 2: Run the full local verification**

```powershell
npm test
npm run test:blog
npm run typecheck:blog
npm run build:all
docker compose build --no-cache app
docker compose up -d
docker compose ps
npm run test:e2e
```

Expected:

- `nono` and `nono-postgres` are healthy;
- `/healthz`, `/`, `/admin/login`, `/blog` and `/blog/api/health` return 200;
- one business container still serves navigation and Blog;
- no migration, console or hydration errors appear.

- [ ] **Step 3: Compare metrics to the baseline**

Update `docs/quality/ui-performance-baseline.md` with before/after values. Required qualitative outcomes:

- sorting feels immediate and sends one save request;
- public entry no longer includes the full admin stylesheet;
- keyboard-only users can open, operate and close dialogs;
- mobile tabs and portal links do not overlap;
- warm navigation visits render cached public data safely;
- favicon failures show stable local badges.

Performance scores are reported, not manipulated by hiding required functionality.

- [ ] **Step 4: Deploy to the RN server**

From the repository:

```powershell
git status --short
git push origin main
ssh rn "cd /opt/nono && git pull --ff-only && docker compose build app && docker compose up -d && docker compose ps"
```

Then verify on the server:

```powershell
ssh rn "curl -fsS http://127.0.0.1:3000/healthz && curl -I -fsS http://127.0.0.1:3000/ && curl -I -fsS http://127.0.0.1:3000/blog && curl -fsS http://127.0.0.1:3000/blog/api/health"
```

Expected: all checks succeed, containers remain healthy with zero restart loops.

- [ ] **Step 5: Commit documentation and CI**

```powershell
git add docs/quality/ui-performance-baseline.md README.md .github/workflows/ci.yml Dockerfile docker-compose.yml
git commit -m "chore: enforce ui regression gates"
git push origin main
```

---

## Delivery Order

| Milestone | Tasks | Outcome |
|---|---|---|
| P0 | 1–2 | 建立基线并先解决文件夹/书签拖动卡顿 |
| P0 | 3–5 | 样式边界、共享 token、后台可调玻璃参数、弹窗无障碍 |
| P1 | 6–9 | Sticky tabs、搜索、弹性卡片、后台布局瘦身 |
| P1 | 10–11 | 安全 favicon 代理与隔离缓存 |
| Release | 12 | 全量回归、单镜像构建、RN 部署与指标对比 |

## Estimated Effort

- Tasks 1–2: 1–2 focused engineering days.
- Tasks 3–5: 3–4 focused engineering days.
- Tasks 6–9: 3–4 focused engineering days.
- Tasks 10–12: 2–3 focused engineering days.
- Total: 9–13 focused engineering days, depending on screenshot review rounds and RN network conditions.

## Definition Of Done

- 所有 Vue、Fastify、Blog 单元测试通过。
- Vue 与 Blog 类型检查、生产构建通过。
- Playwright 桌面端和移动端关键路径通过。
- 100 行级别的后台拖动没有明显掉帧，保存只发送一次批量请求。
- 公开页、后台和 Blog 使用同名核心视觉 token，且后台配置能调整卡片、搜索、弹窗、tabs 与后台表面。
- favicon 代理通过 SSRF、超时、大小和内容类型测试。
- 缓存不跨 slug、用户或 schema 版本泄漏内容。
- Docker 仍为一个业务镜像，RN 上两个容器健康运行。
- 工作树中的现有 `design-qa*.png` 与 `design-qa.md` 保持未修改、未提交。
