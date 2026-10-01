import { useEffect, useState } from 'react';
import { Check, CircleDollarSign, History, X } from 'lucide-react';
import type { AssetItem, Currency, DueItem } from './types';
import { api, ApiError } from './api';
import { compactDate, formatMoney } from './format';
import { Button, inputClass } from './ui';

type Copy = (zh: string, en: string) => string;
export type RenewableEndpoint = 'phones' | 'subscriptions' | 'vps' | 'domains';

export type Renewal = {
  id: number;
  previousExpireDate: string;
  renewedExpireDate: string;
  expenseId: number | null;
  amountMinorUnits: number;
  currency: Currency;
  status: 'active' | 'undone';
  auto?: boolean;
  createdAt?: string;
};

export type RenewalToastState = { endpoint: RenewableEndpoint; itemId: number; renewal: Renewal };
type RenewalResponse = { idempotent: boolean; item: AssetItem; renewal: Renewal };

/** Build the overview renewal input from the API's distinct date fields. */
export function renewalAssetFromDueItem(item: DueItem): AssetItem {
  return {
    id: item.assetId, assetType: item.assetType, amountMinorUnits: item.amountMinorUnits,
    currency: item.currency, billingCycle: item.billingCycle, status: item.status,
    expireDate: item.expireDate ?? null, nextDueDate: item.nextDueDate ?? null,
    autoRenew: item.autoRenew, renewalUrl: item.renewalUrl,
    paymentMethod: null, tags: [], notes: null, archivedAt: null
  };
}

/** The date a renewal advances: expiry for VPS/domains, the next charge for phones/subscriptions. */
export function renewalDueDate(endpoint: RenewableEndpoint, item: AssetItem): string {
  if (endpoint === 'vps' || endpoint === 'domains') return String(item.expireDate ?? '');
  return String(item.nextDueDate ?? '');
}

export function canRenew(endpoint: RenewableEndpoint, item: AssetItem): boolean {
  if (endpoint === 'subscriptions' && item.purchaseType === 'buyout') return false;
  return ['active', 'paused', 'expired'].includes(item.status);
}

export function renewLabel(endpoint: RenewableEndpoint, copy: Copy): string {
  return endpoint === 'vps' || endpoint === 'domains' ? copy('标记已续费', 'Mark renewed') : copy('标记已付', 'Mark paid');
}

export function useRenewals({
  onChanged,
  onError,
  onNeedsSetup,
  copy
}: {
  onChanged: (item: AssetItem) => void | Promise<void>;
  onError: (message: string) => void;
  onNeedsSetup: (item: AssetItem) => void;
  copy: Copy;
}) {
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [toast, setToast] = useState<RenewalToastState | null>(null);

  const renew = async (endpoint: RenewableEndpoint, item: AssetItem) => {
    if (renewingId !== null) return;
    const dueDate = renewalDueDate(endpoint, item);
    if (!dueDate || !item.billingCycle) {
      onError(endpoint === 'vps' || endpoint === 'domains'
        ? copy('请先设置到期日和计费周期。', 'Set an expiry date and billing cycle first.')
        : copy('请先设置下次扣费日期和计费周期。', 'Set the next charge date and billing cycle first.'));
      onNeedsSetup(item);
      return;
    }
    setRenewingId(item.id);
    try {
      const response = await api.post<RenewalResponse>(`/api/${endpoint}/${item.id}/renew`, {
        requestId: crypto.randomUUID(),
        expectedDueDate: dueDate
      });
      setToast({ endpoint, itemId: item.id, renewal: response.renewal });
      await onChanged(response.item);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : copy('标记续费失败', 'Failed to mark renewal'));
    } finally {
      setRenewingId(null);
    }
  };

  const undo = async (current: RenewalToastState) => {
    try {
      const response = await api.post<{ item: AssetItem }>(`/api/${current.endpoint}/${current.itemId}/renewals/${current.renewal.id}/undo`);
      setToast(null);
      await onChanged(response.item);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : copy('撤销续费失败', 'Failed to undo renewal'));
    }
  };

  const updateAmount = async (current: RenewalToastState, amountMinorUnits: number) => {
    try {
      const response = await api.put<{ renewal: Renewal }>(
        `/api/${current.endpoint}/${current.itemId}/renewals/${current.renewal.id}/expense`,
        { amountMinorUnits }
      );
      setToast({ ...current, renewal: response.renewal });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : copy('修改续费金额失败', 'Failed to update renewal amount'));
      throw err;
    }
  };

  return { renewingId, toast, setToast, renew, undo, updateAmount };
}

export function RenewButton({
  endpoint,
  item,
  renewing,
  onRenew,
  copy
}: {
  endpoint: RenewableEndpoint;
  item: AssetItem;
  renewing: boolean;
  onRenew: (item: AssetItem) => void;
  copy: Copy;
}) {
  if (!canRenew(endpoint, item)) return null;
  const label = renewLabel(endpoint, copy);
  return (
    <button
      type="button"
      onClick={() => onRenew(item)}
      disabled={renewing}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-success-500/10 hover:text-success-600 disabled:cursor-wait dark:hover:text-success-400"
      title={label}
      aria-label={label}
    >
      <CircleDollarSign className={renewing ? 'animate-pulse' : ''} size={14} />
    </button>
  );
}

