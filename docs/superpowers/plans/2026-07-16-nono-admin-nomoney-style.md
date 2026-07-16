# Nono Admin NoMoney-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Nono's administration interface into the same compact, neutral, operations-focused visual system as NoMoney while preserving Nono's configurable themes, blur controls, route persistence, and zoom responsiveness.

**Architecture:** Translate NoMoney's shell proportions, typography hierarchy, bordered surfaces, compact controls, tables, drawers, and light/dark contrast into shared Vue/CSS admin primitives. Keep Nono's current view structure and business logic, using global tokens and compatibility classes to avoid rewriting every page. Use blur only on stable top-level surfaces so route changes and dragging remain smooth.

**Tech Stack:** Vue 3, Vue Router, Lucide Vue, CSS custom properties, Vitest, Vue Test Utils, Playwright.

---

## Design Contract

- Sidebar: fixed 256px desktop width, compact 40px navigation rows, icon plus label, clear selected state.
- Topbar: stable 64px minimum height with page title and compact icon actions.
- Content: centered `max-width: 1280px`, responsive 16/24px page padding.
- Surfaces: neutral white or near-black, 1px low-contrast borders, restrained shadows, 8px card radius.
- Controls: 40px standard input/button height, 32px compact button height, 36px icon button size.
- Typography: 14px body and control text, 12px metadata, 20–24px page headings, tabular/mono numerals for metrics.
- Blur: one composited topbar layer and optional page-header layer; no nested blur on tables, inputs, or draggable rows.
- Motion: 160–220ms opacity/transform transitions, disabled during sorting and under reduced-motion preference.
- Existing Nono theme settings remain authoritative for accent color, surface opacity, radius, and blur intensity.

## File Map

- Modify `packages/web/src/styles/tokens.css`: semantic admin color, dimension, and motion tokens.
- Modify `packages/web/src/styles/admin.css`: shared shell, fields, buttons, tables, badges, drawers, and responsive behavior.
- Modify `packages/web/src/components/AdminLayout.vue`: NoMoney-style shell and navigation hierarchy.
- Create `packages/web/src/components/admin/AdminPageHeader.vue`: shared page title/action surface.
- Create `packages/web/src/components/admin/AdminStateBanner.vue`: consistent success, warning, and error feedback.
- Modify all `packages/web/src/views/admin/*.vue`: adopt shared headers and remove conflicting local styling.
- Modify admin tests and E2E specifications to lock layout, zoom, and performance behavior.

### Task 1: Define the shared admin design tokens

**Files:**
- Modify: `packages/web/src/styles/tokens.css`
- Modify: `packages/web/test/visual-contract.test.ts`

- [ ] **Step 1: Add failing token contract assertions**

Require these variables:

```css
--admin-sidebar-width: 256px;
--admin-topbar-height: 64px;
--admin-content-max: 1280px;
--admin-control-height: 40px;
--admin-control-height-sm: 32px;
--admin-icon-button-size: 36px;
--admin-radius-card: 8px;
--admin-radius-control: 8px;
--admin-motion-fast: 160ms;
--admin-motion-standard: 200ms;
```

- [ ] **Step 2: Add light and dark semantic colors**

Define background, surface, elevated surface, border, strong border, primary text, muted text, accent, danger, success, and warning variables. Map accent values to Nono's existing theme variables rather than hard-coding NoMoney's brand color.

- [ ] **Step 3: Run the visual contract test**

```powershell
npm run test -w packages/web -- visual-contract.test.ts
```

Expected: PASS after all required variables exist.

- [ ] **Step 4: Commit tokens**

```bash
git add packages/web/src/styles/tokens.css packages/web/test/visual-contract.test.ts
git commit -m "style(admin): define compact workspace tokens"
```

### Task 2: Rebuild the persistent admin shell

**Files:**
- Modify: `packages/web/src/components/AdminLayout.vue`
- Modify: `packages/web/src/styles/admin.css`
- Modify: `packages/web/test/admin-layout-appearance.test.ts`
- Modify: `packages/web/test/admin-performance-contract.test.ts`

- [ ] **Step 1: Write shell layout tests**

Assert that the shell contains one persistent sidebar, one topbar, one route stage, 40px navigation rows, and no route-keyed wrapper that remounts the entire shell.

