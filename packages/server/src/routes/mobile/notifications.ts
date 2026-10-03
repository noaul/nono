import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireBrowserSession } from '../../plugins/auth.js';
import { sendError, sendOk } from '../../plugins/responses.js';
import { isEventId } from '../../services/mobile-events.service.js';
import { isDeviceEligible } from '../../services/mobile-store.js';

export async function mobileNotificationRoutes(app: FastifyInstance, services: AppServices) {
  const find = async (userId: number, eventId: string) => {
    if (!isEventId(eventId)) return null;
    const event = await services.mobileStore.findEvent(userId, eventId);
    return event && event.expiresAt > new Date() ? event : null;
  };
  app.get('/api/mobile/notifications/:eventId', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const event = await find(user.id, (request.params as { eventId: string }).eventId);
    if (!event) return sendError(reply, 404, 'Notification not found');
    return sendOk(reply, { eventId: event.eventId, source: event.source, severity: event.severity, title: event.title, targetPath: event.targetPath, occurredAt: event.occurredAt, expiresAt: event.expiresAt });
  });
  app.post('/api/mobile/notifications/:eventId/opened', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const { deviceId } = z.object({ deviceId: z.string().uuid() }).parse(request.body);
    const event = await find(user.id, (request.params as { eventId: string }).eventId);
    const device = await services.mobileStore.getDevice(deviceId);
    if (!event || !device || device.userId !== user.id || !isDeviceEligible(device, new Date())) return sendError(reply, 404, 'Notification not found');
    const attempt = await services.mobileStore.findAttempt(event.id, device.id);
    if (!attempt) return sendError(reply, 404, 'Notification not found');
    await services.mobileStore.markOpened(attempt.id, new Date());
    return sendOk(reply, { ok: true });
  });
  app.get('/api/mobile/deliveries', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    const [items, counts] = await Promise.all([services.mobileStore.listAttempts(user.id, limit), services.mobileStore.countAttempts(user.id)]);
    return sendOk(reply, {
      enabled: services.mobilePushOutbox.enabled, counts,
      items: items.map(item => ({ id: item.id, deviceId: item.deviceId, eventId: item.event.eventId, source: item.event.source, title: item.event.title, status: item.status, attempts: item.attempts, errorCode: item.errorCode, acceptedAt: item.acceptedAt, receivedAt: null, openedAt: item.openedAt, updatedAt: item.updatedAt })),
    });
  });
}
