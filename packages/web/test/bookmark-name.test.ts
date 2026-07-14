import { describe, expect, it } from 'vitest';
import { compactBookmarkLabel } from '../src/utils/bookmark-name';

describe('compactBookmarkLabel', () => {
  it('keeps labels within eight Chinese-character widths', () => {
    expect(compactBookmarkLabel('Zotero 中文社区')).toBe('Zotero 中文社区');
    expect(compactBookmarkLabel('中国科大网络用户服务系统')).toBe('中国科大网络用…');
  });
});
