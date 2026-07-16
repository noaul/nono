import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: error.flatten()
      }
    });
    return;
  }

  console.error('[moneypulse] unhandled error', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error'
    }
  });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
