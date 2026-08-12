import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, CircleHelp, Globe2, RefreshCw, RotateCw, ShieldCheck, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { api } from './api';
import { useI18n } from './i18n';
import { useLayoutActions } from './Layout';
import type { DailyStatusState, OverallStatus, StatusDay, StatusOverview } from './types';
import { Button, EmptyState, Skeleton, StateBanner } from './ui';

const overallCopy: Record<OverallStatus, { zh: string; en: string; detailZh: string; detailEn: string }> = {
  operational: { zh: '所有服务运行正常', en: 'All systems operational', detailZh: '当前没有发现影响服务器可用性的问题。', detailEn: 'No availability issues are currently affecting your servers.' },
  degraded: { zh: '部分服务性能下降', en: 'Some systems are degraded', detailZh: '至少一台服务器出现短暂异常，请检查状态记录。', detailEn: 'At least one server has a transient issue. Review its status history.' },
  partial_outage: { zh: '部分服务中断', en: 'Partial service outage', detailZh: '部分服务器当前无法访问。', detailEn: 'Some servers are currently unavailable.' },
  major_outage: { zh: '服务大面积中断', en: 'Major service outage', detailZh: '所有已配置监控的服务器当前均无法访问。', detailEn: 'All monitored servers are currently unavailable.' },
  no_data: { zh: '暂无状态数据', en: 'No status data', detailZh: '为 VPS 配置探针后，这里会开始记录可用性。', detailEn: 'Configure a probe on a VPS to start recording availability.' }
};

