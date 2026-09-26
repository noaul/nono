# NoNo

[简体中文](README.md) · [English](README_EN.md)

<p align="center"><img src="design/icons/nono-duo-512.png" width="96" height="96" alt="NoNo"></p>

NoNo is a self-hosted personal workspace for bookmarks, publishing, personal assets, infrastructure, and GitHub Stars under one domain. It is intended for individuals and small groups of trusted users.

## Products and entry points

| Product | Path | Capabilities | Identity and storage |
| --- | --- | --- | --- |
| **NoNo** | `/`, `/admin` | Public navigation, folders, bookmarks, search, import/export, trash, link checks | NoNo accounts; PostgreSQL |
| **NoDesk** | `/nodesk` | Articles, images, projects, links, snippets, schedules, home workspace | NoNo administrator session for editing; file volume |
| **NoMoney** | `/nomoney` | Phone cards, subscriptions, accounts, expenses, expiry and email reminders | Independent accounts; SQLite |
| **Yumi** | `/yumi` | VPS, domains, renewals, expenses, monitoring | Independent accounts; SQLite |
| **NoStar** | `/nostar` | GitHub Stars sync, categories, search, README, releases, AI analysis | NoNo session; PostgreSQL |
| **Chrome extension** | Popup and context menu | Capture the current page, organize with AI, save bookmarks | Dedicated NoNo API Token |

NoNo supports passwords, Passkeys, session management, scoped API Tokens, and site/folder access passwords. NoNo and NoStar support OpenAI/Claude-compatible providers; analysis content is sent to the configured provider.

Current navigation:

- **Bookmarks** combines bookmark and folder management. NoTab groups navigation content.
- **Account settings** contains passwords, Passkeys, API Tokens, LLM configuration, and login devices. Administrators also see **Users and registration**.
- **NoDesk settings** contains account module backups, local downloads, WebDAV, and scheduled backups.
- **Appearance** includes Chinese/English, light/dark mode, and a reduced set of layout, typography, background, and scene controls. Same-origin apps share some browser preferences.

Separate user, LLM, Token, and folder screens have been consolidated. Music cards and clipping are retired. There is no self-registration page; when an administrator enables registration, the API still creates regular users. NoMoney and Yumi each have independent accounts and do not automatically sign in with NoNo.

## Quick start

Use Docker Compose for the integrated product. Install Docker Engine, Compose v2, and Git. Images use Node.js 22 and PostgreSQL 16.

```bash
git clone https://github.com/noaul/nono.git
cd nono
cp .env.example .env
```

Replace every `replace-with-*` value in `.env`. Generate independent secrets, for example by running `openssl rand -hex 32` separately for each secret.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Database password; hexadecimal avoids connection URL escaping issues |
| `SESSION_SECRET` | NoNo session secret, at least 32 characters |
| `BOOTSTRAP_TOKEN` | Independent token required to create the first administrator |
| `ENCRYPTION_KEY` | NoNo encryption key, 64 hexadecimal characters |
| `NOMONEY_JWT_SECRET`, `YUMI_JWT_SECRET` | Independent login secrets for each product |
| `NOMONEY_INTERNAL_TOKEN` | Independent token for protected internal calls |
| `NOMONEY_ENCRYPTION_KEY`, `YUMI_ENCRYPTION_KEY` | Separate 64-character hexadecimal encryption keys recommended |
| `NONO_PUBLIC_URL` | Actual browser-facing NoNo URL |
| `BLOG_PUBLIC_URL` | Same-origin NoDesk URL, usually `https://example.com/nodesk` |
| `PORT` | Compose binding, default `127.0.0.1:3000` |

For a local HTTP trial, use `NONO_PUBLIC_URL=http://localhost:3000`, `BLOG_PUBLIC_URL=http://localhost:3000/nodesk`, and set `NOMONEY_COOKIE_SECURE=false` and `YUMI_COOKIE_SECURE=false`. Production must use HTTPS and both cookie flags must remain `true`.

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/readyz
```

Open `http://localhost:3000/setup`, supply `BOOTSTRAP_TOKEN`, and create the first administrator. Add bookmarks, configure your site and AI provider, and create a dedicated extension Token. Initialize NoMoney and Yumi accounts separately in their own interfaces.

Registration is closed by default. Its runtime setting is stored in the database and managed through **Account settings → Users and registration**. Editing `.env` does not override saved configuration. `ALLOW_REGISTRATION` only seeds configuration when running the server directly; the current Compose file does not pass it through.

Stop with `docker compose down`. **Do not add `-v` during normal upgrades: it deletes data volumes.**

