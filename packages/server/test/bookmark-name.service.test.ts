import { describe, expect, it } from 'vitest';
import { shortenBookmarkName } from '../src/services/bookmark-name.service.js';

describe('shortenBookmarkName', () => {
  it('keeps a recognizable name and removes site suffixes', () => {
    expect(shortenBookmarkName('GitHub - Build and ship software', 'https://github.com/openai')).toBe('GitHub');
    expect(shortenBookmarkName('A complete guide to TypeScript | MDN', 'https://developer.mozilla.org/en-US/docs')).toBe('A complete');
  });

  it('drops pipe suffixes and stays within eight Chinese-character widths', () => {
    expect(shortenBookmarkName('Codex 额度重置提醒 | 别错过 reset credits', 'https://chatgpt.com/')).toBe('Codex 额度重置');
    expect(shortenBookmarkName('Zotero 中文社区', 'https://zotero-chinese.com/')).toBe('Zotero 中文社区');
  });

  it('uses the known website name when the page title is generic', () => {
    expect(shortenBookmarkName('首页', 'https://juejin.cn/post/123')).toBe('掘金');
  });
});
