import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppContext } from './types.js';
import { registerAuthRoutes, requireAuth } from './auth.js';
import { registerAssetRoutes } from './assets.js';
import { registerExpenseRoutes } from './expenses.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerSettingsRoutes } from './settings.js';
import { registerReminderRoutes } from './reminders.js';
import { buildEncryptedBackupEnvelope, registerBackupRoutes } from './backup.js';
import { registerAccountRoutes } from './accounts.js';
import { registerInternalRenewalRoutes, registerRenewalRoutes } from './renewals.js';
import { errorHandler } from './http.js';
import { registerStatusRoutes } from './status.js';

export function createApp(context: AppContext) {
  const product = context.product;
  const allowedTypes = product === 'yumi'
    ? ['vps', 'domain'] as const
    : product === 'nomoney'
      ? ['phone', 'subscription'] as const
      : ['phone', 'vps', 'domain', 'subscription'] as const;
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'upgrade-insecure-requests': null
        }
      }
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(originGuard);
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.get('/livez', (_req, res) => {
    res.json({ ok: true });
  });
  api.get('/readyz', (_req, res) => {
    try {
      const row = context.db.get<{ ok: number }>('SELECT 1 AS ok');
      if (Number(row?.ok) !== 1) throw new Error('SQLite readiness query failed');
      res.json({ ok: true, checks: { sqlite: true } });
    } catch {
      res.status(503).json({ ok: false, checks: { sqlite: false } });
    }
  });
  registerAuthRoutes(api, context);
  if (product !== 'nomoney') registerInternalRenewalRoutes(api, context);

  api.use(requireAuth(context));
  registerAssetRoutes(api, context, [...allowedTypes]);
  if (product !== 'nomoney') registerRenewalRoutes(api, context);
  if (product !== 'yumi') registerAccountRoutes(api, context);
  registerExpenseRoutes(api, context, [...allowedTypes]);
  if (product !== 'yumi') registerDashboardRoutes(api, context, [...allowedTypes]);
  if (product === 'yumi') registerStatusRoutes(api, context);
  registerSettingsRoutes(api, context);
  registerReminderRoutes(api, context, [...allowedTypes]);
  registerBackupRoutes(api, context);
  api.get('/export/json', (_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="${product ?? 'nomoney'}-backup.json.enc"`);
    res.json(buildEncryptedBackupEnvelope(context));
  });

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}

function originGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }

  const host = req.get('x-forwarded-host') ?? req.get('host');
  if (!host) {
    res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Invalid request origin' } });
    return;
  }

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const allowedHosts = String(host)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.includes(originHost)) {
      next();
      return;
    }
  } catch {
    // Fall through to the rejection below.
  }

  res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Invalid request origin' } });
}
