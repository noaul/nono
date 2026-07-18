import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppServices, AuthUser } from '../types.js';

export interface AuditContext {
  action?: string;
  resourceType?: string;
  resourceId?: string | number | null;
  resourceLabel?: string | null;
  details?: unknown;
  errorMessage?: string;
  skip?: boolean;
}

const contextKey = Symbol('nono.audit-context');
const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function setAuditContext(request: FastifyRequest, context: AuditContext) {
  const current = (request as any)[contextKey] as AuditContext | undefined;
  (request as any)[contextKey] = { ...current, ...context };
}

export function registerAuditHooks(app: FastifyInstance, services: AppServices) {
  app.addHook('onResponse', async (request, reply) => {
    if (!mutationMethods.has(request.method)) return;
    const actor = (request as any).user as AuthUser | undefined;
    if (!actor) return;
    const context = (request as any)[contextKey] as AuditContext | undefined;
    if (context?.skip) return;

    const classification = classifyAuditMutation(request.method, request.url);
    if (!classification) return;
    const params = request.params as Record<string, unknown> | undefined;
    const body = request.body as Record<string, unknown> | undefined;
    const statusCode = reply.statusCode;

    try {
      await services.auditLogService.record({
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: context?.action || classification.action,
        resourceType: context?.resourceType || classification.resourceType,
        resourceId: normalizeOptionalText(context?.resourceId ?? params?.id ?? summarizeIds(body?.ids)),
        resourceLabel: normalizeOptionalText(context?.resourceLabel ?? body?.name ?? body?.displayName ?? body?.label),
        result: statusCode < 400 ? 'success' : 'failure',
        statusCode,
        ipAddress: request.ip || null,
        userAgent: normalizeOptionalText(request.headers['user-agent']),
        details: withAuditError(context?.details ?? {
          route: request.url.split('?', 1)[0],
          params: params || {},
          query: request.query || {},
          changes: body || {},
        }, context?.errorMessage),
      });
    } catch (error) {
      request.log.error({ err: error }, 'failed to persist audit log');
    }
  });
}

export function classifyAuditMutation(method: string, rawUrl: string) {
  const pathname = rawUrl.split('?', 1)[0];
  if (pathname.startsWith('/api/admin/notifications') || pathname === '/api/admin/bookmarks/preview') return null;

  const resourceType = classifyResource(pathname);
  const action = classifyAction(method, pathname);
  return { resourceType, action };
}

function classifyResource(pathname: string) {
  if (pathname.startsWith('/api/admin/folders')) return 'folder';
  if (pathname.startsWith('/api/admin/links') || pathname.startsWith('/api/admin/bookmarks')) return 'bookmark';
  if (pathname.startsWith('/api/admin/site')) return 'site';
  if (pathname.startsWith('/api/admin/users')) return 'user';
  if (pathname.startsWith('/api/admin/config')) return 'system';
  if (pathname.startsWith('/api/admin/tokens')) return 'token';
  if (pathname.startsWith('/api/admin/backups')) return 'backup';
  if (pathname.startsWith('/api/admin/audit')) return 'audit';
  if (pathname.includes('/passkeys')) return 'passkey';
  if (pathname.includes('/sessions')) return 'session';
  if (pathname.includes('/llm') || pathname.startsWith('/api/ai/')) return 'llm';
  if (pathname.startsWith('/api/admin/account')) return 'account';
  if (pathname.startsWith('/api/admin/nodesk') || pathname.startsWith('/api/nodesk')) return 'nodesk';
  if (pathname.startsWith('/api/nostar')) return 'nostar';
  return 'system';
}

function classifyAction(method: string, pathname: string) {
  if (pathname.includes('/bulk-delete')) return 'bulk_delete';
  if (pathname.includes('/bulk-move')) return 'bulk_move';
  if (pathname.includes('/reorder')) return 'reorder';
  if (pathname.endsWith('/import')) return 'import';
  if (pathname.includes('/health-check')) return 'health_check';
  if (pathname.includes('/health-repair')) return 'health_repair';
  if (pathname.endsWith('/test')) return 'test_connection';
  if (pathname.includes('/sync')) return 'sync';
  if (pathname.endsWith('/automation') || pathname.endsWith('/settings') || pathname.endsWith('/config')) return 'settings_update';
  if (method === 'POST') return 'create';
  if (method === 'DELETE') return 'delete';
  return 'update';
}

function summarizeIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 20).map(String).join(',');
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, 500);
}

function withAuditError(details: unknown, errorMessage: string | undefined) {
  if (!errorMessage) return details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return { ...(details as Record<string, unknown>), error: errorMessage };
  }
  return { details, error: errorMessage };
}
