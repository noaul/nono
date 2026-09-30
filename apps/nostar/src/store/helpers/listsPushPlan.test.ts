import { describe, expect, it } from 'vitest';
import { buildListsImportPlan, buildListsPushPlan, validateListsPushPlan } from './listsPushPlan';
import type { GitHubList } from '../../utils/githubLists';
import type { Category, Repository } from '../../types';
const cat = (id: string, name = id): Category => ({
  id,
  name,
  icon: '📁',
  keywords: [],
  isCustom: true,
});
const repo = (full_name: string, custom_category?: string): Repository =>
  ({ id: 1, full_name, custom_category }) as Repository;
const remote: GitHubList[] = [
  { id: 'L1', name: 'Tools', isPrivate: true, items: ['a/one', 'b/two'] },
  { id: 'L2', name: 'Other', isPrivate: false, items: ['a/one'] },
];
describe('Lists plans', () => {
  it('adds local membership while preserving unrelated remote repositories and memberships', () => {
    const plan = buildListsPushPlan(
      [cat('tools', 'Tools')],
      [repo('c/three', 'Tools')],
      remote,
      { tools: 'L1' },
      {},
    );
    expect(plan.entries[0]).toMatchObject({ listId: 'L1', repositoryNames: ['c/three'] });
    expect(plan.memberships).toEqual([
      { fullName: 'c/three', existingListIds: [], categoryIds: ['tools'], removeListIds: [] },
    ]);
  });
  it('only removes managed list membership after explicit removal selection', () => {
    const plan = buildListsPushPlan(
      [cat('tools', 'Tools')],
      [repo('a/one', 'Tools')],
      remote,
      { tools: 'L1' },
      {},
      { removeMissing: true },
    );
    expect(plan.memberships.find((r) => r.fullName === 'b/two')).toEqual({
      fullName: 'b/two',
      existingListIds: ['L1'],
      categoryIds: [],
      removeListIds: ['L1'],
    });
    expect(plan.memberships.find((r) => r.fullName === 'a/one')).toBeUndefined(); // unchanged membership is preserved without a write
  });
  it('rejects conflicting mappings and preflights name/count limits', () => {
    expect(() =>
      buildListsPushPlan([cat('a', 'Tools'), cat('b', 'Tools')], [], remote, {}, {}),
    ).toThrow(/same GitHub List/);
    const plan = buildListsPushPlan([cat('long', 'x'.repeat(33))], [], [], {}, {});
    expect(validateListsPushPlan(plan, 32)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/32 characters/),
        expect.stringMatching(/32 Lists/),
      ]),
    );
  });
  it('imports multiple memberships without overwriting an existing local assignment', () => {
    const result = buildListsImportPlan(remote, [cat('tools', 'Tools')], { tools: 'L1' }, {}, [
      repo('a/one', 'Existing'),
    ]);
    expect(result.categoryListIdMap.tools).toBe('L1');
    expect(result.githubListMemberships.tools).toEqual(['a/one', 'b/two']);
    expect(result.categoriesToAdd).toHaveLength(1);
    expect(result.repositoryUpdates).toEqual([]);
    expect(result.unavailableCount).toBe(1);
  });
  it('keeps imported memberships separate from manual category assignment', () => {
    const result = buildListsImportPlan([remote[0]], [], {}, {}, [repo('a/one')]);
    expect(result.repositoryUpdates).toEqual([]);
    expect(result.categoriesToAdd[0].id).toBe('github-list-L1');
  });
});
it('refreshing imported memberships removes stale membership without synthesizing manual assignment', () => {
  const initial = buildListsImportPlan([remote[0]], [], {}, {}, [repo('a/one')]);
  expect(initial.repositoryUpdates).toEqual([]);
  const refreshed = buildListsImportPlan(
    [{ ...remote[0], items: [] }],
    initial.categoriesToAdd,
    initial.categoryListIdMap,
    initial.githubListMemberships,
    [repo('a/one')],
  );
  expect(refreshed.githubListMemberships['github-list-L1']).toEqual([]);
  expect(refreshed.repositoryUpdates).toEqual([]);
});
it('pushes inferred category members using the same matching rules as category filters', () => {
  const category = { ...cat('tools', 'Tools'), keywords: ['cli'] };
  const repository = { ...repo('a/one'), name: 'cli tool', topics: [] };
  expect(
    buildListsPushPlan([category], [repository], [], {}, {}).entries[0].repositoryNames,
  ).toEqual(['a/one']);
});
it('retains checked imported remote-only members during ordinary category removal push', () => {
  const plan = buildListsPushPlan(
    [cat('tools', 'Tools')],
    [repo('a/one', 'Tools')],
    remote,
    { tools: 'L1' },
    { tools: ['a/one', 'b/two'] },
    { removeMissing: true },
  );
  expect(plan.entries[0].repositoryNames).toEqual(['a/one', 'b/two']);
  expect(plan.memberships).toEqual([]);
  const removed = buildListsPushPlan(
    [cat('tools', 'Tools')],
    [repo('a/one', 'Tools')],
    remote,
    { tools: 'L1' },
    { tools: ['a/one'] },
    { removeMissing: true },
  );
  expect(removed.memberships).toEqual([
    { fullName: 'b/two', existingListIds: ['L1'], categoryIds: [], removeListIds: ['L1'] },
  ]);
});
it('limits explicit repository pushes to selected local repositories despite imported members', () => {
  const plan = buildListsPushPlan(
    [cat('tools', 'Tools')],
    [repo('c/three', 'Tools')],
    remote,
    { tools: 'L1' },
    { tools: ['a/one', 'b/two'] },
    { repositoryIds: [1] },
  );
  expect(plan.entries[0].repositoryNames).toEqual(['c/three']);
});
