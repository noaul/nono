import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GitHubListsPanel } from './GitHubListsPanel';
import { useAppStore } from '../../store/useAppStore';
import { GitHubListsApiService } from '../../services/githubListsApi';
import { setStorageScope } from '../../services/storageScope';
vi.unmock('../../store/useAppStore');
afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  setStorageScope('alice');
  useAppStore.setState({
    user: { id: 1, login: 'alice' },
    customCategories: [{ id: 'tools', name: 'Tools', icon: '📁', keywords: [], isCustom: true }],
    repositories: [{ id: 1, full_name: 'a/one', custom_category: 'Tools' }],
    categoryListIdMap: { tools: 'L1' },
    githubListMemberships: {},
  } as never);
  vi.spyOn(GitHubListsApiService.prototype, 'getUserLists').mockResolvedValue([
    { id: 'L1', name: 'Tools', isPrivate: true, items: [] },
  ]);
});
it('reads Lists and imports selected memberships only after an explicit import click', async () => {
  const imported = vi.spyOn(useAppStore.getState(), 'importGitHubLists');
  render(<GitHubListsPanel t={(_zh, en) => en} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh GitHub Lists' }));
  await screen.findByLabelText('Import Tools');
  expect(imported).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Import Tools'));
  fireEvent.click(screen.getByRole('button', { name: 'Import selected Lists' }));
  expect(imported).toHaveBeenCalledWith([expect.objectContaining({ id: 'L1' })]);
});
it('previews category changes before a separate confirmation can mutate GitHub', async () => {
  const execute = vi.spyOn(GitHubListsApiService.prototype, 'executePushPlan').mockResolvedValue({
    mapping: { tools: 'L1' },
    succeeded: ['a/one'],
    failed: [],
    cancelled: false,
  });
  render(<GitHubListsPanel t={(_zh, en) => en} />);
  fireEvent.click(screen.getByLabelText('Push Tools'));
  fireEvent.click(screen.getByRole('button', { name: 'Preview push' }));
  await screen.findByText('1 repository membership changes');
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm GitHub changes' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 succeeded'));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Confirm GitHub changes' })).toBeNull();
});
it('invalidates preview when removal option or category selection changes', async () => {
  render(<GitHubListsPanel t={(_zh, en) => en} />);
  fireEvent.click(screen.getByLabelText('Push Tools'));
  fireEvent.click(screen.getByRole('button', { name: 'Preview push' }));
  await screen.findByRole('button', { name: 'Confirm GitHub changes' });
  fireEvent.click(screen.getByLabelText('Remove missing members from selected Lists'));
  expect(screen.queryByRole('button', { name: 'Confirm GitHub changes' })).toBeNull();
});
it('clears removal intent when switching to explicit repository selection', async () => {
  const execute = vi
    .spyOn(GitHubListsApiService.prototype, 'executePushPlan')
    .mockResolvedValue({ mapping: { tools: 'L1' }, succeeded: [], failed: [], cancelled: false });
  vi.spyOn(GitHubListsApiService.prototype, 'getUserLists').mockResolvedValue([
    { id: 'L1', name: 'Tools', isPrivate: true, items: ['b/two'] },
  ]);
  render(<GitHubListsPanel t={(_zh, en) => en} />);
  fireEvent.click(screen.getByLabelText('Push Tools'));
  fireEvent.click(screen.getByLabelText('Remove missing members from selected Lists'));
  fireEvent.click(screen.getByLabelText('Push only explicitly selected repositories'));
  expect(screen.getByLabelText('Remove missing members from selected Lists')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Select a/one'));
  fireEvent.click(screen.getByRole('button', { name: 'Preview push' }));
  await screen.findByRole('button', { name: 'Confirm GitHub changes' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm GitHub changes' }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(execute.mock.calls[0][0].memberships).toEqual([
    expect.objectContaining({ fullName: 'a/one', removeListIds: [] }),
  ]);
});
it('rejects stale imported Lists when NoNo storage scope has changed', async () => {
  const imported = vi.spyOn(useAppStore.getState(), 'importGitHubLists');
  render(<GitHubListsPanel t={(_zh, en) => en} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh GitHub Lists' }));
  await screen.findByLabelText('Import Tools');
  fireEvent.click(screen.getByLabelText('Import Tools'));
  setStorageScope('bob');
  fireEvent.click(screen.getByRole('button', { name: 'Import selected Lists' }));
  expect(imported).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('session changed');
});
it('blocks a removal preview when inferred category inputs change before confirmation', async () => {
  useAppStore.setState({
    customCategories: [
      { id: 'tools', name: 'Tools', icon: '📁', keywords: ['cli'], isCustom: true },
    ],
    repositories: [
      { id: 1, full_name: 'a/one', name: 'one', custom_category: undefined, ai_tags: ['cli'] },
    ],
  } as never);
  vi.spyOn(GitHubListsApiService.prototype, 'getUserLists').mockResolvedValue([
    { id: 'L1', name: 'Tools', isPrivate: true, items: ['a/one'] },
  ]);
  const execute = vi
    .spyOn(GitHubListsApiService.prototype, 'executePushPlan')
    .mockResolvedValue({ mapping: { tools: 'L1' }, succeeded: [], failed: [], cancelled: false });
  render(<GitHubListsPanel t={(_zh, en) => en} />);
  fireEvent.click(screen.getByLabelText('Push Tools'));
  fireEvent.click(screen.getByLabelText('Remove missing members from selected Lists'));
  fireEvent.click(screen.getByRole('button', { name: 'Preview push' }));
  await screen.findByRole('button', { name: 'Confirm GitHub changes' });
  act(() =>
    useAppStore.getState().updateRepositoriesMetadata([{ id: 1, patch: { ai_tags: ['changed'] } }]),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm GitHub changes' }));
  await screen.findByRole('alert');
  expect(execute).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('changed. Preview again');
});
