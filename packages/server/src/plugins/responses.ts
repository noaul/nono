import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export function sendOk(reply: FastifyReply, data: unknown = null, message = '') {
  return reply.send({ code: 0, data, message });
}

export function sendError(reply: FastifyReply, status: number, message: string, code = status) {
  return reply.status(status).send({ code, data: null, message });
}

export async function responsePlugin(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    const err = error as { statusCode?: number; message?: string };
    if (error instanceof ZodError) {
      sendError(reply, 400, error.issues[0]?.message || 'Invalid request payload', 400);
      return;
    }
    const status = Number(err.statusCode || 500);
    sendError(reply, status, status === 500 ? 'Internal server error' : err.message || 'Internal server error', status);
  });
}
