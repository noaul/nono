import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'prisma/migrations/20260815010000_add_clipper/migration.sql';

describe('Clipper Prisma schema', () => {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('defines the complete user-owned Clipper data surface', () => {
    for (const model of ['Clip', 'ClipTag', 'ClipTagOnClip', 'ClipHighlight']) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it('binds every Clipper row to a Nono user', () => {
    expect(schema).toMatch(/model Clip \{[\s\S]*?userId\s+Int/);
    expect(schema).toMatch(/model ClipTag \{[\s\S]*?userId\s+Int/);
    expect(schema).toMatch(/model ClipHighlight \{[\s\S]*?userId\s+Int/);
    // Denormalized so tag assignment can be tenant-filtered without joining back to Clip.
    expect(schema).toMatch(/model ClipTagOnClip \{[\s\S]*?userId\s+Int/);

    expect(schema).toMatch(/model User \{[\s\S]*?clips\s+Clip\[\]/);
    expect(schema).toMatch(/model User \{[\s\S]*?clipTags\s+ClipTag\[\]/);
    expect(schema).toMatch(/model Link \{[\s\S]*?clip\s+Clip\?/);
  });

  it('deduplicates clips by canonical URL per user', () => {
    expect(schema).toMatch(/model Clip \{[\s\S]*?canonicalUrl\s+String/);
    expect(schema).toMatch(/model Clip \{[\s\S]*?@@unique\(\[userId, canonicalUrl\]\)/);
    expect(schema).toMatch(/model Clip \{[\s\S]*?@@index\(\[userId, status, clippedAt\]\)/);
  });

  it('records the content invariants the reader and refetch depend on', () => {
    for (const field of ['contentVersion', 'contentHash', 'contentTruncated']) {
      expect(schema).toMatch(new RegExp(`model Clip \\{[\\s\\S]*?${field}`));
    }
  });

  it('keeps a display tag name separate from the uniqueness key', () => {
    expect(schema).toMatch(/model ClipTag \{[\s\S]*?name\s+String/);
    expect(schema).toMatch(/model ClipTag \{[\s\S]*?normalizedName\s+String/);
    expect(schema).toMatch(/model ClipTag \{[\s\S]*?@@unique\(\[userId, normalizedName\]\)/);
  });

  it('stores resilient highlight anchors rather than bare offsets', () => {
    expect(schema).toMatch(/model ClipHighlight \{[\s\S]*?anchor\s+Json/);
    expect(schema).toMatch(/model ClipHighlight \{[\s\S]*?contentVersion\s+Int/);
  });

  it('detaches rather than deletes a clip when its bookmark goes away', () => {
    expect(schema).toMatch(/model Clip \{[\s\S]*?linkId\s+Int\?\s+@unique/);
    expect(schema).toMatch(/model Clip \{[\s\S]*?link\s+Link\?[\s\S]*?onDelete: SetNull/);
  });
});

describe('Clipper search migration', () => {
  const migration = fs.readFileSync(path.resolve(process.cwd(), MIGRATION), 'utf8');

  it('creates the trigram extension and index', () => {
    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
    expect(migration).toMatch(/USING GIN \("searchText" gin_trgm_ops\)/i);
  });

  it('derives searchText instead of letting the application write it', () => {
    expect(migration).toMatch(/GENERATED ALWAYS AS/i);
    expect(migration).toMatch(/STORED/i);
    expect(migration).toContain('"searchText"');
  });

  it('quotes every camel-case identifier so PostgreSQL does not fold it to lowercase', () => {
    const identifiers = [
      'Clip',
      'ClipTag',
      'ClipTagOnClip',
      'ClipHighlight',
      'userId',
      'canonicalUrl',
      'contentMd',
      'contentHash',
      'contentVersion',
      'contentTruncated',
      'normalizedName',
      'clippedAt',
      'searchText',
    ];

    for (const identifier of identifiers) {
      expect(migration, `${identifier} must appear quoted`).toContain(`"${identifier}"`);
    }

    // Any bare camel-case token outside a quoted string would silently become lowercase.
    const unquoted = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .flatMap((line) => line.replace(/"[^"]*"/g, '').match(/\b[a-z]+[A-Z]\w*\b/g) || []);

    expect(unquoted).toEqual([]);
  });
});
