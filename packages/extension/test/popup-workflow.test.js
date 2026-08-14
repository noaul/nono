import { describe, expect, it } from 'vitest';
import {
  buildFolderGroups,
  buildQuickSavePayload,
  buildUpdateBookmarkPayload,
  compactBookmarkName,
  findDuplicateLink,
  findFolderGroup,
  normalizeServerUrl,
  preferredFolderId,
  serverOriginPattern,
  tokenExpiryText,
} from '../shared/popup-workflow.js';

describe('extension popup workflow helpers', () => {
  it('accepts HTTPS servers and loopback HTTP development servers', () => {
    expect(normalizeServerUrl(' https://noaul.com/// ')).toBe('https://noaul.com');
    expect(normalizeServerUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeServerUrl('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    expect(normalizeServerUrl('http://[::1]:3000/')).toBe('http://[::1]:3000');
  });

  it('rejects insecure or malformed server URLs', () => {
    expect(() => normalizeServerUrl('http://example.com')).toThrow('HTTPS');
    expect(() => normalizeServerUrl('ftp://example.com')).toThrow('HTTPS');
    expect(() => normalizeServerUrl('not a url')).toThrow('有效');
    expect(() => normalizeServerUrl('')).toThrow('服务地址');
  });

  it('grants access only to the configured NoNo origin', () => {
    expect(serverOriginPattern('https://nono.example/path')).toBe('https://nono.example/*');
    expect(serverOriginPattern('http://localhost:3000/')).toBe('http://localhost:3000/*');
  });

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

    expect(payload).toEqual({ folderId: 2, name: 'Custom', nameMode: 'auto', url: 'https://example.com/', description: 'Desc' });
  });

  it('builds an update payload for an existing duplicate', () => {
    const payload = buildUpdateBookmarkPayload(
      { url: 'https://example.com/', title: 'Example', description: 'Page description' },
      { folderId: '4', name: 'Updated', description: 'Fresh description' },
    );

    expect(payload).toEqual({ folderId: 4, name: 'Updated', url: 'https://example.com/', description: 'Fresh description' });
  });

  it('compacts page titles into recognizable bookmark names', () => {
    expect(compactBookmarkName('GitHub - Build and ship software', 'https://github.com/openai')).toBe('GitHub');
    expect(compactBookmarkName('首页', 'https://juejin.cn/post/123')).toBe('掘金');
    expect(compactBookmarkName('Codex 额度重置提醒 | 别错过 reset credits', 'https://chatgpt.com/')).toBe('Codex 额度重置');
    expect(compactBookmarkName('Zotero 中文社区', 'https://zotero-chinese.com/')).toBe('Zotero 中文社区');
  });
});
