import { describe, expect, it } from 'vitest';
import { buildSavePayload, findDuplicateLink, healthStatusText, tokenExpiryText } from '../shared/popup-workflow.js';

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

  it('builds save payload with selected folder preference', () => {
    const payload = buildSavePayload(
      { url: 'https://example.com/', title: 'Example', content: 'Body' },
      { suggestedFolderId: 7, suggestedFolderName: 'AI' },
      { folderId: '2', folderName: '', name: 'Custom', description: 'Desc' },
    );

    expect(payload).toMatchObject({ folderId: 2, name: 'Custom', description: 'Desc' });
    expect(payload.folderName).toBeUndefined();
  });

  it('describes health check results', () => {
    expect(healthStatusText({ status: 'ok', statusCode: 200 })).toBe('链接可访问 · 200');
    expect(healthStatusText({ status: 'broken', statusCode: 404 })).toBe('链接异常 · 404');
    expect(healthStatusText({ status: 'timeout' })).toBe('链接检查超时');
    expect(healthStatusText({ status: 'invalid' })).toBe('链接格式无效');
  });
});
