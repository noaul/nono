# NoMoney Single-Image Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import MoneyPulse into the Nono repository as NoMoney, serve it at `/nomoney`, build it into the existing Nono image, and add a separated NoMoney entry after the public Notab tabs.

**Architecture:** Keep NoMoney as an independent React + Express process inside the combined Nono container, mirroring the existing Nodesk process boundary. The Node gateway routes `/nomoney/*` to NoMoney while the existing Nono Fastify and Nodesk Next.js services remain unchanged. Preserve the existing SQLite data format and internal compatibility identifiers while changing the visible product name to NoMoney.

**Tech Stack:** Vue 3, React 18, Vite, Express 4, sql.js/SQLite, Node.js gateway, Docker multi-stage builds, Docker Compose, Vitest, Playwright.

---

## File Map

- Create `apps/nomoney/`: imported MoneyPulse application source without its standalone Docker deployment files.
- Create `apps/nomoney/frontend/src/base-path.ts`: one source of truth for the `/nomoney` browser and API mount path.
- Create `docker/gateway-routing.mjs`: pure routing helpers for gateway unit tests.
- Create `tests/gateway-routing.test.mjs`: verifies NoMoney routing and path stripping.
- Modify `docker/gateway.mjs`: starts NoMoney and proxies `/nomoney` requests.
- Modify `Dockerfile`: builds and packages the third internal application.
- Modify `docker-compose.yml`: adds NoMoney environment variables and persistent data volume.
- Modify `package.json`: adds NoMoney and gateway test/build commands.
- Modify `packages/web/src/views/NavigationPage.vue`: adds the separated NoMoney navigation entry.
- Modify `packages/web/test/navigation-page.test.ts`: verifies entry order, URL, and indicator isolation.
- Modify `README.md` and `.env.example`: documents the integrated deployment.

### Task 1: Import MoneyPulse as `apps/nomoney`

**Files:**
- Create: `apps/nomoney/**`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Verify both source repositories are clean**

Run:

```powershell
git -C C:\Users\aodo\Documents\github项目\nono status --short
git -C C:\Users\aodo\Documents\github项目\MoneyPulse status --short
```

Expected: both commands produce no file entries.

- [ ] **Step 2: Import the tracked MoneyPulse source snapshot**

Run from the Nono repository:

```powershell
New-Item -ItemType Directory -Force apps\nomoney | Out-Null
git -C C:\Users\aodo\Documents\github项目\MoneyPulse archive HEAD | tar -x -C apps\nomoney
Remove-Item -LiteralPath apps\nomoney\Dockerfile,apps\nomoney\docker-compose.yml -Force
```

Do not copy `data/`, `.env`, `node_modules/`, or generated `backend/public/` files.

- [ ] **Step 3: Add root orchestration commands**

Add these scripts to the root `package.json`:

```json
{
  "scripts": {
    "build:nomoney": "npm --prefix apps/nomoney run build",
    "test:nomoney": "npm --prefix apps/nomoney test",
    "test:gateway": "node --test tests/gateway-routing.test.mjs"
  }
}
```

- [ ] **Step 4: Ignore NoMoney generated output**

Add to `.gitignore`:

```gitignore
apps/nomoney/backend/public/
apps/nomoney/data/
apps/nomoney/.env
apps/nomoney/node_modules/
```

- [ ] **Step 5: Install and verify the imported source**

Run:

```powershell
npm --prefix apps/nomoney ci
npm run build:nomoney
```

Expected: TypeScript and Vite builds exit with code 0.

- [ ] **Step 6: Commit the source import**

```bash
git add apps/nomoney package.json .gitignore
git commit -m "feat(nomoney): import MoneyPulse application source"
```

### Task 2: Stabilize the existing exchange-rate dependency

**Files:**
- Create: `apps/nomoney/backend/src/exchange-rates.ts`
- Create: `apps/nomoney/backend/src/exchange-rates.test.ts`
- Modify: `apps/nomoney/backend/src/assets.ts`
- Modify: `apps/nomoney/backend/src/types.ts`

