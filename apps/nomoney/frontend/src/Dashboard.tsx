import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Database,
  Globe2,
  Layers3,
  Phone,
  Repeat2,
  Server,
  TrendingUp
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetType, Currency, DashboardCategoryCost, DashboardSummary, DueItem } from './types';
import { api } from './api';
import { compactDate, dueTone, formatCycle, formatMoney } from './format';
import { DataTable, EmptyState, MetricCard, PageHeader, Skeleton, StateBanner, StatusBadge, type DataTableColumn } from './ui';

const currencies: Currency[] = ['CNY', 'USD', 'GBP', 'EUR', 'CAD'];

type CategoryDefinition = {
  assetType: AssetType;
  name: string;
  description: string;
  path: string;
  icon: ReactNode;
  color: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
};

const categoryDefinitions: CategoryDefinition[] = [
  { assetType: 'phone', name: '电话卡', description: '国内与国外号码', path: '/phones', icon: <Phone size={18} />, color: '#3b82f6', tone: 'brand' },
  { assetType: 'vps', name: 'VPS', description: '建站、线路与家宽', path: '/vps', icon: <Server size={18} />, color: '#10b981', tone: 'success' },
  { assetType: 'domain', name: '域名', description: '按注册商归集', path: '/domains', icon: <Globe2 size={18} />, color: '#f59e0b', tone: 'warning' },
  { assetType: 'subscription', name: '订阅', description: '订阅制与买断制', path: '/subscriptions', icon: <Repeat2 size={18} />, color: '#f43f5e', tone: 'danger' }
];

const assetTypeLabels: Record<AssetType, string> = {
  phone: '电话卡',
  vps: 'VPS',
  domain: '域名',
  subscription: '订阅'
};

