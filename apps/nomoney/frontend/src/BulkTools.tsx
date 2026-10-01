import { useRef, useState } from 'react';
import { CircleDollarSign, Download, Tag, Trash2, Upload, X } from 'lucide-react';
import type { AssetItem, AssetStatus } from './types';
import { api, ApiError } from './api';
import { withBasePath } from './base-path';
import { renewalDueDate, renewLabel, type RenewableEndpoint } from './renewals';
import { Button, IconButton, inputClass } from './ui';

type Copy = (zh: string, en: string) => string;

const bulkStatuses: Array<{ value: Exclude<AssetStatus, 'archived'>; zh: string; en: string }> = [
  { value: 'active', zh: '使用中', en: 'Active' },
  { value: 'paused', zh: '暂停', en: 'Paused' },
  { value: 'expired', zh: '已过期', en: 'Expired' },
  { value: 'cancelled', zh: '已取消', en: 'Cancelled' }
];

/** Action bar shown while table rows are selected. */
export function BulkBar({
  endpoint,
  selected,
  onClear,
  onDone,
  onError,
  copy
}: {
  endpoint: RenewableEndpoint;
  selected: AssetItem[];
  onClear: () => void;
  onDone: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
  copy: Copy;
}) {
  const [working, setWorking] = useState(false);
  const [tag, setTag] = useState('');

  const run = async (task: () => Promise<string>) => {
    setWorking(true);
    try {
      await onDone(await task());
      onClear();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : copy('批量操作失败', 'Bulk action failed'));
    } finally {
      setWorking(false);
    }
  };

  const bulk = (body: Record<string, unknown>) => api.post<{ changed: number }>(`/api/${endpoint}/bulk`, { ids: selected.map((item) => item.id), ...body });

  const renewAll = () => run(async () => {
    // One request per item keeps each renewal idempotent and individually undoable.
    let done = 0;
    const skipped: string[] = [];
    for (const item of selected) {
      const dueDate = renewalDueDate(endpoint, item);
      if (!dueDate || !item.billingCycle || item.purchaseType === 'buyout') {
        skipped.push(String(item.name ?? item.domainName ?? item.cardNumber ?? item.id));
        continue;
      }
      await api.post(`/api/${endpoint}/${item.id}/renew`, { requestId: crypto.randomUUID(), expectedDueDate: dueDate });
      done += 1;
    }
    return skipped.length
      ? copy(`已处理 ${done} 项；${skipped.length} 项缺少日期或周期已跳过：${skipped.join('、')}`, `${done} done; skipped ${skipped.length} without a date or cycle: ${skipped.join(', ')}`)
      : copy(`已处理 ${done} 项，可在各条目的续费记录里撤销。`, `${done} done. Each can be undone from its history.`);
  });

  return (
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-white p-2 shadow-lg dark:bg-ink-900" role="region" aria-label={copy('批量操作', 'Bulk actions')}>
      <span className="px-2 text-sm font-medium text-slate-700 dark:text-slate-200">{copy(`已选 ${selected.length} 项`, `${selected.length} selected`)}</span>
      <Button size="sm" variant="secondary" disabled={working} onClick={renewAll}><CircleDollarSign size={14} />{renewLabel(endpoint, copy)}</Button>
      <select
        className={`${inputClass} !h-8 !w-auto text-xs`}
        disabled={working}
        value=""
        aria-label={copy('改状态', 'Set status')}
        onChange={(event) => {
          const status = event.target.value;
          if (status) void run(async () => { const result = await bulk({ action: 'status', status }); return copy(`已更新 ${result.changed} 项状态`, `Updated ${result.changed} statuses`); });
        }}
      >
        <option value="">{copy('改状态…', 'Set status…')}</option>
        {bulkStatuses.map((option) => <option key={option.value} value={option.value}>{copy(option.zh, option.en)}</option>)}
      </select>
      <div className="flex items-center gap-1">
        <input className={`${inputClass} !h-8 !w-28 text-xs`} placeholder={copy('标签', 'Tag')} value={tag} onChange={(event) => setTag(event.target.value)} />
        <IconButton title={copy('添加标签', 'Add tag')} onClick={() => tag.trim() && void run(async () => { const result = await bulk({ action: 'addTag', tag: tag.trim() }); setTag(''); return copy(`已给 ${result.changed} 项加上标签`, `Tagged ${result.changed}`); })}><Tag size={14} /></IconButton>
        <IconButton title={copy('移除标签', 'Remove tag')} onClick={() => tag.trim() && void run(async () => { const result = await bulk({ action: 'removeTag', tag: tag.trim() }); setTag(''); return copy(`已从 ${result.changed} 项移除标签`, `Untagged ${result.changed}`); })}><X size={14} /></IconButton>
      </div>
      <Button
        size="sm"
        variant="danger"
        disabled={working}
        onClick={() => {
          if (!window.confirm(copy(`将 ${selected.length} 项移入回收站？`, `Move ${selected.length} entries to the recycle bin?`))) return;
          void run(async () => { const result = await bulk({ action: 'trash' }); return copy(`已移入回收站 ${result.changed} 项`, `Moved ${result.changed} to the recycle bin`); });
        }}
      >
        <Trash2 size={14} />{copy('移入回收站', 'Move to bin')}
      </Button>
      <button type="button" className="ml-auto px-2 text-xs text-slate-500 hover:underline" onClick={onClear}>{copy('取消选择', 'Clear selection')}</button>
    </div>
  );
}

type ImportResult = { imported: number; valid: number; errors: Array<{ row: number; message: string }>; unknownHeaders: string[] };

/** CSV export link and import picker for an asset list. */
export function CsvTools({
  endpoint,
  onImported,
  onError,
  copy
}: {
  endpoint: RenewableEndpoint;
  onImported: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
  copy: Copy;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const csv = await file.text();
      const preview = await api.post<ImportResult>(`/api/${endpoint}/import`, { csv, dryRun: true });
      if (preview.errors.length) {
        const lines = preview.errors.slice(0, 5).map((error) => copy(`第 ${error.row} 行：${error.message}`, `Row ${error.row}: ${error.message}`));
        onError(copy(`CSV 有 ${preview.errors.length} 行无法导入，未做任何更改。`, `${preview.errors.length} rows could not be imported; nothing was changed.`) + ' ' + lines.join('；'));
        return;
      }
      const ignored = preview.unknownHeaders.length ? copy(`（忽略未知列：${preview.unknownHeaders.join('、')}）`, ` (ignoring unknown columns: ${preview.unknownHeaders.join(', ')})`) : '';
      if (!window.confirm(copy(`将导入 ${preview.valid} 条记录${ignored}。继续？`, `Import ${preview.valid} records${ignored}?`))) return;
      const result = await api.post<ImportResult>(`/api/${endpoint}/import`, { csv });
      await onImported(copy(`已导入 ${result.imported} 条记录。`, `Imported ${result.imported} records.`));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : copy('导入失败', 'Import failed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <a
        href={withBasePath(`/api/${endpoint}/export.csv`)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:hover:bg-white/[0.06] dark:hover:text-white"
        title={copy('导出 CSV', 'Export CSV')}
        aria-label={copy('导出 CSV', 'Export CSV')}
      >
        <Download size={16} />
      </a>
      <IconButton onClick={() => fileRef.current?.click()} title={copy('从 CSV 导入（可先导出一份当模板）', 'Import CSV (export one first as a template)')} disabled={busy}>
        <Upload className={busy ? 'animate-pulse' : ''} size={16} />
      </IconButton>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
    </>
  );
}
