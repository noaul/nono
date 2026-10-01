# Moneypulse

Moneypulse is a single-user asset and recurring cost manager for phone cards, VPS instances, domains, and subscriptions.

## Features

- Single-user setup, login, logout, and password change.
- HttpOnly cookie JWT authentication.
- Asset CRUD for phone cards, VPS, domains, and subscriptions.
- Mark paid / renewed: advances the due date one billing cycle and records an expense, with undo and a per-item history. Auto-renew items roll forward on their own (Settings → auto-renew bookkeeping).
- Expense ledger with CSV export; CSV import/export for every asset list; bulk status, tag, renew and delete.
- Currencies: CNY, USD, HKD, JPY, GBP, EUR, CAD, SGD, AUD. Dashboard totals are converted to the default currency with cached Frankfurter rates, and fall back to per-currency figures when rates are unavailable.
- Dashboard with predicted monthly/yearly costs, actual spend (any year), a 12-month trend, and an actionable 30-day due list including phone keep-alive deadlines.
- Reminders by email, webhook, Telegram or Bark; missed days are caught up and overdue items are re-sent at 1/7/14/30 days.
- Yumi: outage, recovery, disk and traffic-quota alerts; RDAP registry expiry sync and TLS certificate checks for domains.
- List filters, sort, page and view are kept in the URL; `/` focuses search and `n` adds an entry.
- Shared NoNo UI contract: teal accent, compact tables, mono data typography, low-noise borders; colour mode (`nono:color-mode`, system by default) and language (`nono:locale`) are shared with the other NoNo apps.
- SQLite file persistence through `sql.js`.
- Docker and Docker Compose packaging.

## Local Development

```bash
npm install
npm run test -w backend
npm run build
npm run dev -w backend
```

The backend serves the Vite build from `backend/public` after `npm run build`.

## Environment

Copy `.env.example` to `.env` for local or Docker use.

Required in production:

```text
JWT_SECRET=replace-with-a-long-random-secret
```

Optional email configuration:

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=secret
SMTP_FROM=moneypulse@example.com
SMTP_TO=owner@example.com
```

## Docker

```bash
docker compose up --build
```

Open:

```text
http://localhost:18096
```

SQLite data is persisted in:

```text
./data/app.db
```

## Notes

- `.env`, `data/`, SQLite database files, build output, and `node_modules/` are intentionally ignored.
- SMTP password and JWT secret are not stored in SQLite. SMTP host, port and user come from the environment, falling back to the values saved in Settings.
- Telegram bot tokens and Bark URLs are stored encrypted with the product encryption key.
- Restoring a backup replaces users and sessions, so you sign in again with the account from the backup.