- [ ] **Step 2: Match NoMoney's shell proportions**

Use:

```css
.workbench-sidebar { width: var(--admin-sidebar-width); }
.workbench-main { margin-left: var(--admin-sidebar-width); min-width: 0; }
.workbench-topbar { min-height: var(--admin-topbar-height); }
.workbench-stage { margin: 0 auto; max-width: var(--admin-content-max); padding: 16px 24px 28px; }
```

- [ ] **Step 3: Refine navigation states**

Selected navigation uses a strong neutral foreground/background pair. Inactive rows use muted text and a subtle hover surface. Keep Lucide icons at 17px and avoid text-only decorative pills.

- [ ] **Step 4: Preserve smooth route changes**

Keep the persistent parent route and `RouterView` structure. Do not add enter/leave transitions around the complete route stage. Disable layout transitions while the sidebar is opening or closing on mobile.

- [ ] **Step 5: Run shell and performance tests**

```powershell
npm run test -w packages/web -- admin-layout-appearance.test.ts admin-performance-contract.test.ts app-route-transition.test.ts
```

- [ ] **Step 6: Commit the shell**

```bash
git add packages/web/src/components/AdminLayout.vue packages/web/src/styles/admin.css packages/web/test
git commit -m "style(admin): align the shell with NoMoney"
```

### Task 3: Add shared page headers and feedback banners

**Files:**
- Create: `packages/web/src/components/admin/AdminPageHeader.vue`
- Create: `packages/web/src/components/admin/AdminStateBanner.vue`
- Create: `packages/web/test/admin-page-header.test.ts`
- Create: `packages/web/test/admin-state-banner.test.ts`

- [ ] **Step 1: Write component tests**

Test title, optional eyebrow, description, action slot, all feedback tones, and accessible live-region behavior.

- [ ] **Step 2: Implement `AdminPageHeader`**

Use semantic markup and slots:

```vue
<header class="admin-page-header">
  <div class="admin-page-heading">
    <p v-if="eyebrow" class="admin-page-eyebrow">{{ eyebrow }}</p>
    <h1>{{ title }}</h1>
    <p v-if="description" class="admin-page-description">{{ description }}</p>
  </div>
  <div v-if="$slots.actions" class="admin-page-actions"><slot name="actions" /></div>
</header>
```

- [ ] **Step 3: Implement `AdminStateBanner`**

Use Lucide status icons and `role="status"` or `role="alert"` according to tone. Keep banners compact and within normal document flow.

- [ ] **Step 4: Run component tests**

```powershell
npm run test -w packages/web -- admin-page-header.test.ts admin-state-banner.test.ts
```

- [ ] **Step 5: Commit shared components**

```bash
git add packages/web/src/components/admin packages/web/test
git commit -m "feat(admin): add shared page and feedback surfaces"
```

### Task 4: Unify controls, fields, and actions

**Files:**
- Modify: `packages/web/src/styles/admin.css`
- Modify: `packages/web/test/visual-contract.test.ts`

- [ ] **Step 1: Add control contract tests**

Require visible borders, 40px input/select/textarea controls, 8px radius, 14px text, focus ring, disabled state, and error state. Require 36px square icon buttons with no layout shift on hover.

- [ ] **Step 2: Consolidate field styles**

Make `.field`, `.inline-link-input`, `.inline-link-select`, `.admin-search-input`, and configuration inputs consume the same semantic variables. Remove view-level border and focus declarations that conflict with global controls.

- [ ] **Step 3: Consolidate buttons**

Support primary, secondary, ghost, success, and danger variants with stable dimensions. Use icon-only buttons for edit, save, delete, reorder, visibility, and close actions; retain icon plus text for clear commands such as creating and saving.

- [ ] **Step 4: Standardize toggles and checkboxes**

Use actual checkbox/toggle controls with a 16–18px hit target inside a minimum 36px row. Do not represent binary settings as text pills.

- [ ] **Step 5: Run the visual contract**

```powershell
npm run test -w packages/web -- visual-contract.test.ts
```

- [ ] **Step 6: Commit control styling**

```bash
git add packages/web/src/styles/admin.css packages/web/test/visual-contract.test.ts
git commit -m "style(admin): unify controls and action states"
```

### Task 5: Unify tables, lists, and sorting states

