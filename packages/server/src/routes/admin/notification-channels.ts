import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireBrowserSession, requireInternalToken } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';
import { numericParam } from '../../utils/route-params.js';
import {
  encodeChannelConfig,
  NOTIFICATION_CHANNEL_TYPES,
  NOTIFICATION_SEVERITIES,
  publicChannel,
} from '../../services/notification-channels.service.js';

const createSchema = z.object({
  type: z.enum(NOTIFICATION_CHANNEL_TYPES),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().optional().default(true),
  minSeverity: z.enum(NOTIFICATION_SEVERITIES).optional().default('warning'),
  linkDigest: z.boolean().optional().default(false),
  config: z.record(z.string(), z.unknown()),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  minSeverity: z.enum(NOTIFICATION_SEVERITIES).optional(),
  linkDigest: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const relaySchema = z.object({
  product: z.enum(['nomoney', 'yumi']),
  subject: z.string().trim().min(1).max(300),
  text: z.string().max(100_000),
  severity: z.enum(NOTIFICATION_SEVERITIES).optional().default('warning'),
});

const MAX_CHANNELS_PER_USER = 20;

export async function notificationChannelRoutes(app: FastifyInstance, services: AppServices) {
  const owned = async (userId: number, id: number) => {
    const channel = await services.prisma.notificationChannel.findFirst({ where: { id, userId } });
    if (!channel) throw Object.assign(new Error('Notification channel not found'), { statusCode: 404 });
    return channel;
  };

  app.get('/api/admin/notification-channels', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const channels = await services.prisma.notificationChannel.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
    return sendOk(reply, { items: channels.map(publicChannel) });
  });

  app.post('/api/admin/notification-channels', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const input = createSchema.parse(request.body);
    if (await services.prisma.notificationChannel.count({ where: { userId: user.id } }) >= MAX_CHANNELS_PER_USER) {
      throw Object.assign(new Error(`At most ${MAX_CHANNELS_PER_USER} notification channels are allowed`), { statusCode: 400 });
    }
    const channel = await services.prisma.notificationChannel.create({
      data: {
        userId: user.id,
        type: input.type,
        name: input.name,
        enabled: input.enabled,
        minSeverity: input.minSeverity,
        linkDigest: input.linkDigest,
        config: encodeChannelConfig(input.type, input.config, null, services.encryptionKey) as object,
      },
    });
    setAuditContext(request, { action: 'create', resourceType: 'notification_channel', resourceId: channel.id, resourceLabel: channel.name, details: { after: { type: channel.type, enabled: channel.enabled, minSeverity: channel.minSeverity } } });
    return sendOk(reply, publicChannel(channel));
  });

  app.patch('/api/admin/notification-channels/:id', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const current = await owned(user.id, numericParam(request, 'id'));
    const input = updateSchema.parse(request.body);
    const channel = await services.prisma.notificationChannel.update({
      where: { id: current.id },
      data: {
        name: input.name,
        enabled: input.enabled,
        minSeverity: input.minSeverity,
        linkDigest: input.linkDigest,
        config: input.config ? encodeChannelConfig(current.type as never, input.config, current.config, services.encryptionKey) as object : undefined,
      },
    });
    setAuditContext(request, { action: 'update', resourceType: 'notification_channel', resourceId: channel.id, resourceLabel: channel.name, details: { after: { enabled: channel.enabled, minSeverity: channel.minSeverity, configChanged: Boolean(input.config) } } });
    return sendOk(reply, publicChannel(channel));
  });

  // Sends this week's broken-link digest to one channel now, whatever the schedule says.
  app.post('/api/admin/notification-channels/:id/link-digest', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const channel = await owned(user.id, numericParam(request, 'id'));
    const result = await services.notificationDispatcher.sendLinkDigest(channel, user);
    if (!result.ok && !result.skipped) throw Object.assign(new Error(result.error || 'Delivery failed'), { statusCode: 502 });
    return sendOk(reply, result);
  });

  app.delete('/api/admin/notification-channels/:id', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const channel = await owned(user.id, numericParam(request, 'id'));
    await services.prisma.notificationChannel.delete({ where: { id: channel.id } });
    setAuditContext(request, { action: 'delete', resourceType: 'notification_channel', resourceId: channel.id, resourceLabel: channel.name });
    return sendOk(reply, { ok: true });
  });

  app.post('/api/admin/notification-channels/:id/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const channel = await owned(user.id, numericParam(request, 'id'));
    return sendOk(reply, await services.notificationDispatcher.test(channel, user));
  });

  app.get('/api/admin/notification-deliveries', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).optional().default(50) }).parse(request.query);
    const items = await services.prisma.notificationDelivery.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { channel: { select: { name: true, type: true } } },
    });
    return sendOk(reply, {
      items: items.map((item) => ({
        id: item.id,
        source: item.source,
        title: item.title,
        status: item.status,
        error: item.error,
        attempts: item.attempts,
        channel: item.channel,
        updatedAt: item.updatedAt,
      })),
    });
  });

  // NoMoney and Yumi hand their reminders and outage alerts to the administrator's channels here.
  app.post('/api/internal/notifications/relay', async (request, reply) => {
    if (!requireInternalToken(request, reply, services)) return;
    const input = relaySchema.parse(request.body);
    const results = await services.notificationDispatcher.relay(input.product, input);
    return sendOk(reply, { results });
  });
}
