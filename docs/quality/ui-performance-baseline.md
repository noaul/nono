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

## Live RN 8188 Acceptance

This acceptance used the live application, Fastify/Prisma request path, and RN PostgreSQL data store at `http://192.129.159.194:8188`.

### Environment

| Field | Value |
| --- | --- |
| Base URL | `http://192.129.159.194:8188` |
| Acceptance date and time | `2026-07-12 12:28, Asia/Shanghai` |
| Deployed commit | `394849efdc1c05a9592a28a26fab89a511dc7e0a` |
| Browser and version | Chromium `149.0.7827.55` via Playwright `1.61.1` |
| Desktop viewport | `1440 x 900` |
| Mobile viewport/device | Playwright Pixel 7, `412 x 839` |
| Network conditions | Direct connection from the acceptance workstation to RN; no synthetic throttling |
| Authenticated test user | `admin` |
| Fixture prefix or IDs | `D1-PERF-20260712-1221` |

### Page Acceptance

Capture at least one desktop screenshot for every route and a mobile screenshot where the layout or interaction differs. Screenshot paths must point to retained test artifacts; do not place credentials, tokens, or personal data in filenames or images.

| Route | Authentication | Functional result | DOMContentLoaded | First contentful paint | Horizontal overflow | Screenshot evidence | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| `/admin/folders` | authenticated administrator | Passed on desktop and mobile | 1705.8 ms desktop; 1771 ms mobile | 3332 ms desktop; 3520 ms mobile | none | `docs/quality/screenshots/day1-live-admin-folders-{desktop,mobile}-chromium.png` | 100-folder fixture loaded; loading overlay cleared before capture |
| `/admin/links` | authenticated administrator | Passed on desktop and mobile | 1919.7 ms desktop; 1730.6 ms mobile | 3724 ms desktop; 3488 ms mobile | none | `docs/quality/screenshots/day1-live-admin-links-{desktop,mobile}-chromium.png` | Folder selector loaded; loading overlay cleared before capture |
| `/blog` | public | Passed on desktop and mobile | 1486.2 ms desktop; 1395.4 ms mobile | 1520 ms desktop; 1416 ms mobile | none | `docs/quality/screenshots/day1-live-blog-{desktop,mobile}-chromium.png` | Main region and portal shortcut back to Nono were visible |

### Sorting Performance

Use an isolated fixture set containing exactly 100 test folders and 200 test bookmarks in one test folder. Do not delete or reorder user-created records during setup or cleanup. For drag displacement latency, measure from pointer movement input to the first corresponding visual displacement. For DOM stabilization, measure from drag end to the final stable DOM order. Save duration is the live reorder request duration observed in the browser network trace.

| Scenario | Fixture size | Drag displacement latency | Drag end to DOM stable | Save request duration | Reorder requests while dragging | Reorder requests on save | DOM order after reload | Screenshot/trace evidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Reorder folders on `/admin/folders` | 100 folders | 103.4 ms | 77.9 ms | 1301 ms | 0 | 1 | Passed | `docs/quality/screenshots/day1-live-admin-folders-{before,after}.png` |
| Reorder bookmarks on `/admin/links` | 200 bookmarks in one folder | 188.2 ms | 77.9 ms | 1596 ms | 0 | 1 | Passed | `docs/quality/screenshots/day1-live-admin-links-{before,after}.png` |

The displacement values include Playwright's stepped pointer movement and therefore represent automated end-to-end feedback latency rather than a browser event-handler microbenchmark. The 100-folder result is close to the local 100 ms target, while the 200-bookmark result misses it and remains a Day 2 optimization target. Persistence and request-count contracts passed in both scenarios.

### Acceptance Checklist

| Check | Expected result | Actual result | Evidence |
| --- | --- | --- | --- |
| Folder drag feedback | DOM order changes immediately during drag | Passed | Mutation observer detected the expected first-two-row swap |
| Folder request behavior | 0 reorder requests during drag; exactly 1 on save | Passed | Live request listener recorded `0` then `1` |
| Folder persistence | Saved order remains after reload | Passed | Reloaded first two IDs matched the saved order |
| Bookmark drag feedback | DOM order changes immediately during drag | Passed | Mutation observer detected the expected first-two-row swap |
| Bookmark request behavior | 0 reorder requests during drag; exactly 1 on save | Passed | Live request listener recorded `0` then `1` |
| Bookmark persistence | Saved order remains after reload | Passed | Reloaded first two IDs matched the saved order |
| Fixture cleanup | Only uniquely prefixed test fixtures are removed | Passed | Deleted 1 temporary token and exactly 100 prefixed folders; 200 fixture links cascade-deleted; 1 administrator remained |

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

- Local smoke coverage remains deterministic and unauthenticated, while RN acceptance adds authenticated folder/link management with a uniquely prefixed fixture set and temporary API token.
- Drag sorting is covered by Vitest component tests, Fastify integration tests, and opt-in live Playwright persistence tests.
- The Vite smoke uses route interception; the RN acceptance separately validates the Fastify/Prisma network path.
- Node `v26.3.1` emits experimental `localStorage` warnings during Vitest and Next builds. Playwright also reports that `NO_COLOR` is ignored when `FORCE_COLOR` is set. Neither warning changes exit status.
