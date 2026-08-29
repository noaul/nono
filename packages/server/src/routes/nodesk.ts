import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdminSession, resolveUser } from '../plugins/auth.js';
import { sendError, sendOk } from '../plugins/responses.js';
import { setAuditContext } from '../plugins/audit.js';
import { NodeskContentStore } from '../services/nodesk-content.service.js';
import { currentSessionId } from '../services/session.service.js';
import type { AppServices } from '../types.js';
import { navigationEntriesSchema } from '../utils/site-settings.js';

const workbenchSettingsSchema = z.object({
  quickEntriesVisible: z.boolean().optional(),
  navigationEntries: navigationEntriesSchema.optional(),
}).refine((value) => value.quickEntriesVisible !== undefined || value.navigationEntries !== undefined, {
  message: 'At least one workbench setting is required',
});

export async function nodeskRoutes(app: FastifyInstance, services: AppServices) {
  const store = new NodeskContentStore(services.nodeskContentDir);

  app.get('/images/:filename', async (request, reply) => {
    const filename = String((request.params as { filename?: string }).filename || '');
    if (!/^avatar-[a-f0-9]{64}\.webp$/i.test(filename)) {
      return sendError(reply, 404, 'NoDesk asset not found');
    }
    const content = await store.read(`public/images/${filename}`);
    return reply
      .type('image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(content);
  });

  app.get('/api/nodesk/content/:resource', async (request, reply) => {
    const resource = String((request.params as { resource?: string }).resource || '');
    const content = await store.readPublicJson(resource);
    if (resource !== 'site' && resource !== 'site-content') return sendOk(reply, content);
    const user = await resolveUser(request, services);
    const canReadPrivateContent = user?.role === 'admin' && Boolean(currentSessionId(request));
    return sendOk(reply, canReadPrivateContent ? content : withoutPrivateSiteContent(content));
  });

  app.put('/api/admin/nodesk/workbench', async (request, reply) => {
    const user = await requireAdminSession(request, reply, services);
    if (!user) return;
    const input = workbenchSettingsSchema.parse(request.body);
    const site = await services.repo.getSite(user.id);
    if (!site) throw Object.assign(new Error('Site not found'), { statusCode: 404 });
    const before = {
      nodeskWorkbench: site.settings.nodeskWorkbench,
      navigationEntries: site.settings.navigationEntries,
    };
    const currentWorkbench = site.settings.nodeskWorkbench && typeof site.settings.nodeskWorkbench === 'object'
      ? site.settings.nodeskWorkbench as { quickEntriesVisible?: unknown }
      : {};
    const nodeskWorkbench = {
      quickEntriesVisible: input.quickEntriesVisible ?? (typeof currentWorkbench.quickEntriesVisible === 'boolean' ? currentWorkbench.quickEntriesVisible : true),
    };
    const settings = {
      ...site.settings,
      nodeskWorkbench,
      ...(input.navigationEntries ? { navigationEntries: input.navigationEntries, navigationEntriesVersion: 4 } : {}),
    };
    await services.repo.updateSite(user.id, { settings });
    setAuditContext(request, {
      action: 'update',
      resourceType: 'nodesk',
      resourceId: 'workbench',
      resourceLabel: 'NoDesk 工作台设置',
      details: {
        before,
        after: {
          nodeskWorkbench,
          ...(input.navigationEntries ? { navigationEntries: input.navigationEntries } : {}),
        },
      },
    });
    return sendOk(reply, nodeskWorkbench);
  });

  app.get('/api/admin/nodesk/files', async (request, reply) => {
    const user = await requireAdminSession(request, reply, services);
    if (!user) return;
    const logicalPath = String((request.query as { path?: string }).path || '');
    const content = await store.read(logicalPath);
    return sendOk(reply, { path: logicalPath, contentBase64: content.toString('base64') });
  });

  app.get('/api/admin/nodesk/files/list', async (request, reply) => {
    const user = await requireAdminSession(request, reply, services);
    if (!user) return;
    const logicalPath = String((request.query as { path?: string }).path || '');
    return sendOk(reply, await store.list(logicalPath));
  });

  app.post('/api/admin/nodesk/files/batch', { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireAdminSession(request, reply, services);
    if (!user) return;
    const files = (request.body as { files?: unknown })?.files;
    return sendOk(reply, await store.batch(files));
  });
}

function withoutPrivateSiteContent(content: unknown) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
  const publicContent = { ...(content as Record<string, unknown>) };
  delete publicContent.calendarEvents;
  return publicContent;
}
