# NoStar

NoStar is the GitHub Stars workspace integrated into NoNo. It provides repository sync, AI analysis, categories, semantic search, release tracking, discovery, WebDAV backup, network proxy settings, and optional aria2 downloads.

[中文说明](README_zh.md)

## Integrated Architecture

- Served from the same origin at `/nostar`.
- Uses the existing NoNo Session; unauthenticated users are redirected to `/login?next=/nostar`.
- Repository and configuration data is isolated by NoNo user and stored in PostgreSQL through Prisma.
- GitHub, AI, WebDAV, proxy, and aria2 secrets are encrypted with NoNo's `ENCRYPTION_KEY`.
- AI profiles can also be managed from the NoNo admin LLM page.
- The production Docker image contains NoNo, Nodesk, NoMoney, and NoStar. No separate NoStar container or SQLite runtime is required.

## Development

From the repository root:

```bash
npm install
npm run dev
npm run dev:nostar
```

The Vite development server uses `/api/nostar` for backend requests. A valid NoNo login session is required for user data APIs.

Tests and build:

```bash
npm run test:nostar
npm run build:nostar
```

## Docker

Build and run the complete NoNo stack from the repository root:

```bash
docker compose up -d --build
```

Open:

```text
http://127.0.0.1:3000/nostar
```

The application container runs Prisma migrations before startup. NoStar uses the same PostgreSQL database and NoNo encryption key as the main application.

## Legacy SQLite Migration

Migrate an existing GithubStars `data.db` into one NoNo user:

```bash
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin --dry-run
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin
```

The migration automatically reads `.encryption-key` beside the SQLite database, or accepts `--source-key <64-hex>`. A real migration creates a timestamped backup before writing to PostgreSQL and uses idempotent upserts.

## Technology

- React, TypeScript, Vite, Tailwind CSS, Zustand
- Fastify, Prisma, PostgreSQL
- NoNo Cookie Session SSO
- Single-image Docker deployment

The imported upstream project remains MIT licensed; see [LICENSE](LICENSE).
