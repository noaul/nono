# Retire Clipper and harden operations Implementation Plan

> **For agentic workers:** Execute the independently owned task groups with test-driven development, review each diff, and perform a whole-change review before pushing. User explicitly requested execution, push and nc48 deployment; no additional scope approval is needed for the approved design.

**Goal:** Remove clipping including its live data and deploy the remaining operational improvements safely.

**Architecture:** Retire the clipping vertical while retaining normal bookmarks. Use database migration state for deploy gates and offline snapshots for rollback. Separate backup request lifetimes from job lifetimes.

**Tech Stack:** Node 22+, TypeScript, Fastify, Vue, React/Next, PostgreSQL/Prisma, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-05-retire-clipper-design.md`

## Global Constraints

- Historical migrations stay immutable; deletion requires a new migration.
- No production writes until tests, review and safety backup are complete.
- Preserve nc48 local environment files and unrelated services/data.
- No clipping functionality or ordinary-user entry points remain; normal bookmarks remain.
- Agents own disjoint files and must not commit, push, deploy, or spawn other agents.
- Root owns integration, review, commits and deployment.

## Task 1: Retire server/data/build clipping integration (root)

**Files:** `packages/server/src/app.ts`, clipping routes/services/tests, `packages/server/prisma/schema.prisma`, new retirement migration, token scopes, `apps/clipper`, root build/test config, README and notices.

- [ ] Add behavioral tests asserting retired API returns 404, issued token scopes exclude clips and backup bundles exclude clipping. Run and observe failures.
- [ ] Delete clipping-only sources, remove registration and static routing, remove current Prisma models; retain historical migrations and introduce ordered table deletion plus stored-scope cleanup.
- [ ] Remove clipping app and root/Docker/Playwright/acceptance wiring and dependencies; update docs.
- [ ] Generate Prisma client; run server and contract tests and production typechecks.

## Task 2: Retire client/extension entry points and isolate artifacts

**Files:** `packages/extension/**`, `packages/web/**`, NoDesk clipping integration in `apps/blog/**` except backup-center component.

- [ ] Add failing behavioral tests that context menus and extension workflow expose bookmarks only, and navigation/search do not expose clipping.
- [ ] Remove clipping extraction, settings and extension controls while retaining bookmark capture/AI; remove NoDesk clipping calls and token selection controls.
- [ ] Run package tests with a unique temporary artifact output: `mkdtemp`, package with explicit output argument, assert archive contents, clean that exact directory.
- [ ] Run extension, Vue and NoDesk focused tests. Report changed files and test output.

## Task 3: Deployment gate, offline snapshot and rollback safety

**Files:** `scripts/deploy-compose.mjs`, `scripts/restore-compose.mjs`, new deployment helpers, `tests/deploy-compose.test.mjs`, `tests/restore-compose.test.mjs`, deployment docs.

- [ ] Reproduce gate bypass with two calls where pull updates HEAD on the first blocked run; ensure both refuse pending destructive migrations without approval.
- [ ] Read `_prisma_migrations` from the actual database/container; compare pending checked-in migrations. Missing state on existing installs is an error.
- [ ] Test build precedes stop, stop precedes snapshot, and acceptance cannot expose new writes before a rollback decision.
- [ ] Implement temporary maintenance/public-ingress protection, immutable previous image selection, rollback on every post-stop failure and explicit errors if recovery fails.
- [ ] Run behavioral deployment/restore tests with injected Docker and acceptance boundaries; document maintenance and data recovery semantics.

## Task 4: Backup job lifecycle and concurrency

**Files:** backup-center routes/service and tests, new job service/tests, `apps/blog/src/app/(home)/ambient-backup-center.tsx` and its direct clients/tests.

- [ ] Test immediate 202 acceptance while an operation remains deferred; completion/failure polling; same request id deduplication; concurrent restore rejection; admin-session authorization.
- [ ] Implement bounded job records, authenticated polling/result download, interruption semantics and operation exclusion. Preserve existing adapter behavior and remove retired Clipper module from backup-center service.
- [ ] Update backup UI to submit/poll/display terminal state without interpreting request timeout as operation failure.
- [ ] Run focused server/UI tests. Root removes clipper adapter in the separate adapter file.

## Task 5: Integration gate, review, push and deployment

**Files:** new integration tests/runner, CI workflow and root scripts; docs.

- [ ] Run real PostgreSQL fresh and upgrade migrations plus API tenant-isolation/retired-route tests in a disposable database or container, requiring an explicit test-only target.
- [ ] Run all remaining unit/contract tests, typechecks, lint/build checks and browser smoke tests; resolve failures rather than weakening assertions.
- [ ] Independent review of the final diff; fix significant findings and rerun tests.
- [ ] Commit and push verified revision, preserving remote user changes.
- [ ] Verify full backup on nc48, deploy with explicit migration approval and maintenance isolation, verify health/routes and absence of clipping tables; report revision and recovery backup.
