import type { FastifyRequest } from 'fastify';

export const API_TOKEN_SCOPES = [
  'bookmarks:read',
  'bookmarks:write',
  'ai:analyze',
  'clips:read',
  'clips:write',
  '*',
] as const;
export type ApiTokenScope = typeof API_TOKEN_SCOPES[number];

/**
 * Applied to newly created tokens only. Tokens already in the database keep the scopes they were
 * stored with — widening those silently would hand existing credentials new authority that nobody
 * granted. Their owner amends them through PATCH /api/admin/tokens/:id instead.
 */
export const DEFAULT_API_TOKEN_SCOPES: ApiTokenScope[] = [
  'bookmarks:read',
  'bookmarks:write',
  'ai:analyze',
  'clips:read',
  'clips:write',
];

export function requiredApiTokenScope(request: FastifyRequest): ApiTokenScope {
  const pathname = request.url.split('?', 1)[0];
  if (request.method === 'GET' && (pathname === '/api/admin/folders' || pathname === '/api/admin/links')) {
    return 'bookmarks:read';
  }
  if (pathname === '/api/admin/links' || pathname.startsWith('/api/admin/links/')) {
    return request.method === 'GET' ? 'bookmarks:read' : 'bookmarks:write';
  }
  if (pathname === '/api/clipper' || pathname.startsWith('/api/clipper/')) {
    return request.method === 'GET' ? 'clips:read' : 'clips:write';
  }
  if (request.method === 'POST' && pathname === '/api/ai/analyze') return 'ai:analyze';
  return '*';
}

export function hasApiTokenScope(scopes: readonly string[], required: ApiTokenScope) {
  return scopes.includes('*') || scopes.includes(required);
}
