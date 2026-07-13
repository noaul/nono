import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../types.js';
import { requireAuth } from '../../plugins/auth.js';
import { sendOk } from '../../plugins/responses.js';
import { assertStrongPassword } from '../../services/auth.service.js';
import { publicUser } from '../../services/repository.js';
import { encryptSecret, hashPassword, verifyPassword } from '../../utils/crypto.js';

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

const llmSchema = z.object({
  provider: z.enum(['openai', 'claude']).nullable().optional(),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  baseUrl: z.string().trim().max(500).refine((value) => !value || isHttpUrl(value), 'API 地址必须使用 HTTP 或 HTTPS').nullable().optional(),
});

export async function accountRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/admin/account', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const account = await services.repo.findUserById(user.id);
    if (!account) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return sendOk(reply, publicUser(account));
  });

  app.put('/api/admin/account/password', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = passwordSchema.parse(request.body);
    assertStrongPassword(input.newPassword);
    const account = await services.repo.findUserById(user.id);
    if (!account || !(await verifyPassword(input.currentPassword, account.passwordHash))) {
      throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });
    }
    await services.repo.updateUser(user.id, { passwordHash: await hashPassword(input.newPassword) });
    return sendOk(reply, { ok: true });
  });

  app.put('/api/admin/account/llm', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = llmSchema.parse(request.body);
    const patch: Record<string, unknown> = {
      llmProvider: input.provider || null,
      llmModel: input.model || (input.provider === 'claude' ? 'claude-sonnet-4-5' : input.provider === 'openai' ? 'gpt-4o-mini' : null),
    };
    if (input.apiKey !== undefined) patch.llmApiKey = input.apiKey ? encryptSecret(input.apiKey, services.encryptionKey) : null;
    if (input.baseUrl !== undefined) patch.llmBaseUrl = input.baseUrl ? input.baseUrl.replace(/\/+$/, '') : null;
    const updated = await services.repo.updateUser(user.id, patch as any);
    return sendOk(reply, publicUser(updated));
  });
}

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
