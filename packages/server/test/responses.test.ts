import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { responsePlugin } from '../src/plugins/responses.js';

/**
 * Registering a custom error handler replaces Fastify's default one, which is the only place the
 * framework logs a failed request. These tests pin the replacement: unexpected failures must still
 * reach the log, and expected 4xx rejections must not fill it with noise.
 */
async function appWithCapturedLog() {
  const lines: string[] = [];
  const app = fastify({ logger: { level: 'error', stream: { write: (line: string) => { lines.push(line); } } } });
  await responsePlugin(app);
  app.get('/boom', async () => { throw new Error('database exploded'); });
  app.get('/missing', async () => { throw Object.assign(new Error('Folder not found'), { statusCode: 404 }); });
  return { app, lines };
}

describe('error handler', () => {
  it('logs unexpected failures instead of swallowing them', async () => {
    const { app, lines } = await appWithCapturedLog();

    const response = await app.inject({ method: 'GET', url: '/boom' });

    // The client still learns nothing about the internals.
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 500, data: null, message: 'Internal server error' });
    // The operator does.
    expect(lines.join('\n')).toContain('database exploded');
  });

  it('keeps expected 4xx rejections out of the error log', async () => {
    const { app, lines } = await appWithCapturedLog();

    const response = await app.inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Folder not found');
    expect(lines).toHaveLength(0);
  });
});
