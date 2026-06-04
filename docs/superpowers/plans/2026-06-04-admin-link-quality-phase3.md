# Admin Link Quality Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a practical admin link health workflow so operators can scan selected or visible links and quickly find invalid, broken, or slow URLs.

**Architecture:** Keep this phase schema-free to avoid migration risk. The server exposes an on-demand health-check endpoint that checks existing links and returns transient results; the web admin Links page displays the results in a compact operations panel and keeps bulk selection state from Phase 2.

**Tech Stack:** Fastify, Repository abstraction, Node fetch/AbortController, Vue 3, TypeScript, Vitest, Vue Test Utils, jsdom.

---

## Scope

Included:
- `POST /api/admin/links/health-check` accepts optional `ids` and returns summary + per-link result rows.
- Invalid URLs are classified without network calls.
- HTTP status codes under 400 are `ok`; 400+ are `broken`; aborts are `timeout`.
- LinksView can health-check selected links or current filtered folder links.
- Health results render in a dedicated `.health-check-panel`.

Excluded:
- Persisting health status to the database.
- Background scheduler.
- External uptime monitoring.

## Files

- Create: `packages/server/src/services/link-health.service.ts`
- Modify: `packages/server/src/routes/admin/links.ts`
- Modify: `packages/server/test/app.test.ts`
- Modify: `packages/web/src/api/types.ts`
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Modify: `packages/web/src/styles.css`
- Modify: `packages/web/test/admin-links-view.test.ts`
- Modify: `packages/web/test/visual-contract.test.ts`

---

### Task 1: Server Link Health Endpoint

- [ ] **Step 1: Write failing server test**

Add a test to `packages/server/test/app.test.ts` that creates three links, mocks `globalThis.fetch`, calls `POST /api/admin/links/health-check`, and expects one `ok`, one `broken`, and one `invalid` result.

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: FAIL with the health-check route missing.

- [ ] **Step 2: Implement `checkLinksHealth`**

Create `packages/server/src/services/link-health.service.ts` with:
- `LinkHealthResult`
- `LinkHealthSummary`
- `checkLinksHealth(links, fetchImpl = fetch)`
- `checkOneLink(link, fetchImpl)`

The service should:
- Use `new URL(link.url)` and require `http` or `https`.
- Use `HEAD`, falling back to `GET` when needed.
- Abort after a short timeout.
- Return stable status strings: `ok`, `broken`, `timeout`, `invalid`.

- [ ] **Step 3: Add admin route**

In `packages/server/src/routes/admin/links.ts`, add `POST /api/admin/links/health-check` before `/:id` routes:
- Require auth.
- Read optional `ids`.
- Load `repo.listLinks(user.id)`.
- If `ids` is non-empty, filter to those ids.
- Return `{ summary, results }` from `checkLinksHealth`.

- [ ] **Step 4: Verify server**

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add packages/server/src/services/link-health.service.ts packages/server/src/routes/admin/links.ts packages/server/test/app.test.ts
git commit -m "feat(server): add link health checks"
git push origin main
```

---

### Task 2: Links Page Health UI

- [ ] **Step 1: Write failing web test**

Extend `packages/web/test/admin-links-view.test.ts`:
- Mock two folders and two links.
- Select one link.
- Click `[data-testid="check-link-health"]`.
- Expect `/api/admin/links/health-check` with `POST`.
- Expect UI text `健康检查` and the broken link name.

Run:

```powershell
npm.cmd run test -w packages/web -- admin-links-view.test.ts
```

Expected: FAIL because the health UI is missing.

- [ ] **Step 2: Add API types**

In `packages/web/src/api/types.ts`, add:

```ts
export interface LinkHealthResult {
  id: number;
  name: string;
  url: string;
  status: 'ok' | 'broken' | 'timeout' | 'invalid';
  statusCode?: number;
  reason?: string;
  checkedAt: string;
}

export interface LinkHealthSummary {
  total: number;
  ok: number;
  broken: number;
  timeout: number;
  invalid: number;
}
```

- [ ] **Step 3: Add LinksView health state and action**

In `packages/web/src/views/admin/LinksView.vue`:
- Import the new types.
- Add `healthResults`, `healthSummary`, and `isCheckingHealth`.
- Add `checkLinkHealth()` that uses selected ids when present, otherwise uses `filteredLinks`.
- Render a button `data-testid="check-link-health"`.
- Render `.health-check-panel` with summary and per-link result rows.

- [ ] **Step 4: Add styles**

In `packages/web/src/styles.css`, add:
- `.health-check-panel`
- `.health-summary`
- `.health-result-row`
- `.status-ok`, `.status-broken`, `.status-timeout`, `.status-invalid`

- [ ] **Step 5: Verify web**

Run:

```powershell
npm.cmd run test -w packages/web -- admin-links-view.test.ts
npm.cmd run test -w packages/web
```

Expected: PASS.

- [ ] **Step 6: Commit and push**

```powershell
git add packages/web/src/api/types.ts packages/web/src/views/admin/LinksView.vue packages/web/src/styles.css packages/web/test/admin-links-view.test.ts
git commit -m "feat(web): add link health workflow"
git push origin main
```

---

### Task 3: Phase 3 Visual Contract and Verification

- [ ] **Step 1: Add visual contract**

In `packages/web/test/visual-contract.test.ts`, assert `src/styles.css` contains `.health-check-panel` and `.health-result-row`.

- [ ] **Step 2: Run full verification**

```powershell
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Commit and push**

```powershell
git add packages/web/test/visual-contract.test.ts
git commit -m "test(web): cover link health styles"
git push origin main
```

---

## Acceptance Checklist

- Admin can scan selected links.
- Admin can scan current filtered folder links without selecting rows.
- Invalid URL rows are reported without network calls.
- Tests and production build pass.
