import type { Release, ReleaseAsset } from '../types';

export const createReleaseAsset = (overrides: Partial<ReleaseAsset> = {}): ReleaseAsset => ({
  id: 100, name: 'app-linux.zip', size: 1024, download_count: 1,
  browser_download_url: 'https://github.com/owner/app/releases/download/v1/app-linux.zip',
  content_type: 'application/zip', created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', ...overrides,
});

export const createRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 1, tag_name: 'v1', name: null, body: null,
  published_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/owner/app/releases/tag/v1',
  assets: [createReleaseAsset()], zipball_url: 'https://api.github.com/repos/owner/app/zipball/v1',
  tarball_url: 'https://api.github.com/repos/owner/app/tarball/v1',
  repository: { id: 10, full_name: 'owner/app', name: 'app' }, ...overrides,
});
