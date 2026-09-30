import { describe, expect, it } from 'vitest';
import {
  repositoryData,
  toLegacyRepository,
} from '../src/routes/nostar/common.js';
describe('durable repository license', () => {
  it('round trips GitHub license metadata through the user-owned row', () => {
    const data = repositoryData({
      id: 12,
      license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
    });
    expect(data).toMatchObject({
      licenseKey: 'mit',
      licenseName: 'MIT License',
      licenseSpdxId: 'MIT',
    });
    expect(toLegacyRepository(data).license).toEqual({
      key: 'mit',
      name: 'MIT License',
      spdx_id: 'MIT',
    });
  });
  it('allows older clients to update without clearing an existing license', () => {
    expect(repositoryData({ id: 12 })).not.toHaveProperty('licenseName');
    expect(repositoryData({ id: 12, license: null })).toMatchObject({
      licenseKey: null,
      licenseName: null,
      licenseSpdxId: null,
    });
    expect(toLegacyRepository({ githubId: 12 }).license).toBeNull();
  });
});