- [ ] **Step 1: Write a failing timeout regression test**

The test must inject a fetch implementation that never resolves and assert that exchange-rate resolution returns an empty rate set within three seconds:

```ts
test('returns an empty rate set when the provider exceeds the timeout', async () => {
  const startedAt = Date.now();
  const result = await fetchExchangeRates(
    async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
    'CNY',
    ['USD'],
    250,
  );

  expect(result).toEqual({ base: 'CNY', rates: {}, date: null });
  expect(Date.now() - startedAt).toBeLessThan(1000);
});
```

- [ ] **Step 2: Run the regression test and confirm failure**

```powershell
npm --prefix apps/nomoney exec -w backend -- vitest run src/exchange-rates.test.ts
```

Expected: FAIL because `fetchExchangeRates` has not been extracted and has no timeout.

- [ ] **Step 3: Extract exchange-rate fetching with an abort timeout**

Implement `fetchExchangeRates(fetcher, base, quotes, timeoutMs = 2500)` using `AbortController`, `clearTimeout` in `finally`, and the current response parser. Return an empty rate set on timeout, network failure, or invalid response.

- [ ] **Step 4: Replace the in-file implementation in `assets.ts`**

Import the helper and pass `context.fetch ?? globalThis.fetch`; do not change API response shapes or currency calculations.

- [ ] **Step 5: Run all NoMoney tests**

```powershell
npm run test:nomoney
```

Expected: 33 existing tests plus the new timeout tests pass with zero failures.

- [ ] **Step 6: Commit the reliability fix**

```bash
git add apps/nomoney/backend/src
git commit -m "fix(nomoney): bound exchange-rate provider latency"
```

### Task 3: Make the frontend subpath-aware

**Files:**
- Create: `apps/nomoney/frontend/src/base-path.ts`
- Create: `apps/nomoney/frontend/src/base-path.test.ts`
- Modify: `apps/nomoney/frontend/src/main.tsx`
- Modify: `apps/nomoney/frontend/src/api.ts`
- Modify: `apps/nomoney/frontend/src/SettingsPage.tsx`
- Modify: `apps/nomoney/frontend/vite.config.ts`
- Modify: `apps/nomoney/frontend/package.json`

- [ ] **Step 1: Add frontend Vitest support and failing base-path tests**

Add `"test": "vitest run"` and `vitest` to the frontend package. Test these contracts:

```ts
expect(normalizeBasePath('/nomoney/')).toBe('/nomoney');
expect(withBasePath('/api/auth/me')).toBe('/nomoney/api/auth/me');
expect(withBasePath('/dashboard')).toBe('/nomoney/dashboard');
```

- [ ] **Step 2: Implement base-path helpers**

```ts
export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export function normalizeBasePath(value: string): string {
  const normalized = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized === '/' ? '' : normalized;
}

export function withBasePath(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${appBasePath}${path}` || '/';
}
```

- [ ] **Step 3: Configure Vite and React Router**

Set Vite `base` to `'/nomoney/'`. Wrap the application with:

```tsx
<BrowserRouter basename={appBasePath || '/'}>
  <App />
