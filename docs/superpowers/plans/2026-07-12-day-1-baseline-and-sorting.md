# Nono Day 1 Baseline And Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在第一天建立可重复的前端质量基线，并完成文件夹与书签拖动排序的首轮性能优化、测试和独立提交。

**Architecture:** 保持现有 Vue、Fastify、Next.js 和单业务镜像结构不变。上午只增加 Playwright 骨架、现状截图与性能记录；下午仅优化 `SortableList.vue` 及文件夹/书签排序链路，拖动期间只修改本地草稿，保存时只发送一次批量请求。

**Tech Stack:** Vue 3、SortableJS、Vitest、Playwright、Fastify、Docker Compose。

---

## Day 1 Boundaries

今天包含：

- 记录 `/`、`/admin/folders`、`/admin/links`、`/blog` 的现状。
- 建立桌面端与移动端 Playwright 骨架。
- 为拖动排序增加更完整的单元测试。
- 降低拖动期间的 CSS 和 DOM 更新成本。
- 确认保存排序只请求一次，失败后保留草稿。
- 完成两次独立提交。

今天不包含：

- 拆分 `styles.css`。
- 重做后台布局。
- Sticky tabs、Scrollspy、搜索引擎切换。
- favicon 服务端代理。
- 导航缓存。
- RN 正式部署。

不得修改或提交：

```text
design-qa-comparison.png
design-qa-nono-admin-auth.png
design-qa-nono-desktop.png
design-qa-nono-mobile.png
design-qa.md
```

## Eight-Hour Schedule

| Timebox | Work | Required Output |
|---|---|---|
| 0:00–0:30 | 环境与测试基线 | 当前 commit、工作树、Node/npm/pnpm、现有测试结果 |
| 0:30–2:00 | Playwright 骨架 | 桌面/移动项目、三条 smoke 用例、截图目录 |
| 2:00–2:30 | 现状记录 | 基线文档、关键截图、拖动现状数据 |
| 2:30–3:00 | 第一次提交 | `test: establish ui performance baselines` |
| 3:00–4:00 | 拖动测试先行 | Sortable 选项、单次 emit、保存请求和失败保留草稿测试 |
| 4:00–6:00 | 拖动实现 | Sortable 配置、拖动状态、轻量 CSS、局部草稿更新 |
| 6:00–7:00 | 回归和实际测量 | 100 文件夹、200 书签测试，桌面和触摸视口检查 |
| 7:00–7:30 | 第二次提交 | `perf: make admin sorting responsive` |
| 7:30–8:00 | 日结 | 测试结果、性能前后对比、第二天风险清单 |

---

### Task 1: Verify The Starting State

**Files:**
- Read: `package.json`
- Read: `packages/web/package.json`
- Read: `packages/web/src/components/admin/SortableList.vue`
- Read: `packages/web/src/views/admin/FoldersView.vue`
- Read: `packages/web/src/views/admin/LinksView.vue`
- Read: `packages/web/test/sortable-list.test.ts`
- Read: `packages/web/test/admin-folders-view.test.ts`
- Read: `packages/web/test/admin-links-view.test.ts`

- [ ] **Step 1: Record repository state**

Run:

```powershell
git status --short
git rev-parse --short HEAD
node --version
npm --version
pnpm --version
```

Expected:

- branch starts from the current integrated `main`;
- existing `design-qa*` files remain untracked;
- Node satisfies `>=22`;
- no unrelated file is staged.

- [ ] **Step 2: Run existing focused tests**

Run:

```powershell
npm run test -w packages/web -- --run test/sortable-list.test.ts test/admin-folders-view.test.ts test/admin-links-view.test.ts
```

Expected: current tests pass before implementation. Record failures as pre-existing if any fail before edits.

- [ ] **Step 3: Record current bundle build**

Run:

```powershell
npm run build -w packages/web
Get-ChildItem packages/web/dist/assets | Select-Object Name, Length
```

