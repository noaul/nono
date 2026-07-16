# MoneyPulse Full-Stack Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor MoneyPulse into a more robust full-stack personal finance operations app with stronger backend data contracts and a redesigned dark-first frontend workspace.

**Architecture:** Backend work comes first so the redesigned UI can rely on stable query, validation, and dashboard contracts. Frontend work then builds a compact data-workbench component layer and replaces pages incrementally. Verification runs after every backend contract change and again after the full UI pass.

**Tech Stack:** Node.js, Express, TypeScript, sql.js, Zod, Vitest, Supertest, React 18, Vite, TailwindCSS 3, Recharts, lucide-react.

---

## Design Read

Reading this as: a single-user financial operations app for technical owners, with a dark-first compact data-workbench language, leaning toward a restrained Geist/Linear-style admin surface rather than a marketing layout.

## Execution Policy

- Work on a branch named `codex/moneypulse-fullstack-refactor`.
- Keep existing route slugs and API paths stable unless a new endpoint is additive.
- Use TDD for backend behavior changes: write the failing Vitest/Supertest case first, run it, implement, rerun.
- For frontend, preserve current product structure while replacing the visual system and interaction states.
- Update `progress.md` after each phase and record meaningful discoveries in `findings.md`.
- Do not commit secrets, `.env`, `data/`, `node_modules/`, `dist/`, or generated SQLite files.

## Current Files Map

- `backend/src/app.ts`: API route registration and static app boundary.
- `backend/src/auth.ts`: setup/login/logout/me/password routes.
- `backend/src/assets.ts`: generic asset route implementation and asset mapping.
- `backend/src/expenses.ts`: expense CRUD.
- `backend/src/dashboard.ts`: summary and due-item APIs.
- `backend/src/settings.ts`: reminder, mail, and account settings APIs.
- `backend/src/reminders.ts`: reminder scanning, email digest, and logs.
- `backend/src/db.ts`: sql.js database wrapper and migration.
- `backend/src/*.test.ts`: existing backend behavior tests.
- `frontend/src/App.tsx`: auth gate and route tree.
- `frontend/src/Layout.tsx`: shell, navigation, theme toggle, account controls.
- `frontend/src/Dashboard.tsx`: metrics, charts, due table.
- `frontend/src/AssetPage.tsx`: generic asset list, filters, cards, table, drawer form.
- `frontend/src/Expenses.tsx`: expense list and drawer form.
- `frontend/src/SettingsPage.tsx`: settings, email test, reminder scan, password form.
- `frontend/src/ui.tsx`: shared primitive components.
- `frontend/src/styles.css` and `frontend/tailwind.config.js`: visual tokens.

---

## Phase 0: Baseline And Safety

- [x] Create/switch to branch: user explicitly requested direct `main` push, so work stayed on `main`.
- [x] Install dependencies if missing: `npm install`.
- [x] Run backend baseline: `npm run test -w backend`.
- [x] Run full baseline build: `npm run build`.
- [x] If a baseline failure exists, record it in `findings.md` before changing source.
- [x] Start the app locally and run production API smoke checks. Screenshot QA was limited by missing RoxyChrome core binary.

## Phase 1: Backend Query Contracts

- [x] Add tests in `backend/src/assets.test.ts` for asset list pagination, currency filter, billing-cycle filter, and deterministic sorting.
- [x] Implement additive query support in `backend/src/assets.ts` without removing existing `q` or `status` behavior.
- [x] Return list metadata shaped as `{ items, meta: { total, limit, offset } }` while keeping old frontend compatibility.
- [x] Add tests for invalid query values returning `VALIDATION_ERROR`.
- [x] Run `npm run test -w backend`.

## Phase 2: Expense Integrity And Lookup Data

- [x] Add tests in `backend/src/expenses.test.ts` for rejecting an expense whose `assetType` and `assetId` do not point to an existing asset.
- [x] Add tests for expense filters by year, currency, asset type, and category.
- [x] Implement asset-existence validation in `backend/src/expenses.ts`.
- [x] Add an additive lookup endpoint such as `GET /api/assets/lookup` returning lightweight asset labels for expense forms.
- [x] Return expense rows with `assetLabel` when possible so the UI no longer shows only `type #id`.
- [x] Run `npm run test -w backend`.

