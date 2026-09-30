import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchStarModal } from './BatchStarModal';
import { useAppStore } from '../store/useAppStore';
import { setStorageScope } from '../services/storageScope';
import { readBatchStarHistory } from '../services/batchStarHistoryStorage';
import { backend } from '../services/backendAdapter';
vi.unmock('../store/useAppStore');
vi.mock('../services/backendAdapter', () => ({backend: {backendUrl: '/api/nostar', isAvailable: true, syncRepositories: vi.fn(async () => {})}}));
vi.mock('./ReadmeModal', () => ({ReadmeModal: ({repository, onClose}: {repository: {full_name: string}; onClose: () => void}) => <div role="dialog" aria-label="README"><span>{repository.full_name} README content</span><button onClick={onClose}>Close README</button></div>}));
const repo = (id: number, name: string) => ({id, name, full_name: `owner/${name}`, owner: {login: 'owner', avatar_url: ''}, html_url: `https://github.com/owner/${name}`, description: `${name} description`, stargazers_count: 10, language: 'TypeScript', topics: []});
const res = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {status});

describe('Batch Star review workflow', () => {
  beforeEach(() => {
    localStorage.clear(); setStorageScope(1);
    useAppStore.setState({language: 'en', githubToken: '__nono_server_managed__', repositories: [], searchResults: []});
    vi.stubGlobal('fetch', vi.fn(async url => res(repo(String(url).endsWith('two') ? 2 : 1, String(url).endsWith('two') ? 'two' : 'one'))));
    vi.mocked(backend.syncRepositories).mockClear();
  });
  afterEach(() => {cleanup(); vi.unstubAllGlobals();});
  const preview = async (text = 'owner/one owner/two') => {
    fireEvent.change(screen.getByLabelText('Paste repositories'), {target: {value: text}});
    fireEvent.click(screen.getByRole('button', {name: 'Preview repositories'}));
    await screen.findByText('one description');
  };
  it('previews without mutations and Stars only selected rows, immediately saving confirmed results and syncing', async () => {
    render(<BatchStarModal isOpen onClose={() => {}} />);
    await preview();
    expect(useAppStore.getState().repositories).toEqual([]);
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => JSON.parse(String(init?.body)).method === 'GET')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', {name: 'Select owner/two'}));
    vi.mocked(fetch).mockResolvedValue(res(null, 204));
    fireEvent.click(screen.getByRole('button', {name: 'Star selected (1)'}));
    await screen.findByText(/1 starred/);
    expect(useAppStore.getState().repositories.map(repo => repo.full_name)).toEqual(['owner/one']);
    expect(backend.syncRepositories).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({full_name: 'owner/one'})]));
  });
  it('opens README preview on request and provides editable, reusable scoped history', async () => {
    render(<BatchStarModal isOpen onClose={() => {}} />);
    await preview('owner/one');
    fireEvent.click(screen.getByRole('button', {name: 'Preview README owner/one'}));
    await screen.findByText('owner/one README content');
    fireEvent.click(screen.getByRole('button', {name: 'Close README'}));
    expect(readBatchStarHistory()[0].text).toBe('owner/one');
    fireEvent.click(screen.getByRole('button', {name: 'Edit history 1'}));
    fireEvent.change(screen.getByLabelText('Edit saved paste'), {target: {value: 'owner/two'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save history edit'}));
    expect(readBatchStarHistory()[0].text).toBe('owner/two');
    fireEvent.click(screen.getByRole('button', {name: 'Reuse history 1'}));
    expect(screen.getByLabelText('Paste repositories')).toHaveValue('owner/two');
    fireEvent.click(screen.getByRole('button', {name: 'Delete history 1'}));
    expect(readBatchStarHistory()).toEqual([]);
  });
  it('surfaces unavailable metadata and backend sync failures without losing confirmed Stars', async () => {
    vi.mocked(fetch).mockImplementation(async url => String(url).endsWith('two') ? res({}, 404) : res(repo(1, 'one')));
    vi.mocked(backend.syncRepositories).mockRejectedValueOnce(new Error('Persistence offline'));
    render(<BatchStarModal isOpen onClose={() => {}} />);
    await preview();
    expect(screen.getByText(/Repository not found/)).toBeInTheDocument();
    vi.mocked(fetch).mockResolvedValue(res(null, 204));
    fireEvent.click(screen.getByRole('button', {name: 'Star selected (1)'}));
    await screen.findByText(/Persistence offline/);
    expect(useAppStore.getState().repositories).toHaveLength(1);
  });
  it('saves confirmed in-flight successes after closing the modal and never starts cancelled queued requests', async () => {
    const targets = Array.from({length: 4}, (_, i) => `owner/repo${i}`).join(' ');
    vi.mocked(fetch).mockImplementation(async url => res(repo(Number(String(url).slice(-1)), `repo${String(url).slice(-1)}`)));
    const view = render(<BatchStarModal isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Paste repositories'), {target: {value: targets}});
    fireEvent.click(screen.getByRole('button', {name: 'Preview repositories'}));
    await screen.findByText('repo0 description');
    const completions: ((value: Response) => void)[] = [];
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => {completions.push(resolve);}));
    fireEvent.click(screen.getByRole('button', {name: 'Star selected (4)'}));
    await waitFor(() => expect(completions).toHaveLength(3));
    view.rerender(<BatchStarModal isOpen={false} onClose={() => {}} />);
    await act(async () => {completions.forEach(resolve => resolve(res(null, 204)));});
    expect(useAppStore.getState().repositories).toHaveLength(3);
    expect(completions).toHaveLength(3);
    expect(backend.syncRepositories).toHaveBeenCalled();
  });
  it('requires a new preview after the tenant changes before Star is triggered', async () => {
    render(<BatchStarModal isOpen onClose={() => {}} />);
    await preview('owner/one');
    setStorageScope(2);
    vi.mocked(fetch).mockClear();
    fireEvent.click(screen.getByRole('button', {name: 'Star selected (1)'}));
    await screen.findByText(/session changed/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(useAppStore.getState().repositories).toEqual([]);
  });
  it('does not add delayed responses to a new NoNo user or persist the old user snapshot', async () => {
    render(<BatchStarModal isOpen onClose={() => {}} />);
    await preview('owner/one');
    let finish!: (res: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    fireEvent.click(screen.getByRole('button', {name: 'Star selected (1)'}));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    setStorageScope(2);
    await act(async () => {finish(res(null, 204));});
    expect(useAppStore.getState().repositories).toEqual([]);
    expect(backend.syncRepositories).not.toHaveBeenCalled();
  });
});