Expected: production build succeeds and asset sizes are available for the baseline document.

---

### Task 2: Add The Day 1 Browser Baseline

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/public-navigation.spec.ts`
- Create: `tests/e2e/admin-sorting.spec.ts`
- Create: `tests/e2e/blog-portal.spec.ts`
- Create: `docs/quality/ui-performance-baseline.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/web/test/visual-contract.test.ts`

- [ ] **Step 1: Write the failing Playwright contract**

Add to `packages/web/test/visual-contract.test.ts`:

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

- [ ] **Step 2: Verify the contract fails**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts
```

Expected: FAIL because `playwright.config.ts` and `test:e2e` do not exist.

- [ ] **Step 3: Install Playwright test tooling**

Run:

```powershell
npm install --save-dev @playwright/test
npx playwright install chromium
```

Expected: root lockfile updates and Chromium installs successfully.

- [ ] **Step 4: Add root scripts**

Add to the root `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:update": "playwright test --update-snapshots"
  }
}
```

- [ ] **Step 5: Create deterministic Playwright configuration**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: devices['iPhone 13'],
    },
  ],
});
```

- [ ] **Step 6: Add public and Blog smoke tests**

`public-navigation.spec.ts` must verify:

```ts
await expect(page.locator('.search-bar input')).toBeVisible();
await expect(page.locator('[data-testid^="public-folder-card-"]').first()).toBeVisible();
await expect(page.locator('[data-testid="portal-corner-link"]')).toBeVisible();
```

Capture full-page screenshots for `/` at 1440x900 and 390x844.

`blog-portal.spec.ts` must verify `/blog` renders a visible main region and its portal shortcut links back to the Nono root.

- [ ] **Step 7: Add the initial admin sorting smoke test**

`admin-sorting.spec.ts` must:

1. authenticate using the test or seeded admin account;
2. open `/admin/folders`;
3. enter sorting mode;
4. assert at least one `.drag-handle` is visible;
5. capture the pre-optimization screenshot;
6. leave persistence assertions for Task 4 after drag behavior is optimized.

- [ ] **Step 8: Create the baseline document**

Create `docs/quality/ui-performance-baseline.md` with columns for route, viewport, cold/warm cache, LCP, CLS, JS bytes, CSS bytes and notes. Add measured rows for `/` desktop, `/` mobile, `/admin/folders` desktop and `/blog` desktop. Include only values produced by the current run, together with date, commit SHA, browser version and machine description.

- [ ] **Step 9: Run and commit the baseline**

Run:

```powershell
npm run test -w packages/web -- --run test/visual-contract.test.ts
npm run build:all
npm run test:e2e
```

Expected: tests and builds pass; screenshots are produced; the baseline document contains actual values.

Commit:

```powershell
git add package.json package-lock.json playwright.config.ts tests/e2e docs/quality/ui-performance-baseline.md packages/web/test/visual-contract.test.ts
git commit -m "test: establish ui performance baselines"
```

---

### Task 3: Define Drag Performance Contracts

**Files:**
- Modify: `packages/web/test/sortable-list.test.ts`
- Modify: `packages/web/test/admin-folders-view.test.ts`
- Modify: `packages/web/test/admin-links-view.test.ts`

- [ ] **Step 1: Require lightweight SortableJS options**

Update the Sortable mock to provide:

```ts
const sortableMocks = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  option: vi.fn(),
  sort: vi.fn(),
}));
```

Require:

```ts
expect(options).toMatchObject({
  animation: 120,
  handle: '.drag-handle',
  forceFallback: false,
  fallbackOnBody: true,
  swapThreshold: 0.65,
  invertSwap: true,
  delayOnTouchOnly: true,
  touchStartThreshold: 4,
});
```

- [ ] **Step 2: Require one reorder event**

Call:

```ts
options.onStart();
options.onEnd({ oldIndex: 0, newIndex: 2 });
```

Assert:

```ts
expect(wrapper.attributes('data-dragging')).toBe('false');
expect(wrapper.emitted('reorder')).toEqual([[[2, 3, 1]]]);
```

- [ ] **Step 3: Require draft retention after save failure**

In folder and link view tests:

- enter sort mode;
- reorder IDs;
- make the batch endpoint reject;
- assert the reordered rows remain visible;
- assert sort mode remains active;
- assert the save button becomes enabled for retry.

- [ ] **Step 4: Require one batch request after success**

For folder sorting:

```ts
expect(apiRequest).toHaveBeenCalledWith(
  '/api/admin/folders/reorder',
  expect.objectContaining({ method: 'PUT' }),
);
```

For link sorting:

```ts
expect(apiRequest).toHaveBeenCalledWith(
  '/api/admin/links/reorder',
  expect.objectContaining({ method: 'PUT' }),
);
```

Assert each endpoint is called exactly once and neither view performs another GET reload after saving.

- [ ] **Step 5: Run tests and verify the new contracts fail**

Run:

```powershell
npm run test -w packages/web -- --run test/sortable-list.test.ts test/admin-folders-view.test.ts test/admin-links-view.test.ts
```

Expected: FAIL on the new Sortable options, drag state and failure-retention contracts.

---

### Task 4: Implement Responsive Drag Sorting

**Files:**
- Modify: `packages/web/src/components/admin/SortableList.vue`
- Modify: `packages/web/src/views/admin/FoldersView.vue`
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Modify: `packages/web/src/styles.css`
- Modify: `tests/e2e/admin-sorting.spec.ts`

- [ ] **Step 1: Add explicit drag state**

In `SortableList.vue`:

```ts
const dragging = ref(false);

