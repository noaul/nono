import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/index.js';
import { getDb, closeDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrations.js';

const makeRepo = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  name: 'demo',
  full_name: 'owner/demo',
  description: 'Original description',
  html_url: 'https://github.com/owner/demo',
  stargazers_count: 10,
  language: 'TypeScript',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  pushed_at: '2024-01-03T00:00:00Z',
  owner: {
    login: 'owner',
    avatar_url: 'https://example.com/avatar.png',
  },
  topics: [],
  ...overrides,
});

describe('repositories routes', () => {
  beforeEach(() => {
    runMigrations(getDb());
  });

  afterEach(() => {
    closeDb();
  });

  it('preserves existing AI analysis and category fields when full sync omits them', async () => {
    const app = createApp();

    await request(app)
      .put('/api/repositories')
      .send({
        repositories: [
          makeRepo({
            ai_summary: 'AI generated summary',
            ai_tags: ['developer tools'],
            ai_platforms: ['web'],
            analyzed_at: '2026-05-11T08:00:00.000Z',
            analysis_failed: false,
            custom_category: 'Development Tools',
            category_locked: true,
          }),
        ],
        isFullSync: true,
      })
      .expect(200);

    await request(app)
      .put('/api/repositories')
      .send({
        repositories: [
          makeRepo({
            stargazers_count: 20,
          }),
        ],
        isFullSync: true,
      })
      .expect(200);

    const response = await request(app)
      .get('/api/repositories?limit=10000')
      .expect(200);

    expect(response.body.repositories).toHaveLength(1);
    expect(response.body.repositories[0]).toMatchObject({
      stargazers_count: 20,
      ai_summary: 'AI generated summary',
      ai_tags: ['developer tools'],
      ai_platforms: ['web'],
      analyzed_at: '2026-05-11T08:00:00.000Z',
      analysis_failed: false,
      custom_category: 'Development Tools',
      category_locked: true,
    });
  });
});