export function YumiOverview() {
  const { copy, language } = useI18n();
  const { setTopbarActions } = useLayoutActions();
  const [data, setData] = useState<StatusOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ name: string; day: StatusDay } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api.get<StatusOverview>('/api/status/overview?days=90'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy('状态加载失败', 'Unable to load status'));
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.post('/api/status/refresh');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy('刷新失败', 'Refresh failed'));
    } finally {
      setRefreshing(false);
    }
  }, [copy, load]);

  useEffect(() => {
    setTopbarActions(
      <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        {copy('立即检查', 'Check now')}
      </Button>
    );
    return () => setTopbarActions(null);
  }, [copy, refresh, refreshing, setTopbarActions]);

  const rangeLabel = useMemo(() => {
    if (!data) return '';
    const format = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${format.format(new Date(`${data.range.start}T00:00:00Z`))} - ${format.format(new Date(`${data.range.end}T00:00:00Z`))}`;
  }, [data, language]);

  const overallStatus = data?.overallStatus ?? 'no_data';
  const overall = overallCopy[overallStatus];
  const domainStats = data?.domainStats;

  return (
    <div className="space-y-4">
      {error && <StateBanner tone="danger">{error}</StateBanner>}
      {loading ? <OverviewSkeleton /> : (
        <>
          <section className={clsx('yumi-overall-banner', `is-${overallStatus}`)} aria-live="polite">
            <div className="yumi-overall-title">
              <OverallIcon status={overallStatus} />
              <h2>{language === 'zh' ? overall.zh : overall.en}</h2>
            </div>
            <p>{language === 'zh' ? overall.detailZh : overall.detailEn}</p>
          </section>

          <section className="yumi-status-panel">
            <header className="yumi-status-panel-header">
              <div>
                <h2>{copy('系统状态', 'System status')}</h2>
                <p>{rangeLabel}</p>
              </div>
              <div className="yumi-status-legend" aria-label={copy('状态图例', 'Status legend')}>
                <Legend state="operational" label={copy('正常', 'Operational')} />
                <Legend state="degraded" label={copy('异常', 'Degraded')} />
                <Legend state="outage" label={copy('中断', 'Outage')} />
                <Legend state="no_data" label={copy('无数据', 'No data')} />
              </div>
            </header>

            {!data?.items.length ? (
              <div className="p-4"><EmptyState title={copy('还没有 VPS', 'No VPS yet')} description={copy('在 VPS 页面添加服务器并配置探针后，此处会显示可用性历史。', 'Add a server and configure its probe to begin availability tracking.')} /></div>
            ) : <div className="yumi-status-grid">{data.items.map((item) => (
              <article className="yumi-status-row" key={item.id}>
                <div className="yumi-status-row-heading">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot state={item.currentState} />
                      <h3 className="truncate">{item.name}</h3>
                    </div>
                    <p>{[item.provider, item.location].filter(Boolean).join(' / ') || copy('未填写服务商与地区', 'Provider and region not set')}</p>
                  </div>
                  <div className="yumi-uptime">
                    <strong>{item.uptimePercent === null ? '--' : `${item.uptimePercent.toFixed(2)}%`}</strong>
                    <span>{copy('可用率', 'uptime')}</span>
                  </div>
                </div>
                <div className="status-history-scroll" role="region" aria-label={`${item.name} ${copy('状态历史', 'status history')}`}>
                  <div className="status-history-strip">
                    {item.history.map((day) => (
                      <button
                        type="button"
                        key={day.day}
                        className={`status-history-day is-${day.state}`}
                        title={dayTitle(day, language)}
                        aria-label={dayTitle(day, language)}
                        onClick={() => setSelected({ name: item.name, day })}
                      />
                    ))}
                  </div>
                </div>
                <div className="yumi-history-axis"><span>{copy('90 天前', '90 days ago')}</span><span>{copy('今天', 'Today')}</span></div>
              </article>
            ))}</div>}
          </section>

          {domainStats && <section className="yumi-domain-panel" aria-labelledby="yumi-domain-stats-title">
            <header>
              <div>
                <h2 id="yumi-domain-stats-title">{copy('域名概况', 'Domain overview')}</h2>
                <p>{copy('仅统计域名状态与结构，不包含任何费用信息。', 'Status and portfolio structure only; no cost data.')}</p>
              </div>
              <Globe2 size={18} aria-hidden="true" />
            </header>
            <div className="yumi-domain-stats">
              <DomainStat icon={<Globe2 size={16} />} label={copy('域名总数', 'Total domains')} value={domainStats.total} />
              <DomainStat icon={<ShieldCheck size={16} />} label={copy('正常使用', 'Active')} value={domainStats.active} />
              <DomainStat icon={<CalendarClock size={16} />} label={copy('30 天内到期', 'Due in 30 days')} value={domainStats.expiringWithin30Days} tone={domainStats.expiringWithin30Days ? 'warning' : 'default'} />
              <DomainStat icon={<RotateCw size={16} />} label={copy('自动续期', 'Auto renew')} value={domainStats.autoRenew} />
              <DomainStat icon={<ShieldCheck size={16} />} label={copy('注册商', 'Registrars')} value={domainStats.registrars} />
              <DomainStat icon={<Globe2 size={16} />} label={copy('主要后缀', 'Top suffix')} value={domainStats.topSuffix ?? '--'} mono />
            </div>
          </section>}
        </>
      )}

      {selected && (
        <div className="yumi-day-detail" role="status">
          <StatusDot state={selected.day.state} />
          <div className="min-w-0 flex-1">
            <strong>{selected.name} · {formatDay(selected.day.day, language)}</strong>
            <p>{dayDetail(selected.day, language)}</p>
          </div>
          <button type="button" onClick={() => setSelected(null)} aria-label={copy('关闭详情', 'Close detail')}>×</button>
        </div>
      )}
    </div>
  );
}

function DomainStat({ icon, label, value, tone = 'default', mono = false }: { icon: React.ReactNode; label: string; value: string | number; tone?: 'default' | 'warning'; mono?: boolean }) {
  return (
    <div className={clsx('yumi-domain-stat', tone === 'warning' && 'is-warning')}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong className={mono ? 'font-mono' : undefined}>{value}</strong>
      </div>
    </div>
  );
}

function OverallIcon({ status }: { status: OverallStatus }) {
  if (status === 'operational') return <Check size={20} />;
  if (status === 'no_data') return <CircleHelp size={20} />;
  if (status === 'degraded') return <AlertTriangle size={20} />;
  return <XCircle size={20} />;
}

function StatusDot({ state }: { state: DailyStatusState }) {
  return <span className={`yumi-status-dot is-${state}`} aria-hidden="true">{state === 'operational' ? <Check size={12} /> : state === 'no_data' ? <CircleHelp size={12} /> : <AlertTriangle size={12} />}</span>;
}

function Legend({ state, label }: { state: DailyStatusState; label: string }) {
  return <span><i className={`is-${state}`} />{label}</span>;
}

function OverviewSkeleton() {
  return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-80 w-full" /></div>;
}

function formatDay(day: string, language: string) {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
}

function dayTitle(day: StatusDay, language: string) {
  return `${formatDay(day.day, language)}: ${dayDetail(day, language)}`;
}

function dayDetail(day: StatusDay, language: string) {
  if (day.state === 'no_data') return language === 'zh' ? '无监控数据' : 'No monitoring data';
  const state = language === 'zh'
    ? ({ operational: '运行正常', degraded: '部分异常', outage: '发生中断' } as const)[day.state]
    : ({ operational: 'Operational', degraded: 'Degraded', outage: 'Outage detected' } as const)[day.state];
  const uptime = day.uptimePercent === null ? '--' : `${day.uptimePercent.toFixed(2)}%`;
  return language === 'zh' ? `${state}，可用率 ${uptime}，${day.sampleCount} 次检查` : `${state}, ${uptime} uptime across ${day.sampleCount} checks`;
}