function handleStart() {
  dragging.value = true;
}

function handleEnd(event: SortableEvent) {
  dragging.value = false;
  const oldIndex = event.oldIndex;
  const newIndex = event.newIndex;
  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;

  const ids = [...props.itemIds];
  const [moved] = ids.splice(oldIndex, 1);
  if (moved === undefined) return;
  ids.splice(newIndex, 0, moved);
  emit('reorder', ids);
}
```

Bind it on the root:

```vue
<div
  ref="root"
  class="sortable-list"
  role="list"
  :aria-label="ariaLabel"
  :data-dragging="String(dragging)"
>
```

- [ ] **Step 2: Tune SortableJS without forcing fallback**

Use:

```ts
sortable = Sortable.create(root.value, {
  animation: 120,
  handle: '.drag-handle',
  ghostClass: 'sortable-row-ghost',
  chosenClass: 'sortable-row-chosen',
  dragClass: 'sortable-row-dragging',
  forceFallback: false,
  fallbackOnBody: true,
  fallbackTolerance: 4,
  swapThreshold: 0.65,
  invertSwap: true,
  emptyInsertThreshold: 8,
  delay: 120,
  delayOnTouchOnly: true,
  touchStartThreshold: 4,
  disabled: props.disabled,
  onStart: handleStart,
  onEnd: handleEnd,
});
```

- [ ] **Step 3: Remove expensive active-drag effects**

Add to `packages/web/src/styles.css`:

```css
.app-workbench .sortable-list[data-dragging='true'] .sortable-admin-row {
  transition: none;
}

.app-workbench .sortable-row-dragging {
  backdrop-filter: none;
  box-shadow: 0 8px 20px rgb(15 23 42 / 16%);
  transform: none;
}

