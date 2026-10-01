import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { RenewButton, RenewalToast, useRenewals, type RenewableEndpoint } from './renewals';
import { useI18n } from './i18n';
import {
  AlertTriangle,
  ArrowUpRight,
  Pencil,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Database,
  Layers3,
  Phone,
  Repeat2,
  TrendingUp
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetItem, AssetType, ConvertedTotal, Currency, DashboardCategoryCost, DashboardSummary, DueItem } from './types';
import { api } from './api';
import { compactDate, currentShanghaiYear, dueTone, formatCycle, formatMoney, currencies } from './format';
import { DataTable, EmptyState, MetricCard, PageHeader, Skeleton, StateBanner, StatusBadge, type DataTableColumn } from './ui';


type CategoryDefinition = {
  assetType: AssetType;
  name: string;
  description: string;
  path: string;
  icon: ReactNode;
  color: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
};

type Copy = (zh: string, en: string) => string;

/** The API returns a stable key plus a Chinese label; the UI localizes by key. */
function subcategoryLabel(key: string, fallback: string, copy: Copy): string {
  const labels: Record<string, string> = {
    domestic: copy('国内', 'Domestic'),
    foreign: copy('国外', 'Overseas'),
    website: copy('建站机', 'Hosting'),
    route: copy('线路机', 'Route'),
    residential: copy('家宽', 'Residential'),
    subscription: copy('订阅制', 'Recurring'),
    buyout: copy('买断制', 'One-off'),
    other: copy('未分类', 'Uncategorised')
  };
  return labels[key] ?? fallback;
}

const buildCategoryDefinitions = (copy: Copy): CategoryDefinition[] => [
  { assetType: 'phone', name: copy('电话卡', 'SIM cards'), description: copy('国内与国外号码', 'Domestic and overseas numbers'), path: '/phones', icon: <Phone size={18} />, color: '#3b82f6', tone: 'brand' },
  { assetType: 'subscription', name: copy('订阅', 'Subscriptions'), description: copy('订阅制与买断制', 'Recurring and one-off'), path: '/subscriptions', icon: <Repeat2 size={18} />, color: '#f43f5e', tone: 'danger' }
];

const buildAssetTypeLabels = (copy: Copy): Record<AssetType, string> => ({
  phone: copy('电话卡', 'SIM card'),
  vps: 'VPS',
  domain: copy('域名', 'Domain'),
  subscription: copy('订阅', 'Subscription')
});

const assetEndpoints: Record<AssetType, RenewableEndpoint> = {
  phone: 'phones',
  subscription: 'subscriptions',
  vps: 'vps',
  domain: 'domains'
};

/** Enough of an asset for the shared renewal helpers, built from a due-list row. */
function dueItemAsAsset(item: DueItem): AssetItem {
  return {
    id: item.assetId,
    nextDueDate: item.dueDate,
    expireDate: item.dueDate,
    billingCycle: item.billingCycle,
    status: item.status,
    amountMinorUnits: item.amountMinorUnits,
    currency: item.currency
  } as AssetItem;
}

type DueRow = DueItem & { id: string };