## Architecture and persistence

One application container runs the gateway, NoNo API, NoDesk, NoMoney, and Yumi. NoNo serves NoStar assets and APIs. The gateway routes by path; internal service ports do not need public bindings. PostgreSQL runs in a separate container.

| Volume | Contents |
| --- | --- |
| `nono_pg_data` | NoNo, NoStar, users, sessions, Passkeys, audit and system settings |
| `nodesk_content` | NoDesk content, images and settings |
| `nomoney_data` | NoMoney SQLite database |
| `yumi_data` | Yumi SQLite database |
| `nono_backups` | Full backups, manifests and deployment safety snapshots |

NoMoney/Yumi persist SQLite through `sql.js`. Never run multiple writers against the same data volume. The default architecture does not provide multi-node high availability.

Keep encryption keys with your recovery materials: changing them makes existing encrypted data unreadable. Changing session secrets invalidates existing logins. Editing the PostgreSQL password in `.env` does not change the role password inside an existing database volume.

## Production deployment and upgrades

Keep the repository in a controlled directory such as `/opt/nono` and preserve the server's `.env`. Bind application and database ports to loopback and provide public HTTPS through a reverse proxy. Public URLs must match the actual domain; Passkeys also require the correct `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN`.

Use the quick-start Compose command for the first installation. For upgrades, use the backup-and-acceptance deployment script. The host needs Node.js 22 and `flock`. This example assumes `PORT=127.0.0.1:8188`:

```bash
cd /opt/nono
flock -n /var/lock/nono-deploy.lock node scripts/deploy-compose.mjs \
  --dir /opt/nono --base-url http://127.0.0.1:8188
```

The script fast-forwards from `origin/main` by default. Add `--skip-pull` for an already verified local commit. Images are identified by Git commit; commit the source and confirm a clean working tree before deployment.

The script checks pending migrations, builds the image, stops application writers, creates and verifies a full safety snapshot, accepts the candidate on an isolated port, switches to the normal port under maintenance, and then opens ingress. The old version stays available during the build; switching may briefly cause connection failures or HTTP 503. Destructive migrations are blocked until their SQL and recovery plan have been reviewed.

Validate a running deployment:

```bash
node scripts/accept-deployment.mjs --base-url http://127.0.0.1:8188
docker compose ps
```

`/healthz` checks liveness. `/readyz` also checks the database, NoDesk content, NoMoney, and Yumi. An HTTP 200 from the homepage alone is insufficient acceptance.

Failures before public release trigger a recovery attempt. After release, arbitrary data rollback may discard new writes. An image-only rollback does not restore the database. See the [Compose deployment runbook](docs/deployment/compose-verified-deploy.md).

## Backup and restore

Two backup scopes are available:

- **Account module backups** in NoDesk settings: NoNo, NoDesk, NoMoney, Yumi, and NoStar; local files, WebDAV, and schedules. Jobs run in the background, so check the original job after a network interruption.
- **Full disaster recovery backups** on the server: PostgreSQL and all application data volumes, including accounts and sessions.

```bash
npm run backup:create
npm run backup:list
npm run backup:verify -- --id BACKUP_ID
npm run backup:drill -- --id BACKUP_ID
```

Drills use temporary databases and directories. Actual restoration overwrites production data and must share the deployment lock:

```bash
flock -n /var/lock/nono-deploy.lock npm run backup:restore -- \
  --dir /opt/nono --base-url http://127.0.0.1:8188 \
  --id BACKUP_ID --confirm BACKUP_ID
```

Full archives are not additionally encrypted and do not contain `.env`, certificates, or reverse-proxy configuration. Preserve keys separately and copy encrypted backups off-host. Deployment safety snapshots live in the backup volume's `deployment-safety` subdirectory, outside ordinary retention.

See [Full backup and restore](docs/deployment/full-backup-restore.md), [NoMoney migration](docs/deployment/nomoney-production-migration.md), and [Yumi split migration](docs/deployment/yumi-split-migration.md).

## Development and verification

Install Node.js 22+, npm, PostgreSQL, and the pnpm version declared in `apps/blog/package.json`. Root npm workspaces contain only `packages/*`; each `apps/*` project has its own lockfile.

```bash
npm run install:all
npm run prisma:generate
```

For NoNo-only development, `npm ci` is sufficient to install its dependencies. Set `.env`'s `DATABASE_URL` to your local database and keep it consistent with `POSTGRES_PASSWORD`:

