import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../types.js';
import { requireAuth, requireBrowserSession } from '../plugins/auth.js';
import { sendOk } from '../plugins/responses.js';
import { analyzeBookmark, saveAnalyzedBookmark } from '../services/ai.service.js';

const analyzeSchema = z.object({
  url: z.string().url(),
  title: z.string().max(300).optional(),
  content: z.string().max(5000).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  purpose: z.literal('bookmark').optional(),
});

const saveSchema = analyzeSchema.extend({
  folderId: z.number().int().positive().optional(),
  folderName: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(1000).optional(),
});

export async function aiRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/ai/analyze', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireBrowserSession(request, reply, services);
    if (!user) return;
    return sendOk(reply, await analyzeBookmark(services, user, analyzeSchema.parse(request.body)));
  });

  app.post('/api/ai/save', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    return sendOk(reply, await saveAnalyzedBookmark(services, user, saveSchema.parse(request.body)));
  });
}
