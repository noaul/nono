import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllCategories, useAppStore } from '../../store/useAppStore';
import { getStorageScope } from '../../services/storageScope';
import { GitHubListsApiService } from '../../services/githubListsApi';
import {
  buildListsImportPlan,
  buildListsPushPlan,
  validateListsPushPlan,
  type ListsPushPlan,
} from '../../store/helpers/listsPushPlan';
import type { GitHubList, GitHubListsRateLimit } from '../../utils/githubLists';

interface Props {
  t?: (zh: string, en: string) => string;
  initialRepositoryIds?: number[];
}
const button =
  'rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed';
const localFingerprint = () => {
  const s = useAppStore.getState();
  return JSON.stringify([
    s.repositories.map((r) => [
      r.id,
      r.full_name,
      r.custom_category,
      r.name,
      r.description,
      r.language,
      r.topics,
      r.ai_summary,
      r.ai_tags,
    ]),
    s.language,
    s.hiddenDefaultCategoryIds,
    s.customCategories,
    s.defaultCategoryOverrides,
    s.categoryListIdMap,
    s.githubListMemberships,
  ]);
};
export function GitHubListsPanel({ t: translate, initialRepositoryIds }: Props) {
  const state = useAppStore();
  const t = translate ?? ((zh: string, en: string) => (state.language === 'zh' ? zh : en));
  const categories = useMemo(
    () =>
      getAllCategories(
        state.customCategories,
        state.language,
        state.hiddenDefaultCategoryIds,
        state.defaultCategoryOverrides,
      ),
    [
      state.customCategories,
      state.language,
      state.hiddenDefaultCategoryIds,
      state.defaultCategoryOverrides,
    ],
  );
  const [lists, setLists] = useState<GitHubList[] | null>(null);
  const [importIds, setImportIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [selectedRepoIds, setSelectedRepoIds] = useState<number[] | null>(
    initialRepositoryIds ?? null,
  );
  const [removeMissing, setRemoveMissing] = useState(false);
  const [preview, setPreview] = useState<ListsPushPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [rate, setRate] = useState<GitHubListsRateLimit | null>(null);
  const task = useRef<AbortController | null>(null);
  const fingerprint = useRef('');
  const generation = useRef({ value: 0 });
  const panelScope = useRef(getStorageScope());
  useEffect(() => {
    const lifecycle = generation.current;
    ++lifecycle.value;
    panelScope.current = getStorageScope();
    task.current?.abort();
    setLists(null);
    setImportIds([]);
    setCategoryIds([]);
    setMappingOverrides({});
    setPreview(null);
    setStatus('');
    setError('');
    setRate(null);
    setBusy(false);
    return () => {
      ++lifecycle.value;
      task.current?.abort();
    };
  }, [state.user?.id]);
  const invalidate = () => {
    setPreview(null);
    setError('');
    setStatus('');
  };
  const active = () =>
    !!state.user && !!getStorageScope() && getStorageScope() === panelScope.current;
  async function run(
    action: (
      api: GitHubListsApiService,
      signal: AbortSignal,
      valid: () => boolean,
    ) => Promise<void>,
  ) {
    if (!active()) {
      setError(
        t('NoNo 会话已变化，请刷新。', 'NoNo session changed. Refresh before syncing Lists.'),
      );
      return;
    }
    if (task.current) return;
    const controller = new AbortController();
    const scope = getStorageScope();
    const currentGeneration = generation.current.value;
    task.current = controller;
    setBusy(true);
    setError('');
    setStatus('');
    const valid = () =>
      currentGeneration === generation.current.value &&
      scope === getStorageScope() &&
      !controller.signal.aborted;
    const api = new GitHubListsApiService();
    try {
      await action(api, controller.signal, valid);
      if (valid()) setRate(api.rateLimit);
    } catch (error) {
      if (valid()) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (task.current === controller) task.current = null;
      if (currentGeneration === generation.current.value) setBusy(false);
    }
  }
  const refresh = () => {
    invalidate();
    void run(async (api, signal, valid) => {
      const remote = await api.getUserLists(signal);
      if (valid()) {
        setLists(remote);
        setImportIds([]);
        setStatus(t('已刷新 GitHub Lists。', 'GitHub Lists refreshed.'));
      }
    });
  };
  const prepare = () => {
    invalidate();
    void run(async (api, signal, valid) => {
      const remote = await api.getUserLists(signal);
      if (!valid()) return;
      const s = useAppStore.getState();
      const all = getAllCategories(
        s.customCategories,
        s.language,
        s.hiddenDefaultCategoryIds,
        s.defaultCategoryOverrides,
      );
      const plan = buildListsPushPlan(
        all.filter((c) => categoryIds.includes(c.id)),
        s.repositories,
        remote,
        { ...s.categoryListIdMap, ...mappingOverrides },
        s.githubListMemberships,
        { removeMissing, repositoryIds: selectedRepoIds ?? undefined },
      );
      const issues = validateListsPushPlan(plan, remote.length);
      if (issues.length) throw new Error(issues.join(' '));
      setLists(remote);
      fingerprint.current = localFingerprint();
      setPreview(plan);
    });
  };
  const confirm = () => {
    const plan = preview;
    if (!plan) return;
    setPreview(null);
    void run(async (api, signal, valid) => {
      const assertPlanCurrent = () => {
        if (!valid()) throw new DOMException('Cancelled', 'AbortError');
        if (localFingerprint() !== fingerprint.current)
          throw new Error(
            t(
              '本地分类或仓库已变化，请重新预览。',
              'Local categories or repositories changed. Preview again.',
            ),
          );
      };
      assertPlanCurrent();
      const result = await api.executePushPlan(
        plan,
        (map) => {
          if (valid()) {
            assertPlanCurrent();
            const s = useAppStore.getState();
            s.setCategoryListIdMap({ ...s.categoryListIdMap, ...map });
            fingerprint.current = localFingerprint();
          }
        },
        signal,
        assertPlanCurrent,
      );
      if (!valid()) return;
      const remaining = plan.memberships.length - result.succeeded.length - result.failed.length;
      setStatus(
        t(
          `${result.succeeded.length} 项成功；${result.failed.length} 项失败；${remaining} 项未执行。`,
          `${result.succeeded.length} succeeded; ${result.failed.length} failed; ${remaining} not attempted.`,
        ),
      );
      if (result.failed.length)
        setError(result.failed.map((item) => `${item.fullName}: ${item.error}`).join('\n'));
      setLists(null);
      setImportIds([]);
    });
  };
  const imported = lists?.filter((l) => importIds.includes(l.id)) ?? [];
  const importSummary = buildListsImportPlan(
    imported,
    categories,
    state.categoryListIdMap,
    state.githubListMemberships,
    state.repositories,
  );
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  return (
    <section
      className="space-y-4 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-light-surface dark:bg-dark-surface p-4 text-gray-900 dark:text-text-primary"
      aria-label="GitHub Lists"
    >
      <h3 className="text-base font-semibold">GitHub Lists</h3>
      <p className="text-sm text-gray-600 dark:text-text-secondary">
        {t(
          '使用 NoNo 会话和服务端保存的 GitHub Token。导入保留本地分类；推送默认保留远端成员。新建列表默认为私有。',
          'Uses your NoNo session and stored GitHub token. Imports preserve local categories; pushes preserve remote members by default. New Lists are private.',
        )}
      </p>
      {!active() && (
        <p>
          {t(
            '请先登录 NoNo 并配置 GitHub Token。',
            'Sign in to NoNo and configure a GitHub token first.',
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !active()} onClick={refresh}>
          {t('刷新 GitHub Lists', 'Refresh GitHub Lists')}
        </button>
        {busy && (
          <button
            className={button}
            onClick={() => {
              task.current?.abort();
              setPreview(null);
              setLists(null);
              setStatus(
                t(
                  '已取消。已提交的操作可能生效，请刷新并重新预览。',
                  'Cancelled. Submitted changes may have completed. Refresh and preview again.',
                ),
              );
            }}
          >
            {t('取消', 'Cancel')}
          </button>
        )}
      </div>
      {rate && (
        <p className="text-xs">
          {t('GitHub 剩余请求额度', 'GitHub rate remaining')}: {rate.remaining} ·{' '}
          {t('重置时间', 'Resets')}: {rate.resetAt}
        </p>
      )}
      {lists && (
        <fieldset disabled={busy} className="space-y-2">
          <legend className="font-medium">{t('从 GitHub 导入', 'Import from GitHub')}</legend>
          {!lists.length && (
            <p className="text-sm">{t('当前没有 GitHub Lists。', 'No GitHub Lists found.')}</p>
          )}
          {lists.map((list) => (
            <label key={list.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`Import ${list.name}`}
                checked={importIds.includes(list.id)}
                onChange={() => setImportIds(toggle(importIds, list.id))}
              />
              <span>
                {list.name} ({list.items.length})
              </span>
            </label>
          ))}
          {imported.length > 0 && (
            <p className="text-sm">
              {t(
                `${imported.length} 个列表，${importSummary.unavailableCount} 个仓库不在本地星标中。未在本地的成员会保留，星标不会改变。`,
                `${imported.length} Lists; ${importSummary.unavailableCount} repositories unavailable locally. Memberships are retained; Stars stay unchanged.`,
              )}
            </p>
          )}
          <button
            className={button}
            disabled={!imported.length || !active()}
            onClick={() => {
              if (!active()) {
                setError('NoNo session changed. Refresh before importing Lists.');
                return;
              }
              state.importGitHubLists(imported);
              invalidate();
              setStatus(t('已导入所选列表。', 'Selected Lists imported.'));
            }}
          >
            {t('导入所选列表', 'Import selected Lists')}
          </button>
        </fieldset>
      )}
      <fieldset disabled={busy || !active()} className="space-y-3">
        <legend className="font-medium">{t('推送到 GitHub', 'Push to GitHub')}</legend>
        <p className="text-sm">
          {t(
            '选择分类；同名列表自动匹配，也可选择具体列表。',
            'Choose categories. Matching List names are reused, or select a specific List.',
          )}
        </p>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Push ${category.name}`}
                  checked={categoryIds.includes(category.id)}
                  onChange={() => {
                    setCategoryIds(toggle(categoryIds, category.id));
                    invalidate();
                  }}
                />
                {category.name}
              </label>
              {lists && categoryIds.includes(category.id) && (
                <select
                  className="max-w-full rounded border bg-light-surface dark:bg-dark-surface p-1"
                  aria-label={`Map ${category.name}`}
                  value={
                    mappingOverrides[category.id] ?? state.categoryListIdMap[category.id] ?? ''
                  }
                  onChange={(event) => {
                    setMappingOverrides({ ...mappingOverrides, [category.id]: event.target.value });
                    invalidate();
                  }}
                >
                  <option value="">{t('同名匹配或新建', 'Match name or create')}</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selectedRepoIds !== null}
            onChange={(event) => {
              setSelectedRepoIds(event.target.checked ? (initialRepositoryIds ?? []) : null);
              setRemoveMissing(false);
              invalidate();
            }}
          />
          {t('仅推送明确选择的仓库', 'Push only explicitly selected repositories')}
        </label>
        {selectedRepoIds !== null && (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {state.repositories.map((repo) => (
              <label className="flex items-center gap-2 text-sm" key={repo.id}>
                <input
                  type="checkbox"
                  aria-label={`Select ${repo.full_name}`}
                  checked={selectedRepoIds.includes(repo.id)}
                  onChange={() => {
                    setSelectedRepoIds(
                      selectedRepoIds.includes(repo.id)
                        ? selectedRepoIds.filter((id) => id !== repo.id)
                        : [...selectedRepoIds, repo.id],
                    );
                    invalidate();
                  }}
                />
                {repo.full_name}
              </label>
            ))}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            aria-label="Remove missing members from selected Lists"
            checked={removeMissing}
            disabled={selectedRepoIds !== null}
            onChange={(event) => {
              setRemoveMissing(event.target.checked);
              invalidate();
            }}
          />
          {t(
            '移除所选列表中本地分类没有的成员（不会取消星标）',
            'Remove missing members from selected Lists (does not unstar)',
          )}
        </label>
        {removeMissing && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t(
              '此选项会移除所选列表中未包含在本地分类的仓库。请仔细检查预览。',
              'This removes repositories from selected Lists when absent from the local category. Review the preview carefully.',
            )}
          </p>
        )}
        <button
          className={button}
          disabled={!categoryIds.length || (selectedRepoIds !== null && !selectedRepoIds.length)}
          onClick={prepare}
        >
          {t('预览推送', 'Preview push')}
        </button>
      </fieldset>
      {preview && (
        <div className="space-y-2 rounded-lg border border-black/10 dark:border-white/10 p-3">
          <h4 className="font-medium">{t('操作预览', 'Operation preview')}</h4>
          {preview.entries.map((entry) => (
            <p className="text-sm" key={entry.categoryId}>
              {entry.name}:{' '}
              {entry.listId
                ? t('映射现有列表', 'Map existing List')
                : t('新建私有列表', 'Create private List')}{' '}
              · {entry.repositoryNames.length} {t('个本地成员', 'local members')}
            </p>
          ))}
          <p className="text-sm">
            {t(
              `${preview.memberships.length} 项仓库成员变更`,
              `${preview.memberships.length} repository membership changes`,
            )}
          </p>
          <ul className="max-h-48 overflow-y-auto text-xs space-y-1">
            {preview.memberships.map((item) => (
              <li key={item.fullName}>
                {item.fullName} · {t('新增/保留', 'Add/keep')}:{' '}
                {item.categoryIds
                  .map((id) => preview.entries.find((e) => e.categoryId === id)?.name)
                  .join(', ') || '—'}{' '}
                {item.removeListIds.length > 0 &&
                  ` · ${t('移除', 'Remove')}: ${item.removeListIds.map((id) => preview.remoteSnapshot.find((l) => l.id === id)?.name ?? id).join(', ')}`}
              </li>
            ))}
          </ul>
          <button className={button} disabled={busy || !active()} onClick={confirm}>
            {t('确认 GitHub 变更', 'Confirm GitHub changes')}
          </button>
        </div>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
