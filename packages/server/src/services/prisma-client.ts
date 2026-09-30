import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Prisma 7 connects through the pg driver adapter. pg waits forever for a connection by default;
// keep Prisma 6's 5 second connect timeout so readiness checks fail fast when PostgreSQL is down.
export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
}