```bash
docker compose up -d postgres
npx prisma migrate dev --schema packages/server/prisma/schema.prisma
PORT=3000 node --env-file=.env --import tsx packages/server/src/server.ts
```

In another terminal, run `npm run dev:web` and open `http://localhost:5173`. Vite proxies API calls to `127.0.0.1:3000` by default. Compose's `PORT` includes a bind address; direct Node execution requires a numeric port instead. Use Compose to verify integrated NoDesk, NoMoney, and Yumi behavior.

| Command | Purpose |
| --- | --- |
| `npm test` | NoNo server, web and extension tests |
| `npm run test:blog` | NoDesk tests |
| `npm run test:nomoney` | NoMoney/Yumi frontend and backend tests |
| `npm run test:nostar` | NoStar tests |
| `npm run test:gateway` | Gateway, deployment, backup and restore contracts |
| `npm run build:all` | All product builds |
| `npm run test:e2e` | Desktop and mobile Playwright tests |
| `npm run audit:all` | Dependency audits |
| `npm run verify:all` | Tests, type checks, builds, E2E, audits and extension packaging |

Run `npm run test:e2e:install` before the first browser test. Mocked-API E2E tests do not replace real database integration tests or deployment acceptance.

## Chrome extension

```bash
npm run build -w packages/extension
npm run package:extension
```

Enable Developer mode in `chrome://extensions/` and load `packages/extension/dist`. Create a dedicated Token in NoNo account settings, then configure the service origin and Token in the extension. Public origins must use HTTPS.

The extension reads the current page only after user action and requests service access for the exact configured origin. Use separate expiring Tokens per device with `bookmarks:read`, `bookmarks:write`, and `ai:analyze` scopes.

See [Extension documentation](packages/extension/README.md) and [Store publishing](packages/extension/CHROME_WEB_STORE.md).

## Security and operational boundaries

- Browser sessions use HttpOnly cookies. The server checks permissions, resource ownership, and cross-site write origins. Sessions and API Tokens are stored as hashes.
- Outbound requests restrict private addresses and validate redirect destinations. Cross-origin redirects cannot replay sensitive request bodies. Configure final AI/WebDAV URLs where possible.
- `PRIVATE_OUTBOUND_HOSTS` relaxes restrictions for named hosts; allow only required hosts under your control.
- Forwarded headers are untrusted by default. Enabling `GATEWAY_TRUST_FORWARDED_HEADERS` also requires a trusted proxy address configuration.
- Protect `.env`, the Docker socket, backups, and logs. Do not expose PostgreSQL or unencrypted management endpoints publicly.
- Maintain secrets, audit dependencies, and rehearse off-host recovery. Do not commit credentials, database copies, or real user data.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing Compose variables | `.env`, placeholder values, bootstrap token |
| NoMoney/Yumi returns to login on local HTTP | Local Secure Cookie flags; production must remain HTTPS |
| Passkey failure | HTTPS, browser origin, RP ID, configured origin |
| AI returns fallback results | Configuration load, connection test, key, model, final service URL, private-host allowlist |
| Database connection fails after upgrade | Environment password versus the existing database role password |
| `/readyz` returns 503 | `docker compose ps` and `docker compose logs --tail=100 app postgres` |
| Missing settings screen | Account controls are consolidated in Account settings; backups are in NoDesk settings |

## Repository and documentation

```text
packages/server    NoNo/NoStar API, Prisma, authentication, backups, jobs
packages/web       NoNo Vue frontend
packages/extension Chrome extension
apps/blog          NoDesk Next.js content site
apps/nomoney       NoMoney/Yumi Express + React
apps/nostar        NoStar React frontend
docker             Gateway and container entry
scripts            Deployment, acceptance, backups, restore, migration
tests              E2E, integration and deployment contracts
docs               Operations, design conventions and quality baselines
```

- [Shared UI contract](docs/design/ui-contract.md) · [Appearance settings](docs/design/appearance-settings.md)
- [Audit logging](docs/deployment/audit-logs.md) · [Quality baseline](docs/quality/ui-performance-baseline.md)
- [NoMoney](apps/nomoney/README.md) · [NoStar](apps/nostar/README.md)

## License and community

NoStar integrates and extends [AmintaCCCP/GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager), retaining its [MIT license](apps/nostar/LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for other notices. There is currently no root LICENSE granting permission to freely copy, modify, or redistribute the entire repository.

[GitHub](https://github.com/noaul/nono) · [Issues](https://github.com/noaul/nono/issues) · [Privacy](https://noaul.com/privacy) · [LINUX DO](https://linux.do/)