const dueColumns: DataTableColumn<DueItem & { id: string }>[] = [
  { key: 'name', header: '资产', render: (item) => <span className="font-medium text-slate-950 dark:text-white">{item.name}</span> },
  { key: 'type', header: '类型', render: (item) => <span className="text-xs text-slate-500">{assetTypeLabels[item.assetType]}</span> },
  { key: 'amount', header: '金额', align: 'right', render: (item) => <span className="font-mono font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</span> },
  { key: 'cycle', header: '周期', align: 'right', render: (item) => <span className="text-slate-500">{formatCycle(item.billingCycle)}</span> },
  { key: 'date', header: '日期', align: 'right', render: (item) => <span className="font-mono text-slate-500">{compactDate(item.dueDate)}</span> },
  { key: 'days', header: '剩余', align: 'right', render: (item) => <span className={`font-mono font-semibold ${dueTone(item.daysLeft)}`}>{item.daysLeft}d</span> },
  { key: 'status', header: '状态', align: 'center', render: (item) => <StatusBadge status={item.status} /> }
];

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<DashboardSummary>('/api/dashboard/summary'),
      api.get<{ items: DueItem[] }>('/api/dashboard/expiring?days=30')
    ])
      .then(([summaryResponse, dueResponse]) => {
        setSummary(summaryResponse);
        setDueItems(dueResponse.items);
      })
      .catch(() => setError('Dashboard 数据加载失败'));
  }, []);

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
      value: summary.categoryCosts[definition.assetType].assetCount,
      color: definition.color
    }));
  }, [summary]);

  const totalAssets = assetChart.reduce((sum, item) => sum + item.value, 0);
  const nextDue = summary?.nextDueItems?.length ? summary.nextDueItems : dueItems.slice(0, 5);
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
        title="资产成本控制台"
        eyebrow="Overview"
        description="四类资产的循环成本、实际支出、买断投入和近期到期风险集中展示。"
      />

      <div className="motion-list grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CircleDollarSign size={18} />} color="brand" label="本月预测" value={<MoneyList values={summary.predictedMonthly} size="large" />} detail="按计费周期折算，保留全部币种" />
        <MetricCard icon={<TrendingUp size={18} />} color="success" label="年度预测" value={<MoneyList values={summary.predictedYearly} size="large" />} detail="活跃循环资产的全年成本" />
        <MetricCard icon={<BarChart3 size={18} />} color="warning" label="年度实际" value={<MoneyList values={summary.actualYearly} size="large" />} detail="本年度已登记费用流水" />
        <MetricCard icon={<AlertTriangle size={18} />} color="danger" label="30 天风险" value={summary.expiringCount} detail={`逾期 ${dueBuckets.overdue} 项，7 天内 ${dueBuckets.today + dueBuckets.week} 项`} />
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">分类成本</h3>
            <p className="mt-1 text-xs text-slate-500">每个分类均展示月度折算、年度预测、年度实际与内部构成。</p>
          </div>
          <span className="text-xs text-slate-400">共 {totalAssets} 项活跃资产</span>
        </div>
        <div className="motion-list grid items-stretch gap-4 lg:grid-cols-2">
          {categoryDefinitions.map((definition) => {
            const cost = summary.categoryCosts[definition.assetType];
            return <CostCategoryCard key={definition.assetType} definition={definition} cost={cost} />;
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="card">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">年度成本对比</h3>
              <p className="mt-1 text-xs text-slate-500">预测支出和真实支出的多币种对照。</p>
            </div>
            <span className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-500 dark:border-white/10">FY {new Date().getFullYear()}</span>
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
                  formatter={(value, name, item) => [formatMoney(Number(value), item.payload.currency as Currency), name === 'forecast' ? '预测' : '实际']}
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
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">资产构成</h3>
              <p className="text-xs text-slate-500">当前活跃资产 {totalAssets} 项</p>
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
            <EmptyState title="还没有活跃资产" description="添加资产后，这里会显示数量构成。" />
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
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">到期风险分布</h3>
              <p className="text-xs text-slate-500">未来 30 天</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RiskCell label="已逾期" value={dueBuckets.overdue} tone="danger" />
            <RiskCell label="今日" value={dueBuckets.today} tone="danger" />
            <RiskCell label="7 天内" value={dueBuckets.week} tone="warning" />
            <RiskCell label="8–30 天" value={dueBuckets.month} tone="brand" />
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <Database size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">下一批扣费 / 到期</h3>
              <p className="text-xs text-slate-500">按剩余天数排序</p>
            </div>
          </div>
          <DataTable columns={dueColumns} data={nextDue.map((item) => ({ ...item, id: `${item.assetType}-${item.assetId}` }))} emptyText="30 天内没有到期项目" />
        </section>
      </div>
    </div>
  );
}

function CostCategoryCard({ definition, cost }: { definition: CategoryDefinition; cost: DashboardCategoryCost }) {
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
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{cost.assetCount} 项</span>
            {cost.dueCount > 0 && <span className="rounded-md bg-danger-500/10 px-2 py-0.5 text-[11px] font-medium text-danger-600 dark:text-danger-400">30 天 {cost.dueCount} 项</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{definition.description} · {cost.recurringCount} 项循环计费</p>
        </div>
        <Link to={definition.path} aria-label={`查看${definition.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white">
          <ArrowUpRight size={17} />
        </Link>
      </header>

      <div className="my-5 border-y border-slate-200 py-4 dark:border-white/10">
        <p className="text-xs font-medium text-slate-500">月度折算</p>
        <div className="mt-2 text-slate-950 dark:text-white">
          <MoneyList values={cost.predictedMonthly} size="hero" />
        </div>
      </div>

      <div className={`grid gap-x-4 gap-y-3 ${showOneTime ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        <CostValue label="年度预测" values={cost.predictedYearly} />
        <CostValue label="年度实际" values={cost.actualYearly} />
        {showOneTime && <CostValue label="一次性投入" values={cost.oneTimeCost} className="col-span-2 sm:col-span-1" />}
      </div>

      <div className="mt-5 flex-1 border-t border-slate-200 pt-4 dark:border-white/10">
        <p className="mb-2 text-xs font-medium text-slate-500">分类明细</p>
        {cost.subcategories.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {cost.subcategories.map((subcategory) => {
              const oneTime = hasMoney(subcategory.oneTimeCost) && !hasMoney(subcategory.predictedMonthly);
              return (
                <div key={subcategory.key} className="flex min-h-10 items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{subcategory.label}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{subcategory.count} 项</span>
                  <MoneyList values={oneTime ? subcategory.oneTimeCost : subcategory.predictedMonthly} size="small" suffix={oneTime ? '一次' : '/月'} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-2 text-sm text-slate-400">暂无分类数据</p>
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
