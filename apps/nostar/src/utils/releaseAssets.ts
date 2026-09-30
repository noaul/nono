import type { Release, ReleaseAsset } from '../types';

/** Download counts change on every download and do not signify new content. */
export function assetsFingerprint(assets: ReleaseAsset[] | undefined): string {
  return JSON.stringify([...(assets ?? [])].sort((a, b) => a.id - b.id).map(asset => [
    asset.id, asset.updated_at, asset.size, asset.name, asset.browser_download_url, asset.content_type,
  ]));
}

export function hasReleaseChanged(current: Release, incoming: Release): boolean {
  return assetsFingerprint(current.assets) !== assetsFingerprint(incoming.assets)
    || (current.body ?? '') !== (incoming.body ?? '')
    || (current.name || current.tag_name) !== (incoming.name || incoming.tag_name)
    || current.tag_name !== incoming.tag_name
    || (current.prerelease ?? false) !== (incoming.prerelease ?? false);
}

/** Existing releases can gain notes or replaced assets after publication. */
export function findReleasesWithChangedAssets(latest: Release[] | undefined, current: Release[]): Release[] {
  const byId = new Map(current.map(release => [release.id, release]));
  return (latest ?? []).filter(release => {
    const previous = byId.get(release.id);
    return previous !== undefined && hasReleaseChanged(previous, release);
  });
}
