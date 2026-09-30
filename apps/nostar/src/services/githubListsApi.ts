import { backend } from './backendAdapter';
import { getStorageScope } from './storageScope';
import {
  normalizeListRepo,
  type GitHubList,
  type GitHubListsRateLimit,
} from '../utils/githubLists';
import { validateListsPushPlan, type ListsPushPlan } from '../store/helpers/listsPushPlan';
export type { GitHubList } from '../utils/githubLists';
type Page<T> = {
  nodes: (T | null)[] | null;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};
type Summary = Omit<GitHubList, 'items'>;
type Item = { __typename?: string; id?: string; nameWithOwner?: string };
export interface ListsPushResult {
  mapping: Record<string, string>;
  succeeded: string[];
  failed: { fullName: string; error: string }[];
  cancelled: boolean;
}
const rateFields = 'rateLimit { remaining resetAt cost }';
const snapshotKey = (lists: GitHubList[]) =>
  JSON.stringify(
    lists
      .map((l) => [l.id, l.name, [...l.items].map(normalizeListRepo).sort()])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
export class GitHubListsApiService {
  private readonly scope = getStorageScope();
  rateLimit: GitHubListsRateLimit | null = null;
  private assertActive(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!this.scope || this.scope !== getStorageScope())
      throw new Error('NoNo session changed. Refresh before syncing GitHub Lists.');
  }
  private async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertActive(signal);
    let response;
    try {
      response = await backend.proxyGitHubGraphQL(query, variables, signal);
    } catch (error) {
      if (
        query.trim().startsWith('mutation') &&
        !signal?.aborted &&
        !(error instanceof Error && 'statusCode' in error && Number(error.statusCode) < 500)
      )
        throw new Error(
          `Mutation outcome unknown. Refresh Lists and preview again before continuing. ${error instanceof Error ? error.message : ''}`,
        );
      throw error;
    }
    this.assertActive(signal);
    if (response.errors?.length)
      throw new Error(response.errors.map((e) => e.message ?? 'GitHub GraphQL error').join('; '));
    if (!response.data) throw new Error('GitHub GraphQL response is missing data.');
    if (response.data.rateLimit) this.rateLimit = response.data.rateLimit as GitHubListsRateLimit;
    return response.data as T;
  }
  private nextCursor<T>(page: Page<T>, cursor: string | null, seen: Set<string>): string | null {
    if (!page.pageInfo.hasNextPage) return null;
    const next = page.pageInfo.endCursor;
    if (!next || next === cursor || seen.has(next))
      throw new Error('Incomplete GitHub Lists pagination. Refresh and try again.');
    if (seen.size >= 99)
      throw new Error(
        'GitHub Lists page limit exceeded. Select a smaller scope or refresh before continuing.',
      );
    seen.add(next);
    return next;
  }
  async getUserLists(signal?: AbortSignal): Promise<GitHubList[]> {
    const summaries: Summary[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const data: { viewer: { lists: Page<Summary> } | null } = await this.request(
        `query($cursor:String) { viewer { lists(first:100,after:$cursor) { nodes { id name description isPrivate } pageInfo { hasNextPage endCursor } } } ${rateFields} }`,
        { cursor },
        signal,
      );
      if (!data.viewer?.lists)
        throw new Error(
          'GitHub Lists are unavailable. Check stored token permissions (classic PAT: user scope).',
        );
      summaries.push(...(data.viewer.lists.nodes ?? []).filter((n): n is Summary => !!n));
      if (summaries.length > 1000) throw new Error('Lists read limit exceeded.');
      cursor = this.nextCursor(data.viewer.lists, cursor, seen);
    } while (cursor);
    const result: GitHubList[] = new Array(summaries.length);
    let index = 0;
    let readFailed = false;
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(3, summaries.length) }, async () => {
        while (index < summaries.length && !readFailed) {
          try {
            this.assertActive(signal);
            const current = index++;
            const summary = summaries[current];
            const items: string[] = [];
            let cursor: string | null = null;
            const seen = new Set<string>();
            do {
              // A sibling failure drains only requests that were already in flight.
              if (readFailed) return;
              const data: { node: { items: Page<Item> } | null } = await this.request(
                `query($listId:ID!,$cursor:String) { node(id:$listId) { ... on UserList { items(first:100,after:$cursor) { nodes { __typename ... on Repository { id nameWithOwner } } pageInfo { hasNextPage endCursor } } } } ${rateFields} }`,
                { listId: summary.id, cursor },
                signal,
              );
              if (!data.node?.items)
                throw new Error(
                  'GitHub List disappeared or membership access was denied. Refresh before continuing.',
                );
              for (const item of data.node.items.nodes ?? [])
                if (item?.__typename === 'Repository' && item.nameWithOwner)
                  items.push(item.nameWithOwner);
              if (items.length > 10000) throw new Error('List member read limit exceeded.');
              cursor = this.nextCursor(data.node.items, cursor, seen);
            } while (cursor);
            result[current] = { ...summary, items: [...new Set(items.map(normalizeListRepo))] };
          } catch (error) {
            readFailed = true;
            throw error;
          }
        }
      }),
    );
    const rejected = workers.find(
      (worker): worker is PromiseRejectedResult => worker.status === 'rejected',
    );
    if (rejected) throw rejected.reason;
    return result;
  }
  async createUserList(name: string, signal?: AbortSignal): Promise<string> {
    const data = await this.request<{ createUserList: { list: { id: string } } }>(
      'mutation($name:String!) { createUserList(input:{name:$name,isPrivate:true}) { list { id } } }',
      { name },
      signal,
    );
    if (!data.createUserList?.list?.id)
      throw new Error('Create outcome unknown. Refresh Lists before trying again.');
    return data.createUserList.list.id;
  }
  async updateUserListsForItem(
    itemId: string,
    listIds: string[],
    signal?: AbortSignal,
  ): Promise<void> {
    const data = await this.request<{
      updateUserListsForItem: { clientMutationId: string | null } | null;
    }>(
      'mutation($itemId:ID!,$listIds:[ID!]!) { updateUserListsForItem(input:{itemId:$itemId,listIds:$listIds}) { clientMutationId } }',
      { itemId, listIds: [...new Set(listIds)] },
      signal,
    );
    if (!data.updateUserListsForItem)
      throw new Error('Membership mutation outcome unknown. Refresh Lists and preview again.');
  }
  async resolveRepositoryNodeIds(
    names: string[],
    signal?: AbortSignal,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (let start = 0; start < names.length; start += 40) {
      const batch = names.slice(start, start + 40);
      const variables: Record<string, unknown> = {};
      const declarations: string[] = [];
      const fields: string[] = [];
      batch.forEach((fullName, index) => {
        const [owner, name] = fullName.split('/');
        if (!owner || !name) throw new Error(`Invalid repository: ${fullName}`);
        variables[`o${index}`] = owner;
        variables[`n${index}`] = name;
        declarations.push(`$o${index}:String!,$n${index}:String!`);
        fields.push(`r${index}:repository(owner:$o${index},name:$n${index}) { id nameWithOwner }`);
      });
      const data = await this.request<Record<string, { id: string; nameWithOwner: string } | null>>(
        `query(${declarations.join(',')}) { ${fields.join(' ')} ${rateFields} }`,
        variables,
        signal,
      );
      batch.forEach((name, index) => {
        const node = data[`r${index}`];
        if (node?.id) {
          if (
            !node.nameWithOwner ||
            normalizeListRepo(node.nameWithOwner) !== normalizeListRepo(name)
          )
            throw new Error(
              `Repository ${name} was renamed or transferred. Refresh repositories and Lists before pushing.`,
            );
          result.set(normalizeListRepo(name), node.id);
        }
      });
    }
    return result;
  }
  async executePushPlan(
    plan: ListsPushPlan,
    onMapping: (mapping: Record<string, string>) => void,
    signal?: AbortSignal,
    assertPlanCurrent: () => void = () => {},
  ): Promise<ListsPushResult> {
    this.assertActive(signal);
    const current = await this.getUserLists(signal);
    if (snapshotKey(current) !== snapshotKey(plan.remoteSnapshot))
      throw new Error('GitHub Lists changed since this preview. Refresh and preview again.');
    const issues = validateListsPushPlan(plan, current.length);
    if (issues.length) throw new Error(issues.join(' '));
    const nodes = await this.resolveRepositoryNodeIds(
      plan.memberships.map((p) => p.fullName),
      signal,
    );
    const missing = plan.memberships.filter((p) => !nodes.has(p.fullName));
    if (missing.length)
      throw new Error(
        `Cannot resolve ${missing.length} repositories. Refresh or exclude them before pushing.`,
      );
    if (
      this.rateLimit &&
      this.rateLimit.remaining <
        plan.entries.filter((e) => !e.listId).length + plan.memberships.length + 1
    )
      throw new Error('Insufficient GitHub rate limit. Wait until ' + this.rateLimit.resetAt);
    const mapping: Record<string, string> = {};
    for (const entry of plan.entries) {
      try {
        this.assertActive(signal);
        assertPlanCurrent();
        mapping[entry.categoryId] = entry.listId ?? (await this.createUserList(entry.name, signal));
        this.assertActive(signal);
        onMapping({ ...mapping });
      } catch (error) {
        throw new Error(
          `${Object.keys(mapping).length} categories mapped; remaining changes not attempted. Refresh Lists and preview again. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const result: ListsPushResult = { mapping, succeeded: [], failed: [], cancelled: false };
    // Sequential mutations bound load and stop immediately at an ambiguous failure; no replay.
    for (const item of plan.memberships) {
      try {
        this.assertActive(signal);
        assertPlanCurrent();
        const listIds = item.existingListIds.filter((id) => !item.removeListIds.includes(id));
        item.categoryIds.forEach((id) => listIds.push(mapping[id]));
        await this.updateUserListsForItem(nodes.get(item.fullName)!, listIds, signal);
        result.succeeded.push(item.fullName);
      } catch (error) {
        if (signal?.aborted) result.cancelled = true;
        else
          result.failed.push({
            fullName: item.fullName,
            error: error instanceof Error ? error.message : String(error),
          });
        break;
      }
    }
    return result;
  }
}
