# MoneyPulse Task Plan

## Goal
Build MoneyPulse, a single-user asset and recurring cost management app for phone cards, VPS, domains, and subscriptions, with authentication, multi-currency cost tracking, email reminders, Docker packaging, and GitHub delivery.

## Scope
- Full-stack app using React + Vite + TypeScript + TailwindCSS.
- Backend using Node.js + Express + TypeScript + SQLite.
- Single user with initial setup, login/logout, password change, and HttpOnly cookie JWT.
- Assets: phones, VPS, domains, subscriptions.
- Expenses: actual payment history linked to assets.
- Currencies: CNY, USD, GBP, EUR.
- Email reminders: daily summary for due/renewal items.
- UI: Geist Minimalist, dark-first, high-density tables, mono data typography.
- Delivery: push to https://github.com/noaul/moneypulse, then run local Docker verification.

## Non-Goals
- Multi-user permissions.
- Automatic exchange rates.
- Payment provider integration.
- WHOIS or cloud provider API sync.
- Two-factor authentication.

## Phases
1. [complete] Project scaffold, planning files, package setup, Git ignore rules.
2. [complete] Backend foundation: Express app, SQLite schema, migrations, shared utilities.
3. [complete] Authentication: setup, login, logout, me, password change.
4. [complete] Asset CRUD: phones, VPS, domains, subscriptions.
5. [complete] Expenses, dashboard summary, expiring item aggregation.
6. [complete] Settings, email testing, reminder scan and reminder logs.
7. [complete] Frontend foundation: routing, auth flow, app shell, theme.
8. [complete] Frontend pages: dashboard, asset lists, expenses, settings.
9. [complete] Verification: tests, build, commit, push.
10. [complete] Docker packaging and local Docker verification after push.

## UI Acceptance Criteria
- Dark mode is the default visual target.
- Data values such as IP addresses, dates, money, phone numbers, and due-day counts use monospace typography.
- Tables use compact row spacing and border-based separation.
- Drawer is used for create/edit forms.
- Dashboard uses restrained metric cards and charts without marketing-style hero sections.
- Status colors: active emerald, paused amber, expired rose, cancelled zinc, archived violet.

## Delivery Notes
- Do not commit `.env`, SQLite databases, `data/`, `node_modules/`, `dist/`, or coverage output.
- Do not force-push.
- Run verification before claiming completion.

## Verification Summary
- Backend tests: 4 files, 7 tests passed.
- Production dependency audit: 0 vulnerabilities with `npm audit --omit=dev`.
- Full build: backend TypeScript and frontend Vite build passed; Vite reported only a chunk-size warning.
- Docker: `docker compose build` passed; `docker compose up -d` started the app; `/api/health` returned `{"ok":true}`.

---

# Second Pass: Full-Stack Refactor Plan

## Goal
Refactor MoneyPulse beyond the initial MVP: strengthen backend data contracts, improve API integrity, and redesign the frontend into a polished dark-first financial operations workspace.

## Scope
- Backend query contracts, list metadata, validation, expense integrity, lookup data, dashboard additions, and reminder log improvements.
- Frontend app shell, auth screens, dashboard, generic asset workspace, expenses, settings, loading states, empty states, error states, and responsive layout.
- Verification through backend tests, full build, and browser QA.

## Non-Goals
- Multi-user permissions.
- Automatic exchange rates.
- Payment-provider integration.
- Breaking route slugs or existing core API paths.
- Replacing sql.js unless a concrete runtime issue appears.

## Execution Plan
Detailed plan file: `docs/superpowers/plans/2026-06-07-moneypulse-fullstack-refactor.md`.

## Phases
1. [complete] Baseline and safety: install, backend tests, full build, API audit.
2. [complete] Backend query contracts: asset filters, pagination metadata, sorting, validation tests.
3. [complete] Expense integrity and lookup data: asset existence validation, expense filters, asset labels.
4. [complete] Dashboard and reminder improvements: richer summary fields, due buckets, reminder-log pagination.
5. [complete] Frontend design direction and tokens: dark workbench palette, component primitives, state patterns.
6. [complete] App shell and auth screens: navigation, theme initialization, setup/login polish.
7. [complete] Dashboard redesign: command-center metrics, charts, due-risk table, responsive states.
8. [complete] Asset workspace redesign: filters, cards, table, drawer forms, pagination.
9. [complete] Expenses and settings redesign: lookup labels, filters, reminder logs, account/mail/export sections.
10. [complete] End-to-end verification: backend tests, full build, production API smoke, final commit and push.

## Current Decision
Backend changes should lead the implementation because the redesigned frontend needs stronger data contracts. UI changes should then land page-by-page so each route remains runnable during the refactor.

## Second Pass Verification Notes
- Backend tests expanded from 7 to 15 tests across 5 files.
- Production API smoke verified setup, auth cookie session, asset lookup, expense asset labels, dashboard due buckets, and reminder log metadata.
- RoxyBrowser service was reachable, but its configured Chrome core binary was missing locally, so screenshot-level browser QA could not be completed in this run.