</BrowserRouter>
```

- [ ] **Step 4: Prefix API and download URLs**

Update the API client to call `fetch(withBasePath(path), ...)`. Change the backup export link to `withBasePath('/api/export/json')`.

- [ ] **Step 5: Run frontend tests and build**

```powershell
npm --prefix apps/nomoney run test -w frontend
npm run build:nomoney
```

Expected: tests pass and generated HTML references `/nomoney/assets/`.

- [ ] **Step 6: Commit the subpath support**

```bash
git add apps/nomoney/frontend
git commit -m "feat(nomoney): support the nomoney mount path"
```

### Task 4: Add gateway routing and process supervision

**Files:**
- Create: `docker/gateway-routing.mjs`
- Create: `tests/gateway-routing.test.mjs`
- Modify: `docker/gateway.mjs`

- [ ] **Step 1: Write failing gateway routing tests**

```js
test('routes and strips the NoMoney mount path', () => {
  assert.deepEqual(targetFor('/nomoney/dashboard', ports), {
    name: 'nomoney',
    port: 2030,
    path: '/dashboard',
  });
  assert.deepEqual(targetFor('/nomoney/api/auth/me?fresh=1', ports), {
    name: 'nomoney',
    port: 2030,
    path: '/api/auth/me?fresh=1',
  });
});
```

- [ ] **Step 2: Extract pure routing helpers**

Move route selection into `gateway-routing.mjs`. Route `/nomoney`, `/nomoney/`, and `/nomoney?query` to NoMoney before the Nodesk and Nono fallbacks.

- [ ] **Step 3: Start the third child process**

Extend `startService` to accept extra environment variables and start:

```js
startService('nomoney', '/app/nomoney', 'backend/dist/index.js', nomoneyPort, {
  APP_DATA_DIR: process.env.NOMONEY_DATA_DIR || '/app/nomoney-data',
  JWT_SECRET: process.env.NOMONEY_JWT_SECRET || '',
  COOKIE_SECURE: process.env.NOMONEY_COOKIE_SECURE || 'true',
});
```

Forward the existing SMTP variables without logging their values.

- [ ] **Step 4: Run gateway tests**

```powershell
npm run test:gateway
```

Expected: all Nono, Nodesk, legacy `/blog`, and NoMoney routing cases pass.

- [ ] **Step 5: Commit gateway integration**

```bash
git add docker/gateway.mjs docker/gateway-routing.mjs tests/gateway-routing.test.mjs package.json
git commit -m "feat(gateway): route the integrated NoMoney service"
```

### Task 5: Build NoMoney into the combined image

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add NoMoney dependency, build, and production-dependency stages**

Follow the standalone MoneyPulse Dockerfile pattern: run `npm ci`, build backend and frontend, then run a second `npm ci --omit=dev --workspace backend --include-workspace-root` for runtime dependencies.

- [ ] **Step 2: Copy runtime files into the final image**

The runtime image must contain:

```text
/app/nomoney/backend/dist
/app/nomoney/backend/public
/app/nomoney/backend/node_modules dependencies through /app/nomoney/node_modules
```

Do not copy NoMoney `.env` or SQLite files into the image.

- [ ] **Step 3: Add Compose configuration**

Add:

```yaml
environment:
  NOMONEY_INTERNAL_PORT: 2030
  NOMONEY_DATA_DIR: /app/nomoney-data
  NOMONEY_JWT_SECRET: ${NOMONEY_JWT_SECRET:?NOMONEY_JWT_SECRET is required}
  NOMONEY_COOKIE_SECURE: "true"
volumes:
  - nomoney_data:/app/nomoney-data
```

Declare `nomoney_data:` under top-level volumes.

- [ ] **Step 4: Extend the container healthcheck**

Check both Nono and NoMoney:

```yaml
test:
  - CMD-SHELL
  - wget -qO- http://127.0.0.1:3000/healthz >/dev/null && wget -qO- http://127.0.0.1:3000/nomoney/api/health >/dev/null
```

- [ ] **Step 5: Build and start locally**

```powershell
$env:NOMONEY_JWT_SECRET = 'local-development-secret-at-least-32-characters'
docker compose build app
docker compose up -d
```

Expected: Nono, Nodesk, and NoMoney start inside the `nono` container and the healthcheck becomes healthy.

- [ ] **Step 6: Commit container integration**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat(docker): package NoMoney in the Nono image"
```

### Task 6: Rename the visible product to NoMoney

**Files:**
- Modify: `apps/nomoney/frontend/index.html`
- Modify: `apps/nomoney/frontend/src/App.tsx`
- Modify: `apps/nomoney/frontend/src/AuthPages.tsx`
- Modify: `apps/nomoney/frontend/src/Layout.tsx`
- Modify: `apps/nomoney/frontend/src/SettingsPage.tsx`
- Modify: `apps/nomoney/backend/src/index.ts`
- Modify: `apps/nomoney/backend/src/settings.ts`
- Modify: `apps/nomoney/backend/src/reminders.ts`

