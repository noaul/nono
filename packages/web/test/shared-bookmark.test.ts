import { describe, expect, it } from 'vitest';
import { sharedBookmarkDraft } from '../src/utils/sharedBookmark';

describe('sharedBookmarkDraft', () => {
  it('accepts http(s) links and trims the title to the editor limit', () => {
    expect(sharedBookmarkDraft({ share_url: ' https://example.com/a?b=1 ', share_title: '  一个  很长的标题'.repeat(5) }))
      .toEqual({ url: 'https://example.com/a?b=1', name: [...'一个 很长的标题 一个 很长的标题 一个 很长的标题'].slice(0, 24).join('') });
    expect(sharedBookmarkDraft({ share_url: 'http://www.example.org' })).toEqual({ url: 'http://www.example.org/', name: 'example.org' });
  });

  it('rejects missing, malformed and non-web links', () => {
    expect(sharedBookmarkDraft({})).toBeNull();
    expect(sharedBookmarkDraft({ share_url: 'not a url' })).toBeNull();
    expect(sharedBookmarkDraft({ share_url: 'javascript:alert(1)' })).toBeNull();
    expect(sharedBookmarkDraft({ share_url: ['https://a.test'] })).toBeNull();
    expect(sharedBookmarkDraft({ share_url: `https://a.test/${'x'.repeat(5000)}` })).toBeNull();
  });
});
