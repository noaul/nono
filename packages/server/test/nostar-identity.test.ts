import { describe, expect, it } from 'vitest';
import { importNoStarData } from '../src/routes/nostar/sync-service.js';
import { reconcileRepositoryIdentities } from '../src/routes/nostar/repository-identity.js';

const legacyId = 1_800_000_000_000n;
const row = (id: number, githubId: bigint, extra = {}) => ({ id, userId: 1, githubId, name: 'tool', fullName: 'owner/tool', topics: [], customTags: [], ...extra });

function database(initial: any[]) {
  const rows = structuredClone(initial);
  const releases = [{ id: 9, userId: 1, repositoryId: 7, isRead: true }];
  const settings = new Map<string, any>();
  const tx: any = {
    noStarSetting: {
      findUnique: async ({ where }: any) => settings.has(where.userId_key.key) ? { value: settings.get(where.userId_key.key) } : null,
      upsert: async ({ where, update }: any) => settings.set(where.userId_key.key, update.value),
    },
    noStarRepository: {
      findMany: async ({ where }: any) => rows.filter(r => r.userId === where.userId && (!where.fullName || r.fullName === where.fullName)),
      findUnique: async ({ where }: any) => rows.find(r => r.githubId === where.userId_githubId.githubId),
      update: async ({ where, data }: any) => Object.assign(rows.find(r => r.id === where.id), data),
      upsert: async ({ where, update, create }: any) => {
        const found = rows.find(r => r.githubId === where.userId_githubId.githubId);
        if (found) return Object.assign(found, update);
        const created = { id: 20, ...create }; rows.push(created); return created;
      },
      deleteMany: async ({ where }: any) => { rows.splice(rows.findIndex(r => r.id === where.id), 1); },
    },
    noStarRelease: {
      updateMany: async ({ where, data }: any) => releases.filter(r => r.repositoryId === where.repositoryId).forEach(r => Object.assign(r, data)),
      upsert: async () => ({}),
    },
  };
  tx.$transaction = async (callback: (db: any) => unknown) => callback(tx);
  return { tx, rows, releases };
}

describe('legacy repository reconciliation', () => {
  it('reparents releases before folding a synthetic twin and keeps its custom data', async () => {
    const db = database([row(7, legacyId, { aiSummary: 'legacy analysis' }), row(8, 42n)]);
    const result = await reconcileRepositoryIdentities(db.tx, 1, [{ id: 42, full_name: 'owner/tool' }], null);
    expect(db.rows).toEqual([expect.objectContaining({ id: 8, githubId: 42n, aiSummary: 'legacy analysis' })]);
    expect(db.releases).toEqual([{ id: 9, userId: 1, repositoryId: 8, isRead: true }]);
    expect(result.repositories[0].ai_summary).toBe('legacy analysis');
  });

  it('does not resurrect synthetic rows from an old import when the real identity is already saved', async () => {
    const db = database([row(8, 42n, { aiSummary: 'current analysis' })]);
    await importNoStarData({ prisma: db.tx } as any, 1, {
      repositories: [{ id: Number(legacyId), full_name: 'owner/tool', custom_category: 'imported' }],
    });
    expect(db.rows).toEqual([expect.objectContaining({ id: 8, githubId: 42n, aiSummary: 'current analysis', customCategory: 'imported' })]);
  });

  it('recognizes a previously migrated synthetic id after the real repository is renamed', async () => {
    const db = database([row(7, legacyId)]);
    await reconcileRepositoryIdentities(db.tx, 1, [{ id: 42, full_name: 'owner/tool' }], null);
    db.rows[0].fullName = 'owner/renamed';
    await importNoStarData({ prisma: db.tx } as any, 1, { repositories: [{ id: Number(legacyId), full_name: 'owner/tool', custom_category: 'imported' }] });
    expect(db.rows).toEqual([expect.objectContaining({ id: 7, githubId: 42n, fullName: 'owner/renamed', customCategory: 'imported' })]);
  });

  it('ignores ambiguous names instead of passing analysis to a different real id', async () => {
    const db = database([row(7, legacyId, { aiSummary: 'ambiguous' }), row(8, 41n)]);
    const result = await reconcileRepositoryIdentities(db.tx, 1, [{ id: 42, full_name: 'owner/tool' }], null);
    expect(db.rows.map(r => r.githubId)).toEqual([legacyId, 41n]);
    expect(result.remaps.size).toBe(0);
  });

  it('keeps legacy subscription and category lock when folding into empty canonical defaults', async () => {
    const db = database([row(7, legacyId, { subscribedToReleases: true, customCategory: 'locked', categoryLocked: true }), row(8, 42n, { subscribedToReleases: false, categoryLocked: false })]);
    await reconcileRepositoryIdentities(db.tx, 1, [{ id: 42, full_name: 'owner/tool' }], null);
    expect(db.rows[0]).toMatchObject({ subscribedToReleases: true, customCategory: 'locked', categoryLocked: true });
  });
});