- [ ] **Step 1: Add a branding contract test**

Verify rendered titles and user-facing copy contain `NoMoney` and do not contain visible `Moneypulse` labels.

- [ ] **Step 2: Rename user-facing strings only**

Change page titles, sidebar brand, loading copy, email subjects, reminder headings, and setup/login copy to NoMoney.

Preserve these compatibility identifiers:

```text
moneypulse_session
moneypulse.webdav.encrypted
moneypulse-probe.service
MONEYPULSE_PROBE_TOKEN
existing localStorage keys
```

- [ ] **Step 3: Run NoMoney tests and build**

```powershell
npm run test:nomoney
npm run build:nomoney
```

- [ ] **Step 4: Commit the brand change**

```bash
git add apps/nomoney
git commit -m "feat(nomoney): rename the integrated product UI"
```

### Task 7: Add the public NoMoney entry after Notabs

**Files:**
- Modify: `packages/web/src/views/NavigationPage.vue`
- Modify: `packages/web/test/navigation-page.test.ts`

- [ ] **Step 1: Write a failing navigation contract test**

Assert that the NoMoney anchor:

- appears after all `category-tab-*` buttons
- has `href="/nomoney"`
- includes a separator with `aria-hidden="true"`
- is not matched by `button.active` and cannot move the Notab indicator

- [ ] **Step 2: Add the entry**

Use Lucide `WalletCards` and this structure after the `v-for` button:

```vue
<span class="tab-service-separator" aria-hidden="true"></span>
<a class="tab-service-link" href="/nomoney" data-testid="nomoney-entry">
  <WalletCards :size="15" />
  <span>NoMoney</span>
</a>
```

- [ ] **Step 3: Style desktop and mobile states**

Keep the entry the same height as Notab buttons, use a visible divider rather than another selected pill, and retain horizontal scrolling on narrow screens.

- [ ] **Step 4: Run public-navigation tests**

```powershell
npm run test -w packages/web -- navigation-page.test.ts
```

- [ ] **Step 5: Commit the entry**

```bash
git add packages/web/src/views/NavigationPage.vue packages/web/test/navigation-page.test.ts
git commit -m "feat(web): add the NoMoney public entry"
```

### Task 8: Migrate nc48 data and deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Back up the existing SQLite database**

On nc48, stop writes before copying:

```bash
cd /root/moneypulse
docker compose stop app
cp -a data/app.db "data/app.db.pre-nomoney-$(date +%Y%m%d-%H%M%S)"
sha256sum data/app.db data/app.db.pre-nomoney-*
```

- [ ] **Step 2: Copy data into the Nono named volume**

Create the volume through Compose, then use a temporary Alpine container to copy `/root/moneypulse/data/app.db` into the mounted `nomoney_data` volume. Verify owner readability and checksum before starting Nono.

- [ ] **Step 3: Deploy the combined image**

```bash
cd /opt/nono
git pull --ff-only origin main
docker compose up -d --build app
```

- [ ] **Step 4: Verify data and routes**

Check:

```bash
curl -fsS http://127.0.0.1:8188/healthz
curl -fsS http://127.0.0.1:8188/nomoney/api/health
```

Then verify login, dashboard totals, phones, VPS, domains, subscriptions, expenses, settings, and backup configuration through `https://noaul.com/nomoney`.

- [ ] **Step 5: Retire the standalone container only after acceptance**

Keep `/root/moneypulse/data` and its backup. Remove only the old running container; do not delete its data directory.

- [ ] **Step 6: Run final repository verification**

```powershell
npm run test:gateway
npm run test:nomoney
npm run test -w packages/web
npm run build:nono
npm run build:nomoney
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit documentation**

```bash
git add README.md
git commit -m "docs: document the integrated NoMoney deployment"
```

