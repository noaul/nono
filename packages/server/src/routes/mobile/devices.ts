import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireBrowserSession } from '../../plugins/auth.js';
import { sendError, sendOk } from '../../plugins/responses.js';
import { setAuditContext } from '../../plugins/audit.js';
import { currentSessionId } from '../../services/session.service.js';
import { MOBILE_PROVIDERS } from '../../services/mobile-devices.service.js';

const deviceIdSchema = z.string().uuid();

// userId and sessionId are never read from the body; unknown keys are stripped by zod.
const registerSchema = z.object({
  installationId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/, 'installationId is invalid'),
  provider: z.enum(MOBILE_PROVIDERS),
  registrationId: z.string().trim().min(1).max(512).regex(/^[\x21-\x7e]+$/, 'registrationId is invalid'),
  appVersion: z.string().trim().min(1).max(40).regex(/^[0-9A-Za-z._+-]+$/, 'appVersion is invalid'),
});

const revokeSchema = z.object({
  deviceId: z.string().max(64),
  revokeToken: z.string().max(200),
});

export async function mobileDeviceRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/mobile/devices', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    // The body carries the vendor token: keep it out of the audit log.
    setAuditContext(request, { action: 'create', resourceType: 'mobile_device', details: { route: '/api/mobile/devices' } });
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const sessionId = currentSessionId(request);
    if (!sessionId) return sendError(reply, 403, 'A browser session is required');
    const input = registerSchema.parse(request.body);
    const result = await services.mobileDevices.register(user.id, sessionId, input);
    setAuditContext(request, { resourceId: result.deviceId, resourceLabel: input.provider, details: { provider: input.provider, appVersion: input.appVersion } });
    return sendOk(reply, result);
  });

  app.get('/api/mobile/devices', async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    return sendOk(reply, { items: await services.mobileDevices.list(user.id, currentSessionId(request)) });
  });

  app.delete('/api/mobile/devices/:id', async (request, reply) => {
    setAuditContext(request, { action: 'delete', resourceType: 'mobile_device' });
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    const id = deviceIdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success || !(await services.mobileDevices.remove(user.id, id.data))) {
      return sendError(reply, 404, 'Mobile device not found');
    }
    return sendOk(reply, { ok: true });
  });

  // Session-less on purpose: a phone that already signed out locally still has to be able to stop
  // pushes. The answer is identical whether or not the device exists or the token matched.
  app.post('/api/mobile/devices/revoke', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    setAuditContext(request, { skip: true });
    const input = revokeSchema.parse(request.body);
    const id = deviceIdSchema.safeParse(input.deviceId);
    if (id.success && input.revokeToken) await services.mobileDevices.revoke(id.data, input.revokeToken);
    return sendOk(reply, { ok: true });
  });
}
