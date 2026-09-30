import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubListsApiService } from './githubListsApi';
import { backend } from './backendAdapter';
import { setStorageScope } from './storageScope';
import { buildListsPushPlan } from '../store/helpers/listsPushPlan';
import type { Category, Repository } from '../types';
const page = (nodes: unknown[], cursor: string | null = null) => ({
  nodes,
  pageInfo: { hasNextPage: !!cursor, endCursor: cursor },
});
const category = { id: 'tools', name: 'Tools', icon: '📁', keywords: [] } as Category;
beforeEach(() => {
  vi.restoreAllMocks();
  setStorageScope('alice');
});
describe('GitHub Lists proxy', () => {
  it('pages viewer Lists and repository members while exposing rate metadata', async () => {
    vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async (_q, variables = {}) => {
      if ('listId' in variables)
        return {
          data: {
            node: {
              items: variables.cursor
                ? page([{ __typename: 'Repository', nameWithOwner: 'b/two' }])
                : page(
                    [
                      { __typename: 'Repository', nameWithOwner: 'a/one' },
                      { __typename: 'User', nameWithOwner: 'skip' },
                    ],
                    'members-next',
                  ),
            },
            rateLimit: { remaining: 10, resetAt: 'later', cost: 1 },
          },
        };
      return {
        data: {
          viewer: {
            lists: variables.cursor
              ? page([{ id: 'L2', name: 'Other', isPrivate: false }])
              : page([{ id: 'L1', name: 'Tools', isPrivate: true }], 'lists-next'),
          },
        },
      };
    });
    const api = new GitHubListsApiService();
    expect((await api.getUserLists()).map((l) => l.items)).toEqual([
      ['a/one', 'b/two'],
      ['a/one', 'b/two'],
    ]);
    expect(api.rateLimit?.remaining).toBe(10);
  });
  it('rejects incomplete GraphQL pages instead of importing a partial snapshot', async () => {
    vi.spyOn(backend, 'proxyGitHubGraphQL').mockResolvedValue({
      data: { viewer: { lists: page([], 'stuck') } },
      errors: [{ message: 'permission denied' }],
    });
    await expect(new GitHubListsApiService().getUserLists()).rejects.toThrow('permission denied');
  });
  it('does not replay a mutation after a lost response', async () => {
    const call = vi
      .spyOn(backend, 'proxyGitHubGraphQL')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(new GitHubListsApiService().createUserList('Tools')).rejects.toThrow(
      /unknown|refresh/i,
    );
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('stops stale tenant work before another request', async () => {
    const api = new GitHubListsApiService();
    setStorageScope('bob');
    const call = vi.spyOn(backend, 'proxyGitHubGraphQL');
    await expect(api.getUserLists()).rejects.toThrow(/session changed/i);
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects repeating pagination cursors', async () => {
    vi.spyOn(backend, 'proxyGitHubGraphQL').mockResolvedValue({
      data: { viewer: { lists: page([], 'same') } },
    });
    await expect(new GitHubListsApiService().getUserLists()).rejects.toThrow(/pagination/i);
  });
  it('preflights unresolved repositories before creating any Lists', async () => {
    vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async (query) =>
      query.includes('repository(')
        ? { data: { r0: null } }
        : { data: { viewer: { lists: page([]) } } },
    );
    const plan = buildListsPushPlan(
      [category],
      [{ id: 1, full_name: 'a/one', custom_category: 'Tools' } as Repository],
      [],
      {},
      {},
    );
    await expect(new GitHubListsApiService().executePushPlan(plan, vi.fn())).rejects.toThrow(
      /resolve/,
    );
    expect(backend.proxyGitHubGraphQL).not.toHaveBeenCalledWith(
      expect.stringContaining('mutation'),
      expect.anything(),
      expect.anything(),
    );
  });
});