## Phase 3: Dashboard And Reminder Improvements

- [x] Add tests in `backend/src/dashboard.test.ts` for due-item risk bands and top upcoming liabilities.
- [x] Extend `GET /api/dashboard/summary` with additive fields for `dueBuckets`, `nextDueItems`, and currency totals usable by the dashboard.
- [x] Add reminder-log pagination tests in `backend/src/reminders.test.ts`.
- [x] Implement reminder-log pagination and make failed reminder responses expose enough status for the settings UI.
- [x] Run `npm run test -w backend`.

## Phase 4: Frontend Design Direction And Tokens

- [x] Audit current screens against the confirmed dark-first compact finance brief.
- [x] User requested big-tech UI direction and immediate execution, so no three-option pause was used.
- [x] If proceeding with the confirmed direction, update `frontend/tailwind.config.js` and `frontend/src/styles.css` with a locked dark workbench palette, stable radius scale, focus states, dense spacing, and readable data typography.
- [x] Split `frontend/src/ui.tsx` into focused primitives only if doing so reduces complexity: buttons, fields, drawer, data table, badges, empty states, state banners, page headers.
- [x] Run `npm run lint -w frontend`.

## Phase 5: App Shell And Auth Screens

- [x] Refactor `frontend/src/Layout.tsx` into a quieter operations shell with denser nav, clearer active state, mobile drawer polish, and persistent theme initialization.
- [x] Redesign `frontend/src/AuthPages.tsx` for setup/login with proper loading, validation, and error states.
- [x] Keep route behavior unchanged.
- [x] Run `npm run lint -w frontend`.

## Phase 6: Dashboard Redesign

- [x] Refactor `frontend/src/Dashboard.tsx` into a command-center view with stronger hierarchy for monthly forecast, yearly forecast, actual spend, and due risk.
- [x] Use richer backend summary fields when present while gracefully falling back to existing fields.
- [x] Replace thin empty states and loading states with polished data-workbench states.
- [x] Check chart readability in dark mode and mobile width through build/type checks; screenshot QA was limited by Roxy binary availability.
- [x] Run `npm run lint -w frontend`.

## Phase 7: Asset Workspace Redesign

- [x] Refactor `frontend/src/AssetPage.tsx` so filters, view switching, cards, table, and drawer form feel like one coherent asset workspace.
- [x] Use backend filters for currency, status, billing cycle, search, and pagination when available.
- [x] Improve drawer validation messages and form grouping.
- [x] Preserve create, edit, archive, renewal-link, card view, and table view behavior.
- [x] Run `npm run lint -w frontend`.

## Phase 8: Expenses And Settings Redesign

- [x] Refactor `frontend/src/Expenses.tsx` to use asset lookup labels, filters, better empty state, and safer delete/edit states.
- [x] Refactor `frontend/src/SettingsPage.tsx` into account, reminders, mail, export, and logs sections with clear feedback states.
- [x] Add reminder log display if the backend pagination endpoint is implemented.
- [x] Run `npm run lint -w frontend`.

## Phase 9: End-To-End Verification

- [x] Run `npm run test -w backend`.
- [x] Run `npm run build`.
- [x] Start the local backend with the built frontend.
- [x] Verify setup, auth, dashboard data contracts, assets lookup, expenses, and reminder logs through production API smoke.
- [x] Record screenshots or notes for any remaining visual mismatches. Screenshot QA was blocked by missing RoxyChrome core binary.
- [x] Update `README.md` only if API, setup, or usage changed. No README update was required.
- [x] Update `progress.md`, `findings.md`, and `task_plan.md` statuses.

## Completion Criteria

- Backend tests pass.
- Full build passes.
- UI is dark-first, compact, responsive, and visually coherent across dashboard, asset pages, expenses, settings, setup, and login.
- Existing core features remain functional.
- New backend contracts are additive and tested.
- Planning files reflect completed phases and any residual risks.
