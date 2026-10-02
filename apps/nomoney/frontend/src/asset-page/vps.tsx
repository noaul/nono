import type React from 'react';
import { Activity, Check, Copy, Cpu, Database, Download, ExternalLink, HardDrive, Pencil, RefreshCw, Server, Terminal, Trash2, Upload, Wifi } from 'lucide-react';
import type { AssetItem, Currency } from '../types';
import { api } from '../api';
import { daysLeft, dueTone, formatCycle, currencies } from '../format';
import { Button, Field, ProgressBar, inputClass } from '../ui';
import { stringValue } from '../domainRegistrars';
import { formatVpsCapacity } from '../vps-capacity';
import { cycles, vpsTypes, statusOptions, formatMoneyTotals, numberValue, textValue, getText, Section, ProviderJump, formatPercent, percentColor, type FormState } from './shared';

export type VpsMonitorSnapshot = {
  status: 'online' | 'offline';
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  netInBps: number | null;
  netOutBps: number | null;
  netTotalInBytes: number | null;
  netTotalOutBytes: number | null;
  load1: number | null;
  uptimeSeconds: number | null;
  updatedAt: string;
};

export type VpsMonitorResponse = { monitor: VpsMonitorSnapshot; item: AssetItem };

export type VpsActionResponse = { ok: boolean; item: AssetItem; message?: string; probeUrl?: string; testedAt?: string; installedAt?: string };

export type VpsMonitorState = { loading?: boolean; error?: string; monitor?: VpsMonitorSnapshot };

export type VpsActionState = { testing?: boolean; installing?: boolean; message?: string; error?: string };

export type VpsStats = {
  total: number;
  online: number;
  offline: number;
  configured: number;
  avgCpu: number | null;
  avgMemory: number | null;
  totalTrafficBytes: number;
  monthlyCost?: Partial<Record<Currency, number>>;
  riskWithin30Days: number;
};

export const vpsMonitorRefreshIntervalMs = 5_000;

export function VpsCommandPanel({
  stats,
  autoRefresh,
  onAutoRefreshChange,
  copy
}: {
  stats: VpsStats;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  copy: (zh: string, en: string) => string;
}) {
  return (
    <section className="motion-list grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      <VpsStat icon={<Server size={17} />} label={copy('在线节点', 'Online nodes')} value={`${stats.online}/${stats.total}`} detail={copy(`${stats.offline} 台离线或异常`, `${stats.offline} offline or failing`)} tone={stats.offline > 0 ? 'warning' : 'success'} />
      <VpsStat icon={<Wifi size={17} />} label={copy('探针覆盖', 'Probe coverage')} value={`${stats.configured}/${stats.total}`} detail={copy('已接入探针的节点', 'Nodes reporting via probe')} tone="brand" />
      <VpsStat icon={<Activity size={17} />} label={copy('平均负载', 'Average load')} value={formatPercent(stats.avgCpu)} detail={copy(`内存均值 ${formatPercent(stats.avgMemory)}`, `Memory average ${formatPercent(stats.avgMemory)}`)} tone={stats.avgCpu !== null && stats.avgCpu >= 80 ? 'danger' : 'brand'} />
      <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xs xl:col-span-1 dark:border-white/10 dark:bg-ink-850">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{copy('累计流量', 'Total transfer')}</p>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl dark:text-white">{formatBytes(stats.totalTrafficBytes)}</div>
          </div>
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:flex border-success-500/20 bg-success-500/10 text-success-500"><Database size={17} /></div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {copy(`30 天续费风险 ${stats.riskWithin30Days}`, `${stats.riskWithin30Days} renewal risks`)}
            {stats.monthlyCost && Object.keys(stats.monthlyCost).length > 0 && <> · {copy('月均', 'Monthly')} {formatMoneyTotals(stats.monthlyCost)}</>}
          </span>
          <button
            type="button"
            onClick={() => onAutoRefreshChange(!autoRefresh)}
            className={`rounded-lg border px-2 py-1 transition-all ${autoRefresh ? 'border-success-500/25 bg-success-500/10 text-success-600 dark:text-success-400' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.05]'}`}
          >
            {autoRefresh ? copy('自动 5s', 'Auto 5s') : copy('手动', 'Manual')}
          </button>
        </div>
      </div>
    </section>
  );
}

