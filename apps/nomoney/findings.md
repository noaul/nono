# MoneyPulse Findings

## Initial Decisions
- Use integer minor units for all money fields to avoid floating point errors.
- Store `currency` separately as one of `CNY`, `USD`, `GBP`, `EUR`.
- Keep sensitive values such as `JWT_SECRET` and `SMTP_PASS` in environment variables.
- Use daily digest reminders rather than one email per asset.
- Keep real expenses separate from asset recurring cost settings.
- Use `sql.js` for SQLite file persistence to avoid native addon builds on local Node 26 while still storing an SQLite database file.

## Dependency Install Finding
- `better-sqlite3` failed to install locally because no prebuilt binary was available for Node 26.1.0 and node-gyp failed while downloading Node headers through the current proxy/undici path.
- Replaced native SQLite binding with `sql.js` to keep implementation portable.

## Remote Repository
- Target remote: https://github.com/noaul/moneypulse
- Initial remote check showed an empty repository.

## 2026-06-07 Refactor Audit
- User expanded scope: backend code should also be improved, not only frontend UI.
- Repository currently has a completed MVP plan and implementation split into `backend/` and `frontend/`.
- Backend stack: Express + TypeScript + sql.js + Zod + Vitest/Supertest.
- Frontend stack: React + Vite + TailwindCSS + Recharts + lucide-react.
- Backend routes are functional but route handlers, mapping, validation, and database access are tightly coupled in a few files.
- Asset list API supports status and search but does not yet expose pagination metadata, currency filters, billing-cycle filters, or sort controls.
- Expense API accepts `assetType` and `assetId` but currently does not validate that the referenced asset exists.
- Frontend has full route coverage, but shared UI primitives are concentrated in `frontend/src/ui.tsx`, and page states are uneven across loading, empty, error, and mobile layouts.
- Recommended execution order: backend contracts first, then frontend design tokens/components, then page-by-page UI replacement.
- Production smoke testing uncovered a persist-mode database bug: `DbClient.insert` saved the sql.js database before reading `last_insert_rowid()`, causing setup to return `USER_NOT_FOUND` with file persistence enabled.
- Fixed `DbClient.insert` to execute insert, read `last_insert_rowid()`, then save; added a persist-enabled auth regression test.
- Production dependency audit with `npm audit --omit=dev` reports 0 vulnerabilities. Full install audit still reports dev/deep dependency issues, so production audit is the relevant deployment signal.
- RoxyBrowser server was healthy, but the created test browser could not open because `RoxyChrome.exe` for core 144 was missing. The temporary browser profile was deleted.