**Files:**
- Modify: `packages/web/src/styles/admin.css`
- Modify: `packages/web/src/components/admin/SortableList.vue`
- Modify: `packages/web/test/sortable-list.test.ts`
- Modify: `packages/web/test/admin-performance-contract.test.ts`

- [ ] **Step 1: Add stable table geometry tests**

Require fixed header/row grid tracks, minimum row heights, reserved action-column width, text truncation without three-dot ellipsis where existing Nono behavior requires hard clipping, and mobile card conversion below 760px.

- [ ] **Step 2: Apply NoMoney table density**

Use compact rows, low-contrast dividers, 12px metadata, 14px primary cells, and neutral hover states. Keep sortable handles in a dedicated fixed-width column so dragging does not resize rows.

- [ ] **Step 3: Protect drag performance**

While `[data-dragging='true']`, disable transitions and backdrop filters on the list, apply `contain: paint` to rows, and preserve the existing SortableJS fallback behavior.

- [ ] **Step 4: Run sorting tests**

```powershell
npm run test -w packages/web -- sortable-list.test.ts admin-performance-contract.test.ts
```

- [ ] **Step 5: Commit table primitives**

```bash
git add packages/web/src/styles/admin.css packages/web/src/components/admin/SortableList.vue packages/web/test
git commit -m "style(admin): standardize dense data tables"
```

### Task 6: Convert simple administration pages

**Files:**
- Modify: `packages/web/src/views/admin/AdminDashboard.vue`
- Modify: `packages/web/src/views/admin/SiteConfigView.vue`
- Modify: `packages/web/src/views/admin/LlmView.vue`
- Modify: `packages/web/src/views/admin/AccountView.vue`
- Modify: `packages/web/src/views/admin/TokensView.vue`
- Modify: `packages/web/src/views/admin/UsersView.vue`
- Modify: corresponding tests under `packages/web/test/`

- [ ] **Step 1: Replace local page-title blocks with `AdminPageHeader`**

Move page commands into the action slot and keep explanatory text under the title rather than in separate feature cards.

- [ ] **Step 2: Flatten page sections**

Avoid cards inside cards. Use one page header followed by unframed section bands or individual operational panels. Keep settings forms aligned to a shared two-column grid that collapses at 900px.

- [ ] **Step 3: Normalize feedback states**

Replace page-specific error/success boxes with `AdminStateBanner`. Preserve current API behavior and test selectors.

- [ ] **Step 4: Run the affected view tests**

```powershell
npm run test -w packages/web -- site-config-view.test.ts admin-llm-view.test.ts admin-tokens-view.test.ts
```

- [ ] **Step 5: Commit simple pages**

```bash
git add packages/web/src/views/admin packages/web/test
git commit -m "style(admin): convert settings pages to the shared workspace"
```

### Task 7: Convert folder, bookmark, and Notab management

**Files:**
- Modify: `packages/web/src/views/admin/FoldersView.vue`
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Modify: `packages/web/src/views/admin/NotabsView.vue`
- Modify: `packages/web/src/components/admin/FolderIconPicker.vue`
- Modify: `packages/web/src/components/admin/BookmarkTransferPanel.vue`
- Modify: related tests under `packages/web/test/`

- [ ] **Step 1: Preserve existing workflows before visual changes**

Lock tests for category selection, folder selection, edit/save mode, bulk selection, direct folder transfer, Notab sorting, icon picker, and new-folder creation.

- [ ] **Step 2: Apply one hierarchy across the three pages**

Use page header, category filter row, folder filter row where applicable, bulk-action toolbar, then the data table. Keep selectors above the table and editing controls within the affected row.

- [ ] **Step 3: Make action columns consistent**

Use the same edit, save, cancel, open, move, and delete icon order across folder, bookmark, and Notab rows. Reserve fixed action width at every breakpoint.

- [ ] **Step 4: Keep icon selection as a popover/modal**

The icon picker must remain a compact trigger plus popup grid, not expand into multiple inline rows.

- [ ] **Step 5: Run management tests**

```powershell
npm run test -w packages/web -- admin-folders-view.test.ts admin-links-view.test.ts admin-notabs-view.test.ts folder-icon-picker.test.ts
```

- [ ] **Step 6: Commit management pages**

