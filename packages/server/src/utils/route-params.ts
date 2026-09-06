import type { FastifyRequest } from 'fastify';

/**
 * Autoincrement ids arrive as path segments and are handed straight to Prisma, which rejects a NaN
 * id with a validation error that carries no status code — so `/api/admin/links/abc` would come
 * back as an opaque 500 rather than a 400. Parsing at the edge keeps the failure honest.
 *
 * Only for numeric ids. Routes keyed by a uuid (sessions, passkeys, trash, backups) read the
 * segment as a string and validate it themselves.
 */
export function numericParam(request: FastifyRequest, name = 'id') {
  const value = Number((request.params as Record<string, unknown> | undefined)?.[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw Object.assign(new Error(`Invalid ${name} parameter`), { statusCode: 400 });
  }
  return value;
}