export function VpsStat({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone: 'brand' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-500',
    success: 'border-success-500/20 bg-success-500/10 text-success-500',
    warning: 'border-warning-500/20 bg-warning-500/10 text-warning-500',
    danger: 'border-danger-500/20 bg-danger-500/10 text-danger-500'
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl dark:text-white">{value}</div>
        </div>
        <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:flex ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

export function VpsNodeCard({
  item,
  monitorState,
  actionState,
  copiedSsh,
  copiedIp,
  renewing,
  onRenew,
  onCopySsh,
  onCopyIp,
  onRefresh,
  onTest,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  monitorState?: VpsMonitorState;
  actionState?: VpsActionState;
  copiedSsh: boolean;
  copiedIp: boolean;
  renewing: boolean;
  onRenew: (item: AssetItem) => void;
  onCopySsh: (item: AssetItem) => void;
  onCopyIp: (item: AssetItem) => void;
  onRefresh: (item: AssetItem) => void;
  onTest: (item: AssetItem) => void;
  onEdit: (item: AssetItem) => void;
  onDelete: (item: AssetItem) => void;
  copy: (zh: string, en: string) => string;
}) {
  const statusValue = getMonitorStatus(item, monitorState);
  const dueDate = String(item.expireDate ?? item.nextDueDate ?? '');
  const left = daysLeft(dueDate || null);
  const cpu = getMonitorNumber(item, monitorState, 'monitorCpuPercent', 'cpuPercent');
  const memory = getMonitorNumber(item, monitorState, 'monitorMemoryPercent', 'memoryPercent');
  const disk = getMonitorNumber(item, monitorState, 'monitorDiskPercent', 'diskPercent');
  const netIn = getMonitorNumber(item, monitorState, 'monitorNetInBps', 'netInBps');
  const netOut = getMonitorNumber(item, monitorState, 'monitorNetOutBps', 'netOutBps');
  const totalIn = getMonitorNumber(item, monitorState, 'monitorNetTotalInBytes', 'netTotalInBytes') ?? 0;
  const totalOut = getMonitorNumber(item, monitorState, 'monitorNetTotalOutBytes', 'netTotalOutBytes') ?? 0;
  const hasMetrics = [cpu, memory, disk, netIn, netOut].some((value) => value !== null && value !== undefined) || totalIn > 0 || totalOut > 0;
  const ipAddress = stringValue(item.ipAddress) || stringValue(item.sshHost) || '-';
  const canRenew = !['cancelled', 'archived'].includes(item.status);

  return (
    <div className="motion-card card-hover group relative overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex max-w-full items-center gap-2">
            <MonitorDot status={statusValue} />
            <h3 className="min-w-0 truncate font-medium text-slate-950 dark:text-white">{getText(item, 'name')}</h3>
            <span className="shrink-0 text-sm text-slate-500">{formatVpsType(item.vpsType, copy)}</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {stringValue(item.provider) || '-'} · {stringValue(item.location) || stringValue(item.os) || '-'}
          </p>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[11px] font-medium leading-5 ${monitorBadgeClass(statusValue)}`}>{formatMonitorStatus(statusValue, copy)}</span>
      </div>

      <button
        type="button"
        onClick={() => onCopyIp(item)}
        disabled={ipAddress === '-'}
        className="mt-4 flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 transition-colors hover:border-brand-500/25 hover:bg-brand-500/[0.04] disabled:cursor-default dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
        title={copy('复制 IP 地址', 'Copy IP address')}
        aria-label={copy('复制 IP 地址', 'Copy IP address')}
      >
        <Server size={13} />
        <span className="min-w-0 flex-1 truncate font-mono">{ipAddress}</span>
        <span className={copiedIp ? 'text-success-500' : 'text-slate-400'}>
          {copiedIp ? <Check size={13} /> : <Copy size={13} />}
        </span>
      </button>

      {/* Without any probe reading the metric rows would all be "-"; one line says so instead. */}
      {hasMetrics ? <>
        <div className="mt-4 space-y-3">
          <VpsMetricLine icon={<Cpu size={14} />} label="CPU" total={formatVpsCapacity(item.cpu, 'cpu')} value={cpu} />
          <VpsMetricLine icon={<Database size={14} />} label={copy('内存', 'Memory')} total={formatVpsCapacity(item.memory, 'memory')} value={memory} />
          <VpsMetricLine icon={<HardDrive size={14} />} label={copy('硬盘', 'Disk')} total={formatVpsCapacity(item.storage, 'storage')} value={disk} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="muted-panel flex h-12 items-center justify-between gap-2 px-3">
            <p className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><Download size={13} />{copy('下行', 'Down')}</p>
            <div className="min-w-0 text-right">
              <p className="truncate font-mono text-xs font-semibold text-success-600 dark:text-success-400">{formatBps(netIn)}</p>
              <p className="truncate font-mono text-[10px] text-slate-400">{formatBytes(totalIn)}</p>
            </div>
          </div>
          <div className="muted-panel flex h-12 items-center justify-between gap-2 px-3">
            <p className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><Upload size={13} />{copy('上行', 'Up')}</p>
            <div className="min-w-0 text-right">
              <p className="truncate font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">{formatBps(netOut)}</p>
              <p className="truncate font-mono text-[10px] text-slate-400">{formatBytes(totalOut)}</p>
            </div>
          </div>
        </div>
      </> : (
        <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          {copy('尚无监控数据；配置探针后显示 CPU、内存、硬盘和流量。', 'No monitoring data yet; configure a probe to see CPU, memory, disk and traffic.')}
        </p>
      )}

      <TrafficQuotaLine item={item} copy={copy} />

      {(monitorState?.error || actionState?.error || actionState?.message) && (
        <p className={`mt-3 rounded-lg border px-2 py-1 text-xs ${actionState?.message ? 'border-success-500/20 bg-success-500/10 text-success-700 dark:text-success-300' : 'border-warning-500/20 bg-warning-500/10 text-warning-700 dark:text-warning-300'}`}>
          {actionState?.message || actionState?.error || monitorState?.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className={`shrink-0 font-mono font-semibold ${dueTone(left)}`}>{copy('续费 ', 'Renewal ')}{left === null ? '-' : `${left}d`}</span>
          {canRenew && (
            <button
              type="button"
              onClick={() => onRenew(item)}
              disabled={renewing}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-success-500/25 bg-success-500/10 px-2 text-[11px] font-medium text-success-700 transition-colors hover:bg-success-500/15 disabled:cursor-wait disabled:opacity-60 dark:text-success-300"
            >
              <RefreshCw className={renewing ? 'animate-spin' : ''} size={12} />
              {copy('标记已续费', 'Mark renewed')}
            </button>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-1">
          <button onClick={() => onTest(item)} disabled={actionState?.testing} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-success-500 disabled:opacity-40 dark:hover:bg-white/[0.06]" title={copy('测试 SSH 连接', 'Test SSH connection')}>
            <Terminal className={actionState?.testing ? 'animate-pulse' : ''} size={14} />
          </button>
          <button onClick={() => onRefresh(item)} disabled={!stringValue(item.probeUrl) || monitorState?.loading} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-success-500 disabled:opacity-40 dark:hover:bg-white/[0.06]" title={copy('刷新监控', 'Refresh monitor')}>
            <RefreshCw className={monitorState?.loading ? 'animate-spin' : ''} size={14} />
          </button>
          <button onClick={() => onCopySsh(item)} className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all ${copiedSsh ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`} title={copy('复制 SSH 命令', 'Copy SSH command')}>
            {copiedSsh ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={() => onEdit(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" title={copy('编辑', 'Edit')}>
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TrafficQuotaLine({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const quotaGb = numberValue(item.trafficQuotaGb);
  const usedBytes = numberValue(item.trafficUsedBytes);
  const panelUrl = stringValue(item.panelUrl);
  if (!quotaGb && !panelUrl) return null;
  const ratio = quotaGb && usedBytes !== null ? usedBytes / (quotaGb * 1024 ** 3) : null;
  return (
    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
      {quotaGb ? (
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between gap-2">
            <span>{copy('本期流量', 'Period traffic')}</span>
            <span className="font-mono">{formatBytes(usedBytes ?? 0)} / {quotaGb} GB</span>
          </div>
          <ProgressBar value={Math.round((ratio ?? 0) * 100)} max={100} color={(ratio ?? 0) >= 0.9 ? 'danger' : (ratio ?? 0) >= 0.75 ? 'warning' : 'brand'} />
        </div>
      ) : <span className="flex-1" />}
      {panelUrl && (
        <a href={panelUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-brand-600 hover:underline dark:text-brand-400">
          <ExternalLink size={12} />{copy('控制面板', 'Panel')}
        </a>
      )}
    </div>
  );
}

export function VpsMetricLine({ icon, label, total, value }: { icon: React.ReactNode; label: string; total: string; value: number | null }) {
  const safeValue = value ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
          {icon}
          <span>{label}</span>
          <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">{total}</span>
        </span>
        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{formatPercent(value)}</span>
      </div>
      <ProgressBar value={safeValue} max={100} color={percentColor(value)} />
    </div>
  );
}

export function MonitorDot({ status }: { status: string }) {
  const cls = status === 'online'
    ? 'bg-success-500 shadow-success-500/40 live-dot'
    : status === 'offline'
      ? 'bg-danger-500 shadow-danger-500/30'
      : 'bg-slate-300 dark:bg-slate-600';
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ${cls}`} />;
}

export function VpsFormSections({
  form,
  updateForm,
  copy,
  language,
  editing,
  actionState,
  onTest,
  onInstall,
  onSaveThen
}: {
  form: FormState;
  updateForm: (key: string, value: string | boolean) => void;
  copy: (zh: string, en: string) => string;
  language: 'zh' | 'en';
  editing: AssetItem | null;
  actionState?: VpsActionState;
  onTest: (item: AssetItem) => void;
  onInstall: (item: AssetItem, probePort?: number) => void;
  onSaveThen?: (action: 'test' | 'install') => void;
}) {
  const sshCommand = stringValue(form.sshCommand) || buildSshCommand(form);
  const sshHref = getSshHrefFromValues(form.sshHost || form.ipAddress, form.sshUser, form.sshPort);
  const authType = String(form.sshAuthType || 'password');
  const probePort = numberValue(form.probePort) ?? 9100;
  const hasSshPassword = Boolean(editing?.hasSshPassword);
  const hasSshPrivateKey = Boolean(editing?.hasSshPrivateKey);
  const hasSshPrivateKeyPassphrase = Boolean(editing?.hasSshPrivateKeyPassphrase);
  const hasProbeApiKey = Boolean(editing?.hasProbeApiKey);
  return (
    <>
      <Section title={copy('节点信息', 'Node')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('名称', 'Name')}><input className={inputClass} required value={String(form.name ?? '')} onChange={(e) => updateForm('name', e.target.value)} placeholder="nc48" /></Field>
          <Field label={copy('VPS 类型', 'VPS type')}>
            <select className={inputClass} required value={String(form.vpsType ?? '')} onChange={(e) => updateForm('vpsType', e.target.value)}>
              <option value="" disabled>{copy('请选择类型', 'Select type')}</option>
              {vpsTypes.map((option) => <option key={option.value} value={option.value}>{language === 'zh' ? option.labelZh : option.labelEn}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('服务商', 'Provider')}><input className={inputClass} value={String(form.provider ?? '')} onChange={(e) => updateForm('provider', e.target.value)} placeholder="netcup / Hetzner" /></Field>
          <Field label={copy('机房位置', 'Region')}><input className={inputClass} value={String(form.location ?? '')} onChange={(e) => updateForm('location', e.target.value)} placeholder="DE / US-LAX" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IPv4"><input className={`${inputClass} font-mono`} value={String(form.ipAddress ?? '')} onChange={(e) => updateForm('ipAddress', e.target.value)} placeholder="203.0.113.48" /></Field>
          <Field label="IPv6"><input className={`${inputClass} font-mono`} value={String(form.ipv6Address ?? '')} onChange={(e) => updateForm('ipv6Address', e.target.value)} placeholder="2001:db8::48" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('控制面板', 'Control panel')}><input className={inputClass} type="url" value={String(form.panelUrl ?? '')} onChange={(e) => updateForm('panelUrl', e.target.value)} placeholder="https://panel.example.com" /></Field>
          <Field label={copy('系统', 'OS')}><input className={inputClass} value={String(form.os ?? '')} onChange={(e) => updateForm('os', e.target.value)} placeholder="Debian 12" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPU"><input className={inputClass} value={String(form.cpu ?? '')} onChange={(e) => updateForm('cpu', e.target.value)} placeholder="4 vCPU" /></Field>
          <Field label={copy('内存', 'Memory')}><input className={inputClass} value={String(form.memory ?? '')} onChange={(e) => updateForm('memory', e.target.value)} placeholder="8 GB" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('硬盘', 'Storage')}><input className={inputClass} value={String(form.storage ?? '')} onChange={(e) => updateForm('storage', e.target.value)} placeholder="160 GB NVMe" /></Field>
          <Field label={copy('流量 / 带宽说明', 'Traffic / bandwidth')}><input className={inputClass} value={String(form.bandwidth ?? '')} onChange={(e) => updateForm('bandwidth', e.target.value)} placeholder="2 TB / 1 Gbps" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('月流量额度（GB）', 'Monthly quota (GB)')} hint={copy('用探针数据按账期累计，用到 90% 时提醒。', 'Counted from probe data per billing period; alerts at 90%.')}><input className={`${inputClass} font-mono`} type="number" min="0" step="1" value={String(form.trafficQuotaGb ?? '')} onChange={(e) => updateForm('trafficQuotaGb', e.target.value)} placeholder="2048" /></Field>
          <Field label={copy('流量重置日', 'Quota reset day')}><input className={`${inputClass} font-mono`} type="number" min="1" max="28" value={String(form.trafficResetDay ?? '')} onChange={(e) => updateForm('trafficResetDay', e.target.value)} placeholder="1" /></Field>
        </div>
      </Section>

      <Section title="SSH">
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
          <Field label={copy('端口', 'Port')}><input className={`${inputClass} font-mono`} type="number" min="1" max="65535" value={String(form.sshPort ?? '')} onChange={(e) => updateForm('sshPort', e.target.value)} /></Field>
          <Field label={copy('用户', 'User')}><input className={inputClass} value={String(form.sshUser ?? '')} onChange={(e) => updateForm('sshUser', e.target.value)} placeholder="root" /></Field>
        </div>
        <Field label={copy('登录方式', 'Auth method')}>
          <select className={inputClass} value={authType} onChange={(e) => updateForm('sshAuthType', e.target.value)}>
            <option value="password">{copy('密码登录', 'Password')}</option>
            <option value="privateKey">{copy('密钥对登录', 'Key pair')}</option>
          </select>
        </Field>
        {authType === 'privateKey' ? (
          <>
            <Field label={copy('私钥', 'Private key')} hint={hasSshPrivateKey ? copy('已保存；留空不会覆盖。', 'Saved; leave blank to keep it.') : copy('粘贴 OpenSSH 私钥；不会自动生成或下载密钥。', 'Paste an OpenSSH private key; keys are not generated or downloaded.')}>
              <textarea className={`${inputClass} h-28 py-2.5 font-mono`} value={String(form.sshPrivateKey ?? '')} onChange={(e) => updateForm('sshPrivateKey', e.target.value)} placeholder={hasSshPrivateKey ? copy('已保存', 'Saved') : '-----BEGIN OPENSSH PRIVATE KEY-----'} />
            </Field>
            <Field label={copy('私钥口令', 'Key passphrase')} hint={hasSshPrivateKeyPassphrase ? copy('已保存；留空不会覆盖。', 'Saved; leave blank to keep it.') : undefined}><input className={inputClass} type="password" value={String(form.sshPrivateKeyPassphrase ?? '')} onChange={(e) => updateForm('sshPrivateKeyPassphrase', e.target.value)} placeholder={hasSshPrivateKeyPassphrase ? copy('已保存', 'Saved') : ''} /></Field>
          </>
        ) : (
          <Field label={copy('密码', 'Password')} hint={hasSshPassword ? copy('已保存；留空不会覆盖。', 'Saved; leave blank to keep it.') : undefined}><input className={inputClass} type="password" value={String(form.sshPassword ?? '')} onChange={(e) => updateForm('sshPassword', e.target.value)} placeholder={hasSshPassword ? copy('已保存', 'Saved') : ''} /></Field>
        )}
        <Field label={copy('命令', 'Command')}><input className={`${inputClass} font-mono`} value={String(form.sshCommand ?? '')} onChange={(e) => updateForm('sshCommand', e.target.value)} placeholder={sshCommand || 'ssh root@IP -p 22'} /></Field>
        <ProviderJump label={copy('SSH 链接', 'SSH link')} href={sshHref} empty={copy('填写 IP 后自动出现', 'Shown after entering an IP')} />
        {!editing && onSaveThen && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onSaveThen('test')}>
              <Terminal size={14} />
              {copy('保存并测试连接', 'Save and test connection')}
            </Button>
            <span className="text-xs text-slate-400">{copy('先保存为新节点，再用上面的 SSH 信息测试。', 'Saves the node first, then tests with the SSH details above.')}</span>
          </div>
        )}
        {editing && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onTest(editing)} disabled={actionState?.testing}>
              <Terminal className={actionState?.testing ? 'animate-pulse' : ''} size={14} />
              {actionState?.testing ? copy('测试中', 'Testing') : copy('测试连接', 'Test connection')}
            </Button>
            {actionState?.message && <span className="text-xs text-success-600 dark:text-success-400">{actionState.message}</span>}
            {actionState?.error && <span className="text-xs text-danger-500">{actionState.error}</span>}
          </div>
        )}
      </Section>

      <Section title={copy('探针监控', 'Probe monitoring')}>
        <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
          <Field label={copy('探针接口', 'Probe URL')} hint={copy('安装后按 IP 和端口生成，也可填已有探针地址。', 'Generated from IP and port after install, or use an existing probe URL.')}>
            <input className={`${inputClass} font-mono`} value={String(form.probeUrl ?? '')} onChange={(e) => updateForm('probeUrl', e.target.value)} placeholder="http://host:9100/api/stat" />
          </Field>
          <Field label={copy('端口', 'Port')}><input className={`${inputClass} font-mono`} type="number" min="1" max="65535" value={String(form.probePort ?? '')} onChange={(e) => updateForm('probePort', e.target.value)} placeholder="9100" /></Field>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{copy('探针密钥', 'Probe key')}</span>
          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
            <input className={inputClass} type="password" value={String(form.probeApiKey ?? '')} onChange={(e) => updateForm('probeApiKey', e.target.value)} placeholder={hasProbeApiKey ? copy('已保存', 'Saved') : 'Bearer token / API key'} />
            <Button type="button" variant="secondary" className="h-10 px-0" onClick={() => updateForm('probeApiKey', generateClientProbeApiKey())}>
              <RefreshCw size={14} />
              {copy('生成', 'Generate')}
            </Button>
          </div>
          <span className="block text-xs text-slate-400">{hasProbeApiKey ? copy('已保存；留空会继续使用原密钥。', 'Saved; leave blank to keep using it.') : copy('留空安装时自动生成。', 'Generated during install if left blank.')}</span>
        </div>
        {!editing && onSaveThen && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onSaveThen('install')}>
              <Download size={14} />
              {copy('保存并安装探针', 'Save and install probe')}
            </Button>
          </div>
        )}
        {editing && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onInstall(editing, probePort)} disabled={actionState?.installing}>
              <Download className={actionState?.installing ? 'animate-pulse' : ''} size={14} />
              {actionState?.installing ? copy('安装中', 'Installing') : copy('安装探针', 'Install probe')}
            </Button>
            <span className="text-xs text-slate-400">{copy('会通过 SSH 在 VPS 上安装并启动探针服务。', 'Installs and starts the probe over SSH.')}</span>
          </div>
        )}
      </Section>

      <Section title={copy('费用与续费', 'Cost and renewal')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('到期日（续费）', 'Renewal date')}><input className={inputClass} type="date" value={String(form.expireDate ?? '')} onChange={(e) => updateForm('expireDate', e.target.value)} /></Field>
          <Field label={copy('计费周期', 'Billing cycle')}><select className={inputClass} value={String(form.billingCycle)} onChange={(e) => updateForm('billingCycle', e.target.value)}>{cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('金额', 'Amount')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.amount ?? '')} onChange={(e) => updateForm('amount', e.target.value)} /></Field>
          <Field label={copy('币种', 'Currency')}><select className={inputClass} value={String(form.currency)} onChange={(e) => updateForm('currency', e.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
        </div>
      </Section>

      <Section title={copy('状态与备注', 'Status and notes')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statusOptions(copy)}</select></Field>
          <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">{copy('开启', 'On')}</option><option value="false">{copy('关闭', 'Off')}</option></select></Field>
        </div>
        <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
        <Field label={copy('续费链接', 'Renewal link')}><input className={inputClass} value={String(form.renewalUrl ?? '')} onChange={(e) => updateForm('renewalUrl', e.target.value)} /></Field>
        <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="prod, infra, personal" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

export function getMonitorStatus(item: AssetItem, state?: VpsMonitorState): string {
  return state?.monitor?.status || stringValue(item.monitorStatus) || (stringValue(item.probeUrl) ? 'unknown' : 'not-configured');
}

export function getMonitorNumber(
  item: AssetItem,
  state: VpsMonitorState | undefined,
  itemKey: string,
  monitorKey: keyof VpsMonitorSnapshot
): number | null {
  const liveValue = state?.monitor?.[monitorKey];
  if (typeof liveValue === 'number' && Number.isFinite(liveValue)) return liveValue;
  return numberValue(item[itemKey]);
}

export function formatBps(value: number | null): string {
  if (value === null) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} Gbps`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} Kbps`;
  return `${Math.round(value)} bps`;
}

export function formatBytes(value: number | null): string {
  if (value === null) return '-';
  if (value >= 1_099_511_627_776) return `${(value / 1_099_511_627_776).toFixed(2)} TB`;
  if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(2)} GB`;
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

export function formatMonitorStatus(status: string, copy: (zh: string, en: string) => string): string {
  if (status === 'online') return copy('在线', 'Online');
  if (status === 'offline') return copy('离线', 'Offline');
  if (status === 'not-configured') return copy('未配置', 'No probe');
  return copy('等待', 'Pending');
}

export function formatVpsType(value: unknown, copy: (zh: string, en: string) => string): string {
  const type = vpsTypes.find((option) => option.value === stringValue(value));
  return type ? copy(type.labelZh, type.labelEn) : copy('未分类', 'Uncategorized');
}

export function monitorBadgeClass(status: string): string {
  if (status === 'online') return 'border-success-500/25 bg-success-500/10 text-success-600 dark:text-success-400';
  if (status === 'offline') return 'border-danger-500/25 bg-danger-500/10 text-danger-600 dark:text-danger-400';
  return 'border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-400';
}

export function getSshCommand(item: Record<string, unknown>): string {
  return stringValue(item.sshCommand) || buildSshCommand(item);
}

export function buildSshCommand(values: Record<string, unknown>): string {
  const host = textValue(values.sshHost) || textValue(values.ipAddress);
  if (!host) return '';
  const user = textValue(values.sshUser);
  const port = textValue(values.sshPort);
  const target = user ? `${user}@${host}` : host;
  return port && port !== '22' ? `ssh ${target} -p ${port}` : `ssh ${target}`;
}

export function getSshHrefFromValues(hostValue: unknown, userValue: unknown, portValue: unknown): string {
  const host = textValue(hostValue);
  if (!host) return '';
  const user = textValue(userValue);
  const port = textValue(portValue);
  const userPart = user ? `${encodeURIComponent(user)}@` : '';
  const portPart = port && port !== '22' ? `:${encodeURIComponent(port)}` : '';
  return `ssh://${userPart}${host}${portPart}`;
}

export function updateVpsSshFields(current: FormState, next: FormState, key: string): void {
  if (key === 'ipAddress') {
    next.sshHost = textValue(next.ipAddress);
  }
  if (key === 'sshCommand') return;
  const previousAutoCommand = buildSshCommand(current);
  const currentCommand = textValue(current.sshCommand);
  if (!currentCommand || currentCommand === previousAutoCommand) {
    next.sshCommand = buildSshCommand(next);
  }
}

export function generateClientProbeApiKey(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return `mp_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
