import { describe, expect, it } from 'vitest';
import { assetsFingerprint, findReleasesWithChangedAssets, hasReleaseChanged } from './releaseAssets';
import { createRelease, createReleaseAsset } from '../test/releaseFixtures';

describe('release content fingerprints', () => {
  it('ignores asset order and download counts', () => {
    const a = createReleaseAsset();
    const b = createReleaseAsset({ id: 101 });
    expect(assetsFingerprint([a, b])).toBe(assetsFingerprint([{ ...b, download_count: 200 }, { ...a, download_count: 300 }]));
  });

  it.each([
    { id: 200 }, { name: 'renamed.zip' }, { size: 2048 }, { updated_at: '2026-01-02T00:00:00Z' },
    { browser_download_url: 'https://example.com/replaced.zip' }, { content_type: 'application/octet-stream' },
  ])('detects a substantive asset change: %j', (patch) => {
    expect(hasReleaseChanged(createRelease(), createRelease({ assets: [createReleaseAsset(patch)] }))).toBe(true);
  });

  it('normalizes legacy null names and empty notes before comparing', () => {
    expect(hasReleaseChanged(createRelease(), createRelease({ name: 'v1', body: '', prerelease: false }))).toBe(false);
  });

  it('returns promoted prereleases even if their notes and assets are unchanged', () => {
    expect(findReleasesWithChangedAssets([createRelease({ prerelease: false })], [createRelease({ prerelease: true })]).map(release => release.id)).toEqual([1]);
  });

  it('returns only changed existing releases, leaving new releases for the add path', () => {
    const latest = [createRelease({ body: 'Late notes' }), createRelease({ id: 2 })];
    expect(findReleasesWithChangedAssets(latest, [createRelease()]).map(r => r.id)).toEqual([1]);
    expect(findReleasesWithChangedAssets(undefined, [createRelease()])).toEqual([]);
  });
});
