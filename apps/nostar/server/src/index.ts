import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger, morganLoggerStream } from './services/logger.js';
import { getDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import healthRouter from './routes/health.js';
import repositoriesRouter from './routes/repositories.js';
import releasesRouter from './routes/releases.js';
import categoriesRouter from './routes/categories.js';
import configsRouter from './routes/configs.js';
import syncRouter from './routes/sync.js';
import proxyRouter from './routes/proxy.js';
import logsRouter from './routes/logs.js';

export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ exposedHeaders: ['X-Log-Count'] }));
  app.use(morgan('combined', { stream: morganLoggerStream }));
  app.use(express.json({ limit: '50mb' }));

  // Auth middleware for all /api/* except /api/health
  app.use('/api', authMiddleware);

  // Routes
  app.use(healthRouter);

  // Wave 2: Data CRUD routes
  app.use(repositoriesRouter);
  app.use(releasesRouter);
  app.use(categoriesRouter);
  app.use(configsRouter);
  app.use(syncRouter);

  // Wave 3: Proxy routes
  app.use(proxyRouter);

  // Wave 4: Logs route
  app.use(logsRouter);

  // Global error handler for API routes
  app.use('/api', errorHandler);

  // Serve the frontend from the same process in production.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicDir = path.resolve(__dirname, '../public');

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
    logger.info('server.static', 'Serving frontend static files', { publicDir });
  } else {
    logger.info('server.static', 'Public directory not found; running in API-only mode', { publicDir });
  }

  return app;
}

function startServer(): void {
  // Initialize database
  const db = getDb();
  runMigrations(db);
  logger.info('server.init', 'Database initialized');

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('server.start', `Server running on port ${config.port}`);
    if (!config.apiSecret) {
      logger.warn('server.auth', 'Running without API_SECRET — auth is disabled');
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('server.shutdown', 'Shutting down...');
    server.close(() => {
      closeDb();
      logger.info('server.shutdown', 'Server stopped');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Only start server when run directly (not imported for tests)
const isMainModule = process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;
if (isMainModule) {
  startServer();
}
