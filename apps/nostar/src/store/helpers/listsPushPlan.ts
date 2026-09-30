import type { Category, Repository } from '../../types';
import { matchesCategory } from '../../utils/categoryUtils';
import { normalizeListRepo, type GitHubList } from '../../utils/githubLists';
export const GITHUB_LISTS_MAX_COUNT = 32;
export const GITHUB_LISTS_NAME_MAX_LENGTH = 32;
export interface ListsPushPlanEntry {
  categoryId: string;
  name: string;
  listId?: string;
  repositoryNames: string[];
}
export interface ListsMembershipPlan {
  fullName: string;
  existingListIds: string[];
  categoryIds: string[];
  removeListIds: string[];
}
export interface ListsPushPlan {
  entries: ListsPushPlanEntry[];
  memberships: ListsMembershipPlan[];
  remoteSnapshot: GitHubList[];
}

export function buildListsPushPlan(
  categories: Category[],
  repositories: Repository[],
  lists: GitHubList[],
  mapping: Record<string, string>,
  memberships: Record<string, string[]>,
  options: { removeMissing?: boolean; repositoryIds?: number[] } = {},
): ListsPushPlan {
  const used = new Set<string>();
  const entries = categories.map((category) => {
    const mapped = lists.find((list) => list.id === mapping[category.id]);
    const matches = lists.filter((list) => list.name.toLowerCase() === category.name.toLowerCase());
    if (!mapped && matches.length > 1)
      throw new Error(`Multiple GitHub Lists match ${category.name}; map a List explicitly.`);
    const list = mapped ?? matches[0];
    const key = list?.id ?? `new:${category.name.toLowerCase()}`;
    if (used.has(key))
      throw new Error('Multiple categories target the same GitHub List. Choose one category.');
    used.add(key);
    const selected = repositories.filter((repo) =>
      options.repositoryIds
        ? options.repositoryIds.includes(repo.id)
        : matchesCategory(repo, category, memberships),
    );
    return {
      categoryId: category.id,
      name: category.name,
      listId: list?.id,
      repositoryNames: [
        ...new Set([
          ...selected.map((repo) => normalizeListRepo(repo.full_name)),
          ...(options.repositoryIds ? [] : (memberships[category.id] ?? []).map(normalizeListRepo)),
        ]),
      ],
    };
  });
  const names = new Set(entries.flatMap((e) => e.repositoryNames));
  if (options.removeMissing)
    entries.forEach((e) =>
      lists
        .find((l) => l.id === e.listId)
        ?.items.forEach((name) => names.add(normalizeListRepo(name))),
    );
  const planned = [...names].map((fullName) => ({
    fullName,
    existingListIds: lists
      .filter((l) => l.items.some((n) => normalizeListRepo(n) === fullName))
      .map((l) => l.id),
    categoryIds: entries
      .filter((e) => e.repositoryNames.includes(fullName))
      .map((e) => e.categoryId),
    removeListIds: options.removeMissing
      ? entries
          .filter((e) => e.listId && !e.repositoryNames.includes(fullName))
          .map((e) => e.listId!)
      : [],
  }));
  // Skip memberships that already have the requested final state.
  const changed = planned.filter(
    (p) =>
      p.removeListIds.some((id) => p.existingListIds.includes(id)) ||
      p.categoryIds.some((id) => {
        const entry = entries.find((e) => e.categoryId === id)!;
        return !entry.listId || !p.existingListIds.includes(entry.listId);
      }),
  );
  return {
    entries,
    memberships: changed,
    remoteSnapshot: lists.map((l) => ({ ...l, items: [...l.items] })),
  };
}
export function validateListsPushPlan(plan: ListsPushPlan, remoteCount: number): string[] {
  const issues: string[] = [];
  plan.entries.forEach((e) => {
    if (!e.listId && (!e.name.trim() || e.name.length > GITHUB_LISTS_NAME_MAX_LENGTH))
      issues.push(`List names must contain 1–32 characters: ${e.name}`);
  });
  if (remoteCount + plan.entries.filter((e) => !e.listId).length > GITHUB_LISTS_MAX_COUNT)
    issues.push('Creating these categories would exceed 32 Lists.');
  if (plan.memberships.length > 5000)
    issues.push(
      'Preview exceeds 5000 repository changes. Select fewer categories or repositories.',
    );
  return issues;
}
export function buildListsImportPlan(
  lists: GitHubList[],
  categories: Category[],
  mapping: Record<string, string>,
  memberships: Record<string, string[]>,
  repositories: Repository[],
) {
  const categoryListIdMap = { ...mapping };
  const githubListMemberships = { ...memberships };
  const categoriesToAdd: Category[] = [];
  for (const list of lists) {
    const existing =
      categories.find((c) => mapping[c.id] === list.id) ??
      categories.find((c) => c.id === `github-list-${list.id}`);
    // Avoid silently claiming a local category merely because it has the same display name.
    const category = existing ?? {
      id: `github-list-${list.id}`,
      name: list.name,
      icon: '📁',
      keywords: [],
      isCustom: true,
    };
    if (!existing) categoriesToAdd.push(category);
    categoryListIdMap[category.id] = list.id;
    githubListMemberships[category.id] = [...new Set(list.items.map(normalizeListRepo))];
  }
  const repositoryUpdates: { id: number; patch: Partial<Repository> }[] = [];
  const available = new Set(repositories.map((r) => normalizeListRepo(r.full_name)));
  return {
    categoriesToAdd,
    categoryListIdMap,
    githubListMemberships,
    repositoryUpdates,
    unavailableCount: new Set(
      lists.flatMap((l) => l.items.map(normalizeListRepo)).filter((n) => !available.has(n)),
    ).size,
  };
}
