import type { Repository } from '../types';
import { normalizeRepositoryFullName } from '../utils/repositoryImport';

export interface BatchStarOptions { backendUrl?: string | null; token?: string | null; concurrency?: number; isCurrentSession?: () => boolean }
export interface BatchStarRateLimit { remaining?: number; reset?: number; retryAfter?: number }
export interface BatchStarRow {
  fullName: string;
  status: 'ready' | 'failed' | 'success' | 'cancelled';
  repository?: Repository;
  error?: string;
}
export interface BatchStarResult { rows: BatchStarRow[]; syncError?: string; rateLimit?: BatchStarRateLimit }
interface RunState { stopped: boolean; rateLimit?: BatchStarRateLimit }
interface StarOptions {
  signal?: AbortSignal;
  onSuccess?: (repo: Repository) => void;
  onProgress?: (row: BatchStarRow) => void;
  sync?: () => Promise<void>;
}

function validateNames(names: string[]): void {
  if (names.length > 100) throw new Error('A batch may contain at most 100 repositories');
  for (const name of names) {
    const parts = name.split('/');
    if (parts.length !== 2 || normalizeRepositoryFullName(parts[0], parts[1]) !== name) throw new Error('Invalid repository name');
  }
}

export class BatchStarService {
  private options: BatchStarOptions;
  private concurrency: number;

  constructor(options: BatchStarOptions) {
    this.options = options;
    this.concurrency = Math.min(5, Math.max(1, Math.floor(options.concurrency || 3)));
  }

  /** One request only: uncertain mutation outcomes must be reviewed by the user before another attempt. */
  private async request(path: string, method: 'GET' | 'PUT', state: RunState, signal?: AbortSignal): Promise<Response> {
    const {backendUrl, token} = this.options;
    if (this.options.isCurrentSession && !this.options.isCurrentSession()) {
      state.stopped = true;
      throw new Error('NoNo session changed. Reopen Batch Star after reconnecting.');
    }
    if (!backendUrl && (!token || token === '__nono_server_managed__')) {
      state.stopped = true;
      throw new Error('GitHub connection unavailable. Reconnect your NoNo session.');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 30000);
    try {
      const response = backendUrl
        ? await fetch(`${backendUrl.replace(/\/$/, '')}/proxy/github${path}`, {
          method: 'POST', credentials: 'same-origin', signal: controller.signal,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({method, headers: {Accept: 'application/vnd.github+json'}}),
        })
        : await fetch(`https://api.github.com${path}`, {
          method, signal: controller.signal,
          headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
        });
      if (this.options.isCurrentSession && !this.options.isCurrentSession()) {
        state.stopped = true;
        throw new Error('NoNo session changed. Refresh repositories in the original account to check this request.');
      }
      const numberHeader = (key: string): number | undefined => {
        const raw = response.headers.get(key);
        return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
      };
      const remaining = numberHeader('x-ratelimit-remaining');
      const reset = numberHeader('x-ratelimit-reset');
      const retryAfter = numberHeader('retry-after');
      if (remaining !== undefined || reset !== undefined || retryAfter !== undefined) state.rateLimit = {remaining, reset, retryAfter};
      if ([401, 403, 429].includes(response.status) || remaining === 0) state.stopped = true;
      if (!response.ok) {
        const reason = response.status === 404 ? 'Repository not found or inaccessible'
          : [401, 403].includes(response.status) ? 'GitHub permission or rate-limit error. Check your connection before continuing'
            : response.status === 429 ? 'GitHub rate limit reached. Try again after the limit resets'
              : `GitHub request failed (${response.status})`;
        throw new Error(reason);
      }
      return response;
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Network request failed; the Star result may be unknown. Check GitHub before trying again.');
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  private async run(names: string[], state: RunState, work: (name: string, index: number) => Promise<BatchStarRow>, signal?: AbortSignal): Promise<BatchStarRow[]> {
    const rows: BatchStarRow[] = names.map(fullName => ({fullName, status: 'cancelled'}));
    let cursor = 0;
    await Promise.all(Array.from({length: Math.min(this.concurrency, names.length)}, async () => {
      while (cursor < names.length && !signal?.aborted && !state.stopped) {
        const index = cursor++;
        try { rows[index] = await work(names[index], index); }
        catch (error) {
          rows[index] = {fullName: names[index], status: signal?.aborted ? 'cancelled' : 'failed',
            error: signal?.aborted ? 'Request cancelled; an in-flight Star may still have reached GitHub.' : error instanceof Error ? error.message : 'GitHub request failed'};
        }
      }
    }));
    return rows;
  }

  async preview(names: string[], signal?: AbortSignal): Promise<BatchStarRow[]> {
    validateNames(names);
    const unique = [...new Map(names.map(name => [name.toLowerCase(), name])).values()];
    const state: RunState = {stopped: false};
    return this.run(unique, state, async fullName => {
      const response = await this.request(`/repos/${fullName}`, 'GET', state, signal);
      const repository = await response.json() as Repository;
      if (!repository || !Number.isFinite(repository.id) || !repository.full_name || !repository.owner?.login) throw new Error('Invalid repository metadata');
      validateNames([repository.full_name]);
      return {fullName, status: 'ready', repository: {...repository, topics: repository.topics || []}};
    }, signal);
  }

  async star(repositories: Repository[], options: StarOptions = {}): Promise<BatchStarResult> {
    validateNames(repositories.map(repo => repo.full_name));
    const unique = [...new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo])).values()];
    const state: RunState = {stopped: false};
    const persistenceErrors: string[] = [];
    const rows = await this.run(unique.map(repo => repo.full_name), state, async (fullName, index) => {
      // Cancellation stops the queue, allowing active mutations to return a confirmed outcome.
      const response = await this.request(`/user/starred/${fullName}`, 'PUT', state);
      if (response.status !== 204) throw new Error('Star was not confirmed by GitHub. Check GitHub before trying again.');
      const repository = {...unique[index], starred_at: new Date().toISOString()};
      const row: BatchStarRow = {fullName, status: 'success', repository};
      try { options.onSuccess?.(repository); }
      catch { persistenceErrors.push('A confirmed Star could not be saved locally. Refresh your repositories.'); }
      try { options.onProgress?.(row); }
      catch { persistenceErrors.push('A confirmed Star could not be displayed. Refresh your repositories.'); }
      return row;
    }, options.signal);
    if (rows.some(row => row.status === 'success')) {
      try { await options.sync?.(); }
      catch (error) { persistenceErrors.push(error instanceof Error ? error.message : 'Backend sync failed'); }
    }
    return {rows, rateLimit: state.rateLimit, syncError: persistenceErrors.length ? persistenceErrors.join(' ') : undefined};
  }
}
