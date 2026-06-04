# Admin Token Governance Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make API Token management safer and more transparent by rejecting expired tokens at creation time and showing active, expired, and non-expiring token counts in the admin UI.

**Architecture:** Keep the existing `ApiToken` model. Add server-side expiry validation and a summary endpoint derived from `repo.listTokens`, then update `TokensView` to show a compact operations dashboard and revoke tokens locally after successful deletion.

**Tech Stack:** Fastify, Zod, Repository abstraction, Vue 3, TypeScript, Vitest, Vue Test Utils, jsdom.

---

## Scope

Included:
- Reject `expiresAt` values in the past.
- `GET /api/admin/tokens/summary` returns `total`, `active`, `expired`, `neverExpires`, and `expiringSoon`.
- Tokens page displays the summary.
- Tokens page provides quick expiry presets and local deletion after revoke.

Excluded:
- Token scopes.
- Database schema changes.
- Audit log persistence.

## Files

- Modify: `packages/server/src/routes/admin/tokens.ts`
- Modify: `packages/server/test/app.test.ts`
- Modify: `packages/web/src/api/types.ts`
- Modify: `packages/web/src/views/admin/TokensView.vue`
- Create: `packages/web/test/admin-tokens-view.test.ts`
- Modify: `packages/web/src/styles.css`
- Modify: `packages/web/test/visual-contract.test.ts`

---

### Task 1: Server Token Summary and Expiry Guard

- [ ] **Step 1: Write failing server test**

Add a test to `packages/server/test/app.test.ts`:
- Create one token without expiry.
- Try to create one token with `expiresAt` in the past and expect 400.
- Create one token with a future expiry.
- Call `GET /api/admin/tokens/summary`.
- Expect `total: 2`, `active: 2`, `neverExpires: 1`, `expired: 0`.

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: FAIL because summary route and expiry guard are missing.

- [ ] **Step 2: Implement expiry guard and summary helper**

In `packages/server/src/routes/admin/tokens.ts`:
- Add `assertFutureExpiry(expiresAt: Date | null)`.
- Add `summarizeTokens(tokens)`.
- Use the guard in `POST /api/admin/tokens`.
- Add `GET /api/admin/tokens/summary`.

- [ ] **Step 3: Verify server**

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit and push**

```powershell
git add packages/server/src/routes/admin/tokens.ts packages/server/test/app.test.ts
git commit -m "feat(server): add token governance summary"
git push origin main
```

---

### Task 2: Tokens Page Governance UI

- [ ] **Step 1: Write failing web test**

Create `packages/web/test/admin-tokens-view.test.ts`:
- Mock `GET /api/admin/tokens` and `GET /api/admin/tokens/summary`.
- Expect summary labels in the UI.
- Choose a quick expiry preset.
- Submit create token and expect `/api/admin/tokens` POST.
- Delete a token and expect the row removed without a full reload.

Run:

```powershell
npm.cmd run test -w packages/web -- admin-tokens-view.test.ts
```

Expected: FAIL because the summary UI and local revoke are missing.

- [ ] **Step 2: Add token API types**

In `packages/web/src/api/types.ts`, add `ApiToken` and `ApiTokenSummary` interfaces.

- [ ] **Step 3: Update TokensView**

In `packages/web/src/views/admin/TokensView.vue`:
- Use shared API types.
- Load tokens and summary together.
- Add quick expiry presets: never, 7 days, 30 days, 90 days.
- Render `.token-summary-grid`.
- After create, show the one-time token and refresh.
- After delete, remove locally and refresh summary.

- [ ] **Step 4: Add styles and verify**

Add `.token-summary-grid` and `.token-created-secret` styles to `packages/web/src/styles.css`.

Run:

```powershell
npm.cmd run test -w packages/web -- admin-tokens-view.test.ts
npm.cmd run test -w packages/web
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add packages/web/src/api/types.ts packages/web/src/views/admin/TokensView.vue packages/web/src/styles.css packages/web/test/admin-tokens-view.test.ts
git commit -m "feat(web): add token governance console"
git push origin main
```

---

### Task 3: Phase 4 Verification

- [ ] **Step 1: Add visual contract**

In `packages/web/test/visual-contract.test.ts`, assert `src/styles.css` contains `.token-summary-grid` and `.token-created-secret`.

- [ ] **Step 2: Run verification**

```powershell
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Commit and push**

```powershell
git add packages/web/test/visual-contract.test.ts
git commit -m "test(web): cover token governance styles"
git push origin main
```

---

## Acceptance Checklist

- Expired tokens cannot be created.
- Token summary accurately reflects active and non-expiring tokens.
- Token UI communicates one-time token visibility.
- Tests and production build pass.
