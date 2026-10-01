import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

/**
 * Parses a partial update. Zod 4 applies `.default()` values even inside `.partial()`, so the
 * parsed result is narrowed to the keys the client actually sent; otherwise an update would reset
 * every omitted field that has a schema default.
 */
export function parsePatchBody<T extends Record<string, unknown>>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.parse(body);
  const sent = body !== null && typeof body === 'object' ? body : {};
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(sent, key))) as T;
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
        message: describeZodError(error),
        details: z.flattenError(error)
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

function describeZodError(error: ZodError): string {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join('.')).filter(Boolean))];
  return fields.length ? `Invalid request body: ${fields.slice(0, 5).join(', ')}` : 'Invalid request body';
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
