import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';
import type { TrashItemSummary } from '../../services/repository.js';

const trashListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export async function trashRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/trash', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const query = trashListSchema.parse(request.query);
    const page = await services.repo.listTrashItems(user.id, { limit: query.limit, cursor: query.cursor });
    return sendOk(reply, { items: page.items.map(toPublicTrashItem), nextCursor: page.nextCursor, total: page.total });
  });

  app.post('/api/admin/trash/:id/restore', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const id = String((request.params as { id?: string }).id || '');
    const restored = await services.repo.restoreTrashItem(user.id, id);
    setAuditContext(request, {
      action: 'restore',
      resourceType: restored.kind,
      resourceId: String(restored.entityId),
      resourceLabel: restored.label,
      details: { trashId: restored.id },
    });
    return sendOk(reply, toPublicTrashItem(restored));
  });

  app.delete('/api/admin/trash/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const id = String((request.params as { id?: string }).id || '');
    const item = await services.repo.permanentlyDeleteTrashItem(user.id, id);
    setAuditContext(request, {
      action: 'permanent_delete',
      resourceType: item.kind,
      resourceId: String(item.entityId),
      resourceLabel: item.label || null,
    });
    return sendOk(reply, { ok: true });
  });

  app.delete('/api/admin/trash', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const deleted = await services.repo.emptyTrash(user.id);
    setAuditContext(request, { action: 'empty', resourceType: 'trash', details: { deleted } });
    return sendOk(reply, { deleted });
  });
}

function toPublicTrashItem(item: TrashItemSummary) {
  return {
    id: item.id,
    kind: item.kind,
    entityId: item.entityId,
    label: item.label,
    deletedAt: item.deletedAt,
  };
}
