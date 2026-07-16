# Moneypulse

Moneypulse is a single-user asset and recurring cost manager for phone cards, VPS instances, domains, and subscriptions.

## Features

- Single-user setup, login, logout, and password change.
- HttpOnly cookie JWT authentication.
- Asset CRUD for phone cards, VPS, domains, and subscriptions.
- Expense history for actual paid costs.
- Multi-currency support: CNY, USD, GBP, EUR.
- Dashboard with predicted monthly/yearly costs, actual yearly expenses, active asset counts, charts, and due items.
- Daily digest email reminders with reminder logs.
- Geist Minimalist UI: dark-first, compact tables, mono data typography, low-noise borders.
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
- SMTP password and JWT secret are not stored in SQLite.
- The first version displays currencies separately and does not perform exchange-rate conversion.