.app-workbench .sortable-row-chosen {
  contain: paint;
}
```

Do not add `will-change` to every row because it can increase memory use for large lists.

- [ ] **Step 4: Keep draft data stable during dragging**

In both admin views:

- `reorderDraft()` replaces only the draft array;
- no API request runs from `reorderDraft()`;
- no `load()` runs after successful save;
- success updates local `sortOrder`;
- failure keeps `sortMode` true and preserves the draft array;
- `isSavingSort` disables only the save action.

Use a descending local order map:

```ts
const orderMap = new Map(
  draftItems.value.map((item, index) => [item.id, draftItems.value.length - index]),
);
```

- [ ] **Step 5: Complete persistence E2E**

Extend `admin-sorting.spec.ts`:

1. capture the first two row IDs;
2. drag row one below row two;
3. assert the DOM order changes immediately;
4. save;
5. wait for one reorder response;
6. reload;
7. assert the new order persists.

Use `page.on('request')` to count reorder requests and require exactly one request.

- [ ] **Step 6: Run focused verification**

Run:

```powershell
npm run test -w packages/web -- --run test/sortable-list.test.ts test/admin-folders-view.test.ts test/admin-links-view.test.ts
npm run build -w packages/web
npm run test:e2e -- admin-sorting.spec.ts
```

Expected:

- all focused tests pass;
- no duplicate reorder request;
- failed save retains draft order;
- web production build succeeds.

---

### Task 5: Measure, Regress And Commit

**Files:**
- Modify: `docs/quality/ui-performance-baseline.md`
- Modify: `tests/e2e/admin-sorting.spec.ts`

- [ ] **Step 1: Test realistic fixture sizes**

Create or seed:

- 100 folders for folder sorting;
- 200 links inside one folder for link sorting.

Measure:

- pointer down to first visible displacement;
- drag end to local DOM stabilization;
- save click to API completion;
- number of reorder requests.

Record the machine-specific result. The local target is first displacement under 100ms and one reorder request.

- [ ] **Step 2: Run the complete Day 1 regression**

Run:

```powershell
npm test
npm run test:blog
npm run typecheck:blog
npm run build:all
npm run test:e2e
git diff --check
git status --short
```

Expected:

- all tests, type checks and builds pass;
- Playwright passes on desktop and mobile;
- only intended files and pre-existing `design-qa*` files appear in status;
- no whitespace errors.

- [ ] **Step 3: Update the baseline document**

Add a “Day 1 Sorting Result” table with scenario, before milliseconds, after milliseconds, request count and result columns. Populate rows for first displacement and save behavior with 100 folders, then the same two rows with 200 links. Use only values from the completed measurements and explain any failed target.

- [ ] **Step 4: Commit sorting optimization**

Run:

```powershell
git add packages/web/src/components/admin/SortableList.vue packages/web/src/views/admin/FoldersView.vue packages/web/src/views/admin/LinksView.vue packages/web/src/styles.css packages/web/test/sortable-list.test.ts packages/web/test/admin-folders-view.test.ts packages/web/test/admin-links-view.test.ts tests/e2e/admin-sorting.spec.ts docs/quality/ui-performance-baseline.md
git commit -m "perf: make admin sorting responsive"
```

- [ ] **Step 5: Verify commit boundaries**

Run:

```powershell
git log -2 --oneline
git status --short
```

Expected: the newest commit subject is `perf: make admin sorting responsive` and the preceding commit subject is `test: establish ui performance baselines`.

Only the pre-existing `design-qa*` files and the uncommitted master/day plan documents may remain untracked unless the plans are intentionally included in a separate documentation commit.

---

## Day 1 Definition Of Done

- Playwright desktop/mobile skeleton exists and runs.
- Public navigation, Blog and admin sorting have smoke coverage.
- Actual baseline values and screenshots are recorded.
- Dragging does not trigger API requests.
- Folder and link sorting save through one batch request.
- Save failure preserves the draft order and supports retry.
- 100-folder and 200-link measurements are documented.
- Vue tests, Blog tests, Blog typecheck and all production builds pass.
- Two focused commits exist with clean, reviewable boundaries.
- Existing local design QA files remain untouched.

## Day 1 Stop Conditions

Do not begin Day 2 CSS/token restructuring until:

- both Day 1 commits are complete;
- all focused sorting tests pass;
- the current public/admin screenshots are stored;
- any failing full-suite test is either fixed or documented as demonstrably pre-existing;
- the worktree contains no accidental generated files or unrelated staged changes.