it('preserves unrelated memberships while pushing and persists newly created mapping before failure', async () => {
  const remote = [{ id: 'other', name: 'Other', isPrivate: false, items: ['a/one'] }];
  const api = new GitHubListsApiService();
  vi.spyOn(api, 'getUserLists').mockResolvedValue(remote);
  vi.spyOn(api, 'resolveRepositoryNodeIds').mockResolvedValue(
    new Map([
      ['a/one', 'R1'],
      ['b/two', 'R2'],
    ]),
  );
  vi.spyOn(api, 'createUserList').mockResolvedValue('new-list');
  const update = vi
    .spyOn(api, 'updateUserListsForItem')
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('Mutation outcome unknown; refresh'));
  const onMapping = vi.fn();
  const plan = buildListsPushPlan(
    [category],
    [
      { id: 1, full_name: 'a/one', custom_category: 'Tools' },
      { id: 2, full_name: 'b/two', custom_category: 'Tools' },
    ] as Repository[],
    remote,
    {},
    {},
  );
  const result = await api.executePushPlan(plan, onMapping);
  expect(onMapping).toHaveBeenCalledWith({ tools: 'new-list' });
  expect(update).toHaveBeenNthCalledWith(1, 'R1', ['other', 'new-list'], undefined);
  expect(result).toEqual({
    mapping: { tools: 'new-list' },
    succeeded: ['a/one'],
    failed: [{ fullName: 'b/two', error: 'Mutation outcome unknown; refresh' }],
    cancelled: false,
  });
});
it('rejects a changed remote snapshot before resolving IDs or writing', async () => {
  const api = new GitHubListsApiService();
  vi.spyOn(api, 'getUserLists').mockResolvedValue([
    { id: 'new', name: 'New', isPrivate: true, items: [] },
  ]);
  const create = vi.spyOn(api, 'createUserList');
  await expect(
    api.executePushPlan(buildListsPushPlan([category], [], [], {}, {}), vi.fn()),
  ).rejects.toThrow('changed since');
  expect(create).not.toHaveBeenCalled();
});
it('cancels the queue without executing the next mutation', async () => {
  const api = new GitHubListsApiService();
  const controller = new AbortController();
  vi.spyOn(api, 'getUserLists').mockResolvedValue([]);
  vi.spyOn(api, 'resolveRepositoryNodeIds').mockResolvedValue(
    new Map([
      ['a/one', 'R1'],
      ['b/two', 'R2'],
    ]),
  );
  vi.spyOn(api, 'createUserList').mockResolvedValue('L');
  const update = vi.spyOn(api, 'updateUserListsForItem').mockImplementationOnce(async () => {
    controller.abort();
  });
  const result = await api.executePushPlan(
    buildListsPushPlan(
      [category],
      [
        { id: 1, full_name: 'a/one', custom_category: 'Tools' },
        { id: 2, full_name: 'b/two', custom_category: 'Tools' },
      ] as Repository[],
      [],
      {},
      {},
    ),
    vi.fn(),
    controller.signal,
  );
  expect(result.cancelled).toBe(true);
  expect(update).toHaveBeenCalledTimes(1);
  expect(result.succeeded).toEqual(['a/one']);
});
it('does not schedule more than three member reads concurrently', async () => {
  let inflight = 0;
  let maximum = 0;
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async (_q, variables = {}) => {
    if (!('listId' in variables))
      return {
        data: {
          viewer: {
            lists: page(
              Array.from({ length: 7 }, (_, i) => ({
                id: String(i),
                name: String(i),
                isPrivate: true,
              })),
            ),
          },
        },
      };
    inflight++;
    maximum = Math.max(maximum, inflight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inflight--;
    return { data: { node: { items: page([]) } } };
  });
  expect(await new GitHubListsApiService().getUserLists()).toHaveLength(7);
  expect(maximum).toBe(3);
});
it('a cancelled request does not schedule a proxy call', async () => {
  const call = vi.spyOn(backend, 'proxyGitHubGraphQL');
  const controller = new AbortController();
  controller.abort();
  await expect(new GitHubListsApiService().getUserLists(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(call).not.toHaveBeenCalled();
});
it('stops scheduling member reads after a page fails and drains already started reads', async () => {
  const started: string[] = [];
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async (_q, variables = {}) => {
    if (!('listId' in variables))
      return {
        data: {
          viewer: {
            lists: page(
              Array.from({ length: 7 }, (_, i) => ({
                id: String(i),
                name: String(i),
                isPrivate: true,
              })),
            ),
          },
        },
      };
    started.push(String(variables.listId));
    if (variables.listId === '0') throw new Error('Denied');
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: { node: { items: page([]) } } };
  });
  await expect(new GitHubListsApiService().getUserLists()).rejects.toThrow('Denied');
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(started).toEqual(['0', '1', '2']);
});
it('reports partial List creation and retains the successful mapping before stopping', async () => {
  const api = new GitHubListsApiService();
  vi.spyOn(api, 'getUserLists').mockResolvedValue([]);
  const create = vi
    .spyOn(api, 'createUserList')
    .mockResolvedValueOnce('L1')
    .mockRejectedValueOnce(new Error('Mutation outcome unknown'));
  const onMapping = vi.fn();
  const plan = buildListsPushPlan(
    [category, { ...category, id: 'second', name: 'Second' }],
    [],
    [],
    {},
    {},
  );
  await expect(api.executePushPlan(plan, onMapping)).rejects.toThrow('1 categories mapped');
  expect(onMapping).toHaveBeenCalledWith({ tools: 'L1' });
  expect(create).toHaveBeenCalledTimes(2);
});
it('rejects a repository rename before pushing so unrelated canonical memberships cannot be lost', async () => {
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockResolvedValue({
    data: { r0: { id: 'R1', nameWithOwner: 'new/name' } },
  });
  await expect(new GitHubListsApiService().resolveRepositoryNodeIds(['old/name'])).rejects.toThrow(
    'renamed',
  );
});
it('does not count a null membership mutation payload as success', async () => {
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockResolvedValue({
    data: { updateUserListsForItem: null },
  });
  await expect(new GitHubListsApiService().updateUserListsForItem('R1', ['L1'])).rejects.toThrow(
    'outcome unknown',
  );
});
it('checks local plan validity after read preflight and before creating Lists', async () => {
  const api = new GitHubListsApiService();
  vi.spyOn(api, 'getUserLists').mockResolvedValue([]);
  const create = vi.spyOn(api, 'createUserList');
  await expect(
    api.executePushPlan(buildListsPushPlan([category], [], [], {}, {}), vi.fn(), undefined, () => {
      throw new Error('Local plan changed');
    }),
  ).rejects.toThrow('Local plan changed');
  expect(create).not.toHaveBeenCalled();
});
it('does not schedule another member page after a sibling List read fails', async () => {
  const pages: string[] = [];
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async (_q, variables = {}) => {
    if (!('listId' in variables))
      return {
        data: {
          viewer: {
            lists: page(
              [0, 1, 2].map((i) => ({ id: String(i), name: String(i), isPrivate: true })),
            ),
          },
        },
      };
    pages.push(`${variables.listId}:${variables.cursor}`);
    if (variables.listId === '0') throw new Error('Denied');
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: { node: { items: page([], variables.cursor ? null : 'next') } } };
  });
  await expect(new GitHubListsApiService().getUserLists()).rejects.toThrow('Denied');
  expect(pages).toEqual(['0:null', '1:null', '2:null']);
});
it('caps viewer pagination even when all pages contain no Lists', async () => {
  let count = 0;
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async () => {
    if (count >= 101) throw new Error('Test runaway sentinel');
    return { data: { viewer: { lists: page([], String(++count)) } } };
  });
  await expect(new GitHubListsApiService().getUserLists()).rejects.toThrow('page limit');
  expect(count).toBe(100);
});
it('caps member pagination even when all pages contain null nodes', async () => {
  let count = 0;
  vi.spyOn(backend, 'proxyGitHubGraphQL').mockImplementation(async (_q, variables = {}) => {
    if (count >= 101) throw new Error('Test runaway sentinel');
    return 'listId' in variables
      ? { data: { node: { items: page([null], String(++count)) } } }
      : { data: { viewer: { lists: page([{ id: 'L', name: 'List', isPrivate: true }]) } } };
  });
  await expect(new GitHubListsApiService().getUserLists()).rejects.toThrow('page limit');
  expect(count).toBe(100);
});
