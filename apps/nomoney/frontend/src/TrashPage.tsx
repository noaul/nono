import { useEffect, useMemo, useState } from 'react';
import { ContactRound, Globe2, Repeat2, RotateCcw, Server, Smartphone, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, ApiError } from './api';
import { assetPageConfigs, type AssetPageConfig } from './assetConfig';
import { AccountAppIcon, getAccountTypeLabel } from './accountCatalog';
import type { AssetItem, CommunicationAccount, ListResponse } from './types';
import { useI18n } from './i18n';
import { Button, EmptyState, PageHeader, Skeleton, StateBanner } from './ui';
import { product } from './product';

type TrashKind = AssetPageConfig['endpoint'] | 'accounts';

const productAssetEndpoints = product === 'yumi' ? ['vps', 'domains'] : ['phones', 'subscriptions'];
const productAssetConfigs = assetPageConfigs.filter((config) => productAssetEndpoints.includes(config.endpoint));

type TrashItem = {
  key: string;
  id: number;
  endpoint: TrashKind;
  label: string;
  detail: string;
  archivedAt: string | null;
  accountType?: CommunicationAccount['accountType'];
};

const kindIcons: Record<TrashKind, LucideIcon> = {
  phones: Smartphone,
  vps: Server,
  domains: Globe2,
  subscriptions: Repeat2,
  accounts: ContactRound
};

export default function TrashPage() {
  const { copy, language } = useI18n();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [filter, setFilter] = useState<TrashKind | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [accounts, assetResponses] = await Promise.all([
        product === 'nomoney' ? api.get<ListResponse<CommunicationAccount>>('/api/accounts?trashed=true') : Promise.resolve({ items: [] }),
        Promise.all(productAssetConfigs.map((config) => api.get<ListResponse<AssetItem>>(`/api/${config.endpoint}?status=archived&limit=200`)))
      ]);
      const accountItems = accounts.items.map(toAccountTrashItem);
      const assetItems = assetResponses.flatMap((response, index) =>
        response.items.map((item) => toAssetTrashItem(productAssetConfigs[index], item))
      );
      setItems([...accountItems, ...assetItems].sort(byNewestArchive));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('加载回收站失败', 'Failed to load recycle bin'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(
    () => filter === 'all' ? items : items.filter((item) => item.endpoint === filter),
    [filter, items]
  );

  const restore = async (item: TrashItem) => {
    setPendingKey(item.key);
    setError('');
    try {
      await api.post(`/api/${item.endpoint}/${item.id}/restore`);
      setItems((current) => current.filter((entry) => entry.key !== item.key));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('恢复失败', 'Restore failed'));
    } finally {
      setPendingKey(null);
    }
  };

  const removePermanently = async (item: TrashItem) => {
    setPendingKey(item.key);
    setError('');
    try {
      await api.delete(`/api/${item.endpoint}/${item.id}/permanent`);
      setItems((current) => current.filter((entry) => entry.key !== item.key));
      setConfirmKey(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('永久删除失败', 'Permanent delete failed'));
    } finally {
      setPendingKey(null);
    }
  };

  const allFilters: Array<{ value: TrashKind | 'all'; zh: string; en: string }> = [
    { value: 'all', zh: '全部', en: 'All' },
    { value: 'phones', zh: '电话卡', en: 'SIM cards' },
    { value: 'vps', zh: 'VPS', en: 'VPS' },
    { value: 'domains', zh: '域名', en: 'Domains' },
    { value: 'subscriptions', zh: '订阅', en: 'Subscriptions' },
    { value: 'accounts', zh: '账号', en: 'Accounts' }
  ];
  const filters = allFilters.filter((option) => product === 'yumi'
    ? ['all', 'vps', 'domains'].includes(option.value)
    : ['all', 'phones', 'subscriptions', 'accounts'].includes(option.value));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recycle bin"
        title={copy('回收站', 'Recycle bin')}
        description={copy('删除的条目会保留在这里，可恢复或永久删除。', 'Deleted entries stay here until restored or permanently deleted.')}
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-ink-900" role="tablist" aria-label={copy('回收站分类', 'Recycle bin categories')}>
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            className={`h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition ${filter === option.value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
            onClick={() => setFilter(option.value)}
          >
            {copy(option.zh, option.en)}
          </button>
        ))}
      </div>

      {error && <StateBanner tone="danger">{error}</StateBanner>}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-40" />)}</div>
      ) : visibleItems.length === 0 ? (
        <EmptyState title={copy('回收站为空', 'Recycle bin is empty')} description={product === 'yumi' ? copy('移入回收站的 VPS 和域名会显示在这里。', 'Deleted VPS entries and domains appear here.') : copy('移入回收站的电话卡、订阅和账号会显示在这里。', 'Deleted SIM cards, subscriptions, and accounts appear here.')} />
      ) : (
        <div className="motion-list grid gap-3 sm:grid-cols-2">
          {visibleItems.map((item) => {
            const Icon = kindIcons[item.endpoint];
            const pending = pendingKey === item.key;
            const confirming = confirmKey === item.key;
            return (
              <article key={item.key} className="motion-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-900">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                    {item.accountType ? <AccountAppIcon type={item.accountType} size={18} /> : <Icon size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{item.label}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.detail}</p>
                    <p className="mt-2 text-[11px] text-slate-400">{copy('删除于', 'Deleted')} {formatArchivedAt(item.archivedAt, language)}</p>
                  </div>
                </div>

                {confirming ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-danger-500/15 pt-3">
                    <p className="mr-auto text-xs text-danger-600 dark:text-danger-400">{copy('永久删除后无法恢复。', 'This cannot be undone.')}</p>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmKey(null)}>{copy('取消', 'Cancel')}</Button>
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => removePermanently(item)}><Trash2 size={14} />{copy('确认删除', 'Confirm')}</Button>
                  </div>
                ) : (
                  <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => restore(item)}><RotateCcw size={14} />{copy('恢复', 'Restore')}</Button>
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmKey(item.key)}><Trash2 size={14} />{copy('永久删除', 'Delete permanently')}</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function toAccountTrashItem(item: CommunicationAccount): TrashItem {
  return {
    key: `accounts-${item.id}`,
    id: item.id,
    endpoint: 'accounts',
    label: item.displayName || getAccountTypeLabel(item.accountType, 'zh'),
    detail: `${item.countryCallingCode} ${item.phoneNumber}`,
    archivedAt: item.archivedAt,
    accountType: item.accountType
  };
}

function toAssetTrashItem(config: AssetPageConfig, item: AssetItem): TrashItem {
  return {
    key: `${config.endpoint}-${item.id}`,
    id: item.id,
    endpoint: config.endpoint,
    label: String(item[config.primaryKey] || config.singular),
    detail: String(item[config.secondaryKey] || config.title),
    archivedAt: item.archivedAt
  };
}

function byNewestArchive(a: TrashItem, b: TrashItem): number {
  return String(b.archivedAt || '').localeCompare(String(a.archivedAt || ''));
}

function formatArchivedAt(value: string | null, language: 'zh' | 'en'): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}