const buildDueColumns = (
  copy: Copy,
  renewal: { renewingKey: string | null; onRenew: (item: DueItem) => void }
): DataTableColumn<DueRow>[] => {
  const assetTypeLabels = buildAssetTypeLabels(copy);
  return [
    { key: 'name', header: copy('资产', 'Asset'), render: (item) => (
      <Link href={`/${assetEndpoints[item.assetType]}?edit=${item.assetId}`} className="font-medium text-slate-950 hover:text-brand-600 hover:underline dark:text-white dark:hover:text-brand-300">{item.name}</Link>
    ) },
    { key: 'type', header: copy('类型', 'Type'), render: (item) => (
      <span className="text-xs text-slate-500">{assetTypeLabels[item.assetType]}{item.kind === 'keepalive' ? copy(' · 保号', ' · keep-alive') : ''}</span>
    ) },
    { key: 'amount', header: copy('金额', 'Amount'), align: 'right', render: (item) => <span className="font-mono font-semibold text-slate-950 dark:text-white">{item.kind === 'keepalive' && !item.amountMinorUnits ? '-' : formatMoney(item.amountMinorUnits, item.currency)}</span> },
    { key: 'cycle', header: copy('周期', 'Cycle'), align: 'right', render: (item) => <span className="text-slate-500">{item.kind === 'keepalive' ? '-' : copy(formatCycle(item.billingCycle, 'zh'), formatCycle(item.billingCycle, 'en'))}</span> },
    { key: 'date', header: copy('日期', 'Date'), align: 'right', render: (item) => <span className="font-mono text-slate-500">{compactDate(item.dueDate)}</span> },
    { key: 'days', header: copy('剩余', 'Left'), align: 'right', render: (item) => <span className={`font-mono font-semibold ${dueTone(item.daysLeft)}`}>{item.daysLeft}d</span> },
    { key: 'status', header: copy('状态', 'Status'), align: 'center', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'actions', header: '', align: 'right', render: (item) => (
      <div className="flex justify-end gap-1">
        {item.kind !== 'keepalive' && (
          <RenewButton endpoint={assetEndpoints[item.assetType]} item={dueItemAsAsset(item)} renewing={renewal.renewingKey === item.id} onRenew={() => renewal.onRenew(item)} copy={copy} />
        )}
        <Link href={`/${assetEndpoints[item.assetType]}?edit=${item.assetId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" title={copy('打开', 'Open')} aria-label={copy('打开', 'Open')}>
          <Pencil size={14} />
        </Link>
      </div>
    ) }
  ];
};

export function Dashboard() {
  const { copy } = useI18n();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [year, setYear] = useState(currentShanghaiYear());
  const [reloadKey, setReloadKey] = useState(0);
  const [renewingKey, setRenewingKey] = useState<string | null>(null);
  const categoryDefinitions = useMemo(() => buildCategoryDefinitions(copy), [copy]);
  const [, navigate] = useLocation();
  const renewals = useRenewals({
    copy,
    onError: setActionError,
    onNeedsSetup: () => undefined,
    onChanged: () => {
      setActionError('');
      setReloadKey((value) => value + 1);
    }
  });
  const renewDue = async (item: DueItem) => {
    setRenewingKey(`${item.kind ?? 'renewal'}-${item.assetType}-${item.assetId}`);
    try {
      await renewals.renew(assetEndpoints[item.assetType], dueItemAsAsset(item));
    } finally {
      setRenewingKey(null);
    }
  };
  const dueColumns = useMemo(() => buildDueColumns(copy, { renewingKey, onRenew: renewDue }), [copy, renewingKey]);

  useEffect(() => {
    Promise.all([
      api.get<DashboardSummary>(`/api/dashboard/summary?year=${year}`),
      api.get<{ items: DueItem[] }>('/api/dashboard/expiring?days=30')
    ])
      .then(([summaryResponse, dueResponse]) => {
        setSummary(summaryResponse);
        setDueItems(dueResponse.items);
      })
      .catch(() => setError(copy('Dashboard 数据加载失败', 'Could not load the dashboard')));
  }, [copy, year, reloadKey]);

  const trendChart = useMemo(() => (summary?.monthlyActual ?? []).map((entry) => ({
    month: entry.month.slice(2).replace('-', '/'),
    ...Object.fromEntries(currencies.map((currency) => [currency, entry.totals[currency] ?? 0]))
  })), [summary]);
  const trendCurrencies = useMemo(
    () => currencies.filter((currency) => (summary?.monthlyActual ?? []).some((entry) => Number(entry.totals[currency] ?? 0) > 0)),
    [summary]
  );

  const yearlyChart = useMemo(() => {
    if (!summary) return [];
    return currencies.map((currency) => ({
      currency,
      forecast: summary.predictedYearly[currency] ?? 0,
      actual: summary.actualYearly[currency] ?? 0
    }));
  }, [summary]);

  const assetChart = useMemo(() => {
    if (!summary) return [];
    return categoryDefinitions.map((definition) => ({
      name: definition.name,
      value: summary.categoryCosts[definition.assetType]?.assetCount ?? 0,
      color: definition.color
    }));
  }, [summary]);

  const totalAssets = assetChart.reduce((sum, item) => sum + item.value, 0);
  const nextDue = dueItems.length ? dueItems : summary?.nextDueItems ?? [];
  const yearOptions = [0, 1, 2, 3].map((offset) => currentShanghaiYear() - offset);
  const dueBuckets = summary?.dueBuckets ?? { overdue: 0, today: 0, week: 0, month: dueItems.length };

  if (error) return <StateBanner tone="danger">{error}</StateBanner>;

  if (!summary) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-96" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy('资产成本控制台', 'Asset cost console')}
        eyebrow="Overview"
        description={copy('电话卡与订阅的循环成本、实际支出、买断投入和近期到期风险集中展示。', 'Recurring costs, real spend, one-off outlay, and upcoming renewal risk for SIM cards and subscriptions.')}
      />

      <div className="motion-list grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CircleDollarSign size={18} />} color="brand" label={copy('本月预测', 'Monthly forecast')} value={<ConvertedMoney total={summary.converted?.predictedMonthly} values={summary.predictedMonthly} />} detail={<MoneyBreakdown values={summary.predictedMonthly} total={summary.converted?.predictedMonthly} fallback={copy('按计费周期折算', 'Normalised by billing cycle')} />} />
        <MetricCard icon={<TrendingUp size={18} />} color="success" label={copy('年度预测', 'Yearly forecast')} value={<ConvertedMoney total={summary.converted?.predictedYearly} values={summary.predictedYearly} />} detail={<MoneyBreakdown values={summary.predictedYearly} total={summary.converted?.predictedYearly} fallback={copy('活跃循环资产的全年成本', 'Full-year cost of active recurring assets')} />} />
        <MetricCard icon={<BarChart3 size={18} />} color="warning" label={year === currentShanghaiYear() ? copy('年度实际', 'Yearly actual') : copy(`${year} 年实际`, `${year} actual`)} value={<ConvertedMoney total={summary.converted?.actualYearly} values={summary.actualYearly} />} detail={<MoneyBreakdown values={summary.actualYearly} total={summary.converted?.actualYearly} fallback={copy('标记已付或自动续费后计入', 'Counted when marked paid or auto-renewed')} />} />
        <MetricCard icon={<AlertTriangle size={18} />} color="danger" label={copy('30 天风险', '30-day risk')} value={summary.expiringCount} detail={copy(`逾期 ${dueBuckets.overdue} 项，7 天内 ${dueBuckets.today + dueBuckets.week} 项`, `${dueBuckets.overdue} overdue, ${dueBuckets.today + dueBuckets.week} within 7 days`)} />
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('分类成本', 'Cost by category')}</h3>
            <p className="mt-1 text-xs text-slate-500">{copy('每个分类均展示月度折算、年度预测、年度实际与内部构成。', 'Each category shows its monthly equivalent, yearly forecast, yearly actual, and internal split.')}</p>
          </div>
          <span className="text-xs text-slate-400">{copy(`共 ${totalAssets} 项活跃资产`, `${totalAssets} active assets`)}</span>
        </div>
        <div className="motion-list grid items-stretch gap-4 lg:grid-cols-2">
          {categoryDefinitions.map((definition) => {
            const cost = summary.categoryCosts[definition.assetType];
            return cost ? <CostCategoryCard key={definition.assetType} definition={definition} cost={cost} /> : null;
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="card">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('年度成本对比', 'Yearly cost comparison')}</h3>
              <p className="mt-1 text-xs text-slate-500">{copy('预测支出和真实支出的多币种对照。', 'Forecast against real spend, across currencies.')}</p>
            </div>
            <select aria-label={copy('年份', 'Year')} className="h-8 rounded-lg border border-slate-200 bg-transparent px-2 font-mono text-xs text-slate-600 dark:border-white/10 dark:text-slate-300" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {yearOptions.map((value) => <option key={value} value={value}>FY {value}</option>)}
            </select>
          </div>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyChart} barGap={5} margin={{ left: -12, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="currency" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => String(Math.round(Number(value) / 100))} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.22)', background: '#0b0d10', color: '#f8fafc' }}
                  formatter={(value, name, item) => [formatMoney(Number(value), item.payload.currency as Currency), name === 'forecast' ? copy('预测', 'Forecast') : copy('实际', 'Actual')]}
                />
                <Bar dataKey="forecast" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <Layers3 size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('资产构成', 'Asset mix')}</h3>
              <p className="text-xs text-slate-500">{copy(`当前活跃资产 ${totalAssets} 项`, `${totalAssets} active assets`)}</p>
            </div>
          </div>
          {totalAssets > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assetChart.filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} strokeWidth={0}>
                      {assetChart.filter((item) => item.value > 0).map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.22)', background: '#0b0d10', color: '#f8fafc' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2">
                {assetChart.map((item) => (
                  <div key={item.name} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                    <span className="flex-1 text-slate-600 dark:text-slate-300">{item.name}</span>
                    <span className="font-mono font-semibold text-slate-950 dark:text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title={copy('还没有活跃资产', 'No active assets yet')} description={copy('添加资产后，这里会显示数量构成。', 'Add an asset and its share appears here.')} />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.65fr_1.35fr]">
        <section className="card">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger-500/20 bg-danger-500/10 text-danger-500">
              <CalendarClock size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('到期风险分布', 'Renewal risk')}</h3>
              <p className="text-xs text-slate-500">{copy('未来 30 天', 'Next 30 days')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RiskCell label={copy('已逾期', 'Overdue')} value={dueBuckets.overdue} tone="danger" />
            <RiskCell label={copy('今日', 'Today')} value={dueBuckets.today} tone="danger" />
            <RiskCell label={copy('7 天内', 'Within 7 days')} value={dueBuckets.week} tone="warning" />
            <RiskCell label={copy('8–30 天', '8–30 days')} value={dueBuckets.month} tone="brand" />
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <Database size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('下一批扣费 / 到期', 'Next charges and renewals')}</h3>
              <p className="text-xs text-slate-500">{copy('按剩余天数排序', 'Sorted by days remaining')}</p>
            </div>
          </div>
          {actionError && <div className="mb-3"><StateBanner tone="danger">{actionError}</StateBanner></div>}
          <DataTable columns={dueColumns} data={nextDue.map((item) => ({ ...item, id: `${item.kind ?? 'renewal'}-${item.assetType}-${item.assetId}` }))} emptyText={copy('30 天内没有到期项目', 'Nothing due in the next 30 days')} />
        </section>
      </div>

      <section className="card">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('近 12 个月实际支出', 'Actual spend, last 12 months')}</h3>
            <p className="mt-1 text-xs text-slate-500">{copy('来自费用流水，按币种堆叠。', 'From the expense ledger, stacked by currency.')}</p>
          </div>
          <button type="button" onClick={() => navigate('/expenses')} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">{copy('查看流水', 'View ledger')}</button>
        </div>
        {trendCurrencies.length > 0 ? (
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendChart} margin={{ left: -12, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => String(Math.round(Number(value) / 100))} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.22)', background: '#0b0d10', color: '#f8fafc' }}
                  formatter={(value, name) => [formatMoney(Number(value), name as Currency), name]}
                />
                {trendCurrencies.map((currency, index) => (
                  <Bar key={currency} dataKey={currency} stackId="spend" fill={trendColors[index % trendColors.length]} radius={index === trendCurrencies.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title={copy('还没有支出记录', 'No spend recorded yet')} description={copy('在资产卡片上点“标记已付”，或开启自动续费，支出会自动记到这里。', 'Use “Mark paid” on a card, or turn on auto-renew, and spend lands here automatically.')} />
        )}
      </section>

      {renewals.toast && (
        <RenewalToast toast={renewals.toast} onUndo={renewals.undo} onUpdateAmount={renewals.updateAmount} onClose={() => renewals.setToast(null)} copy={copy} />
      )}
    </div>
  );
}

const trendColors = ['#10b981', '#3b82f6', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899', '#64748b'];

/** The headline figure: everything converted into the default currency when rates allow. */
function ConvertedMoney({ total, values }: { total?: ConvertedTotal; values: Partial<Record<Currency, number>> }) {
  const currencyCount = currencies.filter((currency) => Number(values[currency] ?? 0) !== 0).length;
  if (!total || currencyCount <= 1 || !total.complete) return <MoneyList values={values} size="large" />;
  return <span className="font-mono text-base font-semibold">≈ {formatMoney(total.amountMinorUnits, total.currency)}</span>;
}

function MoneyBreakdown({ values, total, fallback }: { values: Partial<Record<Currency, number>>; total?: ConvertedTotal; fallback: string }) {
  const { copy } = useI18n();
  const currencyCount = currencies.filter((currency) => Number(values[currency] ?? 0) !== 0).length;
  if (!total || currencyCount <= 1) return <>{fallback}</>;
  if (!total.complete) return <>{copy('汇率暂不可用，按币种分别显示', 'Exchange rates unavailable; shown per currency')}</>;
  return <MoneyList values={values} size="small" />;
}

function CostCategoryCard({ definition, cost }: { definition: CategoryDefinition; cost: DashboardCategoryCost }) {
  const { copy } = useI18n();
  const iconTone = {
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-500',
    success: 'border-success-500/20 bg-success-500/10 text-success-500',
    warning: 'border-warning-500/20 bg-warning-500/10 text-warning-500',
    danger: 'border-danger-500/20 bg-danger-500/10 text-danger-500'
  }[definition.tone];
  const showOneTime = definition.assetType === 'subscription' || hasMoney(cost.oneTimeCost);

  return (
    <article className="card flex h-full min-w-0 flex-col">
      <header className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconTone}`}>{definition.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-slate-950 dark:text-white">{definition.name}</h4>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{copy(`${cost.assetCount} 项`, `${cost.assetCount} items`)}</span>
            {cost.dueCount > 0 && <span className="rounded-md bg-danger-500/10 px-2 py-0.5 text-[11px] font-medium text-danger-600 dark:text-danger-400">{copy(`30 天 ${cost.dueCount} 项`, `${cost.dueCount} in 30 days`)}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{definition.description} · {copy(`${cost.recurringCount} 项循环计费`, `${cost.recurringCount} recurring`)}</p>
        </div>
        <Link href={definition.path} aria-label={copy(`查看${definition.name}`, `View ${definition.name}`)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white">
          <ArrowUpRight size={17} />
        </Link>
      </header>

      <div className="my-5 border-y border-slate-200 py-4 dark:border-white/10">
        <p className="text-xs font-medium text-slate-500">{copy('月度折算', 'Monthly equivalent')}</p>
        <div className="mt-2 text-slate-950 dark:text-white">
          <MoneyList values={cost.predictedMonthly} size="hero" />
        </div>
      </div>

      <div className={`grid gap-x-4 gap-y-3 ${showOneTime ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        <CostValue label={copy('年度预测', 'Yearly forecast')} values={cost.predictedYearly} />
        <CostValue label={copy('年度实际', 'Yearly actual')} values={cost.actualYearly} />
        {showOneTime && <CostValue label={copy('一次性投入', 'One-off outlay')} values={cost.oneTimeCost} className="col-span-2 sm:col-span-1" />}
      </div>

      <div className="mt-5 flex-1 border-t border-slate-200 pt-4 dark:border-white/10">
        <p className="mb-2 text-xs font-medium text-slate-500">{copy('分类明细', 'Breakdown')}</p>
        {cost.subcategories.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {cost.subcategories.map((subcategory) => {
              const oneTime = hasMoney(subcategory.oneTimeCost) && !hasMoney(subcategory.predictedMonthly);
              return (
                <div key={subcategory.key} className="flex min-h-10 items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{subcategoryLabel(subcategory.key, subcategory.label, copy)}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{copy(`${subcategory.count} 项`, `${subcategory.count} items`)}</span>
                  <MoneyList values={oneTime ? subcategory.oneTimeCost : subcategory.predictedMonthly} size="small" suffix={oneTime ? copy('一次', 'once') : copy('/月', '/mo')} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-2 text-sm text-slate-400">{copy('暂无分类数据', 'No breakdown yet')}</p>
        )}
      </div>
    </article>
  );
}

function CostValue({ label, values, className = '' }: { label: string; values: Partial<Record<Currency, number>>; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1.5 text-slate-950 dark:text-white"><MoneyList values={values} size="medium" /></div>
    </div>
  );
}

function MoneyList({
  values,
  size = 'medium',
  suffix
}: {
  values: Partial<Record<Currency, number>>;
  size?: 'small' | 'medium' | 'large' | 'hero';
  suffix?: string;
}) {
  const entries = currencies.filter((currency) => Number(values[currency] ?? 0) !== 0);
  const sizeClass = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
    hero: 'text-xl sm:text-2xl'
  }[size];

  if (entries.length === 0) return <span className={`font-mono font-semibold text-slate-400 ${sizeClass}`}>0</span>;

  return (
    <span className={`flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 font-mono font-semibold ${sizeClass}`}>
      {entries.map((currency) => (
        <span key={currency} className="whitespace-nowrap">
          {formatMoney(values[currency] ?? 0, currency)}
          {suffix && <span className="ml-1 font-sans text-[10px] font-normal text-slate-400">{suffix}</span>}
        </span>
      ))}
    </span>
  );
}

function hasMoney(values: Partial<Record<Currency, number>>): boolean {
  return currencies.some((currency) => Number(values[currency] ?? 0) !== 0);
}

function RiskCell({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'warning' | 'danger' }) {
  const map = {
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-500',
    warning: 'border-warning-500/20 bg-warning-500/10 text-warning-500',
    danger: 'border-danger-500/20 bg-danger-500/10 text-danger-500'
  };
  return (
    <div className={`rounded-lg border p-3 ${map[tone]}`}>
      <div className="font-mono text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
