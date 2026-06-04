# Public Navigation Polish Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public navigation page feel consistent with the improved admin folder tree and smoother search flow.

**Architecture:** Keep the existing navigation API response shape. The web app derives folder depth and parent labels from the flat folder list, renders tree-aware tabs/cards, and adds a clear local-search result summary and empty state.

**Tech Stack:** Vue 3, Pinia, Vue Router, TypeScript, Vitest, Vue Test Utils, jsdom.

---

## Scope

Included:
- Public folder tabs and folder cards expose tree depth with CSS variables.
- Child folders show their parent context on cards.
- Search mode shows local result count.
- Empty local search state tells the user that pressing Enter will search externally.
- Visual contracts lock in public tree/search classes.

Excluded:
- Changing the navigation API schema.
- Drag-and-drop public layout editing.
- Persisting search history.

## Files

- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/src/components/FolderCard.vue`
- Create: `packages/web/test/navigation-page.test.ts`
- Modify: `packages/web/test/visual-contract.test.ts`

---

### Task 1: Public Navigation Tree Helpers

- [ ] **Step 1: Write failing navigation page test**

Create `packages/web/test/navigation-page.test.ts`:
- Mock `@/api/client` to return a site, parent folder, child folder, and links.
- Mount `NavigationPage` with a fake route param.
- Expect `[data-testid="public-folder-card-2"]` style to contain `--public-folder-depth: 1`.
- Enter a search term that matches only one link.
- Expect text `站内命中 1 个链接`.

Run:

```powershell
npm.cmd run test -w packages/web -- navigation-page.test.ts
```

Expected: FAIL because tree depth and search summary are missing.

- [ ] **Step 2: Implement NavigationPage helpers**

In `packages/web/src/views/NavigationPage.vue`:
- Add `folderDepth(folder)`.
- Add `parentFolderName(folder)`.
- Add `localMatchCount`.
- Pass `depth` and `parentName` to `FolderCard`.
- Add `data-testid="public-folder-card-${folder.id}"` to the `FolderCard` usage via wrapper props or component root attributes.
- Render `.search-result-summary`.
- Render `.public-empty-state` when no folder has matching links.

- [ ] **Step 3: Verify navigation test**

```powershell
npm.cmd run test -w packages/web -- navigation-page.test.ts
```

Expected: PASS.

---

### Task 2: FolderCard Tree Presentation

- [ ] **Step 1: Update FolderCard props**

In `packages/web/src/components/FolderCard.vue`:
- Add optional props `depth?: number` and `parentName?: string`.
- Bind root style with `--public-folder-depth`.
- Render parent context as `.folder-parent-label` when present.

- [ ] **Step 2: Add focused component test**

Extend `packages/web/test/visual-contract.test.ts` or `navigation-page.test.ts` to mount `FolderCard` with `depth: 1` and `parentName: 'Parent'`, then expect the parent label and style variable.

- [ ] **Step 3: Verify web**

```powershell
npm.cmd run test -w packages/web
```

Expected: PASS.

- [ ] **Step 4: Commit and push**

```powershell
git add packages/web/src/views/NavigationPage.vue packages/web/src/components/FolderCard.vue packages/web/test/navigation-page.test.ts
git commit -m "feat(web): polish public folder tree search"
git push origin main
```

---

### Task 3: Phase 5 Visual Contract and Final Verification

- [ ] **Step 1: Add visual contract**

In `packages/web/test/visual-contract.test.ts`, assert:
- `NavigationPage.vue` contains `search-result-summary`.
- `FolderCard.vue` contains `--public-folder-depth`.
- `FolderCard.vue` contains `folder-parent-label`.

- [ ] **Step 2: Run full verification**

```powershell
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Commit and push**

```powershell
git add packages/web/test/visual-contract.test.ts
git commit -m "test(web): cover public navigation polish"
git push origin main
```

---

## Acceptance Checklist

- Public navigation reflects admin folder parent relationships.
- Search mode communicates local match count.
- Empty search state clearly explains the external search fallback.
- Tests and production build pass.
