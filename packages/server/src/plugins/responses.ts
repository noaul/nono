import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { setAuditContext } from './audit.js';

export function sendOk(reply: FastifyReply, data: unknown = null, message = '') {
  return reply.send({ code: 0, data, message });
}

export function sendError(reply: FastifyReply, status: number, message: string, code = status) {
  return reply.status(status).send({ code, data: null, message });
}

export async function responsePlugin(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const err = error as { statusCode?: number; message?: string };
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message || 'Invalid request payload';
      setAuditContext(request, { errorMessage: message });
      sendError(reply, 400, message, 400);
      return;
    }
    const status = Number(err.statusCode || 500);
    const message = status === 500 ? 'Internal server error' : err.message || 'Internal server error';
    setAuditContext(request, { errorMessage: message });
    sendError(reply, status, message, status);
  });
}
