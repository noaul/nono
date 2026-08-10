import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownAZ, ArrowUpAZ, BarChart3, CalendarClock, Check, Copy, Cpu, Database, Download, ExternalLink, Globe2, Grid3X3, HardDrive, Link2, List, Pencil, Phone, Plus, RefreshCw, Search, Server, ShieldCheck, Signal, Sparkles, Terminal, Trash2, Upload, UserRound, Wifi, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetPageConfig } from './assetConfig';
import { useLayoutActions } from './Layout';
import type { AssetItem, AssetStatus, BillingCycle, Currency, ListMeta, ListResponse } from './types';
import { api, ApiError } from './api';
import { compactDate, daysLeft, dueTone, formatCycle, formatMoney } from './format';
import { Button, DataTable, Drawer, EmptyState, Field, IconButton, ProgressBar, Skeleton, StateBanner, StatusBadge, inputClass, type DataTableColumn } from './ui';
import { commonDomainExtensions, composeDomainName, dnsProviderLink, dnsProviderProfiles, domainLink, domainPrefix, findDnsProviderProfile, findRegistrarProfile, inferDomainExtension, normalizeDomainExtension, registrarProfiles, stringValue } from './domainRegistrars';
import { useI18n } from './i18n';
import { formatVpsCapacity } from './vps-capacity';
import { assetLabel, assetSingular } from './assetConfigLabels';

