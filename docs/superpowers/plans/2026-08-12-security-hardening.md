# Nono Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed cross-application content, identity, credential, deployment, and request-integrity risks while preserving existing product behavior.

**Architecture:** Treat browser sessions, API tokens, and internal service credentials as separate trust classes. Keep stored secrets server-side, enforce durable database invariants for initialization, sanitize untrusted content before React parsing, and make deployment rollback restore both code and data.

**Tech Stack:** Fastify, Prisma/PostgreSQL, React/Next.js, Zustand, Node.js deployment scripts, Vitest, Node test runner, Playwright, GitHub Actions.

---

### Task 1: Sanitize Nodesk Markdown

**Files:**
- Modify: `apps/blog/src/lib/markdown-renderer.ts`
- Modify: `apps/blog/src/hooks/use-markdown-render.tsx`
- Modify: `apps/blog/next.config.ts`
- Modify: `apps/blog/package.json`
- Test: `apps/blog/tests/markdown-security.test.mts`

- [x] Add failing tests proving raw frames, active elements, event attributes, and unsafe URL schemes are removed before React parsing.
- [x] Add a maintained HTML sanitizer with an explicit Markdown allowlist and sanitize the final rendered HTML.
- [x] Remove production `script-src 'unsafe-inline'` and same-origin frame permission that is not required by embedded video support.
- [x] Run Blog tests, typecheck, and build.

### Task 2: Protect Identity State

**Files:**
- Modify: `packages/server/src/routes/admin/users.ts`
- Modify: `packages/server/src/services/repository.ts`
- Modify: `packages/server/src/services/prisma.repository.ts`
- Modify: `packages/server/src/plugins/auth.ts`
- Modify: `packages/server/src/routes/passkeys.ts`
- Modify: `packages/server/src/routes/admin/tokens.ts`
- Test: `packages/server/test/app.test.ts`
- Test: `packages/server/test/account-security.test.ts`

- [x] Add failing tests for last-admin demotion and Bearer access to identity-management routes.
- [x] Reject last-admin demotion atomically in both repository implementations.
- [x] Add browser-session-only authentication and apply it to Passkey and API-token mutation routes.
- [x] Run focused and complete server tests.

### Task 3: Keep NoStar Secrets Server-Side

**Files:**
- Modify: `packages/server/src/routes/nostar/config-routes.ts`
- Modify: `apps/nostar/src/services/backendAdapter.ts`
- Modify: `apps/nostar/src/store/useAppStore.ts`
- Test: `packages/server/test/nostar-routes.test.ts`
- Test: `apps/nostar/src/services/backendAdapter.test.ts`
- Test: `apps/nostar/src/store/useAppStore.test.ts`

- [x] Add failing tests showing the browser cannot request decrypted secrets and persisted snapshots contain no credentials.
- [x] Remove the `decrypt=true` client contract and always return masked secret metadata.
- [x] Exclude GitHub, AI, embedding, WebDAV, vector, proxy, and RPC credentials from persistence; scrub legacy hydration state.
- [x] Run NoStar tests, lint, typecheck, and build.

### Task 4: Restore Data on Deployment Rollback

**Files:**
- Modify: `scripts/deploy-compose.mjs`
- Test: `tests/deploy-compose.test.mjs`

- [x] Add failing tests requiring a captured safety-backup ID and restoration before the old image is accepted.
- [x] Add migration-gate cases for table rename, `DROP INDEX`, and data-rewriting `UPDATE` statements.
- [x] Restore the backup on failed acceptance while application writers are stopped, then start and verify the previous image.
- [x] Run deployment and gateway contract tests.

### Task 5: Enforce Request and Secret Boundaries

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `apps/nomoney/backend/src/app.ts`
- Modify: `packages/server/prisma/seed.ts`
- Modify: `packages/server/src/scripts/migrate-from-json.ts`
- Modify: `apps/nomoney/backend/src/index.ts`
- Modify: `docker/gateway-routing.mjs`
- Test: corresponding server, NoMoney, and gateway tests

- [x] Add failing tests for missing or mismatched Origin on cookie-authenticated writes.
- [x] Require exact configured Origin for browser mutations while leaving Bearer requests outside CSRF handling.
- [x] Reject absent, weak, or example production secrets and remove fixed migration/seed passwords.
- [x] Block public routing to internal API paths.
- [x] Run server, NoMoney, and gateway tests.

### Task 6: Restore Automatic Quality Gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/e2e/*.smoke.spec.ts`
- Modify: `package.json`
- Modify: `README.md`

- [x] Trigger CI for pull requests and protected-branch pushes.
- [x] Replace retired CSS-class assertions with stable accessible or test identifiers.
- [x] Add a reproducible dependency bootstrap command that installs independent Blog, NoMoney, and NoStar locks.
- [x] Run all tests, lint, typechecks, builds, audits, and a final worktree diff check.
