import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarClock, CircleDollarSign, Database, Phone, Signal, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Currency, DashboardSummary, DueItem } from './types';
import { api } from './api';
import { compactDate, dueTone, formatCycle, formatMoney } from './format';
import { DataTable, EmptyState, MetricCard, PageHeader, Skeleton, StateBanner, StatusBadge, type DataTableColumn } from './ui';

const currencies: Currency[] = ['CNY', 'USD', 'GBP', 'EUR', 'CAD'];
const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e'];

const dueColumns: DataTableColumn<DueItem & { id: string }>[] = [
  { key: 'name', header: '资产', render: (item) => <span className="font-medium text-slate-950 dark:text-white">{item.name}</span> },
  { key: 'type', header: '类型', render: (item) => <span className="font-mono text-xs text-slate-500">{item.assetType}</span> },
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
      .then(([s, d]) => {
        setSummary(s);
        setDueItems(d.items);
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
    return [
      { name: '电话卡', value: summary.assetCounts.phones ?? 0 },
      { name: 'VPS', value: summary.assetCounts.vps ?? 0 },
      { name: '域名', value: summary.assetCounts.domains ?? 0 },
      { name: '订阅', value: summary.assetCounts.subscriptions ?? 0 }
    ].filter((item) => item.value > 0);
  }, [summary]);

  const phoneCarrierChart = useMemo(() => summary?.phoneStats?.carriers.slice(0, 8) ?? [], [summary]);

  const totalAssets = assetChart.reduce((sum, item) => sum + item.value, 0);
  const nextDue = summary?.nextDueItems?.length ? summary.nextDueItems : dueItems.slice(0, 5);
  const dueBuckets = summary?.dueBuckets ?? { overdue: 0, today: 0, week: 0, month: dueItems.length };

  if (error) {
    return <StateBanner tone="danger">{error}</StateBanner>;
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="资产成本控制台"
        eyebrow="Overview"
        description="预测支出、真实流水和未来 30 天续费风险集中在这里。"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CircleDollarSign size={18} />} color="brand" label="本月预测" value={<MoneyPrimary values={summary.predictedMonthly} />} detail="按资产计费周期折算" />
        <MetricCard icon={<TrendingUp size={18} />} color="success" label="年度预测" value={<MoneyPrimary values={summary.predictedYearly} />} detail="所有活跃资产汇总" />
        <MetricCard icon={<BarChart3 size={18} />} color="warning" label="年度实际" value={<MoneyPrimary values={summary.actualYearly} />} detail="来自费用流水" />
        <MetricCard icon={<AlertTriangle size={18} />} color="danger" label="30 天风险" value={summary.expiringCount} detail={`今日 ${dueBuckets.today} 项，7 天内 ${dueBuckets.week} 项`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <section className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <Phone size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">电话卡总览</h3>
              <p className="text-xs text-slate-500">国内 / 国外号码和总月花费。</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RiskCell label="电话卡总数" value={summary.phoneStats?.total ?? 0} tone="brand" />
            <RiskCell label="国内电话卡" value={summary.phoneStats?.domestic ?? 0} tone="brand" />
            <RiskCell label="国外电话卡" value={summary.phoneStats?.foreign ?? 0} tone="warning" />
            <div className="rounded-xl border border-success-500/20 bg-success-500/10 p-3 text-success-600 dark:text-success-400">
              <div className="font-mono text-xl font-semibold"><MoneyPrimary values={summary.phoneStats?.monthlyRentByCurrency ?? {}} /></div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">总月花费</div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-success-500/20 bg-success-500/10 text-success-500">
              <Signal size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">运营商号码数量</h3>
              <p className="text-xs text-slate-500">按运营商汇总国内和国外电话卡。</p>
            </div>
          </div>
          {phoneCarrierChart.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phoneCarrierChart} layout="vertical" margin={{ left: 16, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148,163,184,0.18)" />
                  <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="carrier" width={96} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.22)', background: '#0b0d10', color: '#f8fafc' }} />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="还没有电话卡" description="添加国内或国外电话卡后，这里会显示运营商分布。" />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="card">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">年度成本对比</h3>
              <p className="mt-1 text-xs text-slate-500">预测支出和真实支出的多币种对照。</p>
            </div>
            <span className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-500 dark:border-white/10">FY {new Date().getFullYear()}</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyChart} barGap={5}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="currency" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.22)', background: '#0b0d10', color: '#f8fafc' }}
                  formatter={(value, _name, item) => [formatMoney(Number(value), item.payload.currency as Currency), _name === 'forecast' ? '预测' : '实际']}
                />
                <Bar dataKey="forecast" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">资产构成</h3>
            <p className="mt-1 text-xs text-slate-500">当前活跃资产 {totalAssets} 项。</p>
          </div>
          {assetChart.length > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assetChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} strokeWidth={0}>
                      {assetChart.map((_entry, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.22)', background: '#0b0d10', color: '#f8fafc' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {assetChart.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3 text-sm">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[i % chartColors.length] }} />
                    <span className="flex-1 text-slate-600 dark:text-slate-300">{item.name}</span>
                    <span className="font-mono font-semibold text-slate-950 dark:text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="还没有活跃资产" description="添加电话卡、VPS、域名或订阅后，这里会显示资产构成。" />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.65fr_1.35fr]">
        <section className="card">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-danger-500/20 bg-danger-500/10 text-danger-500">
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
            <RiskCell label="30 天内" value={dueBuckets.month} tone="brand" />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
                <Database size={17} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">下一批扣费 / 到期</h3>
                <p className="text-xs text-slate-500">按剩余天数排序</p>
              </div>
            </div>
          </div>
          <DataTable columns={dueColumns} data={nextDue.map((d) => ({ ...d, id: `${d.assetType}-${d.assetId}` }))} emptyText="30 天内没有到期项目" />
        </section>
      </div>
    </div>
  );
}

function MoneyPrimary({ values }: { values: Partial<Record<Currency, number>> }) {
  const entries = currencies.filter((currency) => values[currency]);
  if (entries.length === 0) return <span className="text-slate-400">-</span>;
  const primary = entries[0];
  return (
    <span>
      {formatMoney(values[primary] ?? 0, primary)}
      {entries.length > 1 && <span className="ml-2 align-middle text-xs font-normal text-slate-400">+{entries.length - 1}</span>}
    </span>
  );
}

function RiskCell({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'warning' | 'danger' }) {
  const map = {
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-500',
    warning: 'border-warning-500/20 bg-warning-500/10 text-warning-500',
    danger: 'border-danger-500/20 bg-danger-500/10 text-danger-500'
  };
  return (
    <div className={`rounded-xl border p-3 ${map[tone]}`}>
      <div className="font-mono text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
