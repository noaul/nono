import { describe, expect, it } from 'vitest';
import { extractPageMetadata } from '../shared/extract.js';

describe('page metadata extraction', () => {
  it('extracts title, description, og tags and a compact body summary', () => {
    const documentLike = {
      title: 'Nono Refactor',
      querySelector(selector) {
        const values = {
          'meta[name="description"]': { content: 'Modern bookmark manager' },
          'meta[property="og:title"]': { content: 'OG Nono' },
        };
        return values[selector] || null;
      },
      body: {
        innerText: 'A '.repeat(400),
      },
    };

    const meta = extractPageMetadata(documentLike);

    expect(meta.title).toBe('Nono Refactor');
    expect(meta.description).toBe('Modern bookmark manager');
    expect(meta.ogTitle).toBe('OG Nono');
    expect(meta.content.length).toBeLessThanOrEqual(500);
  });
});
