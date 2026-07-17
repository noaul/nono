import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoStar Prisma schema', () => {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('defines the complete user-owned NoStar data surface', () => {
    for (const model of [
      'NoStarAccount',
      'NoStarRepository',
      'NoStarRelease',
      'NoStarCategory',
      'NoStarAiProfile',
      'NoStarWebDavConfig',
      'NoStarAssetFilter',
      'NoStarSetting',
      'NoStarEmbeddingConfig',
      'NoStarVectorSearchConfig',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it('binds repositories and releases to a Nono user', () => {
    expect(schema).toMatch(/model NoStarRepository \{[\s\S]*?userId\s+Int[\s\S]*?@@unique\(\[userId, githubId\]\)/);
    expect(schema).toMatch(/model NoStarRelease \{[\s\S]*?userId\s+Int[\s\S]*?@@unique\(\[userId, githubId\]\)/);
    expect(schema).toMatch(/model User \{[\s\S]*?noStarRepositories\s+NoStarRepository\[\]/);
  });

  it('stores credentials only as encrypted values', () => {
    expect(schema).toContain('githubTokenEncrypted');
    expect(schema).toContain('apiKeyEncrypted');
    expect(schema).toContain('passwordEncrypted');
    expect(schema).not.toMatch(/model NoStarAccount \{[\s\S]*?githubToken\s+String/);
  });
});
