import { describe, expect, it } from 'vitest';
import { buildFolderGroups, buildQuickSavePayload, findDuplicateLink, findFolderGroup, preferredFolderId, tokenExpiryText } from '../shared/popup-workflow.js';

describe('extension popup workflow helpers', () => {
  it('describes token expiry state', () => {
    const now = new Date('2026-06-04T12:00:00.000Z');

    expect(tokenExpiryText({ expiresAt: null }, now)).toBe('Token 不过期');
    expect(tokenExpiryText({ expiresAt: '2026-06-05T12:00:00.000Z' }, now)).toBe('Token 还有 1 天过期');
    expect(tokenExpiryText({ expiresAt: '2026-06-04T11:00:00.000Z' }, now)).toBe('Token 已过期');
  });

  it('finds duplicate links by normalized URL', () => {
    const duplicate = findDuplicateLink([{ id: 1, name: 'GitHub', url: 'https://github.com/' }], 'https://github.com');

    expect(duplicate).toMatchObject({ id: 1, name: 'GitHub' });
  });

  it('groups folders into categories and restores the last used folder', () => {
    const groups = buildFolderGroups([
      { id: 1, name: '工作', sortOrder: 100, parentId: null },
      { id: 2, name: '开发', sortOrder: 90, parentId: 1 },
      { id: 3, name: '阅读', sortOrder: 80, parentId: 1 },
      { id: 4, name: '生活', sortOrder: 70, parentId: null },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].folders.map((folder) => folder.name)).toEqual(['开发', '阅读']);
    expect(groups[1].folders.map((folder) => folder.name)).toEqual(['生活']);
    expect(findFolderGroup(groups, 3)?.category.name).toBe('工作');
    expect(preferredFolderId(groups, 3)).toBe('3');
  });

  it('builds a direct quick-save payload', () => {
    const payload = buildQuickSavePayload(
      { url: 'https://example.com/', title: 'Example', description: 'Page description' },
      { folderId: '2', name: 'Custom', description: 'Desc' },
    );

    expect(payload).toEqual({ folderId: 2, name: 'Custom', url: 'https://example.com/', description: 'Desc' });
  });
});