export function RenewalToast({
  toast,
  onUndo,
  onUpdateAmount,
  onClose,
  copy
}: {
  toast: RenewalToastState;
  onUndo: (toast: RenewalToastState) => Promise<void>;
  onUpdateAmount: (toast: RenewalToastState, amountMinorUnits: number) => Promise<void>;
  onClose: () => void;
  copy: Copy;
}) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amount, setAmount] = useState((toast.renewal.amountMinorUnits / 100).toFixed(2));
  const [working, setWorking] = useState<'undo' | 'amount' | null>(null);
  const isCharge = toast.endpoint === 'phones' || toast.endpoint === 'subscriptions';

  useEffect(() => {
    setAmount((toast.renewal.amountMinorUnits / 100).toFixed(2));
  }, [toast.renewal.id, toast.renewal.amountMinorUnits]);

  const saveAmount = async () => {
    const amountMinorUnits = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountMinorUnits) || amountMinorUnits < 0) return;
    setWorking('amount');
    try {
      await onUpdateAmount(toast, amountMinorUnits);
      setEditingAmount(false);
    } finally {
      setWorking(null);
    }
  };

  const undo = async () => {
    setWorking('undo');
    try {
      await onUndo(toast);
    } finally {
      setWorking(null);
    }
  };

  return (
    <aside className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-success-500/25 bg-white p-3 shadow-2xl shadow-slate-950/15 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[420px] dark:bg-ink-900" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-500/10 text-success-600 dark:text-success-400"><Check size={15} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950 dark:text-white">
            {isCharge
              ? copy(`已记账，下次扣费 ${toast.renewal.renewedExpireDate}`, `Recorded. Next charge ${toast.renewal.renewedExpireDate}`)
              : copy(`已续费至 ${toast.renewal.renewedExpireDate}`, `Renewed until ${toast.renewal.renewedExpireDate}`)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{formatMoney(toast.renewal.amountMinorUnits, toast.renewal.currency)}</p>
          {editingAmount ? (
            <div className="mt-2 flex items-center gap-2">
              <input className={`${inputClass} h-8 min-w-0 flex-1 font-mono text-xs`} type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveAmount(); }} autoFocus />
              <Button size="sm" onClick={saveAmount} disabled={working === 'amount'}>{copy('保存', 'Save')}</Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400" onClick={() => setEditingAmount(true)}>{copy('修改金额', 'Edit amount')}</button>
              <button type="button" className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50 dark:text-slate-300" onClick={undo} disabled={working !== null}>{copy('撤销', 'Undo')}</button>
            </div>
          )}
        </div>
        <button type="button" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={onClose} aria-label={copy('关闭', 'Close')}><X size={14} /></button>
      </div>
    </aside>
  );
}

export function RenewalHistory({
  endpoint,
  itemId,
  refreshKey,
  onUndone,
  copy
}: {
  endpoint: RenewableEndpoint;
  itemId: number;
  refreshKey?: unknown;
  onUndone: (item: AssetItem) => void;
  copy: Copy;
}) {
  const [items, setItems] = useState<Renewal[] | null>(null);
  const [error, setError] = useState('');

  const load = () => api.get<{ items: Renewal[] }>(`/api/${endpoint}/${itemId}/renewals`)
    .then((response) => setItems(response.items))
    .catch((err) => setError(err instanceof ApiError ? err.message : copy('加载失败', 'Failed to load')));

  useEffect(() => {
    void load();
  }, [endpoint, itemId, refreshKey]);

  const undo = async (renewal: Renewal) => {
    if (!window.confirm(copy('撤销这次续费？日期会恢复，对应的支出记录会删除。', 'Undo this renewal? The date is restored and its expense removed.'))) return;
    try {
      const response = await api.post<{ item: AssetItem }>(`/api/${endpoint}/${itemId}/renewals/${renewal.id}/undo`);
      onUndone(response.item);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('撤销续费失败', 'Failed to undo renewal'));
    }
  };

  const latestActive = items?.find((item) => item.status === 'active');
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><History size={13} />{copy('续费 / 付款记录', 'Renewal and payment history')}</h3>
      {error && <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>}
      {items === null ? (
        <p className="text-xs text-slate-400">{copy('加载中…', 'Loading…')}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400">{copy('还没有记录。用卡片上的“标记已付 / 已续费”按钮记一笔。', 'Nothing yet. Use “Mark paid / renewed” on the card to record one.')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs dark:divide-white/[0.06] dark:border-white/10">
          {items.map((renewal) => (
            <li key={renewal.id} className={`flex items-center gap-3 px-3 py-2 ${renewal.status === 'undone' ? 'opacity-50' : ''}`}>
              <span className="font-mono text-slate-500">{compactDate(renewal.previousExpireDate)} → {compactDate(renewal.renewedExpireDate)}</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{formatMoney(renewal.amountMinorUnits, renewal.currency)}</span>
              {renewal.auto && <span className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-600 dark:text-brand-300">{copy('自动', 'Auto')}</span>}
              {renewal.status === 'undone' && <span className="text-[10px] text-slate-400">{copy('已撤销', 'Undone')}</span>}
              {renewal === latestActive && (
                <button type="button" className="ml-auto text-xs font-medium text-slate-500 hover:text-danger-600 hover:underline" onClick={() => undo(renewal)}>{copy('撤销', 'Undo')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