```bash
git add packages/web/src/views/admin packages/web/src/components/admin packages/web/test
git commit -m "style(admin): unify organization management pages"
```

### Task 8: Integrate themes, blur, and dark mode

**Files:**
- Modify: `packages/web/src/styles/admin.css`
- Modify: `packages/web/src/components/admin/AppearanceEditor.vue`
- Modify: `packages/web/src/utils/appearance.ts`
- Modify: `packages/web/test/appearance.test.ts`
- Modify: `packages/web/test/admin-layout-appearance.test.ts`

- [ ] **Step 1: Add theme-mapping tests**

Verify that accent, card opacity, control opacity, radius, and blur settings update admin semantic variables without removing visible borders or reducing text contrast.

- [ ] **Step 2: Limit blur to stable layers**

Allow blur on the topbar and optional page header only. Use opaque or alpha surfaces for sidebar, tables, forms, modals, and draggable rows. During slider interaction, keep the existing preview blur suspension.

- [ ] **Step 3: Align light and dark themes**

Light mode uses slate-50 style canvas and white surfaces. Dark mode uses near-black canvas and neutral elevated surfaces. Accent colors remain theme-driven and are not converted into a one-hue interface.

- [ ] **Step 4: Run appearance tests**

```powershell
npm run test -w packages/web -- appearance.test.ts admin-layout-appearance.test.ts admin-performance-contract.test.ts
```

- [ ] **Step 5: Commit theme integration**

```bash
git add packages/web/src/styles/admin.css packages/web/src/components/admin/AppearanceEditor.vue packages/web/src/utils/appearance.ts packages/web/test
git commit -m "style(admin): integrate themes with the compact workspace"
```

### Task 9: Verify zoom, mobile layout, and visual consistency

**Files:**
- Create: `tests/e2e/admin-responsive-layout.spec.ts`
- Modify: `playwright.config.ts` only if the existing server command cannot start reliably.
- Modify: `design-qa.md`

- [ ] **Step 1: Add responsive geometry assertions**

Test effective widths corresponding to common browser zoom levels from a 1440px desktop:

```ts
const widths = [1440, 1152, 960, 823, 720];
```

At each width assert no document-level horizontal scroll, aligned field edges, visible action columns, and a content area that consumes available space without a large empty right gutter.

- [ ] **Step 2: Test mobile navigation**

At `390x844`, verify the sidebar becomes a drawer, overlay click closes it, page titles do not overlap actions, and tables use the existing mobile-card form.

- [ ] **Step 3: Capture visual QA states**

Capture dashboard, folders, bookmarks, Notabs, site settings, and LLM settings in light and dark modes at desktop and mobile widths. Compare spacing, control heights, borders, and alignment against NoMoney's shell and component language.

- [ ] **Step 4: Run full Web verification**

```powershell
npm run test -w packages/web
npm run build -w packages/web
npx playwright test tests/e2e/admin-responsive-layout.spec.ts
git diff --check
```

Expected: all commands exit 0 and screenshots contain no overlaps or empty right-side layout gaps.

- [ ] **Step 5: Commit responsive QA**

```bash
git add tests/e2e/admin-responsive-layout.spec.ts design-qa.md packages/web
git commit -m "test(admin): verify responsive workspace consistency"
```

### Task 10: Combined deployment acceptance

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run all affected suites**

```powershell
npm run test:gateway
npm run test:nomoney
npm run test -w packages/server
npm run test -w packages/web
npm run build:all
git diff --check
```

- [ ] **Step 2: Build the one-image deployment**

```powershell
docker compose build app
docker compose up -d
docker compose ps
```

- [ ] **Step 3: Verify public and authenticated flows**

Check `/`, `/admin`, `/nomoney`, `/nomoney/dashboard`, `/nodesk`, `/healthz`, and `/nomoney/api/health`. Verify Nono route changes have no black flash, Notab switching has no folder flicker, and NoMoney login/data remain functional.

- [ ] **Step 4: Document the shared design system**

Record shell dimensions, control sizes, theme mapping, blur policy, and responsive breakpoints in `README.md` so future admin pages use the same rules.

- [ ] **Step 5: Commit final documentation**

```bash
git add README.md
git commit -m "docs: document the unified Nono workspace design"
```
