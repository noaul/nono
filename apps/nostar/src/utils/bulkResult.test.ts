import { describe, expect, it } from 'vitest';
import { unstarResultToast } from './bulkResult';

describe('unstarResultToast', () => {
  it('reports a clean success', () => {
    expect(unstarResultToast('en', 3, 3)).toEqual({ message: 'Successfully unstarred 3 repositories', type: 'success' });
  });

  it('warns about partial failures instead of claiming success', () => {
    expect(unstarResultToast('en', 1, 3)).toEqual({ message: 'Unstarred 1 of 3 repositories; 2 failed', type: 'warning' });
    expect(unstarResultToast('zh', 1, 3)).toEqual({ message: '已取消 1/3 个仓库的 Star，2 个失败', type: 'warning' });
  });

  it('reports an error when nothing was unstarred', () => {
    expect(unstarResultToast('en', 0, 2)).toEqual({ message: 'Failed to unstar 2 repositories', type: 'error' });
  });
});
