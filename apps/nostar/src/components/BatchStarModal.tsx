import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Star } from 'lucide-react';
import { Modal } from './Modal';
import { useAppStore } from '../store/useAppStore';
import type { Repository } from '../types';
import { backend } from '../services/backendAdapter';
import { BatchStarService, type BatchStarResult, type BatchStarRow } from '../services/batchStarService';
import { readBatchStarHistory, writeBatchStarHistory, type BatchStarHistoryEntry } from '../services/batchStarHistoryStorage';
import { getStorageScope } from '../services/storageScope';
import { extractRepositoryCandidates } from '../utils/repositoryImport';

const ReadmeModal = lazy(() => import('./ReadmeModal').then(module => ({default: module.ReadmeModal})));
interface BatchStarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessfulRepositories?: (repos: Repository[]) => void;
}
const buttonClass = 'px-3 py-2 rounded-lg text-sm border border-black/10 dark:border-white/10 hover:bg-light-surface dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed';

export const BatchStarModal: React.FC<BatchStarModalProps> = ({isOpen, onClose, onSuccessfulRepositories}) => {
  const {language, githubToken, user, repositories} = useAppStore();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BatchStarRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'idle' | 'preview' | 'star'>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<BatchStarResult | null>(null);
  const [history, setHistory] = useState<BatchStarHistoryEntry[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [readme, setReadme] = useState<Repository | null>(null);
  const operation = useRef<AbortController | null>(null);
  const historyScope = useRef('');
  const previewSession = useRef<(() => boolean) | null>(null);
  const visible = useRef(isOpen);
  visible.current = isOpen;
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  useEffect(() => {
    historyScope.current = getStorageScope();
    setHistory(readBatchStarHistory());
    setEditing(null);
    setText('');
    previewSession.current = null;
    setRows([]);
    setSelected(new Set());
    setError('');
    setNotice('');
    setResult(null);
    setReadme(null);
    setPhase('idle');
    return () => {
      operation.current?.abort();
      operation.current = null;
    };
  }, [isOpen, githubToken, user?.id]);

  const isCurrent = (controller: AbortController) => visible.current && operation.current === controller;
  const createContext = () => {
    const scope = getStorageScope();
    const token = useAppStore.getState().githubToken;
    const userId = useAppStore.getState().user?.id;
    const backendUrl = backend.backendUrl;
    const isSameSession = () => getStorageScope() === scope && useAppStore.getState().githubToken === token
      && useAppStore.getState().user?.id === userId && backend.backendUrl === backendUrl;
    return {isSameSession, service: new BatchStarService({backendUrl, token, concurrency: 3, isCurrentSession: isSameSession})};
  };

  const updateHistory = (entries: BatchStarHistoryEntry[]) => {
    if (historyScope.current !== getStorageScope()) return;
    writeBatchStarHistory(entries);
    setHistory(readBatchStarHistory());
  };
  const resetPreview = (next: string) => {
    previewSession.current = null;
    setText(next); setRows([]); setSelected(new Set()); setResult(null); setError(''); setNotice('');
  };
  const preview = async () => {
    if (operation.current) return;
    const parsed = extractRepositoryCandidates(text);
    setError(''); setResult(null);
    if (parsed.error || !parsed.fullNames.length) {
      setError(parsed.error || t('未找到仓库，请粘贴 owner/repo 或 GitHub 链接。', 'No repositories found. Paste owner/repo names or GitHub links.'));
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    const {service, isSameSession} = createContext();
    previewSession.current = null;
    setPhase('preview'); setRows([]); setSelected(new Set());
    setNotice(parsed.overflow ? t(`每次最多 100 个仓库，另外 ${parsed.overflow} 个未包含，请另行粘贴。`, `Limited to 100 repositories; ${parsed.overflow} more were excluded. Paste them in a separate batch.`)
      : parsed.duplicates ? t(`已去除 ${parsed.duplicates} 个重复项。`, `${parsed.duplicates} duplicate entries removed.`) : '');
    try {
      const next = await service.preview(parsed.fullNames, controller.signal);
      if (!isCurrent(controller) || !isSameSession()) return;
      previewSession.current = isSameSession;
      setRows(next);
      const known = new Set(useAppStore.getState().repositories.map(repo => repo.full_name.toLowerCase()));
      const chosen = new Set<string>();
      for (const row of next) {
        if (row.status !== 'ready' || !row.repository || known.has(row.repository.full_name.toLowerCase())) continue;
        chosen.add(row.fullName); known.add(row.repository.full_name.toLowerCase());
      }
      setSelected(chosen);
      updateHistory([{text, generatedAt: Date.now()}, ...readBatchStarHistory()]);
    } catch (cause) {
      if (isCurrent(controller)) setError(cause instanceof Error ? cause.message : t('预览失败', 'Preview failed'));
    } finally {
      if (isCurrent(controller)) {setPhase('idle'); operation.current = null;}
    }
  };

  const star = async () => {
    if (operation.current) return;
    if (!previewSession.current?.()) {
      setError(t('NoNo 会话已更改，请重新预览。', 'NoNo session changed. Preview repositories again.'));
      setRows([]); setSelected(new Set());
      return;
    }
    const targets = rows.filter(row => selected.has(row.fullName) && row.status === 'ready' && row.repository).map(row => row.repository!);
    if (!targets.length) return;
    const controller = new AbortController();
    operation.current = controller;
    const {service, isSameSession} = createContext();
    setPhase('star'); setError(''); setResult(null);
    const successful: Repository[] = [];
    try {
      const outcome = await service.star(targets, {
        signal: controller.signal,
        onSuccess: repository => {
          if (!isSameSession()) throw new Error('NoNo session changed');
          useAppStore.getState().addRepository(repository);
          successful.push(repository);
        },
        onProgress: row => {
          if (isCurrent(controller) && isSameSession()) setRows(current => current.map(existing => existing.repository?.full_name.toLowerCase() === row.fullName.toLowerCase() ? {...row, fullName: existing.fullName} : existing));
        },
        sync: async () => {
          if (!isSameSession()) throw new Error('NoNo session changed. Refresh after reconnecting.');
          if (backend.isAvailable) await backend.syncRepositories(useAppStore.getState().repositories);
        },
      });
      if (successful.length && isSameSession()) onSuccessfulRepositories?.(successful);
      if (!isCurrent(controller) || !isSameSession()) return;
      setResult(outcome);
      setRows(current => current.map(row => {
        const completed = outcome.rows.find(item => item.fullName.toLowerCase() === row.repository?.full_name.toLowerCase());
        return completed ? {...completed, fullName: row.fullName} : row;
      }));
      setSelected(new Set());
    } catch (cause) {
      if (isCurrent(controller)) setError(cause instanceof Error ? cause.message : t('Star 失败', 'Star failed'));
    } finally {
      if (isCurrent(controller)) {setPhase('idle'); operation.current = null;}
    }
  };

  const close = () => { operation.current?.abort(); onClose(); };
  const busy = phase !== 'idle';
  const available = rows.filter(row => row.status === 'ready' && row.repository
    && !repositories.some(repo => repo.full_name.toLowerCase() === row.repository!.full_name.toLowerCase()));

  return <>
    <Modal isOpen={isOpen && !readme} onClose={close} title={t('批量 Star', 'Batch Star')} maxWidth="max-w-3xl">
      <div className="space-y-4 text-gray-800 dark:text-text-primary">
        <p className="text-sm text-gray-600 dark:text-text-secondary">{t('粘贴文本、Markdown 或 GitHub 链接，预览并选择后再 Star。每次最多 100 个仓库。', 'Paste text, Markdown, or GitHub links. Preview and select before starring up to 100 repositories per batch.')}</p>
        <label className="block text-sm font-medium">
          {t('粘贴仓库', 'Paste repositories')}
          <textarea value={text} onChange={event => resetPreview(event.target.value)} disabled={busy} rows={5} maxLength={512 * 1024 + 1}
            className="mt-2 block w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent p-3 font-mono text-sm" placeholder="https://github.com/owner/repo" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} onClick={() => void preview()} disabled={busy || !text.trim()}>{phase === 'preview' && <Loader2 aria-hidden="true" className="inline h-4 w-4 mr-2 animate-spin" />}{t('预览仓库', 'Preview repositories')}</button>
          {busy && <button className={buttonClass} onClick={() => operation.current?.abort()}>{t('取消队列', 'Cancel queue')}</button>}
        </div>
        {phase === 'star' && <p className="text-sm" role="status">{t('正在 Star。取消将停止等待队列；正在进行的请求完成后仍会保存成功结果。', 'Starring repositories. Cancellation stops queued work; confirmed in-flight successes will still be saved.')}</p>}
        {notice && <p className="text-sm text-amber-700 dark:text-amber-300" role="status">{notice}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        {rows.length > 0 && <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm flex items-center gap-2"><input type="checkbox" disabled={busy || !available.length} checked={available.length > 0 && available.every(row => selected.has(row.fullName))}
              onChange={event => setSelected(event.target.checked ? new Set(available.map(row => row.fullName)) : new Set())} />{t('选择全部', 'Select all')}</label>
            <button className={`${buttonClass} bg-brand-indigo text-white hover:bg-brand-indigo/90`} disabled={busy || !selected.size} onClick={() => void star()}>
              <Star aria-hidden="true" className="inline h-4 w-4 mr-2" />{t(`Star 已选 (${selected.size})`, `Star selected (${selected.size})`)}
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-black/5 dark:divide-white/5 rounded-lg border border-black/10 dark:border-white/10">
            {rows.map(row => {
              const already = repositories.some(repo => repo.full_name.toLowerCase() === row.repository?.full_name.toLowerCase());
              return <li key={row.fullName} className="flex gap-3 p-3">
                <input type="checkbox" aria-label={t(`选择 ${row.fullName}`, `Select ${row.fullName}`)} className="mt-1 shrink-0" checked={selected.has(row.fullName)} disabled={busy || row.status !== 'ready' || already}
                  onChange={event => setSelected(current => {const next = new Set(current); if (event.target.checked) next.add(row.fullName); else next.delete(row.fullName); return next;})} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-all">{row.repository?.full_name || row.fullName}</p>
                  {row.repository && <><p className="text-sm text-gray-600 dark:text-text-secondary break-words">{row.repository.description}</p><p className="text-xs text-gray-500 dark:text-text-secondary">{row.repository.language || '—'} · ★ {row.repository.stargazers_count ?? 0}</p></>}
                  {row.error && <p className="text-sm text-red-600 dark:text-red-400">{row.error}</p>}
                  {row.status === 'success' && <p className="text-sm text-green-700 dark:text-green-400">{t('已 Star', 'Starred')}</p>}
                  {row.status === 'cancelled' && <p className="text-sm">{t('已取消或队列已停止', 'Cancelled or queue stopped')}</p>}
                  {already && row.status === 'ready' && <p className="text-xs">{t('已在本地 Star 仓库中', 'Already in your starred repositories')}</p>}
                </div>
                {row.repository && <button className={`${buttonClass} self-start shrink-0`} disabled={busy} aria-label={t(`预览 README ${row.fullName}`, `Preview README ${row.fullName}`)} onClick={() => setReadme(row.repository!)}><FileText aria-hidden="true" className="h-4 w-4" /></button>}
              </li>;
            })}
          </ul>
        </>}
        {result && <div role="status" className="text-sm space-y-1">
          <p>{t(`${result.rows.filter(row => row.status === 'success').length} 个已 Star，${result.rows.filter(row => row.status === 'failed').length} 个失败，${result.rows.filter(row => row.status === 'cancelled').length} 个取消。`, `${result.rows.filter(row => row.status === 'success').length} starred, ${result.rows.filter(row => row.status === 'failed').length} failed, ${result.rows.filter(row => row.status === 'cancelled').length} cancelled.`)}</p>
          {result.syncError && <p className="text-red-600 dark:text-red-400">{t('GitHub 上已成功 Star，但保存未完成：', 'Stars succeeded on GitHub, but saving is incomplete: ')}{result.syncError}</p>}
          {result.rateLimit?.remaining !== undefined && <p>{t('GitHub 剩余请求：', 'GitHub requests remaining: ')}{result.rateLimit.remaining}{result.rateLimit.retryAfter !== undefined && ` (${t('等待', 'wait')} ${result.rateLimit.retryAfter}s)`}</p>}
          {result.rows.some(row => row.status === 'failed') && <p>{t('部分请求结果可能未知。再次 Star 前，请先检查 GitHub。', 'Some failed requests may have an unknown outcome. Check GitHub before starring them again.')}</p>}
        </div>}
        {history.length > 0 && <details className="text-sm">
          <summary className="cursor-pointer">{t('粘贴历史（仅当前 NoNo 用户）', 'Paste history (current NoNo user only)')}</summary>
          <ul className="mt-2 space-y-2">{history.map((entry, index) => <li key={`${entry.generatedAt}-${index}`} className="rounded-lg border border-black/10 dark:border-white/10 p-2">
            {editing === index ? <><label>{t('编辑保存的粘贴内容', 'Edit saved paste')}<textarea className="block w-full rounded border border-black/10 dark:border-white/10 bg-transparent p-2 mt-1" value={editText} onChange={event => setEditText(event.target.value)} rows={3} maxLength={512 * 1024} /></label><button className={buttonClass} disabled={busy} onClick={() => {updateHistory(history.map((item, i) => i === index ? {text: editText, generatedAt: Date.now()} : item)); setEditing(null);}}>{t('保存历史修改', 'Save history edit')}</button></>
              : <><p className="whitespace-pre-wrap break-all max-h-16 overflow-hidden">{entry.text}</p><div className="flex flex-wrap gap-2 mt-2">
                <button className={buttonClass} disabled={busy} aria-label={t(`复用历史 ${index + 1}`, `Reuse history ${index + 1}`)} onClick={() => resetPreview(entry.text)}>{t('复用', 'Reuse')}</button>
                <button className={buttonClass} disabled={busy} aria-label={t(`编辑历史 ${index + 1}`, `Edit history ${index + 1}`)} onClick={() => {setEditing(index); setEditText(entry.text);}}>{t('编辑', 'Edit')}</button>
                <button className={buttonClass} disabled={busy} aria-label={t(`删除历史 ${index + 1}`, `Delete history ${index + 1}`)} onClick={() => updateHistory(history.filter((_, i) => i !== index))}>{t('删除', 'Delete')}</button>
              </div></>}
          </li>)}</ul>
        </details>}
      </div>
    </Modal>
    {isOpen && readme && <Suspense fallback={<Modal isOpen onClose={() => setReadme(null)} title="README"><p role="status">{t('正在加载 README…', 'Loading README…')}</p></Modal>}>
      <ReadmeModal isOpen repository={readme} onClose={() => setReadme(null)} />
    </Suspense>}
  </>;
};
