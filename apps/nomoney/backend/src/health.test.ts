import { createApp } from './app.js';
import { createTestContext, describe, expect, test } from './test-utils.js';
import request from 'supertest';

describe('health endpoints', () => {
  test('reports liveness and verifies SQLite readiness', async () => {
    const context = await createTestContext();
    const app = createApp(context);

    await request(app).get('/api/livez').expect(200, { ok: true });
    await request(app).get('/api/readyz').expect(200, {
      ok: true,
      checks: { sqlite: true }
    });
  });
});