type FormState = Record<string, string | boolean>;
type RenewalTotals = NonNullable<ListMeta['renewalTotals']>;
type RegistrarAccountOption = NonNullable<ListMeta['registrarAccounts']>[number];
type RenewalTotalMode = 'monthly' | 'yearly';
type VpsMonitorSnapshot = {
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
type VpsMonitorResponse = { monitor: VpsMonitorSnapshot; item: AssetItem };
type VpsActionResponse = { ok: boolean; item: AssetItem; message?: string; probeUrl?: string; testedAt?: string; installedAt?: string };
type VpsMonitorState = { loading?: boolean; error?: string; monitor?: VpsMonitorSnapshot };
type VpsActionState = { testing?: boolean; installing?: boolean; message?: string; error?: string };
type VpsRenewal = {
  id: number;
  previousExpireDate: string;
  renewedExpireDate: string;
  expenseId: number;
  amountMinorUnits: number;
  currency: Currency;
  status: 'active' | 'undone';
};
type VpsRenewalResponse = { idempotent: boolean; item: AssetItem; renewal: VpsRenewal };
type VpsRenewalToastState = { itemId: number; renewal: VpsRenewal };
type VpsStats = {
  online: number;
  offline: number;
  configured: number;
  avgCpu: number | null;
  avgMemory: number | null;
  totalTrafficBytes: number;
};
type PhoneStats = {
  domestic: number;
  foreign: number;
  carrierCounts: Array<{ carrier: string; count: number }>;
  foreignCountryCounts: Array<{ country: string; count: number }>;
  monthlyTotal: Partial<Record<Currency, number>>;
};
type PhoneVisualStyleKey = 'nebula' | 'daylight' | 'graphite' | 'ocean';
type PhoneVisualAccentKey = 'cyan' | 'rose' | 'violet' | 'lime' | 'amber';
type PhoneVisualStyle = {
  key: PhoneVisualStyleKey;
  labelZh: string;
  labelEn: string;
  shell: string;
  background: (accent: PhoneVisualAccent) => string;
  border: string;
  card: string;
  cardStrong: string;
  cardHover: string;
  chip: string;
  text: string;
  muted: string;
  soft: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
};
type PhoneVisualAccent = {
  key: PhoneVisualAccentKey;
  labelZh: string;
  labelEn: string;
  primary: string;
  secondary: string;
  tertiary: string;
  chart: string[];
};

const currencies: Currency[] = ['CNY', 'USD', 'GBP', 'EUR', 'CAD'];
const cycles: BillingCycle[] = ['monthly', 'quarterly', 'annual', 'biennial'];
const domainCycles: BillingCycle[] = ['annual', 'biennial'];
const statuses: AssetStatus[] = ['active', 'paused', 'expired', 'cancelled'];
const vpsTypes = [
  { value: 'website', labelZh: '建站机', labelEn: 'Website' },
  { value: 'route', labelZh: '线路机', labelEn: 'Route' },
  { value: 'residential', labelZh: '家宽', labelEn: 'Residential' }
] as const;
const pageSize = 24;
const vpsMonitorRefreshIntervalMs = 5_000;
const phoneVisualStyles: PhoneVisualStyle[] = [
  {
    key: 'nebula',
    labelZh: '云雾',
    labelEn: 'Mist',
    shell: 'rgba(255,255,255,0.52)',
    background: (accent) => `radial-gradient(circle at 10% 0%, ${hexToRgba(accent.primary, 0.2)}, transparent 32%), radial-gradient(circle at 88% 8%, ${hexToRgba(accent.secondary, 0.16)}, transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.72), rgba(248,250,252,0.42))`,
    border: 'rgba(148,163,184,0.24)',
    card: 'rgba(255,255,255,0.58)',
    cardStrong: 'rgba(255,255,255,0.72)',
    cardHover: 'rgba(255,255,255,0.82)',
    chip: 'rgba(255,255,255,0.56)',
    text: '#0f172a',
    muted: '#475569',
    soft: '#64748b',
    grid: 'rgba(100,116,139,0.14)',
    axis: '#475569',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: 'rgba(148,163,184,0.26)'
  },
  {
    key: 'daylight',
    labelZh: '日光白',
    labelEn: 'Daylight',
    shell: 'rgba(255,255,255,0.66)',
    background: (accent) => `radial-gradient(circle at 14% 10%, ${hexToRgba(accent.primary, 0.18)}, transparent 30%), radial-gradient(circle at 86% 0%, ${hexToRgba(accent.secondary, 0.14)}, transparent 28%), linear-gradient(135deg, rgba(255,255,255,0.86), rgba(241,245,249,0.48))`,
    border: 'rgba(15,23,42,0.11)',
    card: 'rgba(255,255,255,0.68)',
    cardStrong: 'rgba(255,255,255,0.82)',
    cardHover: 'rgba(255,255,255,0.96)',
    chip: 'rgba(15,23,42,0.06)',
    text: '#0f172a',
    muted: '#334155',
    soft: '#64748b',
    grid: 'rgba(15,23,42,0.1)',
    axis: '#475569',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(15,23,42,0.14)'
  },
  {
    key: 'graphite',
    labelZh: '银灰',
    labelEn: 'Silver',
    shell: 'rgba(248,250,252,0.58)',
    background: (accent) => `linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(226,232,240,0.38) 42%, rgba(255,255,255,0.45) 100%), radial-gradient(circle at 78% 4%, ${hexToRgba(accent.primary, 0.16)}, transparent 30%)`,
    border: 'rgba(71,85,105,0.16)',
    card: 'rgba(255,255,255,0.56)',
    cardStrong: 'rgba(248,250,252,0.74)',
    cardHover: 'rgba(255,255,255,0.86)',
    chip: 'rgba(255,255,255,0.5)',
    text: '#111827',
    muted: '#475569',
    soft: '#64748b',
    grid: 'rgba(71,85,105,0.13)',
    axis: '#475569',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: 'rgba(71,85,105,0.18)'
  },
  {
    key: 'ocean',
    labelZh: '海岛蓝',
    labelEn: 'Ocean',
    shell: 'rgba(240,253,250,0.54)',
    background: (accent) => `radial-gradient(circle at 16% 12%, ${hexToRgba(accent.secondary, 0.18)}, transparent 30%), radial-gradient(circle at 86% 4%, ${hexToRgba(accent.primary, 0.2)}, transparent 28%), linear-gradient(135deg, rgba(240,253,250,0.76), rgba(224,242,254,0.42))`,
    border: 'rgba(20,184,166,0.18)',
    card: 'rgba(255,255,255,0.56)',
    cardStrong: 'rgba(255,255,255,0.7)',
    cardHover: 'rgba(255,255,255,0.84)',
    chip: 'rgba(255,255,255,0.54)',
    text: '#0f172a',
    muted: '#31545f',
    soft: '#64748b',
    grid: 'rgba(20,184,166,0.15)',
    axis: '#31545f',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: 'rgba(20,184,166,0.22)'
  }
];
const phoneVisualAccents: PhoneVisualAccent[] = [
  { key: 'cyan', labelZh: '冰蓝', labelEn: 'Cyan', primary: '#38bdf8', secondary: '#22c55e', tertiary: '#f97316', chart: ['#38bdf8', '#22c55e', '#f97316', '#e879f9', '#f43f5e', '#a3e635'] },
  { key: 'rose', labelZh: '玫瑰', labelEn: 'Rose', primary: '#fb7185', secondary: '#f59e0b', tertiary: '#60a5fa', chart: ['#fb7185', '#f59e0b', '#60a5fa', '#34d399', '#c084fc', '#f472b6'] },
  { key: 'violet', labelZh: '电紫', labelEn: 'Violet', primary: '#8b5cf6', secondary: '#06b6d4', tertiary: '#facc15', chart: ['#8b5cf6', '#06b6d4', '#facc15', '#fb7185', '#34d399', '#a78bfa'] },
  { key: 'lime', labelZh: '青柠', labelEn: 'Lime', primary: '#84cc16', secondary: '#14b8a6', tertiary: '#f97316', chart: ['#84cc16', '#14b8a6', '#f97316', '#38bdf8', '#eab308', '#f43f5e'] },
  { key: 'amber', labelZh: '琥珀', labelEn: 'Amber', primary: '#f59e0b', secondary: '#ef4444', tertiary: '#22c55e', chart: ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'] }
];
const domainSortOptions = [
  { value: 'expireDate', labelZh: '到期时间', labelEn: 'Expiry date' },
  { value: 'renewalDate', labelZh: '续费日期', labelEn: 'Renewal date' },
  { value: 'registerDate', labelZh: '注册时间', labelEn: 'Registration date' },
  { value: 'name', labelZh: '域名', labelEn: 'Domain' },
  { value: 'amount', labelZh: '费用', labelEn: 'Cost' }
];

export function AssetPage({ config }: { config: AssetPageConfig }) {
  const isDomain = config.endpoint === 'domains';
  const isVps = config.endpoint === 'vps';
  const isPhone = config.endpoint === 'phones';
  const isSubscription = config.endpoint === 'subscriptions';
  const { copy, language } = useI18n();
  const { setTopbarActions } = useLayoutActions();
  const [items, setItems] = useState<AssetItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'compact' | 'table'>('card');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('');
  const [vpsType, setVpsType] = useState('');
  const [currency, setCurrency] = useState('');
  const [billingCycle, setBillingCycle] = useState('');
  const [phoneType, setPhoneType] = useState(isPhone ? 'domestic' : '');
  const [purchaseType, setPurchaseType] = useState(isSubscription ? 'subscription' : '');
  const [domainExtension, setDomainExtension] = useState('');
  const [registrarAccount, setRegistrarAccount] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('CNY');
  const [sort, setSort] = useState(isDomain ? 'expireDate' : 'dueDate');
  const [direction, setDirection] = useState<'asc' | 'desc'>(isDomain ? 'asc' : 'asc');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<AssetItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(config));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [duplicatingDomainId, setDuplicatingDomainId] = useState<number | null>(null);
  const [duplicatedDomainId, setDuplicatedDomainId] = useState<number | null>(null);
  const [duplicatingPhoneId, setDuplicatingPhoneId] = useState<number | null>(null);
  const [duplicatedPhoneId, setDuplicatedPhoneId] = useState<number | null>(null);
  const [copiedPhoneNumberId, setCopiedPhoneNumberId] = useState<number | null>(null);
  const [renewingDomainId, setRenewingDomainId] = useState<number | null>(null);
  const [renewedDomainId, setRenewedDomainId] = useState<number | null>(null);
  const [renewingVpsId, setRenewingVpsId] = useState<number | null>(null);
  const [vpsRenewalToast, setVpsRenewalToast] = useState<VpsRenewalToastState | null>(null);
  const [monitorById, setMonitorById] = useState<Record<number, VpsMonitorState>>({});
  const [refreshingVps, setRefreshingVps] = useState(false);
  const [autoRefreshVps, setAutoRefreshVps] = useState(true);
  const vpsRefreshesInFlight = useRef(new Set<number>());
  const [copiedSshId, setCopiedSshId] = useState<number | null>(null);
  const [vpsActionById, setVpsActionById] = useState<Record<number, VpsActionState>>({});
  const registrarAccountOptions = meta?.registrarAccounts ?? [];
  const isPhoneVisual = isPhone && phoneType === 'visual';

  const refreshVpsMonitor = async (item: AssetItem, silent = false) => {
    if (!isVps || !stringValue(item.probeUrl)) return;
    if (vpsRefreshesInFlight.current.has(item.id)) return;
    vpsRefreshesInFlight.current.add(item.id);
    if (!silent) {
      setMonitorById((current) => ({ ...current, [item.id]: { ...current[item.id], loading: true, error: '' } }));
    }
    try {
      const response = await api.get<VpsMonitorResponse>(`/api/vps/${item.id}/monitor`);
      setMonitorById((current) => ({
        ...current,
        [item.id]: { loading: false, monitor: response.monitor }
      }));
      setItems((current) => current.map((entry) => entry.id === item.id ? response.item : entry));
    } catch (err) {
      setMonitorById((current) => ({
        ...current,
        [item.id]: {
          ...current[item.id],
          loading: false,
          error: err instanceof ApiError ? err.message : copy('监控刷新失败', 'Monitor refresh failed')
        }
      }));
    } finally {
      vpsRefreshesInFlight.current.delete(item.id);
    }
  };

  const refreshVpsMonitors = async (sourceItems = items, silent = false) => {
    const targets = sourceItems.filter((item) => stringValue(item.probeUrl));
    await Promise.all(targets.map((item) => refreshVpsMonitor(item, silent)));
  };

  const refreshAllVps = async () => {
    if (!isVps || refreshingVps) return;
    setRefreshingVps(true);
    try {
      await refreshVpsMonitors(items);
    } finally {
      setRefreshingVps(false);
    }
  };

  const copySshCommand = async (item: AssetItem) => {
    const command = getSshCommand(item);
    if (!command) {
      setError(copy('请先配置 SSH 主机或 IP。', 'Configure an SSH host or IP first.'));
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      setCopiedSshId(item.id);
      window.setTimeout(() => {
        setCopiedSshId((current) => current === item.id ? null : current);
      }, 1400);
    } catch {
      setError(copy('复制 SSH 命令失败。', 'Failed to copy SSH command.'));
    }
  };

  const copyPhoneNumber = async (item: AssetItem) => {
    const phoneNumber = getPhoneDisplayNumber(item);
    if (!phoneNumber || phoneNumber === '-') return;
    try {
      await navigator.clipboard.writeText(phoneNumber);
      setCopiedPhoneNumberId(item.id);
      window.setTimeout(() => {
        setCopiedPhoneNumberId((current) => current === item.id ? null : current);
      }, 1400);
    } catch {
      setError(copy('复制号码失败。', 'Failed to copy phone number.'));
    }
  };

  const testVpsSsh = async (item: AssetItem, overrides?: Record<string, unknown>) => {
    if (!isVps) return;
    setError('');
    setVpsActionById((current) => ({ ...current, [item.id]: { ...current[item.id], testing: true, error: '' } }));
    try {
      const response = await api.post<VpsActionResponse>(`/api/vps/${item.id}/ssh/test`, overrides ?? {});
      setItems((current) => current.map((entry) => entry.id === item.id ? response.item : entry));
      setVpsActionById((current) => ({
        ...current,
        [item.id]: { ...current[item.id], testing: false, message: response.message || copy('连接成功', 'Connection OK') }
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : copy('连接测试失败', 'SSH test failed');
      setVpsActionById((current) => ({ ...current, [item.id]: { ...current[item.id], testing: false, error: message } }));
      setError(message);
    }
  };

  const installVpsProbe = async (item: AssetItem, probePort?: number, overrides?: Record<string, unknown>) => {
    if (!isVps) return;
    setError('');
    setVpsActionById((current) => ({ ...current, [item.id]: { ...current[item.id], installing: true, error: '' } }));
    try {
      const response = await api.post<VpsActionResponse>(`/api/vps/${item.id}/probe/install`, {
        ...(overrides ?? {}),
        probePort: probePort ?? numberValue(item.probePort) ?? 9100
      });
      setItems((current) => current.map((entry) => entry.id === item.id ? response.item : entry));
      if (editing?.id === item.id) {
        setForm((current) => ({
          ...current,
          probeUrl: stringValue(response.item.probeUrl) || String(current.probeUrl ?? ''),
          probePort: response.item.probePort === null || response.item.probePort === undefined ? String(current.probePort ?? '') : String(response.item.probePort),
          probeApiKey: ''
        }));
      }
      setVpsActionById((current) => ({
        ...current,
        [item.id]: { ...current[item.id], installing: false, message: response.message || copy('探针已安装', 'Probe installed') }
      }));
      await refreshVpsMonitor(response.item, true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : copy('安装探针失败', 'Probe install failed');
      setVpsActionById((current) => ({ ...current, [item.id]: { ...current[item.id], installing: false, error: message } }));
      setError(message);
    }
  };

  const load = async (nextOffset = offset) => {
    const params = new URLSearchParams();
    if (deferredQuery.trim()) params.set('q', deferredQuery.trim());
    if (!isPhoneVisual && !isVps && status) params.set('status', status);
    if (isVps && vpsType) params.set('vpsType', vpsType);
    if (!isPhoneVisual && currency) params.set('currency', currency);
    if (!isDomain && !isPhoneVisual && billingCycle) params.set('billingCycle', billingCycle);
    if (isPhone && (phoneType === 'domestic' || phoneType === 'foreign')) params.set('phoneType', phoneType);
    if (isSubscription && purchaseType) params.set('purchaseType', purchaseType);
    if (isDomain && domainExtension) params.set('domainExtension', domainExtension);
    if (isDomain && registrarAccount.trim()) params.set('registrarAccount', registrarAccount.trim());
    if (isDomain) params.set('displayCurrency', displayCurrency);
    if (sort) params.set('sort', sort);
    if (direction) params.set('direction', direction);
    params.set('limit', String(pageSize));
    params.set('offset', String(nextOffset));
    const response = await api.get<ListResponse<AssetItem>>(`/api/${config.endpoint}?${params}`);
    setItems(response.items);
    setMeta(response.meta ?? null);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : copy('加载失败', 'Failed to load'));
      setLoading(false);
    });
  }, [config.endpoint, deferredQuery, status, vpsType, currency, billingCycle, phoneType, purchaseType, domainExtension, registrarAccount, displayCurrency, sort, direction, offset]);

  const vpsProbeKey = useMemo(
    () => isVps ? items.map((item) => `${item.id}:${stringValue(item.probeUrl)}`).join('|') : '',
    [isVps, items]
  );

  useEffect(() => {
    if (!isVps || loading || !vpsProbeKey) return;
    const targets = items.filter((item) => stringValue(item.probeUrl));
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshVpsMonitors(targets, true);
    };
    refreshWhenVisible();
    if (!autoRefreshVps) return;
    const timer = window.setInterval(refreshWhenVisible, vpsMonitorRefreshIntervalMs);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isVps, loading, vpsProbeKey, autoRefreshVps]);

  useEffect(() => {
    setOffset(0);
  }, [config.endpoint, deferredQuery, status, vpsType, currency, billingCycle, phoneType, purchaseType, domainExtension, registrarAccount, displayCurrency, sort, direction]);

  useEffect(() => {
    setSort(config.endpoint === 'domains' ? 'expireDate' : 'dueDate');
    setDirection('asc');
    setDomainExtension('');
    setRegistrarAccount('');
    setBillingCycle('');
    setStatus('');
    setVpsType('');
    setPhoneType(config.endpoint === 'phones' ? 'domestic' : '');
    setPurchaseType(config.endpoint === 'subscriptions' ? 'subscription' : '');
    setMonitorById({});
    setCopiedSshId(null);
    setVpsActionById({});
    setDuplicatingPhoneId(null);
    setDuplicatedPhoneId(null);
    setCopiedPhoneNumberId(null);
    setForm(initialForm(config));
  }, [config]);

  const phoneStats = useMemo<PhoneStats | null>(() => {
    if (!isPhone) return null;
    const carrierCounts = new Map<string, number>();
    const foreignCountryCounts = new Map<string, number>();
    const monthlyTotal: Partial<Record<Currency, number>> = {};
    let domestic = 0;
    let foreign = 0;
    for (const item of items) {
      if (stringValue(item.phoneType) === 'foreign') {
        foreign += 1;
        const country = getPhoneCountryCode(item);
        foreignCountryCounts.set(country, (foreignCountryCounts.get(country) ?? 0) + 1);
      } else {
        domestic += 1;
        const carrier = normalizeDomesticCarrier(item.carrier, copy);
        carrierCounts.set(carrier, (carrierCounts.get(carrier) ?? 0) + 1);
      }
      const itemCurrency = (item.currency || 'CNY') as Currency;
      monthlyTotal[itemCurrency] = (monthlyTotal[itemCurrency] ?? 0) + Number(item.amountMinorUnits ?? 0);
    }
    const orderedCarriers = ['移动', '联通', '电信'];
    const normalizedCarrierCounts = orderedCarriers
      .map((carrier) => ({ carrier, count: carrierCounts.get(carrier) ?? 0 }))
      .concat(
        Array.from(carrierCounts.entries())
          .filter(([carrier]) => !orderedCarriers.includes(carrier))
          .map(([carrier, count]) => ({ carrier, count }))
          .sort((a, b) => b.count - a.count || a.carrier.localeCompare(b.carrier))
      );
    const normalizedCountryCounts = Array.from(foreignCountryCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
    return { domestic, foreign, carrierCounts: normalizedCarrierCounts, foreignCountryCounts: normalizedCountryCounts, monthlyTotal };
  }, [items, isPhone, copy]);

  const totals = useMemo(() => {
    const sum = items.reduce((acc, item) => acc + Number(item.amountMinorUnits ?? 0), 0);
    const dueCount = items.filter((item) => {
      const dueDate = isDomain
        ? String(item.nextDueDate ?? item.expireDate ?? '')
        : String(item[config.dueKey] ?? item.nextDueDate ?? item.expireDate ?? '');
      const left = daysLeft(dueDate || null);
      return left !== null && left <= 30;
    }).length;
    return { sum, dueCount };
  }, [items, config.dueKey, isDomain]);

  const domainStats = useMemo(() => {
    if (!isDomain) return null;
    const registrarCount = new Set(items.map((item) => stringValue(item.registrar)).filter(Boolean)).size;
    const accountCount = new Set(items.map((item) => {
      const account = stringValue(item.registrarAccount);
      return account ? `${stringValue(item.registrar)}::${account}` : '';
    }).filter(Boolean)).size;
    const suffixCounts = new Map<string, number>();
    let autoRenewCount = 0;
    for (const item of items) {
      const suffix = normalizeDomainExtension(item.domainExtension || inferDomainExtension(item.domainName));
      if (suffix) suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
      if (item.autoRenew) autoRenewCount += 1;
    }
    const topSuffix = Array.from(suffixCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
    return { registrarCount, accountCount, topSuffix, autoRenewCount };
  }, [items, isDomain]);

  const vpsStats = useMemo<VpsStats | null>(() => {
    if (!isVps) return null;
    let online = 0;
    let offline = 0;
    let configured = 0;
    let cpuTotal = 0;
    let cpuCount = 0;
    let memoryTotal = 0;
    let memoryCount = 0;
    let totalTrafficBytes = 0;
    for (const item of items) {
      if (stringValue(item.probeUrl)) configured += 1;
      const statusValue = getMonitorStatus(item, monitorById[item.id]);
      if (statusValue === 'online') online += 1;
      if (statusValue === 'offline') offline += 1;
      const cpu = getMonitorNumber(item, monitorById[item.id], 'monitorCpuPercent', 'cpuPercent');
      const memory = getMonitorNumber(item, monitorById[item.id], 'monitorMemoryPercent', 'memoryPercent');
      const netIn = getMonitorNumber(item, monitorById[item.id], 'monitorNetTotalInBytes', 'netTotalInBytes') ?? 0;
      const netOut = getMonitorNumber(item, monitorById[item.id], 'monitorNetTotalOutBytes', 'netTotalOutBytes') ?? 0;
      if (cpu !== null) {
        cpuTotal += cpu;
        cpuCount += 1;
      }
      if (memory !== null) {
        memoryTotal += memory;
        memoryCount += 1;
      }
      totalTrafficBytes += netIn + netOut;
    }
    return {
      online,
      offline,
      configured,
      avgCpu: cpuCount > 0 ? Math.round((cpuTotal / cpuCount) * 10) / 10 : null,
      avgMemory: memoryCount > 0 ? Math.round((memoryTotal / memoryCount) * 10) / 10 : null,
      totalTrafficBytes
    };
  }, [items, isVps, monitorById]);

  const updateForm = (key: string, value: string | boolean) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (isDomain && (key === 'domainPrefix' || key === 'domainExtension' || key === 'domainName')) {
        const extension = normalizeDomainExtension(next.domainExtension) || inferDomainExtension(next.domainName) || '.com';
        const prefix = key === 'domainName'
          ? domainPrefix(value, extension)
          : getDomainPrefixFromForm(next, extension);
        const fullDomain = composeDomainName(prefix, extension);
        next.domainPrefix = prefix;
        next.domainName = fullDomain;
        next.domainExtension = extension;
      }
      if (isDomain && key === 'registrar') {
        const profile = findRegistrarProfile(value);
        if (profile) next.registrar = profile.name;
      }
      if (isDomain && key === 'dnsProvider') {
        const profile = findDnsProviderProfile(value);
        if (profile) next.dnsProvider = profile.name;
      }
      if (isDomain) {
        updateDomainLifecycleFields(current, next, key);
      }
      if (isVps) {
        updateVpsSshFields(current, next, key);
      }
      if (isPhone) {
        updatePhoneCostFields(next, key);
      }
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    const nextForm = initialForm(config);
    if (isPhone) nextForm.phoneType = phoneType === 'foreign' ? 'foreign' : 'domestic';
    if (isSubscription) nextForm.purchaseType = purchaseType === 'buyout' ? 'buyout' : 'subscription';
    setForm(nextForm);
    setDrawerOpen(true);
  };

  const openEdit = (item: AssetItem) => {
    setEditing(item);
    setForm(assetToForm(config, item));
    setDrawerOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = formToPayload(config, form);
      if (editing) await api.put(`/api/${config.endpoint}/${editing.id}`, payload);
      else await api.post(`/api/${config.endpoint}`, payload);
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('保存失败', 'Failed to save'));
    } finally {
      setSubmitting(false);
    }
  };

  const moveToTrash = async (item: AssetItem) => {
    const name = getText(item, config.primaryKey);
    if (!window.confirm(copy(`将 ${name} 移入回收站？`, `Move ${name} to the recycle bin?`))) return;
    setError('');
    try {
      await api.delete(`/api/${config.endpoint}/${item.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('移入回收站失败', 'Failed to move to recycle bin'));
    }
  };

  const duplicateDomainEntry = async (item: AssetItem) => {
    if (!isDomain || duplicatingDomainId !== null) return;
    setError('');
    setDuplicatingDomainId(item.id);
    try {
      await api.post(`/api/${config.endpoint}`, formToPayload(config, assetToForm(config, item)));
      setDuplicatedDomainId(item.id);
      window.setTimeout(() => {
        setDuplicatedDomainId((current) => current === item.id ? null : current);
      }, 1400);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('复制条目失败', 'Failed to duplicate entry'));
    } finally {
      setDuplicatingDomainId(null);
    }
  };

  const duplicatePhoneEntry = async (item: AssetItem) => {
    if (!isPhone || duplicatingPhoneId !== null) return;
    setError('');
    setDuplicatingPhoneId(item.id);
    try {
      await api.post(`/api/${config.endpoint}`, formToPayload(config, assetToForm(config, item)));
      setDuplicatedPhoneId(item.id);
      window.setTimeout(() => {
        setDuplicatedPhoneId((current) => current === item.id ? null : current);
      }, 1400);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('复制条目失败', 'Failed to duplicate entry'));
    } finally {
      setDuplicatingPhoneId(null);
    }
  };

  const renewDomainOnce = async (item: AssetItem) => {
    if (!isDomain || renewingDomainId !== null) return;
    setError('');
    setRenewingDomainId(item.id);
    try {
      await api.post(`/api/${config.endpoint}/${item.id}/renew`);
      setRenewedDomainId(item.id);
      window.setTimeout(() => {
        setRenewedDomainId((current) => current === item.id ? null : current);
      }, 1400);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('标记续费失败', 'Failed to mark renewal'));
    } finally {
      setRenewingDomainId(null);
    }
  };

  const renewVpsOnce = async (item: AssetItem) => {
    if (!isVps || renewingVpsId !== null) return;
    const dueDate = String(item.expireDate ?? item.nextDueDate ?? '');
    if (!dueDate || !item.billingCycle) {
      setError(copy('请先设置到期日和计费周期。', 'Set an expiry date and billing cycle first.'));
      openEdit(item);
      return;
    }
    setError('');
    setRenewingVpsId(item.id);
    try {
      const response = await api.post<VpsRenewalResponse>(`/api/vps/${item.id}/renew`, {
        requestId: crypto.randomUUID(),
        expectedExpireDate: dueDate
      });
      setVpsRenewalToast({ itemId: item.id, renewal: response.renewal });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('标记续费失败', 'Failed to mark renewal'));
    } finally {
      setRenewingVpsId(null);
    }
  };

  const undoVpsRenewal = async (toast: VpsRenewalToastState) => {
    setError('');
    try {
      await api.post(`/api/vps/${toast.itemId}/renewals/${toast.renewal.id}/undo`);
      setVpsRenewalToast(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('撤销续费失败', 'Failed to undo renewal'));
    }
  };

  const updateVpsRenewalAmount = async (toast: VpsRenewalToastState, amountMinorUnits: number) => {
    setError('');
    try {
      const response = await api.put<{ renewal: VpsRenewal }>(
        `/api/vps/${toast.itemId}/renewals/${toast.renewal.id}/expense`,
        { amountMinorUnits }
      );
      setVpsRenewalToast({ ...toast, renewal: response.renewal });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('修改续费金额失败', 'Failed to update renewal amount'));
      throw err;
    }
  };

  const isForeignPhoneView = phoneType === 'foreign';
  const phoneColumns: DataTableColumn<AssetItem>[] = [
    { key: 'number', header: copy('号码', 'Number'), render: (item) => (
      <div className="min-w-[190px]">
        <div className="flex max-w-full items-center gap-2">
          <span className="truncate font-mono font-semibold text-slate-950 dark:text-white">{getPhoneDisplayNumber(item)}</span>
          <button
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${copiedPhoneNumberId === item.id ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
            onClick={() => copyPhoneNumber(item)}
            title={copy('复制号码', 'Copy number')}
            aria-label={copy('复制号码', 'Copy number')}
          >
            {copiedPhoneNumberId === item.id ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {stringValue(item.phoneType) === 'foreign'
            ? `${copy('国外电话卡', 'Foreign SIM')} · ${getSimFormFactorLabel(item, copy)}`
            : copy('国内电话卡', 'Domestic SIM')}
        </p>
      </div>
    ) },
    { key: 'carrier', header: isForeignPhoneView ? copy('国家 / 运营商', 'Country / carrier') : copy('运营商 / 实际使用人', 'Carrier / actual user'), render: (item) => (
      <div>
        <span className="text-slate-700 dark:text-slate-300">{stringValue(item.carrier) || '-'}</span>
        {stringValue(item.phoneType) === 'foreign' ? (
          <p className="mt-1 inline-flex rounded-md bg-brand-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-600 dark:text-brand-300">{getPhoneCountryCode(item)}</p>
        ) : (
          <p className="mt-1 inline-flex rounded-md bg-success-500/10 px-1.5 py-0.5 text-xs font-semibold text-success-700 dark:text-success-300">{stringValue(item.userName) || stringValue(item.realNamePerson) || '-'}</p>
        )}
      </div>
    ) },
    { key: 'usage', header: isForeignPhoneView ? copy('保号', 'Keepalive') : copy('套餐', 'Plan'), render: (item) => (
      <div className="text-xs text-slate-500">
        {stringValue(item.phoneType) === 'foreign'
          ? <span>{compactDate(stringValue(item.totalKeepaliveUntil)) || '-'} · {stringValue(item.keepaliveDays) || '-'}d</span>
          : <span>{Number(item.dataAllowanceGb ?? 0) || '-'}G / {Number(item.voiceMinutes ?? 0) || '-'}min</span>}
      </div>
    ) },
    { key: 'amount', header: copy('月花费', 'Monthly cost'), align: 'right', render: (item) => <span className="font-mono font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</span> },
    { key: 'actions', header: '', align: 'right', render: (item) => (
      <div className="flex justify-end gap-1">
        {(() => {
          const isDuplicating = duplicatingPhoneId === item.id;
          const isDuplicated = duplicatedPhoneId === item.id;
          const title = isDuplicated
            ? copy('已复制条目', 'Entry duplicated')
            : isDuplicating
              ? copy('复制中', 'Duplicating')
              : copy('复制条目', 'Duplicate entry');
          return (
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${isDuplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
              onClick={() => duplicatePhoneEntry(item)}
              title={title}
              aria-label={title}
              disabled={isDuplicating}
            >
              {isDuplicated ? <Check size={14} /> : <Copy className={isDuplicating ? 'animate-pulse' : ''} size={14} />}
            </button>
          );
        })()}
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)} title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => moveToTrash(item)} title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    ) }
  ];

  const genericColumns: DataTableColumn<AssetItem>[] = [
    { key: 'name', header: copy('名称', 'Name'), render: (item) => <span className="font-medium text-slate-950 dark:text-white">{getText(item, config.primaryKey)}</span> },
    { key: 'provider', header: copy('供应商', 'Provider'), render: (item) => <span className="text-slate-500">{getText(item, config.secondaryKey)}</span> },
    { key: 'amount', header: copy('金额', 'Amount'), align: 'right', render: (item) => <span className="font-mono font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</span> },
    { key: 'cycle', header: copy('周期', 'Cycle'), align: 'right', render: (item) => <span className="text-slate-500">{isSubscription && item.purchaseType === 'buyout' ? copy('买断', 'Buyout') : formatCycle(item.billingCycle, language)}</span> },
    { key: 'days', header: copy('剩余', 'Remaining'), align: 'right', render: (item) => {
      if (isSubscription && item.purchaseType === 'buyout') return <span className="text-slate-400">-</span>;
      const dueDate = String(item[config.dueKey] ?? item.nextDueDate ?? item.expireDate ?? '');
      const left = daysLeft(dueDate || null);
      return <span className={`font-mono font-semibold ${dueTone(left)}`}>{left === null ? '-' : `${left}d`}</span>;
    } },
    { key: 'status', header: copy('状态', 'Status'), align: 'center', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'actions', header: '', align: 'right', render: (item) => (
      <div className="flex justify-end gap-1">
        {item.renewalUrl && (
          <a href={item.renewalUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/[0.06]">
            <ExternalLink size={14} />
          </a>
        )}
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)}>
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => moveToTrash(item)} title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    ) }
  ];
  const domainColumns: DataTableColumn<AssetItem>[] = [
    { key: 'domain', header: copy('域名', 'Domain'), render: (item) => {
      const domainName = getText(item, 'domainName');
      return (
        <div className="min-w-[190px]">
          <div className="inline-flex max-w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
            <span className="truncate font-mono text-sm font-semibold text-slate-950 dark:text-white">{domainName}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-white/[0.06]">
              {normalizeDomainExtension(item.domainExtension || inferDomainExtension(item.domainName)) || '-'}
            </span>
          </div>
        </div>
      );
    } },
    { key: 'registrar', header: copy('服务商 / 账号', 'Provider / account'), render: (item) => (
      <div className="min-w-0">
        <span className="text-slate-800 dark:text-slate-200">{getText(item, 'registrar')}</span>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{stringValue(item.registrarAccount) || '-'}</p>
      </div>
    ) },
    { key: 'dates', header: copy('续费 / 到期', 'Renewal / expiry'), align: 'right', render: (item) => {
      const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
      const left = daysLeft(dueDate || null);
      return (
        <div>
          <span className={`font-mono font-semibold ${dueTone(left)}`}>{left === null ? '-' : `${left}d`}</span>
          <p className="mt-1 font-mono text-xs text-slate-500">{compactDate(dueDate || stringValue(item.expireDate))}</p>
        </div>
      );
    } },
    { key: 'amount', header: copy('费用', 'Cost'), align: 'right', render: (item) => <span className="font-mono font-semibold text-slate-950 dark:text-white">{formatDisplayMoney(item)}</span> },
    { key: 'status', header: copy('状态', 'Status'), align: 'center', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'actions', header: '', align: 'right', render: (item) => (
      <div className="flex justify-end gap-1">
        {(() => {
          const isDuplicating = duplicatingDomainId === item.id;
          const isDuplicated = duplicatedDomainId === item.id;
          const title = isDuplicated
            ? copy('已复制条目', 'Entry duplicated')
            : isDuplicating
              ? copy('复制中', 'Duplicating')
              : copy('复制条目', 'Duplicate entry');
          return (
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${isDuplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
              onClick={() => duplicateDomainEntry(item)}
              title={title}
              aria-label={title}
              disabled={isDuplicating}
            >
              {isDuplicated ? <Check size={14} /> : <Copy className={isDuplicating ? 'animate-pulse' : ''} size={14} />}
            </button>
          );
        })()}
        {domainLink(item) && (
          <a href={domainLink(item) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/[0.06]" title={copy('打开服务商', 'Open provider')}>
            <ExternalLink size={14} />
          </a>
        )}
        {dnsProviderLink(item) && dnsProviderLink(item) !== domainLink(item) && (
          <a href={dnsProviderLink(item) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-success-500 dark:hover:bg-white/[0.06]" title={copy('打开 DNS', 'Open DNS')}>
            <Link2 size={14} />
          </a>
        )}
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)} title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => moveToTrash(item)} title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    ) }
  ];
  const vpsColumns: DataTableColumn<AssetItem>[] = [
    { key: 'node', header: copy('节点', 'Node'), render: (item) => (
      <div className="min-w-[190px]">
        <div className="flex items-center gap-2">
          <MonitorDot status={getMonitorStatus(item, monitorById[item.id])} />
          <span className="truncate font-medium text-slate-950 dark:text-white">{getText(item, 'name')}</span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{stringValue(item.ipAddress) || stringValue(item.sshHost) || '-'}</p>
      </div>
    ) },
    { key: 'provider', header: copy('服务商 / 位置', 'Provider / region'), render: (item) => (
      <div>
        <span className="text-slate-700 dark:text-slate-300">{stringValue(item.provider) || '-'}</span>
        <p className="mt-1 text-xs text-slate-500">{stringValue(item.location) || stringValue(item.os) || '-'}</p>
      </div>
    ) },
    { key: 'cpu', header: 'CPU', align: 'right', render: (item) => <span className="font-mono font-semibold">{formatPercent(getMonitorNumber(item, monitorById[item.id], 'monitorCpuPercent', 'cpuPercent'))}</span> },
    { key: 'memory', header: copy('内存', 'Memory'), align: 'right', render: (item) => <span className="font-mono font-semibold">{formatPercent(getMonitorNumber(item, monitorById[item.id], 'monitorMemoryPercent', 'memoryPercent'))}</span> },
    { key: 'net', header: copy('网络', 'Network'), align: 'right', render: (item) => (
      <div className="font-mono text-xs">
        <span className="text-success-600 dark:text-success-400">{formatBps(getMonitorNumber(item, monitorById[item.id], 'monitorNetInBps', 'netInBps'))}</span>
        <span className="mx-1 text-slate-400">/</span>
        <span className="text-brand-600 dark:text-brand-400">{formatBps(getMonitorNumber(item, monitorById[item.id], 'monitorNetOutBps', 'netOutBps'))}</span>
      </div>
    ) },
    { key: 'due', header: copy('续费', 'Renewal'), align: 'right', render: (item) => {
      const dueDate = String(item.expireDate ?? item.nextDueDate ?? '');
      const left = daysLeft(dueDate || null);
      return (
        <div>
          <span className={`font-mono font-semibold ${dueTone(left)}`}>{left === null ? '-' : `${left}d`}</span>
          <p className="mt-1 font-mono text-xs text-slate-500">{compactDate(dueDate)}</p>
        </div>
      );
    } },
    { key: 'actions', header: '', align: 'right', render: (item) => (
      <div className="flex justify-end gap-1">
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-success-500 dark:hover:bg-white/[0.06]" onClick={() => refreshVpsMonitor(item)} title={copy('刷新监控', 'Refresh monitor')} disabled={!stringValue(item.probeUrl)}>
          <RefreshCw className={monitorById[item.id]?.loading ? 'animate-spin' : ''} size={14} />
        </button>
        <button className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all ${copiedSshId === item.id ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`} onClick={() => copySshCommand(item)} title={copy('复制 SSH 命令', 'Copy SSH command')}>
          {copiedSshId === item.id ? <Check size={14} /> : <Terminal size={14} />}
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)} title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => moveToTrash(item)} title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    ) }
  ];
  const columns = isDomain ? domainColumns : isVps ? vpsColumns : isPhone ? phoneColumns : genericColumns;

  useEffect(() => {
    setTopbarActions(
      <>
        {isVps && (
          <Button variant="secondary" onClick={refreshAllVps} disabled={refreshingVps || items.every((item) => !stringValue(item.probeUrl))}>
            <RefreshCw className={refreshingVps ? 'animate-spin' : ''} size={16} />
            {copy('刷新监控', 'Refresh')}
          </Button>
        )}
        {isPhone && (
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
            {[
              { value: 'domestic', label: copy('国内', 'Domestic') },
              { value: 'foreign', label: copy('国外', 'Foreign') },
              { value: 'visual', label: copy('可视化', 'Visual') }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPhoneType(option.value)}
                className={`h-9 rounded-lg px-3 text-sm font-medium transition-all ${phoneType === option.value ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {isSubscription && (
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
            {[
              { value: 'subscription', label: copy('订阅制', 'Subscription') },
              { value: 'buyout', label: copy('买断制', 'Buyout') }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPurchaseType(option.value)}
                className={`h-9 rounded-lg px-3 text-sm font-medium transition-all ${purchaseType === option.value ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <Button onClick={openCreate}><Plus size={16} />{isDomain ? copy('新增域名', 'Add domain') : isVps ? copy('新增 VPS', 'Add VPS') : isPhone ? copy('新增电话卡', 'Add phone card') : copy(`新增${config.singular}`, `Add ${assetSingular(config.singular, language)}`)}</Button>
      </>
    );
  }, [config.singular, copy, isDomain, isPhone, isSubscription, isVps, items, phoneType, purchaseType, refreshingVps, setTopbarActions]);

  useEffect(() => {
    return () => setTopbarActions(null);
  }, [setTopbarActions]);

  return (
    <div className="space-y-4">
      {isDomain && domainStats && <DomainCommandPanel stats={domainStats} items={items} renewalTotals={meta?.renewalTotals} copy={copy} />}
      {isVps && vpsStats && <VpsCommandPanel stats={vpsStats} items={items} autoRefresh={autoRefreshVps} onAutoRefreshChange={setAutoRefreshVps} copy={copy} />}
      {isPhone && !isPhoneVisual && phoneStats && <PhoneCommandPanel stats={phoneStats} items={items} copy={copy} />}

      {!isPhoneVisual && <section className="card">
        <div className={isDomain ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-[180px_118px_108px_168px_112px_132px_118px_40px_auto] xl:items-center' : isVps ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_130px_130px_150px_auto] xl:items-center' : isPhone ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_120px_120px_130px_auto] xl:items-center' : 'grid gap-3 lg:grid-cols-[1fr_150px_150px_150px_auto]'}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
            <input className={`${inputClass} pl-9`} placeholder={isDomain ? copy('搜索域名', 'Search') : isVps ? copy('搜索节点 / IP / 服务商', 'Search nodes') : copy(`搜索${config.singular}`, `Search ${assetSingular(config.singular, language)}`)} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {isVps ? (
            <select className={inputClass} value={vpsType} onChange={(e) => setVpsType(e.target.value)}>
              <option value="">{copy('全部类型', 'All types')}</option>
              {vpsTypes.map((option) => <option key={option.value} value={option.value}>{language === 'zh' ? option.labelZh : option.labelEn}</option>)}
            </select>
          ) : (
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{copy('未归档', 'Not archived')}</option>
              {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
          <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">{copy('全部币种', 'All currencies')}</option>
            {currencies.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          {!isDomain && (
            <select className={inputClass} value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
              <option value="">{copy('全部周期', 'All cycles')}</option>
            {cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}
            </select>
          )}
          {isDomain && (
            <>
              <select className={inputClass} value={registrarAccount} onChange={(e) => setRegistrarAccount(e.target.value)}>
                <option value="">{copy('全部账号', 'All accounts')}</option>
                {registrarAccount && !registrarAccountOptions.some((option) => option.value === registrarAccount) && (
                  <option value={registrarAccount}>{registrarAccount}</option>
                )}
                {registrarAccountOptions.map((option) => (
                  <option key={option.value} value={option.value}>{formatRegistrarAccountOption(option, copy)}</option>
                ))}
              </select>
              <select className={inputClass} value={domainExtension} onChange={(e) => setDomainExtension(e.target.value)}>
                <option value="">{copy('全部后缀', 'All extensions')}</option>
                {commonDomainExtensions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className={inputClass} value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as Currency)}>
                {currencies.map((value) => <option key={value} value={value}>{copy(`统一 ${value}`, `Total in ${value}`)}</option>)}
              </select>
              <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
                {domainSortOptions.map((item) => <option key={item.value} value={item.value}>{language === 'zh' ? item.labelZh : item.labelEn}</option>)}
              </select>
              <IconButton
                onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
                title={direction === 'asc' ? copy('升序', 'Ascending') : copy('降序', 'Descending')}
              >
                {direction === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
              </IconButton>
            </>
          )}
          <div className="flex gap-1 xl:justify-end">
            <IconButton onClick={() => setView('card')} className={view === 'card' ? '!border-brand-500/30 !bg-brand-500/10 !text-brand-500' : ''} title={copy('卡片', 'Cards')}>
              <Grid3X3 size={16} />
            </IconButton>
            {(isDomain || isPhone) && (
              <IconButton onClick={() => setView('compact')} className={view === 'compact' ? '!border-brand-500/30 !bg-brand-500/10 !text-brand-500' : ''} title={copy('小卡片', 'Compact cards')}>
                <CalendarClock size={16} />
              </IconButton>
            )}
            <IconButton onClick={() => setView('table')} className={view === 'table' ? '!border-brand-500/30 !bg-brand-500/10 !text-brand-500' : ''} title={copy('表格', 'Table')}>
              <List size={16} />
            </IconButton>
          </div>
        </div>
      </section>}

      {error && <StateBanner tone="danger">{error}</StateBanner>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : isPhoneVisual ? (
        <PhoneVisualDashboard items={items} copy={copy} />
      ) : items.length === 0 ? (
        <EmptyState title={copy(`暂无${config.singular}`, `No ${assetSingular(config.singular, language)}s yet`)} description={copy('换个筛选条件，或新增一条资产记录。', 'Try another filter, or add a record.')} action={<Button onClick={openCreate}><Plus size={16} />{copy(`新增${config.singular}`, `Add ${assetSingular(config.singular, language)}`)}</Button>} />
      ) : view === 'card' ? (
        <div className="motion-list grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => isDomain
            ? <DomainCardView key={item.id} item={item} duplicated={duplicatedDomainId === item.id} duplicating={duplicatingDomainId === item.id} renewing={renewingDomainId === item.id} renewed={renewedDomainId === item.id} onDuplicate={duplicateDomainEntry} onRenew={renewDomainOnce} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
            : isVps
              ? <VpsNodeCard key={item.id} item={item} monitorState={monitorById[item.id]} actionState={vpsActionById[item.id]} copiedSsh={copiedSshId === item.id} renewing={renewingVpsId === item.id} onRenew={renewVpsOnce} onCopySsh={copySshCommand} onRefresh={refreshVpsMonitor} onTest={testVpsSsh} onInstall={installVpsProbe} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
            : isPhone
              ? <PhoneCardView key={item.id} item={item} duplicated={duplicatedPhoneId === item.id} duplicating={duplicatingPhoneId === item.id} copiedNumber={copiedPhoneNumberId === item.id} onCopyNumber={copyPhoneNumber} onDuplicate={duplicatePhoneEntry} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
            : <AssetCardView key={item.id} item={item} config={config} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
          )}
        </div>
      ) : isDomain && view === 'compact' ? (
        <div className="motion-list grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => <DomainMiniCardView key={item.id} item={item} copy={copy} />)}
        </div>
      ) : isPhone && view === 'compact' ? (
        <div className="motion-list grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => <PhoneMiniCardView key={item.id} item={item} copy={copy} />)}
        </div>
      ) : (
        <DataTable columns={columns} data={items} />
      )}

      {meta && !isPhoneVisual && meta.total > pageSize && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-ink-900">
          <span className="text-slate-500">{copy(`第 ${Math.floor(offset / pageSize) + 1} 页，共 ${Math.ceil(meta.total / pageSize)} 页`, `Page ${Math.floor(offset / pageSize) + 1} of ${Math.ceil(meta.total / pageSize)}`)}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{copy('上一页', 'Previous')}</Button>
            <Button variant="secondary" size="sm" disabled={offset + pageSize >= meta.total} onClick={() => setOffset(offset + pageSize)}>{copy('下一页', 'Next')}</Button>
          </div>
        </div>
      )}

      {vpsRenewalToast && (
        <VpsRenewalToast
          toast={vpsRenewalToast}
          onUndo={undoVpsRenewal}
          onUpdateAmount={updateVpsRenewalAmount}
          onClose={() => setVpsRenewalToast(null)}
          copy={copy}
        />
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={isDomain ? (editing ? copy('编辑域名', 'Edit domain') : copy('新增域名', 'Add domain')) : isVps ? (editing ? copy('编辑 VPS', 'Edit VPS') : copy('新增 VPS', 'Add VPS')) : isPhone ? (editing ? copy('编辑电话卡', 'Edit phone card') : copy('新增电话卡', 'Add phone card')) : (editing ? copy(`编辑${config.singular}`, `Edit ${assetSingular(config.singular, language)}`) : copy(`新增${config.singular}`, `Add ${assetSingular(config.singular, language)}`))}
        footer={<><Button variant="secondary" onClick={() => setDrawerOpen(false)}>{copy('取消', 'Cancel')}</Button><Button type="submit" form="asset-form" disabled={submitting}>{submitting ? copy('保存中', 'Saving') : copy('保存', 'Save')}</Button></>}
      >
        <form id="asset-form" onSubmit={submit} className="motion-stack space-y-6">
          {isDomain ? (
            <DomainFormSections form={form} updateForm={updateForm} copy={copy} />
          ) : isVps ? (
            <VpsFormSections form={form} updateForm={updateForm} copy={copy} language={language} editing={editing} actionState={editing ? vpsActionById[editing.id] : undefined} onTest={(item) => testVpsSsh(item, formToPayload(config, form))} onInstall={(item, probePort) => installVpsProbe(item, probePort, formToPayload(config, form))} />
          ) : isPhone ? (
            <PhoneFormSections form={form} updateForm={updateForm} copy={copy} language={language} />
          ) : isSubscription ? (
            <SubscriptionFormSections form={form} updateForm={updateForm} copy={copy} language={language} />
          ) : (
            <>
              <Section title={copy('基础信息', 'Basic information')}>
                {config.fields.map((field) => (
                  <Field key={field.key} label={assetLabel(field.label, language)}>
                    {field.type === 'textarea' ? (
                      <textarea className={`${inputClass} h-24 py-2.5`} value={String(form[field.key] ?? '')} onChange={(e) => updateForm(field.key, e.target.value)} />
                    ) : (
                      <input className={inputClass} type={field.type} required={field.required} value={String(form[field.key] ?? '')} onChange={(e) => updateForm(field.key, e.target.value)} />
                    )}
                  </Field>
                ))}
              </Section>
              <Section title={copy('费用信息', 'Cost information')}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={copy('金额', 'Amount')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.amount ?? '')} onChange={(e) => updateForm('amount', e.target.value)} /></Field>
                  <Field label={copy('币种', 'Currency')}><select className={inputClass} value={String(form.currency)} onChange={(e) => updateForm('currency', e.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={copy('计费周期', 'Billing cycle')}><select className={inputClass} value={String(form.billingCycle)} onChange={(e) => updateForm('billingCycle', e.target.value)}>{cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}</select></Field>
                  <Field label={copy('下次扣费', 'Next charge')}><input className={inputClass} type="date" value={String(form.nextDueDate ?? '')} onChange={(e) => updateForm('nextDueDate', e.target.value)} /></Field>
                </div>
              </Section>
              <Section title={copy('状态与备注', 'Status and notes')}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">ON</option><option value="false">OFF</option></select></Field>
                </div>
                <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
                <Field label={copy('续费链接', 'Renewal URL')}><input className={inputClass} value={String(form.renewalUrl ?? '')} onChange={(e) => updateForm('renewalUrl', e.target.value)} /></Field>
                <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="prod, infra, personal" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
                <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
              </Section>
            </>
          )}
        </form>
      </Drawer>
    </div>
  );
}

function PhoneCommandPanel({
  stats,
  items,
  copy
}: {
  stats: PhoneStats;
  items: AssetItem[];
  copy: (zh: string, en: string) => string;
}) {
  const riskCount = items.filter((item) => {
    const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
    const left = daysLeft(dueDate || null);
    return left !== null && left <= 30;
  }).length;
  const carrierSummary = stats.carrierCounts.map(({ carrier, count }) => `${carrier} ${count}`).join(' / ');
  const countrySummary = stats.foreignCountryCounts.length > 0
    ? stats.foreignCountryCounts.map(({ country, count }) => `${country} ${count}`).join(' / ')
    : '-';
  return (
    <section className="motion-list grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DomainStat icon={<Phone size={17} />} label={copy('电话卡总数', 'Phone cards')} value={items.length} detail={copy(`国内 ${stats.domestic} / 国外 ${stats.foreign}`, `${stats.domestic} domestic / ${stats.foreign} foreign`)} />
      <DomainStat icon={<Signal size={17} />} label={copy('总月花费', 'Monthly total')} value={formatMoneyTotals(stats.monthlyTotal)} detail={copy('按当前页活跃筛选合计', 'Total for current active filter')} mono />
      <DomainStat icon={<Database size={17} />} label={copy('国内运营商', 'Domestic carriers')} value={<CountPills entries={stats.carrierCounts} labelKey="carrier" />} detail={carrierSummary} />
      <DomainStat icon={<UserRound size={17} />} label={copy('国外卡片', 'Foreign cards')} value={<CountPills entries={stats.foreignCountryCounts} labelKey="country" />} detail={copy(`${countrySummary}，30 天风险 ${riskCount}`, `${countrySummary}, ${riskCount} risks`)} mono />
    </section>
  );
}

function CountPills<T extends { count: number } & Record<string, string | number>>({ entries, labelKey }: { entries: T[]; labelKey: keyof T }) {
  if (entries.length === 0) return <span>-</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span key={String(entry[labelKey])} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
          {String(entry[labelKey])} <span className="font-mono text-brand-600 dark:text-brand-300">{entry.count}</span>
        </span>
      ))}
    </span>
  );
}

function PhoneVisualDashboard({ items, copy }: { items: AssetItem[]; copy: (zh: string, en: string) => string }) {
  const [styleKey, setStyleKey] = useState<PhoneVisualStyleKey>(() => getStoredPhoneVisualStyle());
  const [accentKey, setAccentKey] = useState<PhoneVisualAccentKey>(() => getStoredPhoneVisualAccent());
  const domestic = items.filter((item) => stringValue(item.phoneType) !== 'foreign');
  const foreign = items.filter((item) => stringValue(item.phoneType) === 'foreign');
  const monthlyTotal = domestic.reduce((sum, item) => sum + Number(item.amountMinorUnits ?? 0), 0);
  const activeCount = items.filter((item) => item.status === 'active').length;
  const riskCount = items.filter((item) => {
    const dueDate = stringValue(item.totalKeepaliveUntil) || stringValue(item.nextDueDate) || stringValue(item.expireDate);
    const left = daysLeft(dueDate || null);
    return left !== null && left <= 60;
  }).length;
  const costChart = domestic
    .map((item) => ({
      number: getPhoneDisplayNumber(item).replace(/^\+86/, ''),
      owner: stringValue(item.userName) || stringValue(item.realNamePerson) || '-',
      cost: Math.round(Number(item.amountMinorUnits ?? 0)) / 100,
      carrier: normalizeDomesticCarrier(item.carrier, copy)
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);
  const carrierChart = countBy(domestic, (item) => normalizeDomesticCarrier(item.carrier, copy));
  const countryChart = countBy(foreign, (item) => getPhoneCountryCode(item));
  const userChart = countBy(domestic, (item) => stringValue(item.userName) || stringValue(item.realNamePerson) || copy('未记录', 'Unknown')).slice(0, 6);
  const keepaliveItems = foreign
    .map((item) => {
      const dueDate = stringValue(item.totalKeepaliveUntil) || stringValue(item.nextDueDate) || stringValue(item.expireDate);
      return {
        id: item.id,
        number: getPhoneDisplayNumber(item),
        country: getPhoneCountryCode(item),
        carrier: stringValue(item.carrier) || '-',
        dueDate,
        left: daysLeft(dueDate || null)
      };
    })
    .sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999))
    .slice(0, 5);
  const showcase = domestic
    .slice()
    .sort((a, b) => Number(b.amountMinorUnits ?? 0) - Number(a.amountMinorUnits ?? 0))
    .slice(0, 4);
  const visualStyle = phoneVisualStyles.find((item) => item.key === styleKey) ?? phoneVisualStyles[0];
  const visualAccent = phoneVisualAccents.find((item) => item.key === accentKey) ?? phoneVisualAccents[0];
  const chartColors = visualAccent.chart;

  useEffect(() => {
    localStorage.setItem('moneypulse-phone-visual-style', styleKey);
  }, [styleKey]);

  useEffect(() => {
    localStorage.setItem('moneypulse-phone-visual-accent', accentKey);
  }, [accentKey]);

  if (items.length === 0) {
    return <EmptyState title={copy('暂无电话卡', 'No phone cards')} description={copy('新增几张电话卡后，这里会生成可视化管理大屏。', 'Add phone cards to generate the visual management board.')} />;
  }

  return (
    <section
      className="motion-list overflow-hidden rounded-2xl border shadow-soft transition-colors duration-300"
      style={{ background: visualStyle.shell, borderColor: visualStyle.border, color: visualStyle.text }}
    >
      <div className="relative isolate overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
        <div className="absolute inset-0 -z-10 transition-all duration-500" style={{ background: visualStyle.background(visualAccent) }} />
        <div className="absolute inset-x-0 top-0 -z-10 h-px" style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(visualAccent.primary, 0.72)}, transparent)` }} />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur" style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualAccent.primary }}>
              <Sparkles size={14} />
              {copy('可视化电话号码管理系统', 'Visual phone number command center')}
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl" style={{ color: visualStyle.text }}>{copy('号码资产全景', 'Number portfolio overview')}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: visualStyle.muted }}>
              {copy('把号码、使用人、运营商、国家与保号状态放在一个动态视图里，快速发现费用重心和风险号码。', 'A live view of numbers, owners, carriers, countries, and keepalive risk so cost centers stand out fast.')}
            </p>
          </div>
          <PhoneAppearanceControl
            styleKey={styleKey}
            accentKey={accentKey}
            onStyleChange={setStyleKey}
            onAccentChange={setAccentKey}
            copy={copy}
            visualStyle={visualStyle}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <VisualGlassCard label={copy('月花费', 'Monthly cost')} value={formatMoney(monthlyTotal, 'CNY')} detail={copy(`${activeCount} 张活跃卡`, `${activeCount} active cards`)} icon={<Signal size={18} />} color={visualAccent.tertiary} visualStyle={visualStyle} compact />
          <VisualGlassCard label={copy('号码总数', 'Total numbers')} value={items.length} detail={copy(`国内 ${domestic.length} / 国外 ${foreign.length}`, `${domestic.length} domestic / ${foreign.length} foreign`)} icon={<Phone size={18} />} color={visualAccent.primary} visualStyle={visualStyle} compact />
          <PhoneHeroMetric label={copy('国内', 'Domestic')} value={domestic.length} color={visualAccent.primary} visualStyle={visualStyle} />
          <PhoneHeroMetric label={copy('国外', 'Foreign')} value={foreign.length} color={visualAccent.secondary} visualStyle={visualStyle} />
          <PhoneHeroMetric label={copy('关注', 'Watch')} value={riskCount} color={visualAccent.tertiary} visualStyle={visualStyle} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-2xl border p-4 backdrop-blur transition-colors duration-300" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('国内号码月花费分布', 'Domestic monthly cost map')}</p>
                <p className="text-xs" style={{ color: visualStyle.soft }}>{copy('按费用从高到低，颜色代表运营商。', 'Sorted high to low; color hints at carrier.')}</p>
              </div>
              <BarChart3 size={20} style={{ color: visualAccent.tertiary }} />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={visualStyle.grid} vertical={false} />
                  <XAxis dataKey="number" tick={{ fill: visualStyle.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: visualStyle.border }} />
                  <YAxis tick={{ fill: visualStyle.soft, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: visualStyle.tooltipBg, border: `1px solid ${visualStyle.tooltipBorder}`, borderRadius: 12, color: visualStyle.text }} formatter={(value) => [`¥${value}`, copy('月花费', 'Monthly cost')]} />
                  <Bar dataKey="cost" radius={[8, 8, 2, 2]}>
                    {costChart.map((entry, index) => <Cell key={entry.number} fill={carrierColor(entry.carrier, chartColors[index % chartColors.length])} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border p-4 backdrop-blur transition-colors duration-300" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
              <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('本人运营商', 'Carrier mix')}</p>
              <div className="mt-3 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={carrierChart} dataKey="count" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={4}>
                      {carrierChart.map((entry, index) => <Cell key={entry.name} fill={carrierColor(entry.name, chartColors[index % chartColors.length])} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: visualStyle.tooltipBg, border: `1px solid ${visualStyle.tooltipBorder}`, borderRadius: 12, color: visualStyle.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2">
                {carrierChart.map((entry, index) => (
                  <span key={entry.name} className="rounded-full border px-2 py-1 text-xs" style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualStyle.muted }}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: carrierColor(entry.name, chartColors[index % chartColors.length]) }} />{entry.name} {entry.count}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-4 backdrop-blur transition-colors duration-300" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
              <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('国家分布', 'Country spread')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {countryChart.length === 0 ? <span className="text-sm" style={{ color: visualStyle.soft }}>-</span> : countryChart.map((entry, index) => (
                  <span key={entry.name} className="rounded-xl border px-3 py-2 font-mono text-sm font-semibold" style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualStyle.text }}>
                    <Globe2 className="mr-1 inline" size={14} style={{ color: visualAccent.primary }} />{entry.name} <span style={{ color: chartColors[index % chartColors.length] }}>{entry.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border p-4 backdrop-blur transition-colors duration-300" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
            <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('实际使用人分布', 'Actual user split')}</p>
            <div className="mt-4 space-y-3">
              {userChart.map((entry, index) => (
                <div key={entry.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span style={{ color: visualStyle.muted }}>{entry.name}</span>
                    <span className="font-mono" style={{ color: visualStyle.text }}>{entry.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: visualStyle.chip }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(12, (entry.count / Math.max(1, domestic.length)) * 100)}%`, background: chartColors[index % chartColors.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border p-4 backdrop-blur transition-colors duration-300" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
            <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('保号与关注', 'Keepalive watch')}</p>
            <div className="mt-4 space-y-2">
              {keepaliveItems.length === 0 ? <p className="text-sm" style={{ color: visualStyle.soft }}>{copy('暂无国外卡保号记录。', 'No foreign keepalive records yet.')}</p> : keepaliveItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold" style={{ color: visualStyle.text }}>{item.number}</p>
                    <p className="text-xs" style={{ color: visualStyle.soft }}>{item.country} · {item.carrier}</p>
                  </div>
                  <div className={`shrink-0 text-right font-mono text-sm font-semibold ${dueTone(item.left)}`}>
                    {item.left === null ? '-' : `${item.left}d`}
                    <p className="text-[11px] font-normal" style={{ color: visualStyle.soft }}>{compactDate(item.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showcase.map((item) => (
            <div key={item.id} className="rounded-2xl border p-4 backdrop-blur transition-all duration-200 hover:-translate-y-0.5" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
              <p className="font-mono text-base font-semibold" style={{ color: visualStyle.text }}>{getPhoneDisplayNumber(item)}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="rounded-md px-1.5 py-0.5" style={{ background: hexToRgba(visualAccent.secondary, 0.15), color: visualAccent.secondary }}>{stringValue(item.userName) || stringValue(item.realNamePerson) || '-'}</span>
                <span className="font-mono" style={{ color: visualAccent.tertiary }}>{formatMoney(item.amountMinorUnits, item.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhoneAppearanceControl({
  styleKey,
  accentKey,
  onStyleChange,
  onAccentChange,
  copy,
  visualStyle
}: {
  styleKey: PhoneVisualStyleKey;
  accentKey: PhoneVisualAccentKey;
  onStyleChange: (next: PhoneVisualStyleKey) => void;
  onAccentChange: (next: PhoneVisualAccentKey) => void;
  copy: (zh: string, en: string) => string;
  visualStyle: PhoneVisualStyle;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border px-2.5 py-2 backdrop-blur" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
      <span className="px-1 text-xs font-medium" style={{ color: visualStyle.soft }}>{copy('外观', 'Look')}</span>
      <select
        value={styleKey}
        onChange={(event) => onStyleChange(event.target.value as PhoneVisualStyleKey)}
        className="h-8 rounded-xl border px-2.5 text-xs font-medium outline-none transition-colors"
        style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualStyle.text }}
      >
        {phoneVisualStyles.map((style) => <option key={style.key} value={style.key}>{copy(style.labelZh, style.labelEn)}</option>)}
      </select>
      <div className="flex items-center gap-1">
        {phoneVisualAccents.map((item) => {
          const active = accentKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onAccentChange(item.key)}
              className="h-7 w-7 rounded-full border p-1 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: active ? hexToRgba(item.primary, 0.16) : 'transparent',
                borderColor: active ? hexToRgba(item.primary, 0.72) : visualStyle.border,
                boxShadow: active ? `0 0 0 2px ${hexToRgba(item.primary, 0.12)}` : 'none'
              }}
              title={copy(item.labelZh, item.labelEn)}
              aria-label={copy(item.labelZh, item.labelEn)}
            >
              <span className="block h-full w-full rounded-full" style={{ background: item.primary }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PhoneHeroMetric({ label, value, color, visualStyle }: { label: string; value: number; color: string; visualStyle: PhoneVisualStyle }) {
  return (
    <div className="rounded-2xl border px-3 py-3 backdrop-blur" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
      <p className="text-xs" style={{ color: visualStyle.muted }}>{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function VisualGlassCard({ label, value, detail, icon, color, visualStyle, compact = false }: { label: string; value: React.ReactNode; detail: string; icon: React.ReactNode; color: string; visualStyle: PhoneVisualStyle; compact?: boolean }) {
  return (
    <div className={`${compact ? 'p-3' : 'p-4'} rounded-2xl border backdrop-blur transition-colors duration-300`} style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm" style={{ color: visualStyle.muted }}>{label}</p>
          <div className={`${compact ? 'text-2xl' : 'text-3xl'} mt-2 font-mono font-semibold`} style={{ color: visualStyle.text }}>{value}</div>
        </div>
        <div className={`${compact ? 'h-9 w-9' : 'h-10 w-10'} flex items-center justify-center rounded-xl border`} style={{ borderColor: hexToRgba(color, 0.28), background: hexToRgba(color, 0.14), color }}>{icon}</div>
      </div>
      <p className={`${compact ? 'mt-3' : 'mt-4'} text-xs`} style={{ color: visualStyle.soft }}>{detail}</p>
    </div>
  );
}

function PhoneFormSections({
  form,
  updateForm,
  copy,
  language
}: {
  form: FormState;
  updateForm: (key: string, value: string | boolean) => void;
  copy: (zh: string, en: string) => string;
  language: ReturnType<typeof useI18n>['language'];
}) {
  const phoneType = String(form.phoneType || 'domestic');
  return (
    <>
      <Section title={copy('卡片类型', 'Card type')}>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {[
            { value: 'domestic', label: copy('国内电话卡', 'Domestic') },
            { value: 'foreign', label: copy('国外电话卡', 'Foreign') }
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateForm('phoneType', option.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${phoneType === option.value ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      {phoneType === 'foreign' ? (
        <Section title={copy('国外号码', 'Foreign number')}>
          <Field label={copy('SIM 形态', 'SIM format')}>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
              {[
                { value: false, label: copy('实体 SIM', 'Physical SIM') },
                { value: true, label: copy('eSIM', 'eSIM') }
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => updateForm('isEsim', option.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${Boolean(form.isEsim) === option.value ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3">
            <Field label={copy('国家区号', 'Country code')}><input className={`${inputClass} font-mono`} value={String(form.countryCode ?? '')} onChange={(e) => updateForm('countryCode', e.target.value)} placeholder="+1" /></Field>
            <Field label={copy('A 电话号码', 'A number')}><input className={`${inputClass} font-mono`} required value={String(form.aPhoneNumber || form.cardNumber || '')} onChange={(e) => { updateForm('aPhoneNumber', e.target.value); updateForm('cardNumber', e.target.value); }} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('归属地', 'Home location')}><input className={inputClass} value={String(form.homeLocation ?? '')} onChange={(e) => updateForm('homeLocation', e.target.value)} /></Field>
            <Field label={copy('运营商', 'Carrier')}><input className={inputClass} value={String(form.carrier ?? '')} onChange={(e) => updateForm('carrier', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('内地号码', 'Mainland number')}><input className={`${inputClass} font-mono`} value={String(form.mainlandNumber ?? '')} onChange={(e) => updateForm('mainlandNumber', e.target.value)} /></Field>
            <Field label={copy('实名方式', 'Verification')}><input className={inputClass} value={String(form.realNameMethod ?? '')} onChange={(e) => updateForm('realNameMethod', e.target.value)} /></Field>
          </div>
        </Section>
      ) : (
        <Section title={copy('国内号码', 'Domestic number')}>
          <Field label={copy('电话号码', 'Phone number')}><input className={`${inputClass} font-mono`} required value={String(form.cardNumber ?? '')} onChange={(e) => updateForm('cardNumber', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('PO 电话号码', 'PO number')}><input className={`${inputClass} font-mono`} value={String(form.poPhoneNumber ?? '')} onChange={(e) => updateForm('poPhoneNumber', e.target.value)} /></Field>
            <Field label={copy('运营商', 'Carrier')}><input className={inputClass} value={String(form.carrier ?? '')} onChange={(e) => updateForm('carrier', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('实名人', 'Registered owner')}><input className={inputClass} value={String(form.realNamePerson ?? '')} onChange={(e) => updateForm('realNamePerson', e.target.value)} /></Field>
            <Field label={copy('使用人', 'User')}><input className={inputClass} value={String(form.userName ?? '')} onChange={(e) => updateForm('userName', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={copy('是否副卡', 'Secondary')}><select className={inputClass} value={String(form.isSecondaryCard)} onChange={(e) => updateForm('isSecondaryCard', e.target.value === 'true')}><option value="false">{copy('否', 'No')}</option><option value="true">{copy('是', 'Yes')}</option></select></Field>
            <Field label={copy('流量（G）', 'Data GB')}><input className={`${inputClass} font-mono`} type="number" step="0.1" value={String(form.dataAllowanceGb ?? '')} onChange={(e) => updateForm('dataAllowanceGb', e.target.value)} /></Field>
            <Field label={copy('通话（min）', 'Minutes')}><input className={`${inputClass} font-mono`} type="number" value={String(form.voiceMinutes ?? '')} onChange={(e) => updateForm('voiceMinutes', e.target.value)} /></Field>
          </div>
          <Field label={copy('附属业务备注', 'Attached service notes')}><input className={inputClass} value={String(form.attachedServices ?? '')} onChange={(e) => updateForm('attachedServices', e.target.value)} /></Field>
        </Section>
      )}

      <Section title={phoneType === 'foreign' ? copy('余额与保号', 'Balance and keepalive') : copy('月租与花费', 'Rent and cost')}>
        {phoneType === 'foreign' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy('余额（当地货币）', 'Balance')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.balanceMinorUnits ?? '')} onChange={(e) => updateForm('balanceMinorUnits', e.target.value)} /></Field>
              <Field label={copy('最低保号金额', 'Min keepalive')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.minimumKeepaliveAmountMinorUnits ?? '')} onChange={(e) => updateForm('minimumKeepaliveAmountMinorUnits', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy('总保号截止日期', 'Keepalive until')}><input className={inputClass} type="date" value={String(form.totalKeepaliveUntil ?? '')} onChange={(e) => updateForm('totalKeepaliveUntil', e.target.value)} /></Field>
              <Field label={copy('保号天数', 'Keepalive days')}><input className={`${inputClass} font-mono`} type="number" value={String(form.keepaliveDays ?? '')} onChange={(e) => updateForm('keepaliveDays', e.target.value)} /></Field>
            </div>
            <Field label={copy('保号方式', 'Keepalive method')}><input className={inputClass} value={String(form.keepaliveMethod ?? '')} onChange={(e) => updateForm('keepaliveMethod', e.target.value)} /></Field>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('月租', 'Monthly rent')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.monthlyRentMinorUnits ?? '')} onChange={(e) => updateForm('monthlyRentMinorUnits', e.target.value)} /></Field>
            <Field label={copy('附属业务', 'Attached services')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.attachedServicesMinorUnits ?? '')} onChange={(e) => updateForm('attachedServicesMinorUnits', e.target.value)} /></Field>
            <Field label={copy('减免', 'Discount')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.discountMinorUnits ?? '')} onChange={(e) => updateForm('discountMinorUnits', e.target.value)} /></Field>
            <Field label={copy('月花费', 'Monthly cost')}><input className={`${inputClass} bg-slate-50 font-mono dark:bg-white/[0.04]`} type="number" step="0.01" value={String(form.amount ?? '')} readOnly /></Field>
            <Field label={copy('回款（扣减月花费）', 'Cashback deducted')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.cashbackMinorUnits ?? '')} onChange={(e) => updateForm('cashbackMinorUnits', e.target.value)} /></Field>
          </div>
        )}
      </Section>

      <Section title={copy('费用与状态', 'Cost and status')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('币种', 'Currency')}><select className={inputClass} value={String(form.currency)} onChange={(e) => updateForm('currency', e.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label={copy('计费周期', 'Billing cycle')}><select className={inputClass} value={String(form.billingCycle)} onChange={(e) => updateForm('billingCycle', e.target.value)}>{cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('下次扣费', 'Next payment')}><input className={inputClass} type="date" value={String(form.nextDueDate ?? '')} onChange={(e) => updateForm('nextDueDate', e.target.value)} /></Field>
          <Field label={copy('到期日', 'Expires on')}><input className={inputClass} type="date" value={String(form.expireDate ?? '')} onChange={(e) => updateForm('expireDate', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('开卡日期', 'Activated on')}><input className={inputClass} type="date" value={String(form.activateDate ?? '')} onChange={(e) => updateForm('activateDate', e.target.value)} /></Field>
          <Field label={copy('扣费日', 'Billing day')}><input className={`${inputClass} font-mono`} type="number" min="1" max="31" value={String(form.billingDay ?? '')} onChange={(e) => updateForm('billingDay', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">ON</option><option value="false">OFF</option></select></Field>
        </div>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

function VpsCommandPanel({
  stats,
  items,
  autoRefresh,
  onAutoRefreshChange,
  copy
}: {
  stats: VpsStats;
  items: AssetItem[];
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  copy: (zh: string, en: string) => string;
}) {
  const riskCount = items.filter((item) => {
    const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
    const left = daysLeft(dueDate || null);
    return left !== null && left <= 30;
  }).length;
  return (
    <section className="motion-list grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <VpsStat icon={<Server size={17} />} label={copy('在线节点', 'Online nodes')} value={`${stats.online}/${items.length}`} detail={copy(`${stats.offline} 台离线或异常`, `${stats.offline} offline or failing`)} tone={stats.offline > 0 ? 'warning' : 'success'} />
      <VpsStat icon={<Wifi size={17} />} label={copy('探针覆盖', 'Probe coverage')} value={`${stats.configured}/${items.length}`} detail={copy('dstatus / neko 风格接口', 'dstatus / neko-style endpoints')} tone="brand" />
      <VpsStat icon={<Activity size={17} />} label={copy('平均负载', 'Average load')} value={formatPercent(stats.avgCpu)} detail={copy(`内存均值 ${formatPercent(stats.avgMemory)}`, `Memory average ${formatPercent(stats.avgMemory)}`)} tone={stats.avgCpu !== null && stats.avgCpu >= 80 ? 'danger' : 'brand'} />
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-850">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{copy('累计流量', 'Total transfer')}</p>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{formatBytes(stats.totalTrafficBytes)}</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-success-500/20 bg-success-500/10 text-success-500"><Database size={17} /></div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{copy(`30 天续费风险 ${riskCount}`, `${riskCount} renewal risks`)}</span>
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

function VpsStat({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone: 'brand' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-500',
    success: 'border-success-500/20 bg-success-500/10 text-success-500',
    warning: 'border-warning-500/20 bg-warning-500/10 text-warning-500',
    danger: 'border-danger-500/20 bg-danger-500/10 text-danger-500'
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function VpsNodeCard({
  item,
  monitorState,
  actionState,
  copiedSsh,
  renewing,
  onRenew,
  onCopySsh,
  onRefresh,
  onTest,
  onInstall,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  monitorState?: VpsMonitorState;
  actionState?: VpsActionState;
  copiedSsh: boolean;
  renewing: boolean;
  onRenew: (item: AssetItem) => void;
  onCopySsh: (item: AssetItem) => void;
  onRefresh: (item: AssetItem) => void;
  onTest: (item: AssetItem) => void;
  onInstall: (item: AssetItem) => void;
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
  const uptime = getMonitorNumber(item, monitorState, 'monitorUptimeSeconds', 'uptimeSeconds');
  const sshCommand = getSshCommand(item);
  const sshHref = getSshHref(item);
  const canRenew = !['cancelled', 'archived'].includes(item.status);

  return (
    <div className="motion-card card-hover group relative overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex max-w-full items-center gap-2">
            <MonitorDot status={statusValue} />
            <h3 className="truncate font-medium text-slate-950 dark:text-white">{getText(item, 'name')}</h3>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {formatVpsType(item.vpsType, copy)} · {stringValue(item.provider) || '-'} · {stringValue(item.location) || stringValue(item.os) || '-'}
          </p>
        </div>
        <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium ${monitorBadgeClass(statusValue)}`}>{formatMonitorStatus(statusValue, copy)}</span>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <Server size={13} />
          <span className="truncate font-mono">{stringValue(item.ipAddress) || stringValue(item.sshHost) || '-'}</span>
        </div>
        {sshCommand && <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{sshCommand}</p>}
      </div>

      <div className="mt-4 space-y-3">
        <VpsMetricLine icon={<Cpu size={14} />} label="CPU" total={formatVpsCapacity(item.cpu, 'cpu')} value={cpu} />
        <VpsMetricLine icon={<Database size={14} />} label={copy('内存', 'Memory')} total={formatVpsCapacity(item.memory, 'memory')} value={memory} />
        <VpsMetricLine icon={<HardDrive size={14} />} label={copy('硬盘', 'Disk')} total={formatVpsCapacity(item.storage, 'storage')} value={disk} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="muted-panel p-3">
          <p className="flex items-center gap-1 text-xs text-slate-500"><Download size={13} />{copy('下行', 'Down')}</p>
          <p className="mt-1 font-mono text-sm font-semibold text-success-600 dark:text-success-400">{formatBps(netIn)}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">{formatBytes(totalIn)}</p>
        </div>
        <div className="muted-panel p-3">
          <p className="flex items-center gap-1 text-xs text-slate-500"><Upload size={13} />{copy('上行', 'Up')}</p>
          <p className="mt-1 font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">{formatBps(netOut)}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">{formatBytes(totalOut)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`font-mono font-semibold ${dueTone(left)}`}>{copy('续费 ', 'Renewal ')}{left === null ? '-' : `${left}d`}</span>
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
        <span className="truncate">{copy('运行 ', 'Uptime ')}{formatUptime(uptime)}</span>
      </div>
      {(monitorState?.error || actionState?.error || actionState?.message) && (
        <p className={`mt-3 rounded-lg border px-2 py-1 text-xs ${actionState?.message ? 'border-success-500/20 bg-success-500/10 text-success-700 dark:text-success-300' : 'border-warning-500/20 bg-warning-500/10 text-warning-700 dark:text-warning-300'}`}>
          {actionState?.message || actionState?.error || monitorState?.error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <p className="truncate text-[11px] text-slate-400">{copy('更新 ', 'Updated ')}{formatMonitorUpdatedAt(stringValue(item.monitorUpdatedAt) || monitorState?.monitor?.updatedAt || '')}</p>
        <div className="flex shrink-0 justify-end gap-1">
          <button onClick={() => onTest(item)} disabled={actionState?.testing} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-success-500 disabled:opacity-40 dark:hover:bg-white/[0.06]" title={copy('测试 SSH 连接', 'Test SSH connection')}>
            <Terminal className={actionState?.testing ? 'animate-pulse' : ''} size={14} />
          </button>
          <button onClick={() => onInstall(item)} disabled={actionState?.installing} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40 dark:hover:bg-white/[0.06]" title={copy('安装探针', 'Install probe')}>
            <Download className={actionState?.installing ? 'animate-pulse' : ''} size={14} />
          </button>
          <button onClick={() => onRefresh(item)} disabled={!stringValue(item.probeUrl) || monitorState?.loading} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-success-500 disabled:opacity-40 dark:hover:bg-white/[0.06]" title={copy('刷新监控', 'Refresh monitor')}>
            <RefreshCw className={monitorState?.loading ? 'animate-spin' : ''} size={14} />
          </button>
          <button onClick={() => onCopySsh(item)} className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all ${copiedSsh ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`} title={copy('复制 SSH 命令', 'Copy SSH command')}>
            {copiedSsh ? <Check size={14} /> : <Terminal size={14} />}
          </button>
          {sshHref && (
            <a href={sshHref} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/[0.06]" title={copy('打开 SSH 链接', 'Open SSH link')}>
              <ExternalLink size={14} />
            </a>
          )}
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

function VpsRenewalToast({
  toast,
  onUndo,
  onUpdateAmount,
  onClose,
  copy
}: {
  toast: VpsRenewalToastState;
  onUndo: (toast: VpsRenewalToastState) => Promise<void>;
  onUpdateAmount: (toast: VpsRenewalToastState, amountMinorUnits: number) => Promise<void>;
  onClose: () => void;
  copy: (zh: string, en: string) => string;
}) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amount, setAmount] = useState((toast.renewal.amountMinorUnits / 100).toFixed(2));
  const [working, setWorking] = useState<'undo' | 'amount' | null>(null);

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
    <aside className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-success-500/25 bg-white p-3 shadow-2xl shadow-slate-950/15 dark:bg-ink-900" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-500/10 text-success-600 dark:text-success-400"><Check size={15} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950 dark:text-white">
            {copy(`已续费至 ${toast.renewal.renewedExpireDate}`, `Renewed until ${toast.renewal.renewedExpireDate}`)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{formatMoney(toast.renewal.amountMinorUnits, toast.renewal.currency)}</p>
          {editingAmount ? (
            <div className="mt-2 flex items-center gap-2">
              <input className={`${inputClass} h-8 min-w-0 flex-1 font-mono text-xs`} type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
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

function VpsMetricLine({ icon, label, total, value }: { icon: React.ReactNode; label: string; total: string; value: number | null }) {
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

function MonitorDot({ status }: { status: string }) {
  const cls = status === 'online'
    ? 'bg-success-500 shadow-success-500/40 live-dot'
    : status === 'offline'
      ? 'bg-danger-500 shadow-danger-500/30'
      : 'bg-slate-300 dark:bg-slate-600';
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow ${cls}`} />;
}

function SubscriptionFormSections({
  form,
  updateForm,
  copy,
  language
}: {
  form: FormState;
  updateForm: (key: string, value: string | boolean) => void;
  copy: (zh: string, en: string) => string;
  language: 'zh' | 'en';
}) {
  const purchaseType = stringValue(form.purchaseType) === 'buyout' ? 'buyout' : 'subscription';
  const isBuyout = purchaseType === 'buyout';

  return (
    <>
      <Section title={copy('基础信息', 'Details')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('名称', 'Name')}><input className={inputClass} required value={String(form.name ?? '')} onChange={(e) => updateForm('name', e.target.value)} /></Field>
          <Field label={copy('类型', 'Type')}>
            <select className={inputClass} value={purchaseType} onChange={(e) => updateForm('purchaseType', e.target.value)}>
              <option value="subscription">{copy('订阅制', 'Subscription')}</option>
              <option value="buyout">{copy('买断制', 'Buyout')}</option>
            </select>
          </Field>
        </div>
        <Field label={copy('服务商', 'Provider')}><input className={inputClass} value={String(form.provider ?? '')} onChange={(e) => updateForm('provider', e.target.value)} /></Field>
        {isBuyout ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy('邮箱', 'Email')}><input className={inputClass} type="email" value={String(form.email ?? '')} onChange={(e) => updateForm('email', e.target.value)} /></Field>
              <Field label={copy('手机号', 'Phone')}><input className={inputClass} type="tel" value={String(form.phoneNumber ?? '')} onChange={(e) => updateForm('phoneNumber', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy('密钥', 'License key')} hint={copy('作为普通记录保存，可直接查看和搜索。', 'Stored as a visible, searchable record.')}><input className={`${inputClass} font-mono`} type="text" spellCheck={false} value={String(form.licenseKey ?? '')} onChange={(e) => updateForm('licenseKey', e.target.value)} /></Field>
              <Field label={copy('设备限制', 'Device limit')}><input className={inputClass} type="number" min="0" value={String(form.deviceLimit ?? '')} onChange={(e) => updateForm('deviceLimit', e.target.value)} /></Field>
            </div>
            <Field label={copy('订阅内容', 'Content')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.content ?? '')} onChange={(e) => updateForm('content', e.target.value)} /></Field>
          </>
        ) : (
          <Field label={copy('账号 / 邮箱', 'Account / email')}><input className={inputClass} value={String(form.account ?? '')} onChange={(e) => updateForm('account', e.target.value)} /></Field>
        )}
      </Section>

      <Section title={copy(isBuyout ? '购买信息' : '费用与续费', isBuyout ? 'Purchase' : 'Cost and renewal')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('金额', 'Amount')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.amount ?? '')} onChange={(e) => updateForm('amount', e.target.value)} /></Field>
          <Field label={copy('币种', 'Currency')}><select className={inputClass} value={String(form.currency)} onChange={(e) => updateForm('currency', e.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
        </div>
        {!isBuyout && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('计费周期', 'Billing cycle')}><select className={inputClass} value={String(form.billingCycle)} onChange={(e) => updateForm('billingCycle', e.target.value)}>{cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}</select></Field>
            <Field label={copy('下次扣费', 'Next payment')}><input className={inputClass} type="date" value={String(form.nextDueDate ?? '')} onChange={(e) => updateForm('nextDueDate', e.target.value)} /></Field>
          </div>
        )}
      </Section>

      <Section title={copy('状态与备注', 'Status and notes')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
          {!isBuyout && <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">ON</option><option value="false">OFF</option></select></Field>}
        </div>
        <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
        {!isBuyout && <Field label={copy('续费链接', 'Renewal link')}><input className={inputClass} value={String(form.renewalUrl ?? '')} onChange={(e) => updateForm('renewalUrl', e.target.value)} /></Field>}
        <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="prod, infra, personal" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

function VpsFormSections({
  form,
  updateForm,
  copy,
  language,
  editing,
  actionState,
  onTest,
  onInstall
}: {
  form: FormState;
  updateForm: (key: string, value: string | boolean) => void;
  copy: (zh: string, en: string) => string;
  language: 'zh' | 'en';
  editing: AssetItem | null;
  actionState?: VpsActionState;
  onTest: (item: AssetItem) => void;
  onInstall: (item: AssetItem, probePort?: number) => void;
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
          <Field label="IP"><input className={`${inputClass} font-mono`} value={String(form.ipAddress ?? '')} onChange={(e) => updateForm('ipAddress', e.target.value)} placeholder="203.0.113.48" /></Field>
          <Field label={copy('系统', 'OS')}><input className={inputClass} value={String(form.os ?? '')} onChange={(e) => updateForm('os', e.target.value)} placeholder="Debian 12" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPU"><input className={inputClass} value={String(form.cpu ?? '')} onChange={(e) => updateForm('cpu', e.target.value)} placeholder="4 vCPU" /></Field>
          <Field label={copy('内存', 'Memory')}><input className={inputClass} value={String(form.memory ?? '')} onChange={(e) => updateForm('memory', e.target.value)} placeholder="8 GB" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('硬盘', 'Storage')}><input className={inputClass} value={String(form.storage ?? '')} onChange={(e) => updateForm('storage', e.target.value)} placeholder="160 GB NVMe" /></Field>
          <Field label={copy('流量 / 带宽', 'Traffic / bandwidth')}><input className={inputClass} value={String(form.bandwidth ?? '')} onChange={(e) => updateForm('bandwidth', e.target.value)} placeholder="2 TB / 1 Gbps" /></Field>
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
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">ON</option><option value="false">OFF</option></select></Field>
        </div>
        <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
        <Field label={copy('续费链接', 'Renewal link')}><input className={inputClass} value={String(form.renewalUrl ?? '')} onChange={(e) => updateForm('renewalUrl', e.target.value)} /></Field>
        <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="prod, infra, personal" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

function DomainCommandPanel({
  stats,
  items,
  renewalTotals,
  copy
}: {
  stats: { registrarCount: number; accountCount: number; topSuffix: string; autoRenewCount: number };
  items: AssetItem[];
  renewalTotals?: RenewalTotals;
  copy: (zh: string, en: string) => string;
}) {
  const riskCount = items.filter((item) => {
    const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
    const left = daysLeft(dueDate || null);
    return left !== null && left <= 30;
  }).length;

  return (
    <section className="motion-list grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DomainPeriodTotalCard totals={renewalTotals} copy={copy} />
      <DomainStat icon={<ShieldCheck size={17} />} label={copy('注册商', 'Registrars')} value={stats.registrarCount} detail={copy(`${stats.accountCount} 个服务商账号`, `${stats.accountCount} registrar accounts`)} />
      <DomainStat icon={<CalendarClock size={17} />} label={copy('30 天风险', '30-day risk')} value={riskCount} detail={copy('按续费/到期日期合并判断', 'Calculated from renewal or expiry dates')} />
      <DomainStat icon={<Link2 size={17} />} label={copy('主力后缀', 'Top suffix')} value={stats.topSuffix} detail={copy(`${stats.autoRenewCount} 个域名开启自动续费`, `${stats.autoRenewCount} domains on auto renew`)} mono />
    </section>
  );
}

function DomainPeriodTotalCard({ totals, copy }: { totals?: RenewalTotals; copy: (zh: string, en: string) => string }) {
  const [mode, setMode] = useState<RenewalTotalMode>('monthly');
  const summary = mode === 'yearly' ? totals?.yearlyTotal : totals ? {
    count: totals.count,
    windowStart: totals.windowStart,
    windowEnd: totals.windowEnd,
    byCurrency: totals.byCurrency,
    convertedTotal: totals.convertedTotal
  } : undefined;
  const currency = summary?.convertedTotal.currency ?? totals?.displayCurrency ?? 'CNY';
  const title = mode === 'yearly' ? copy('未来一年续费合计', 'Next 12 months renewals') : copy('下月续费合计', 'Next-month renewals');
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] dark:border-white/10 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => setMode('monthly')}
            className={`rounded-md px-2 py-0.5 transition-all ${mode === 'monthly' ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {copy('按月', 'Month')}
          </button>
          <button
            type="button"
            onClick={() => setMode('yearly')}
            className={`rounded-md px-2 py-0.5 transition-all ${mode === 'yearly' ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {copy('按年', 'Year')}
          </button>
        </div>
      </div>
      <div className="mt-2 break-words font-mono text-2xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-white">
        {formatMoney(summary?.convertedTotal.amountMinorUnits ?? 0, currency)}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {mode === 'yearly'
          ? copy(
            `${summary?.windowStart ?? '-'} 至 ${summary?.windowEnd ?? '-'} 到期 ${summary?.count ?? 0} 个；仅合计下月起 12 个月内到期金额。`,
            `${summary?.count ?? 0} domains due from ${summary?.windowStart ?? '-'} to ${summary?.windowEnd ?? '-'}; only the 12-month window from next month is counted.`
          )
          : copy(
            `${summary?.windowStart ?? '-'} 至 ${summary?.windowEnd ?? '-'} 到期 ${summary?.count ?? 0} 个；仅合计下个月到期金额。`,
            `${summary?.count ?? 0} domains due from ${summary?.windowStart ?? '-'} to ${summary?.windowEnd ?? '-'}; only next-month renewals are counted.`
          )}
      </p>
      <p className="mt-2 truncate text-[11px] text-slate-400">
        {copy('原币种：', 'Original: ')}{formatMoneyTotals(summary?.byCurrency)}
        {summary?.convertedTotal.exchangeRateDate ? ` · FX ${summary.convertedTotal.exchangeRateDate}` : ''}
      </p>
    </div>
  );
}

function DomainStat({ icon, label, value, detail, mono = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <div className={`${mono ? 'font-mono' : 'font-sans'} mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white`}>{value}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function DomainCardView({
  item,
  duplicated,
  duplicating,
  renewing,
  renewed,
  onDuplicate,
  onRenew,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  duplicated: boolean;
  duplicating: boolean;
  renewing: boolean;
  renewed: boolean;
  onDuplicate: (item: AssetItem) => void;
  onRenew: (item: AssetItem) => void;
  onEdit: (item: AssetItem) => void;
  onDelete: (item: AssetItem) => void;
  copy: (zh: string, en: string) => string;
}) {
  const dueDate = stringValue(item.nextDueDate) || stringValue(item.expireDate);
  const left = daysLeft(dueDate || null);
  const registrar = stringValue(item.registrar);
  const suffix = normalizeDomainExtension(item.domainExtension || inferDomainExtension(item.domainName));
  const link = domainLink(item);
  const dnsLink = dnsProviderLink(item);
  const domainName = getText(item, 'domainName');
  const lastRenewDate = stringValue(item.lastRenewDate);
  const duplicateTitle = duplicated
    ? copy('已复制条目', 'Entry duplicated')
    : duplicating
      ? copy('复制中', 'Duplicating')
      : copy('复制条目', 'Duplicate entry');
  const renewTitle = renewed
    ? copy('已标记续费', 'Renewal marked')
    : renewing
      ? copy('续费中', 'Renewing')
      : copy('标记续费一次', 'Renew one cycle');

  return (
    <div className="motion-card card-hover group relative overflow-hidden">
      <div className="flex items-start justify-between gap-4 pt-1">
        <div className="min-w-0">
          <div className="flex max-w-full items-center gap-2">
            <h3 className="truncate font-mono text-xl font-semibold tracking-normal text-slate-950 dark:text-white">{domainName}</h3>
            {suffix && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-white/[0.06]">{suffix}</span>}
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{registrar || '-'} · {stringValue(item.registrarAccount) || copy('未记录账号', 'No account recorded')}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="muted-panel p-3">
          <p className="text-xs text-slate-500">{copy('续费/到期', 'Renewal / expiry')}</p>
          <p className={`mt-1 font-mono text-lg font-semibold ${dueTone(left)}`}>{left === null ? '-' : `${left}d`}</p>
          <p className="text-xs text-slate-400">{compactDate(dueDate)}</p>
          <p className="mt-1 text-[11px] text-slate-400">{copy('上次 ', 'Last ')}{compactDate(lastRenewDate)}</p>
        </div>
        <div className="muted-panel p-3">
          <p className="text-xs text-slate-500">{copy('周期费用', 'Cycle cost')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-950 dark:text-white">{formatDisplayMoney(item)}</p>
          <p className="text-xs text-slate-400">{formatCycle(item.billingCycle)}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <UserRound size={13} />
          <span className="truncate">{stringValue(item.dnsProvider) || stringValue(item.purpose) || copy('未记录 DNS/用途', 'No DNS or purpose recorded')}</span>
        </div>
        <div className="flex shrink-0 justify-end gap-1">
          <button
            onClick={() => onRenew(item)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${renewed ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-success-500 dark:hover:bg-white/[0.06]'}`}
            title={renewTitle}
            aria-label={renewTitle}
            disabled={renewing}
          >
            {renewed ? <Check size={14} /> : <RefreshCw className={renewing ? 'animate-spin' : ''} size={14} />}
          </button>
          <button
            onClick={() => onDuplicate(item)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${duplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
            title={duplicateTitle}
            aria-label={duplicateTitle}
            disabled={duplicating}
          >
            {duplicated ? <Check size={14} /> : <Copy className={duplicating ? 'animate-pulse' : ''} size={14} />}
          </button>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/[0.06]" title={copy('打开服务商', 'Open provider')}>
              <ExternalLink size={14} />
            </a>
          )}
          {dnsLink && dnsLink !== link && (
            <a href={dnsLink} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-success-500 dark:hover:bg-white/[0.06]" title={copy('打开 DNS', 'Open DNS')}>
              <Link2 size={14} />
            </a>
          )}
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

function DomainMiniCardView({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const dueDate = stringValue(item.nextDueDate) || stringValue(item.expireDate);
  const left = daysLeft(dueDate || null);

  return (
    <div className="motion-card rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-soft dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate font-mono text-base font-semibold tracking-normal text-slate-950 dark:text-white">
          {getText(item, 'domainName')}
        </h3>
        <span className={`shrink-0 font-mono text-sm font-semibold ${dueTone(left)}`}>
          {left === null ? '-' : `${left}d`}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500 dark:text-slate-400">{copy('续费/到期', 'Renewal / expiry')}</span>
        <span className="font-mono text-slate-600 dark:text-slate-300">{compactDate(dueDate)}</span>
      </div>
    </div>
  );
}

function PhoneMiniCardView({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const country = getPhoneCountryCode(item);
  const phoneNumber = getPhoneDisplayNumber(item);
  const isForeign = stringValue(item.phoneType) === 'foreign';

  return (
    <div className="motion-card rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-soft dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
            {country}{isForeign ? ` · ${getSimFormFactorLabel(item, copy)}` : ''}
          </span>
          <h3 className="mt-2 truncate font-mono text-base font-semibold tracking-normal text-slate-950 dark:text-white">
            {phoneNumber}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{copy('月花费', 'Monthly')}</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</p>
        </div>
      </div>
    </div>
  );
}

function DomainFormSections({
  form,
  updateForm,
  copy
}: {
  form: FormState;
  updateForm: (key: string, value: string | boolean) => void;
  copy: (zh: string, en: string) => string;
}) {
  const extension = normalizeDomainExtension(form.domainExtension) || '.com';
  const prefix = getDomainPrefixFromForm(form, extension);
  const fullDomain = composeDomainName(prefix, extension);
  const registrarProfile = findRegistrarProfile(form.registrar);
  const dnsProfile = findDnsProviderProfile(form.dnsProvider);
  return (
    <>
      <Section title={copy('域名与入口', 'Domain and access')}>
        <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-3">
          <Field label={copy('域名前缀', 'Domain prefix')} hint={copy('只填前缀，不需要输入后缀。', 'Enter the name only, without the suffix.')}>
            <input className={`${inputClass} font-mono`} required value={prefix} onChange={(e) => updateForm('domainPrefix', e.target.value)} placeholder="moneypulse" />
          </Field>
          <Field label={copy('后缀', 'Suffix')}>
            <select className={`${inputClass} font-mono`} value={extension} onChange={(e) => updateForm('domainExtension', e.target.value)}>
              {commonDomainExtensions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
        </div>
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{copy('完整域名预览', 'Full domain preview')}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-950 dark:text-white">{fullDomain || `name${extension}`}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('注册商', 'Registrar')}>
            <select className={inputClass} value={String(form.registrar ?? '')} onChange={(e) => updateForm('registrar', e.target.value)}>
              <option value="">{copy('选择注册商', 'Select registrar')}</option>
              {registrarProfiles.map((profile) => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
            </select>
          </Field>
          <Field label={copy('DNS 托管商', 'DNS host')}>
            <select className={inputClass} value={String(form.dnsProvider ?? '')} onChange={(e) => updateForm('dnsProvider', e.target.value)}>
              <option value="">{copy('选择 DNS 托管商', 'Select DNS host')}</option>
              {dnsProviderProfiles.map((profile) => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ProviderJump label={copy('服务商入口', 'Registrar console')} href={registrarProfile?.consoleUrl} empty={copy('选择注册商后自动出现', 'Shown after choosing a registrar')} />
          <ProviderJump label={copy('DNS 入口', 'DNS console')} href={dnsProfile?.consoleUrl} empty={copy('选择 DNS 托管商后自动出现', 'Shown after choosing a DNS host')} />
        </div>
        <Field label={copy('服务商账号', 'Registrar account')}>
          <input className={inputClass} value={String(form.registrarAccount ?? '')} onChange={(e) => updateForm('registrarAccount', e.target.value)} placeholder="owner@example.com / team alias" />
        </Field>
      </Section>

      <Section title={copy('续费与成本', 'Renewal and cost')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('注册日期', 'Registered on')}><input className={inputClass} type="date" value={String(form.registerDate ?? '')} onChange={(e) => updateForm('registerDate', e.target.value)} /></Field>
          <Field label={copy('上次续费', 'Last renewed')}><input className={inputClass} type="date" value={String(form.lastRenewDate ?? '')} onChange={(e) => updateForm('lastRenewDate', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('到期日', 'Expires on')}><input className={inputClass} type="date" value={String(form.expireDate ?? '')} onChange={(e) => updateForm('expireDate', e.target.value)} /></Field>
          <Field label={copy('下次续费', 'Next renewal')}><input className={inputClass} type="date" value={String(form.nextDueDate ?? '')} onChange={(e) => updateForm('nextDueDate', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('计费周期', 'Billing cycle')}><select className={inputClass} value={String(form.billingCycle)} onChange={(e) => updateForm('billingCycle', e.target.value)}>{domainCycles.map((value) => <option key={value} value={value}>{formatCycle(value)}</option>)}</select></Field>
          <Field label={copy('金额', 'Amount')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.amount ?? '')} onChange={(e) => updateForm('amount', e.target.value)} /></Field>
        </div>
        <Field label={copy('币种', 'Currency')}><select className={inputClass} value={String(form.currency)} onChange={(e) => updateForm('currency', e.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
      </Section>

      <Section title={copy('状态与备注', 'Status and notes')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">ON</option><option value="false">OFF</option></select></Field>
        </div>
        <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
        <Field label={copy('用途', 'Purpose')}><input className={inputClass} value={String(form.purpose ?? '')} onChange={(e) => updateForm('purpose', e.target.value)} placeholder={copy('主站 / 邮箱 / 停放 / 转售', 'Main site / email / parking / resale')} /></Field>
        <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="brand, infra, rare" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

function ProviderJump({ label, href, empty }: { label: string; href?: string; empty: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400">
          <span className="truncate">{new URL(href).hostname}</span>
          <ExternalLink size={13} />
        </a>
      ) : (
        <div className="mt-1 truncate text-sm text-slate-400">{empty}</div>
      )}
    </div>
  );
}

function PhoneCardView({
  item,
  duplicated,
  duplicating,
  copiedNumber,
  onCopyNumber,
  onDuplicate,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  duplicated: boolean;
  duplicating: boolean;
  copiedNumber: boolean;
  onCopyNumber: (item: AssetItem) => void;
  onDuplicate: (item: AssetItem) => void;
  onEdit: (item: AssetItem) => void;
  onDelete: (item: AssetItem) => void;
  copy: (zh: string, en: string) => string;
}) {
  const isForeign = stringValue(item.phoneType) === 'foreign';
  const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
  const left = daysLeft(dueDate || null);
  const duplicateTitle = duplicated
    ? copy('已复制条目', 'Entry duplicated')
    : duplicating
      ? copy('复制中', 'Duplicating')
      : copy('复制条目', 'Duplicate entry');
  return (
    <div className="motion-card card-hover group relative overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex max-w-full items-center gap-2">
            <h3 className="truncate font-mono text-lg font-semibold text-slate-950 dark:text-white">{getPhoneDisplayNumber(item)}</h3>
            <button
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${copiedNumber ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
              onClick={() => onCopyNumber(item)}
              title={copy('复制号码', 'Copy number')}
              aria-label={copy('复制号码', 'Copy number')}
            >
              {copiedNumber ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${isForeign ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-success-500/10 text-success-600 dark:text-success-300'}`}>
              {isForeign ? copy('国外', 'Foreign') : copy('国内', 'Domestic')}
            </span>
            {isForeign && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{getSimFormFactorLabel(item, copy)}</span>}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-slate-500">{stringValue(item.carrier) || '-'}</span>
            {isForeign ? (
              <span className="shrink-0 rounded-md bg-brand-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-600 dark:text-brand-300">{getPhoneCountryCode(item)}</span>
            ) : (
              <span className="shrink-0 rounded-md bg-success-500/10 px-1.5 py-0.5 text-xs font-semibold text-success-700 dark:text-success-300">{stringValue(item.userName) || stringValue(item.realNamePerson) || '-'}</span>
            )}
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-slate-500">{copy('月花费', 'Monthly cost')}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-slate-500">{isForeign ? copy('保号截止', 'Keepalive until') : copy('套餐资源', 'Plan usage')}</p>
          <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-950 dark:text-white">
            {isForeign ? compactDate(stringValue(item.totalKeepaliveUntil)) : `${Number(item.dataAllowanceGb ?? 0) || '-'}G / ${Number(item.voiceMinutes ?? 0) || '-'}min`}
          </p>
        </div>
      </div>

      {left !== null && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
          <span className="text-slate-500">{copy('下次扣费', 'Next payment')}</span>
          <span className={`font-mono font-semibold ${dueTone(left)}`}>{compactDate(dueDate)} · {left}d</span>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-1 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <button
          onClick={() => onDuplicate(item)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${duplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
          title={duplicateTitle}
          aria-label={duplicateTitle}
          disabled={duplicating}
        >
          {duplicated ? <Check size={14} /> : <Copy className={duplicating ? 'animate-pulse' : ''} size={14} />}
        </button>
        <button onClick={() => onEdit(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function AssetCardView({
  item,
  config,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  config: AssetPageConfig;
  onEdit: (item: AssetItem) => void;
  onDelete: (item: AssetItem) => void;
  copy: (zh: string, en: string) => string;
}) {
  const isBuyout = config.endpoint === 'subscriptions' && item.purchaseType === 'buyout';
  const dueDate = isBuyout ? '' : String(item[config.dueKey] ?? item.nextDueDate ?? item.expireDate ?? '');
  const left = daysLeft(dueDate || null);
  return (
    <div className="motion-card card-hover group relative">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-slate-950 dark:text-white">{getText(item, config.primaryKey)}</h3>
          <p className="mt-1 truncate text-sm text-slate-500">{isBuyout ? `${copy('买断制', 'Buyout')} · ${getText(item, config.secondaryKey)}` : getText(item, config.secondaryKey)}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</p>
          <p className="mt-1 text-xs text-slate-500">{isBuyout ? copy('一次性买断', 'One-time purchase') : `${formatCycle(item.billingCycle)} · ${item.autoRenew ? copy('自动续费', 'Auto renew') : copy('手动续费', 'Manual renewal')}`}</p>
        </div>
        {left !== null && (
          <div className={`text-right font-mono text-sm font-semibold ${dueTone(left)}`}>
            {left}d
            <p className="font-sans text-[11px] font-normal text-slate-400">{compactDate(dueDate)}</p>
          </div>
        )}
      </div>
      {item.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => <span key={tag} className="rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 dark:border-white/10">{tag}</span>)}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-1 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        {item.renewalUrl && (
          <a href={item.renewalUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/[0.06]" title={copy('打开续费链接', 'Open renewal link')}>
            <ExternalLink size={14} />
          </a>
        )}
        <button onClick={() => onEdit(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function initialForm(config: AssetPageConfig): FormState {
  const base: FormState = {
    amount: '',
    currency: 'CNY',
    billingCycle: config.endpoint === 'domains' ? 'annual' : 'monthly',
    nextDueDate: '',
    status: 'active',
    autoRenew: true,
    paymentMethod: '',
    renewalUrl: '',
    tags: '',
    notes: ''
  };
  for (const field of config.fields) base[field.key] = '';
  if (config.endpoint === 'domains') {
    base.domainPrefix = '';
    base.domainExtension = '.com';
  }
  if (config.endpoint === 'phones') {
    base.phoneType = 'domestic';
    base.isSecondaryCard = false;
    base.isEsim = false;
    base.billingCycle = 'monthly';
  }
  if (config.endpoint === 'vps') {
    base.vpsType = '';
    base.sshPort = '22';
    base.sshUser = 'root';
    base.sshAuthType = 'password';
    base.probePort = '9100';
  }
  if (config.endpoint === 'subscriptions') {
    base.purchaseType = 'subscription';
  }
  return base;
}

function assetToForm(config: AssetPageConfig, item: AssetItem): FormState {
  const base = initialForm(config);
  for (const field of config.fields) {
    const value = item[field.key];
    base[field.key] = field.key.endsWith('MinorUnits') && typeof value === 'number'
      ? (value / 100).toFixed(2)
      : field.key === 'isSecondaryCard' || field.key === 'isEsim'
        ? Boolean(value)
        : String(value ?? '');
  }
  if (config.endpoint === 'domains') {
    const extension = normalizeDomainExtension(item.domainExtension || inferDomainExtension(item.domainName)) || '.com';
    const prefix = domainPrefix(item.domainName, extension);
    base.domainPrefix = prefix;
    base.domainName = composeDomainName(prefix, extension);
    base.domainExtension = extension;
  }
  const result: FormState = {
    ...base,
    amount: (item.amountMinorUnits / 100).toFixed(2),
    currency: item.currency,
    billingCycle: item.billingCycle,
    nextDueDate: item.nextDueDate ?? '',
    status: item.status,
    autoRenew: item.autoRenew,
    paymentMethod: item.paymentMethod ?? '',
    renewalUrl: item.renewalUrl ?? '',
    tags: item.tags.join(', '),
    notes: item.notes ?? ''
  };
  if (config.endpoint === 'domains') {
    applyDomainLifecycleDefaults(result);
  }
  if (config.endpoint === 'vps') {
    result.expireDate = item.expireDate ?? item.nextDueDate ?? '';
    result.sshPassword = '';
    result.sshPrivateKey = '';
    result.sshPrivateKeyPassphrase = '';
    result.probeApiKey = '';
  }
  return result;
}

function formToPayload(config: AssetPageConfig, form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    amountMinorUnits: Math.round(Number(form.amount || 0) * 100),
    currency: form.currency,
    billingCycle: form.billingCycle,
    nextDueDate: nil(form.nextDueDate),
    status: form.status,
    autoRenew: Boolean(form.autoRenew),
    paymentMethod: nil(form.paymentMethod),
    renewalUrl: nil(form.renewalUrl),
    tags: String(form.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
    notes: nil(form.notes)
  };
  for (const field of config.fields) {
    const value = form[field.key];
    if (field.key === 'domainExtension') {
      payload[field.key] = normalizeDomainExtension(value) || null;
    } else if (field.key === 'rarityScore') {
      payload[field.key] = Math.max(0, Math.min(100, Number(value || 0)));
    } else if (field.key === 'isSecondaryCard' || field.key === 'isEsim') {
      payload[field.key] = Boolean(value);
    } else if (field.key.endsWith('MinorUnits')) {
      payload[field.key] = value === '' ? null : Math.round(Number(value || 0) * 100);
    } else {
      payload[field.key] = field.type === 'number' ? (value === '' ? null : Number(value)) : nil(value);
    }
  }
  if (config.endpoint === 'domains') {
    const extension = normalizeDomainExtension(form.domainExtension) || '.com';
    const lifecycle = getDomainLifecycle(form);
    payload.domainName = composeDomainName(getDomainPrefixFromForm(form, extension), extension);
    payload.domainExtension = extension;
    payload.lastRenewDate = nil(lifecycle.lastRenewDate);
    payload.expireDate = nil(lifecycle.expireDate);
    payload.nextDueDate = nil(lifecycle.nextDueDate);
  }
  if (config.endpoint === 'vps') {
    payload.startDate = null;
    payload.nextDueDate = null;
    payload.sshHost = nil(form.ipAddress);
    payload.sshCommand = nil(form.sshCommand || buildSshCommand(form));
    for (const key of ['sshPassword', 'sshPrivateKey', 'sshPrivateKeyPassphrase', 'probeApiKey']) {
      if (!stringValue(payload[key])) delete payload[key];
    }
  }
  if (config.endpoint === 'subscriptions') {
    payload.category = null;
    if (payload.purchaseType === 'buyout') {
      payload.account = null;
      payload.billingCycle = 'annual';
      payload.nextDueDate = null;
      payload.autoRenew = false;
      payload.renewalUrl = null;
    }
  }
  return payload;
}

function nil(value: unknown): string | null | boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim();
  return text || null;
}

function formatMoneyTotals(values?: Partial<Record<Currency, number>>): string {
  const entries = currencies
    .map((currency) => [currency, Number(values?.[currency] ?? 0)] as const)
    .filter(([, amount]) => amount > 0);
  if (entries.length === 0) return formatMoney(0, 'CNY');
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' / ');
}

function formatDisplayMoney(item: AssetItem): string {
  if (typeof item.displayAmountMinorUnits === 'number' && item.displayCurrency) {
    return formatMoney(item.displayAmountMinorUnits, item.displayCurrency);
  }
  return formatMoney(item.amountMinorUnits, item.currency);
}

function formatRegistrarAccountOption(option: RegistrarAccountOption, copy: (zh: string, en: string) => string): string {
  const registrar = option.registrar || copy('未记录服务商', 'No registrar');
  const suffix = option.count > 1 ? ` (${option.count})` : '';
  return `${registrar}-${option.account}${suffix}`;
}

function getStoredPhoneVisualStyle(): PhoneVisualStyleKey {
  const stored = localStorage.getItem('moneypulse-phone-visual-style');
  return phoneVisualStyles.some((item) => item.key === stored) ? stored as PhoneVisualStyleKey : 'nebula';
}

function getStoredPhoneVisualAccent(): PhoneVisualAccentKey {
  const stored = localStorage.getItem('moneypulse-phone-visual-accent');
  return phoneVisualAccents.some((item) => item.key === stored) ? stored as PhoneVisualAccentKey : 'cyan';
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((char) => `${char}${char}`).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function countBy(items: AssetItem[], getName: (item: AssetItem) => string): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = getName(item) || '-';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function carrierColor(carrier: string, fallback: string): string {
  if (carrier.includes('移动')) return '#38bdf8';
  if (carrier.includes('联通')) return '#f97316';
  if (carrier.includes('电信')) return '#22c55e';
  return fallback;
}

function getMonitorStatus(item: AssetItem, state?: VpsMonitorState): string {
  return state?.monitor?.status || stringValue(item.monitorStatus) || (stringValue(item.probeUrl) ? 'unknown' : 'not-configured');
}

function getMonitorNumber(
  item: AssetItem,
  state: VpsMonitorState | undefined,
  itemKey: string,
  monitorKey: keyof VpsMonitorSnapshot
): number | null {
  const liveValue = state?.monitor?.[monitorKey];
  if (typeof liveValue === 'number' && Number.isFinite(liveValue)) return liveValue;
  return numberValue(item[itemKey]);
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatPercent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value * 10) / 10}%`;
}

function percentColor(value: number | null): string {
  if (value === null) return 'brand';
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'success';
}

function formatBps(value: number | null): string {
  if (value === null) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} Gbps`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} Kbps`;
  return `${Math.round(value)} bps`;
}

function formatBytes(value: number | null): string {
  if (value === null) return '-';
  if (value >= 1_099_511_627_776) return `${(value / 1_099_511_627_776).toFixed(2)} TB`;
  if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(2)} GB`;
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

function formatUptime(value: number | null): string {
  if (value === null) return '-';
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatMonitorUpdatedAt(value: string): string {
  if (!value) return '-';
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, '').slice(0, 16);
}

function formatMonitorStatus(status: string, copy: (zh: string, en: string) => string): string {
  if (status === 'online') return copy('在线', 'Online');
  if (status === 'offline') return copy('离线', 'Offline');
  if (status === 'not-configured') return copy('未配置', 'No probe');
  return copy('等待', 'Pending');
}

function formatVpsType(value: unknown, copy: (zh: string, en: string) => string): string {
  const type = vpsTypes.find((option) => option.value === stringValue(value));
  return type ? copy(type.labelZh, type.labelEn) : copy('未分类', 'Uncategorized');
}

function monitorBadgeClass(status: string): string {
  if (status === 'online') return 'border-success-500/25 bg-success-500/10 text-success-600 dark:text-success-400';
  if (status === 'offline') return 'border-danger-500/25 bg-danger-500/10 text-danger-600 dark:text-danger-400';
  return 'border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-400';
}

function getSshCommand(item: Record<string, unknown>): string {
  return stringValue(item.sshCommand) || buildSshCommand(item);
}

function buildSshCommand(values: Record<string, unknown>): string {
  const host = textValue(values.sshHost) || textValue(values.ipAddress);
  if (!host) return '';
  const user = textValue(values.sshUser);
  const port = textValue(values.sshPort);
  const target = user ? `${user}@${host}` : host;
  return port && port !== '22' ? `ssh ${target} -p ${port}` : `ssh ${target}`;
}

function normalizeDomesticCarrier(value: unknown, copy: (zh: string, en: string) => string): string {
  const carrier = stringValue(value);
  if (carrier.includes('移动') || carrier.toLowerCase().includes('mobile')) return '移动';
  if (carrier.includes('联通') || carrier.toLowerCase().includes('unicom')) return '联通';
  if (carrier.includes('电信') || carrier.toLowerCase().includes('telecom')) return '电信';
  return carrier || copy('未记录运营商', 'No carrier');
}

function getPhoneCountryCode(item: AssetItem): string {
  if (stringValue(item.phoneType) !== 'foreign') return 'CN';
  const homeLocation = stringValue(item.homeLocation).toUpperCase();
  if (homeLocation) return normalizeCountryShortName(homeLocation);
  const countryCode = stringValue(item.countryCode).replace(/^\+/, '');
  const byDialCode: Record<string, string> = {
    '1': 'US',
    '44': 'UK',
    '49': 'DE',
    '81': 'JP',
    '82': 'KR',
    '852': 'HK',
    '853': 'MAC',
    '886': 'TW'
  };
  return byDialCode[countryCode] || countryCode || '-';
}

function getSimFormFactorLabel(item: AssetItem, copy: (zh: string, en: string) => string): string {
  return Boolean(item.isEsim) ? copy('eSIM', 'eSIM') : copy('实体 SIM', 'Physical SIM');
}

function getPhoneDisplayNumber(item: AssetItem): string {
  const number = stringValue(item.aPhoneNumber) || stringValue(item.cardNumber) || stringValue(item.poPhoneNumber);
  if (!number) return '-';
  if (stringValue(item.phoneType) !== 'foreign') return number;
  const countryCode = stringValue(item.countryCode).replace(/^\+/, '');
  if (!countryCode || number.startsWith('+')) return number;
  const normalizedNumber = number.replace(/^0+/, '');
  return `+${countryCode} ${normalizedNumber}`;
}

function normalizeCountryShortName(value: string): string {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    HONGKONG: 'HK',
    'HONG KONG': 'HK',
    MACAO: 'MAC',
    MACAU: 'MAC',
    MO: 'MAC',
    GB: 'UK',
    UNITEDKINGDOM: 'UK',
    'UNITED KINGDOM': 'UK',
    UNITEDSTATES: 'US',
    'UNITED STATES': 'US',
    USA: 'US'
  };
  return aliases[normalized] || normalized;
}

function updatePhoneCostFields(next: FormState, key: string): void {
  if (!['monthlyRentMinorUnits', 'attachedServicesMinorUnits', 'discountMinorUnits', 'cashbackMinorUnits'].includes(key)) return;
  const rent = numberValue(next.monthlyRentMinorUnits) ?? 0;
  const attachedServices = numberValue(next.attachedServicesMinorUnits) ?? 0;
  const discount = numberValue(next.discountMinorUnits) ?? 0;
  const cashback = numberValue(next.cashbackMinorUnits) ?? 0;
  next.amount = String(Math.max(rent + attachedServices - discount - cashback, 0));
}

function getSshHref(item: Record<string, unknown>): string {
  return getSshHrefFromValues(item.sshHost || item.ipAddress, item.sshUser, item.sshPort);
}

function getSshHrefFromValues(hostValue: unknown, userValue: unknown, portValue: unknown): string {
  const host = textValue(hostValue);
  if (!host) return '';
  const user = textValue(userValue);
  const port = textValue(portValue);
  const userPart = user ? `${encodeURIComponent(user)}@` : '';
  const portPart = port && port !== '22' ? `:${encodeURIComponent(port)}` : '';
  return `ssh://${userPart}${host}${portPart}`;
}

function updateVpsSshFields(current: FormState, next: FormState, key: string): void {
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

function generateClientProbeApiKey(): string {
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

function getDomainPrefixFromForm(form: FormState, extension: string): string {
  return typeof form.domainPrefix === 'string' ? form.domainPrefix : domainPrefix(form.domainName, extension);
}

function updateDomainLifecycleFields(current: FormState, next: FormState, key: string): void {
  const currentRegisterDate = stringValue(current.registerDate);
  if (key === 'registerDate') {
    const currentLastRenewDate = stringValue(current.lastRenewDate);
    if (!currentLastRenewDate || currentLastRenewDate === currentRegisterDate) {
      next.lastRenewDate = stringValue(next.registerDate);
    }
  }

  if (key === 'registerDate' || key === 'lastRenewDate' || key === 'billingCycle') {
    const expireDate = calculateDomainExpireDate(next);
    if (expireDate) {
      next.expireDate = expireDate;
      next.nextDueDate = expireDate;
    }
  }

  if (key === 'expireDate') {
    next.nextDueDate = stringValue(next.expireDate);
  }
}

function applyDomainLifecycleDefaults(form: FormState): void {
  const lifecycle = getDomainLifecycle(form);
  form.lastRenewDate = lifecycle.lastRenewDate;
  form.expireDate = lifecycle.expireDate;
  form.nextDueDate = lifecycle.nextDueDate;
}

function getDomainLifecycle(form: FormState) {
  const lastRenewDate = stringValue(form.lastRenewDate) || stringValue(form.registerDate);
  const calculatedExpireDate = calculateDomainExpireDate({ ...form, lastRenewDate });
  const expireDate = stringValue(form.expireDate) || calculatedExpireDate;
  const nextDueDate = stringValue(form.nextDueDate) || expireDate;
  return { lastRenewDate, expireDate, nextDueDate };
}

function calculateDomainExpireDate(form: FormState): string {
  const anchorDate = stringValue(form.lastRenewDate) || stringValue(form.registerDate);
  return anchorDate ? addBillingCycleToDate(anchorDate, normalizeBillingCycle(form.billingCycle)) : '';
}

function addBillingCycleToDate(dateValue: string, cycle: BillingCycle): string {
  const months = cycle === 'biennial' ? 24 : cycle === 'annual' ? 12 : cycle === 'quarterly' ? 3 : 1;
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return [
    targetYear,
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0')
  ].join('-');
}

function normalizeBillingCycle(value: unknown): BillingCycle {
  return value === 'quarterly' || value === 'annual' || value === 'biennial' ? value : 'monthly';
}

function getText(item: AssetItem, key: string) {
  return String(item[key] ?? '-');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
