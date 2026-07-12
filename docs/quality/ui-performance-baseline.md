# UI Performance Baseline

## Scope

Day 1 establishes a repeatable Chromium browser smoke baseline for the Vue application:

- `desktop-chromium`: 1440 x 900 desktop viewport.
- `mobile-chromium`: Playwright Pixel 7 device profile.
- Public navigation: deterministic `/api/navigation/admin` response, visible shell, folder card, and no horizontal overflow.
- Admin entry: unauthenticated `/admin` navigation redirects to the login screen.
- Timing attachment: navigation `DOMContentLoaded`, load event, first contentful paint when Chromium reports it, and viewport overflow widths.

The smoke fixture intentionally avoids PostgreSQL, seed data, external favicons, and login credentials. It is suitable for local runs and CI while preserving a clear path to authenticated E2E coverage later.

## Commands

```powershell
npm install
npm run test:e2e:install
npm run test:e2e
```

Run one viewport while iterating:

```powershell
npm run test:e2e -- --project=desktop-chromium
npm run test:e2e -- --project=mobile-chromium
```

Use an already-running deployment instead of the managed Vite server:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3000'
npm run test:e2e
```

Each smoke test attaches `ui-performance-baseline.json` to its Playwright result. The values are diagnostic baselines, not release budgets. The initial guard only rejects a `DOMContentLoaded` time above 10 seconds or horizontal viewport overflow.

## Day 1 Results

Measured on July 12, 2026 with Node `v26.3.1`, npm `11.17.0`, Playwright `1.61.1`, and Chromium `149.0.7827.55`:

| Project | Viewport | DOMContentLoaded | Load event | First contentful paint | Horizontal overflow |
| --- | --- | ---: | ---: | ---: | --- |
| `desktop-chromium` | 1440 x 900 | 116.9 ms | 122.4 ms | 180 ms | none (1440 / 1440 px) |
| `mobile-chromium` | 412 x 839 | 112.2 ms | 117.3 ms | 152 ms | none (412 / 412 px) |

Command result: `npm run test:e2e` passed 2/2 tests in 2.2 seconds of Playwright time and 3.227 seconds wall-clock time. These local, intercepted-data measurements are reference values for detecting large regressions; they are not production network measurements.

## Repository Baseline

| Command | Result | Wall-clock time |
| --- | --- | ---: |
| `npm run test -w packages/web -- test/navigation-page.test.ts test/admin-links-view.test.ts test/admin-folders-view.test.ts test/sortable-list.test.ts` | 4 files, 14 tests passed | 8.633 s |
| `npm run test -w packages/server -- -t sorting` | 3 passed, 15 skipped | 2.699 s |
| `npm test` | 15 files, 74 tests passed | 22.162 s |
| `npm run build` | server, web, and extension built | 16.900 s |
| `pnpm --dir apps/blog check` | 16 tests, typecheck, and Next build passed | 56.213 s |
| `npm audit --json` | failed: 1 high and 1 low vulnerability | 4.771 s |

The audit findings are pre-existing development-tool advisories: Vite `7.3.3` is affected by Windows path/UNC handling advisories, and its esbuild dependency is affected by a low-severity Windows development-server advisory. Dependency upgrades are outside this baseline-only change.

## Known Boundaries

- Authenticated folder/link management is not exercised because the repository does not define dedicated E2E credentials or isolated browser-test database lifecycle.
- Drag sorting remains covered by Vitest component and Fastify integration tests. This baseline does not duplicate those specialized tests.
- The Vite smoke uses route interception, so it validates browser rendering and routing but not the Fastify/Prisma network path.
- Node `v26.3.1` emits experimental `localStorage` warnings during Vitest and Next builds. Playwright also reports that `NO_COLOR` is ignored when `FORCE_COLOR` is set. Neither warning changes exit status.
