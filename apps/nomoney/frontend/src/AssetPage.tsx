import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, CalendarClock, Check, Copy, ExternalLink, Grid3X3, Link2, List, Pencil, Plus, RefreshCw, Search, ShieldCheck, Terminal, Trash2, X } from 'lucide-react';
import type { AssetPageConfig } from './assetConfig';
import { useLayoutActions } from './Layout';
import type { AssetItem, Currency, ListMeta, ListResponse } from './types';
import { api, ApiError } from './api';
import { compactDate, daysLeft, dueTone, formatCycle, formatMoney, currencies } from './format';
import { Button, DataTable, Drawer, EmptyState, Field, IconButton, Skeleton, StateBanner, StatusBadge, inputClass, type DataTableColumn } from './ui';
import { commonDomainExtensions, composeDomainName, dnsProviderLink, domainLink, domainPrefix, findDnsProviderProfile, findRegistrarProfile, inferDomainExtension, normalizeDomainExtension, stringValue } from './domainRegistrars';
import { useI18n } from './i18n';
import { getDefaultCurrency } from './preferences';
import { RenewalHistory, RenewalToast, RenewButton, useRenewals } from './renewals';
import { BulkBar, CsvTools } from './BulkTools';
import { assetLabel, assetSingular } from './assetConfigLabels';
import { cycles, vpsTypes, statusOptions, monthlyEquivalent, formatDisplayMoney, numberValue, getText, Section, AssetCardView, SubscriptionFormSections, formatPercent, type FormState } from './asset-page/shared';
import { PhoneCommandPanel, PhoneVisualDashboard, PhoneFormSections, PhoneMiniCardView, PhoneCardView, LinkedAccountsBadge, normalizeDomesticCarrier, getPhoneCountryCode, getSimFormFactorLabel, getPhoneDisplayNumber, updatePhoneCostFields, type PhoneStats } from './asset-page/phone';
import { vpsMonitorRefreshIntervalMs, VpsCommandPanel, VpsNodeCard, MonitorDot, VpsFormSections, getMonitorStatus, getMonitorNumber, formatBps, getSshCommand, updateVpsSshFields, type VpsMonitorResponse, type VpsActionResponse, type VpsMonitorState, type VpsActionState, type VpsStats } from './asset-page/vps';
import { domainSortOptions, DomainCommandPanel, DomainCardView, describeDomainCheck, DomainMiniCardView, DomainFormSections, formatRegistrarAccountOption, getDomainPrefixFromForm, updateDomainLifecycleFields, type DomainCheckResponse } from './asset-page/domain';
import { duplicateForm, initialForm, assetToForm, formToPayload } from './asset-page/forms';

const pageSizes = [24, 48, 96];

const filterClass = `${inputClass} !w-auto min-w-[120px] flex-[0_1_auto]`;

const assetSortOptions = [
  { value: 'dueDate', labelZh: '到期 / 扣费日', labelEn: 'Due date' },
  { value: 'amount', labelZh: '费用', labelEn: 'Cost' },
  { value: 'name', labelZh: '名称', labelEn: 'Name' },
  { value: 'createdAt', labelZh: '添加时间', labelEn: 'Date added' }
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
  const assetSummary = meta?.assetSummary;
  const [loading, setLoading] = useState(true);
  // Filters, sort, page and view live in the URL so reloads, bookmarks and the back button keep them.
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const param = (key: string, fallback = '') => initialParams.get(key) ?? fallback;
  const viewStorageKey = `nomoney:view:${config.endpoint}`;
  const [view, setView] = useState<'card' | 'compact' | 'table'>(() => {
    const stored = param('view') || localStorage.getItem(viewStorageKey) || 'card';
    return stored === 'table' || stored === 'compact' ? stored : 'card';
  });
  const [query, setQuery] = useState(() => param('q'));
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState(() => param('status'));
  const [vpsType, setVpsType] = useState(() => isVps ? param('type') : '');
  const [monitorStatus, setMonitorStatus] = useState(() => param('online'));
  const [currency, setCurrency] = useState(() => param('currency'));
  const [billingCycle, setBillingCycle] = useState(() => param('cycle'));
  const [phoneType, setPhoneType] = useState(() => isPhone ? param('type', 'domestic') : '');
  const [purchaseType, setPurchaseType] = useState(() => isSubscription ? param('type', 'subscription') : '');
  const [category, setCategory] = useState(() => param('category'));
  const [tag, setTag] = useState(() => param('tag'));
  const [domainExtension, setDomainExtension] = useState(() => param('ext'));
  const [registrarAccount, setRegistrarAccount] = useState(() => param('account'));
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(() => (param('display') as Currency) || getDefaultCurrency());
  const defaultSort = isDomain ? 'expireDate' : 'dueDate';
  const [sort, setSort] = useState(() => param('sort', defaultSort));
  const [direction, setDirection] = useState<'asc' | 'desc'>(() => param('dir') === 'desc' ? 'desc' : 'asc');
  const [pageSize, setPageSize] = useState(() => pageSizes.includes(Number(param('size'))) ? Number(param('size')) : Number(localStorage.getItem('nomoney:page-size')) || 24);
  const [offset, setOffset] = useState(() => Math.max(0, (Number(param('page', '1')) || 1) - 1) * pageSize);
  const [pendingEditId] = useState(() => Number(param('edit')) || null);
  const mounted = useRef(false);
  const [editing, setEditing] = useState<AssetItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(config));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const formSnapshot = useRef('');
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [duplicatedId, setDuplicatedId] = useState<number | null>(null);
  const [copiedPhoneNumberId, setCopiedPhoneNumberId] = useState<number | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [monitorById, setMonitorById] = useState<Record<number, VpsMonitorState>>({});
  const [refreshingVps, setRefreshingVps] = useState(false);
  const [autoRefreshVps, setAutoRefreshVps] = useState(true);
  const vpsRefreshesInFlight = useRef(new Set<number>());
  const [copiedSshId, setCopiedSshId] = useState<number | null>(null);
  const [copiedVpsIpId, setCopiedVpsIpId] = useState<number | null>(null);
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

  const copyVpsIpAddress = async (item: AssetItem) => {
    const address = stringValue(item.ipAddress) || stringValue(item.sshHost);
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedVpsIpId(item.id);
      window.setTimeout(() => {
        setCopiedVpsIpId((current) => current === item.id ? null : current);
      }, 1400);
    } catch {
      setError(copy('复制 IP 地址失败。', 'Failed to copy IP address.'));
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

  const load = async (nextOffset = offset, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (deferredQuery.trim()) params.set('q', deferredQuery.trim());
    if (!isPhoneVisual && !isVps && status) params.set('status', status);
    if (isVps && vpsType) params.set('vpsType', vpsType);
    if (isVps && monitorStatus) params.set('monitorStatus', monitorStatus);
    if (isSubscription && category) params.set('category', category);
    if (tag) params.set('tag', tag);
    if (!isPhoneVisual && currency) params.set('currency', currency);
    if (!isDomain && !isPhoneVisual && billingCycle) params.set('billingCycle', billingCycle);
    if (isPhone && (phoneType === 'domestic' || phoneType === 'foreign')) params.set('phoneType', phoneType);
    if (isSubscription && purchaseType) params.set('purchaseType', purchaseType);
    if (isDomain && domainExtension) params.set('domainExtension', domainExtension);
    if (isDomain && registrarAccount.trim()) params.set('registrarAccount', registrarAccount.trim());
    if (isDomain) params.set('displayCurrency', displayCurrency);
    if (sort) params.set('sort', sort);
    if (direction) params.set('direction', direction);
    // The visual board summarises every card, so it asks for the API maximum in one page.
    params.set('limit', String(isPhoneVisual ? 200 : pageSize));
    params.set('offset', String(nextOffset));
    const response = await api.get<ListResponse<AssetItem>>(`/api/${config.endpoint}?${params}`, signal);
    setItems(response.items);
    setMeta(response.meta ?? null);
    setSelectedIds((current) => new Set(response.items.filter((item) => current.has(item.id)).map((item) => item.id)));
    setLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    load(offset, controller.signal).catch((err) => {
      if (controller.signal.aborted) return;
      setError(err instanceof ApiError ? err.message : copy('加载失败', 'Failed to load'));
      setLoading(false);
    });
    return () => controller.abort();
  }, [config.endpoint, deferredQuery, status, vpsType, monitorStatus, currency, billingCycle, phoneType, purchaseType, category, tag, domainExtension, registrarAccount, displayCurrency, sort, direction, offset, pageSize]);

  useEffect(() => {
    const params = new URLSearchParams();
    const set = (key: string, value: string, fallback = '') => { if (value && value !== fallback) params.set(key, value); };
    set('q', query.trim());
    set('status', status);
    set('type', isVps ? vpsType : isPhone ? phoneType : isSubscription ? purchaseType : '', isPhone ? 'domestic' : isSubscription ? 'subscription' : '');
    set('online', monitorStatus);
    set('currency', currency);
    set('cycle', billingCycle);
    set('category', category);
    set('tag', tag);
    set('ext', domainExtension);
    set('account', registrarAccount);
    set('display', isDomain ? displayCurrency : '', getDefaultCurrency());
    set('sort', sort, defaultSort);
    set('dir', direction, 'asc');
    set('page', offset > 0 ? String(Math.floor(offset / pageSize) + 1) : '');
    set('size', String(pageSize), '24');
    set('view', view, 'card');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', next);
    localStorage.setItem(viewStorageKey, view);
    localStorage.setItem('nomoney:page-size', String(pageSize));
  }, [query, status, vpsType, monitorStatus, currency, billingCycle, phoneType, purchaseType, category, tag, domainExtension, registrarAccount, displayCurrency, sort, direction, offset, view, pageSize]);

  useEffect(() => {
    if (!pendingEditId) return;
    api.get<{ item: AssetItem }>(`/api/${config.endpoint}/${pendingEditId}`)
      .then((response) => openEdit(response.item))
      .catch(() => setError(copy('找不到要打开的条目，可能已删除。', 'The requested entry was not found; it may have been deleted.')));
  }, [pendingEditId]);

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
    // The first run is the mount, where the page number came from the URL.
    if (!mounted.current) return;
    setOffset(0);
  }, [config.endpoint, deferredQuery, status, vpsType, monitorStatus, currency, billingCycle, phoneType, purchaseType, category, tag, domainExtension, registrarAccount, displayCurrency, sort, direction, pageSize]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setTag('');
    setCategory('');
    setMonitorStatus('');
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
    setCopiedVpsIpId(null);
    setVpsActionById({});
    setDuplicatingId(null);
    setDuplicatedId(null);
    setCopiedPhoneNumberId(null);
    setForm(initialForm(config));
  }, [config]);

  const phoneStats = useMemo<PhoneStats | null>(() => {
    if (!isPhone) return null;
    if (assetSummary?.phone) {
      const normalizedCarriers = new Map<string, number>();
      for (const entry of assetSummary.phone.carrierCounts) {
        const carrier = normalizeDomesticCarrier(entry.carrier, copy);
        normalizedCarriers.set(carrier, (normalizedCarriers.get(carrier) ?? 0) + entry.count);
      }
      const orderedCarriers = ['移动', '联通', '电信'];
      const carrierCounts = orderedCarriers
        .map((carrier) => ({ carrier, count: normalizedCarriers.get(carrier) ?? 0 }))
        .concat([...normalizedCarriers.entries()]
          .filter(([carrier]) => !orderedCarriers.includes(carrier))
          .map(([carrier, count]) => ({ carrier, count }))
          .sort((a, b) => b.count - a.count || a.carrier.localeCompare(b.carrier)));
      return { total: assetSummary.total, ...assetSummary.phone, carrierCounts };
    }
    const carrierCounts = new Map<string, number>();
    const foreignCountryCounts = new Map<string, number>();
    const monthlyTotal: Partial<Record<Currency, number>> = {};
    const domesticMonthlyTotal: Partial<Record<Currency, number>> = {};
    let domestic = 0;
    let foreign = 0;
    let activeCount = 0;
    let riskWithin30Days = 0;
    let riskWithin60Days = 0;
    for (const item of items) {
      if (stringValue(item.phoneType) === 'foreign') {
        foreign += 1;
        const country = getPhoneCountryCode(item);
        foreignCountryCounts.set(country, (foreignCountryCounts.get(country) ?? 0) + 1);
      } else {
        domestic += 1;
        const carrier = normalizeDomesticCarrier(item.carrier, copy);
        carrierCounts.set(carrier, (carrierCounts.get(carrier) ?? 0) + 1);
        const itemCurrency = (item.currency || 'CNY') as Currency;
        domesticMonthlyTotal[itemCurrency] = (domesticMonthlyTotal[itemCurrency] ?? 0) + monthlyEquivalent(Number(item.amountMinorUnits ?? 0), item.billingCycle);
      }
      const itemCurrency = (item.currency || 'CNY') as Currency;
      monthlyTotal[itemCurrency] = (monthlyTotal[itemCurrency] ?? 0) + monthlyEquivalent(Number(item.amountMinorUnits ?? 0), item.billingCycle);
      if (item.status === 'active') activeCount += 1;
      const dueDate = stringValue(item.totalKeepaliveUntil) || stringValue(item.nextDueDate) || stringValue(item.expireDate);
      const left = daysLeft(dueDate || null);
      if (left !== null && left <= 30) riskWithin30Days += 1;
      if (left !== null && left <= 60) riskWithin60Days += 1;
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
    return {
      total: items.length,
      domestic,
      foreign,
      carrierCounts: normalizedCarrierCounts,
      foreignCountryCounts: normalizedCountryCounts,
      monthlyTotal,
      domesticMonthlyTotal,
      activeCount,
      riskWithin30Days,
      riskWithin60Days
    };
  }, [assetSummary, items, isPhone, copy]);

  const totals = useMemo(() => {
    if (assetSummary) {
      return { sum: assetSummary.totalsByCurrency, dueCount: assetSummary.dueWithin30Days };
    }
    const sum = items.reduce((acc, item) => acc + Number(item.amountMinorUnits ?? 0), 0);
    const dueCount = items.filter((item) => {
      const dueDate = isDomain
        ? String(item.nextDueDate ?? item.expireDate ?? '')
        : String(item[config.dueKey] ?? item.nextDueDate ?? item.expireDate ?? '');
      const left = daysLeft(dueDate || null);
      return left !== null && left <= 30;
    }).length;
    return { sum, dueCount };
  }, [assetSummary, items, config.dueKey, isDomain]);

  const domainStats = useMemo(() => {
    if (!isDomain) return null;
    if (assetSummary?.domain) return assetSummary.domain;
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
    const riskWithin30Days = items.filter((item) => {
      const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
      const left = daysLeft(dueDate || null);
      return left !== null && left <= 30;
    }).length;
    return { registrarCount, accountCount, topSuffix, autoRenewCount, riskWithin30Days };
  }, [assetSummary, items, isDomain]);

  const vpsStats = useMemo<VpsStats | null>(() => {
    if (!isVps) return null;
    if (assetSummary?.vps) return { total: assetSummary.total, ...assetSummary.vps };
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
      total: items.length,
      online,
      offline,
      configured,
      avgCpu: cpuCount > 0 ? Math.round((cpuTotal / cpuCount) * 10) / 10 : null,
      avgMemory: memoryCount > 0 ? Math.round((memoryTotal / memoryCount) * 10) / 10 : null,
      totalTrafficBytes,
      riskWithin30Days: items.filter((item) => {
        const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
        const left = daysLeft(dueDate || null);
        return left !== null && left <= 30;
      }).length
    };
  }, [assetSummary, items, isVps, monitorById]);

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
    openForm(null, nextForm);
  };

  const openEdit = (item: AssetItem) => {
    openForm(item, assetToForm(config, item));
  };

  const openForm = (item: AssetItem | null, nextForm: FormState) => {
    setEditing(item);
    setForm(nextForm);
    formSnapshot.current = JSON.stringify(nextForm);
    setFormError('');
    setDrawerOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = formToPayload(config, form);
      if (editing) await api.put(`/api/${config.endpoint}/${editing.id}`, payload);
      else await api.post(`/api/${config.endpoint}`, payload);
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : copy('保存失败', 'Failed to save'));
    } finally {
      setSubmitting(false);
    }
  };

  /** New VPS: create it, keep the drawer open on the saved entry, then run the SSH action. */
  const saveVpsThen = async (action: 'test' | 'install') => {
    const formElement = document.getElementById('asset-form') as HTMLFormElement | null;
    if (formElement && !formElement.reportValidity()) return;
    setFormError('');
    setSubmitting(true);
    let created: AssetItem;
    try {
      const response = await api.post<{ item: AssetItem }>(`/api/${config.endpoint}`, formToPayload(config, form));
      created = response.item;
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : copy('保存失败', 'Failed to save'));
      return;
    } finally {
      setSubmitting(false);
    }
    const nextForm = assetToForm(config, created);
    setEditing(created);
    setForm(nextForm);
    formSnapshot.current = JSON.stringify(nextForm);
    void load();
    if (action === 'test') await testVpsSsh(created);
    else await installVpsProbe(created, numberValue(form.probePort) ?? 9100);
  };

  const moveToTrash = async (item: AssetItem) => {
    const name = getText(item, config.primaryKey);
    const linked = Array.isArray(item.linkedAccounts) ? item.linkedAccounts.length : 0;
    const warning = linked ? copy(`\n\n这个号码上还登记着 ${linked} 个账号，换号前记得先迁移。`, `\n\n${linked} accounts are still registered on this number; move them before letting it go.`) : '';
    if (!window.confirm(copy(`将 ${name} 移入回收站？`, `Move ${name} to the recycle bin?`) + warning)) return;
    setError('');
    try {
      await api.delete(`/api/${config.endpoint}/${item.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('移入回收站失败', 'Failed to move to recycle bin'));
    }
  };

  const duplicateEntry = async (item: AssetItem) => {
    if (duplicatingId !== null) return;
    setError('');
    setDuplicatingId(item.id);
    try {
      await api.post(`/api/${config.endpoint}`, formToPayload(config, duplicateForm(config, assetToForm(config, item))));
      setDuplicatedId(item.id);
      window.setTimeout(() => {
        setDuplicatedId((current) => current === item.id ? null : current);
      }, 1400);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('复制条目失败', 'Failed to duplicate entry'));
    } finally {
      setDuplicatingId(null);
    }
  };

  const renewals = useRenewals({
    copy,
    onError: setError,
    onNeedsSetup: openEdit,
    onChanged: async () => {
      setError('');
      setHistoryKey((value) => value + 1);
      await load();
    }
  });
  const renewItem = (item: AssetItem) => renewals.renew(config.endpoint, item);
  const [checkingDomainId, setCheckingDomainId] = useState<number | null>(null);
  const [checkingAllDomains, setCheckingAllDomains] = useState(false);
  const [notice, setNotice] = useState('');
  const checkDomain = async (item: AssetItem) => {
    setCheckingDomainId(item.id);
    setError('');
    try {
      const response = await api.post<DomainCheckResponse>(`/api/domains/${item.id}/check`);
      setItems((current) => current.map((entry) => entry.id === item.id ? response.item : entry));
      setNotice(describeDomainCheck(response, copy));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('检查失败', 'Check failed'));
    } finally {
      setCheckingDomainId(null);
    }
  };
  const checkAllDomains = async () => {
    setCheckingAllDomains(true);
    setError('');
    try {
      const response = await api.post<{ rdap: Array<{ ok: boolean; updated?: boolean }>; certificates: Array<{ ok: boolean }> }>('/api/domains/check-all');
      const updated = response.rdap.filter((entry) => entry.updated).length;
      setNotice(copy(
        `已检查 ${response.rdap.length} 个域名：${updated} 个到期日已按注册局更新，${response.certificates.filter((entry) => entry.ok).length} 个读取到证书。`,
        `Checked ${response.rdap.length} domains: ${updated} expiry dates updated from the registry, ${response.certificates.filter((entry) => entry.ok).length} certificates read.`
      ));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('检查失败', 'Check failed'));
    } finally {
      setCheckingAllDomains(false);
    }
  };
  const domainCheckAction = (item: AssetItem) => (
    <button
      type="button"
      onClick={() => checkDomain(item)}
      disabled={checkingDomainId === item.id}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-brand-600 disabled:cursor-wait dark:hover:bg-white/[0.06]"
      title={copy('查询注册局到期日与 SSL 证书', 'Check registry expiry and TLS certificate')}
      aria-label={copy('查询注册局到期日与 SSL 证书', 'Check registry expiry and TLS certificate')}
    >
      <ShieldCheck className={checkingDomainId === item.id ? 'animate-pulse' : ''} size={14} />
    </button>
  );
  const duplicateAction = (item: AssetItem) => (
    <button
      type="button"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${duplicatedId === item.id ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
      onClick={() => duplicateEntry(item)}
      disabled={duplicatingId === item.id}
      title={copy('复制条目', 'Duplicate entry')}
      aria-label={copy('复制条目', 'Duplicate entry')}
    >
      {duplicatedId === item.id ? <Check size={14} /> : <Copy className={duplicatingId === item.id ? 'animate-pulse' : ''} size={14} />}
    </button>
  );
  const renewAction = (item: AssetItem) => (
    <RenewButton endpoint={config.endpoint} item={item} renewing={renewals.renewingId === item.id} onRenew={renewItem} copy={copy} />
  );

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
          <LinkedAccountsBadge item={item} copy={copy} />
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
          const isDuplicating = duplicatingId === item.id;
          const isDuplicated = duplicatedId === item.id;
          const title = isDuplicated
            ? copy('已复制条目', 'Entry duplicated')
            : isDuplicating
              ? copy('复制中', 'Duplicating')
              : copy('复制条目', 'Duplicate entry');
          return (
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${isDuplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
              onClick={() => duplicateEntry(item)}
              title={title}
              aria-label={title}
              disabled={isDuplicating}
            >
              {isDuplicated ? <Check size={14} /> : <Copy className={isDuplicating ? 'animate-pulse' : ''} size={14} />}
            </button>
          );
        })()}
        {renewAction(item)}
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
        {renewAction(item)}
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
          const isDuplicating = duplicatingId === item.id;
          const isDuplicated = duplicatedId === item.id;
          const title = isDuplicated
            ? copy('已复制条目', 'Entry duplicated')
            : isDuplicating
              ? copy('复制中', 'Duplicating')
              : copy('复制条目', 'Duplicate entry');
          return (
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${isDuplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
              onClick={() => duplicateEntry(item)}
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
        {renewAction(item)}
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
        {renewAction(item)}
        {duplicateAction(item)}
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)} title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => moveToTrash(item)} title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    ) }
  ];
  const baseColumns = isDomain ? domainColumns : isVps ? vpsColumns : isPhone ? phoneColumns : genericColumns;
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const selectColumn: DataTableColumn<AssetItem> = {
    key: 'select',
    header: <input type="checkbox" className="h-4 w-4 accent-brand-500" aria-label={copy('全选本页', 'Select page')} checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(items.map((item) => item.id)))} />,
    render: (item) => (
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand-500"
        aria-label={copy('选择', 'Select')}
        checked={selectedIds.has(item.id)}
        onChange={() => setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        })}
      />
    )
  };
  const columns = [selectColumn, ...baseColumns];
  const selectedItems = items.filter((item) => selectedIds.has(item.id));

  useEffect(() => {
    setTopbarActions(
      <>
        {isVps && (
          <Button variant="secondary" onClick={refreshAllVps} disabled={refreshingVps || items.every((item) => !stringValue(item.probeUrl))}>
            <RefreshCw className={refreshingVps ? 'animate-spin' : ''} size={16} />
            {copy('刷新监控', 'Refresh')}
          </Button>
        )}
        {isDomain && (
          <Button variant="secondary" onClick={checkAllDomains} disabled={checkingAllDomains}>
            <ShieldCheck className={checkingAllDomains ? 'animate-pulse' : ''} size={16} />
            {copy('同步到期日 / SSL', 'Sync expiry / TLS')}
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
                className={`h-9 rounded-lg px-3 text-sm font-medium transition-all ${phoneType === option.value ? 'bg-white text-brand-600 shadow-xs dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
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
                className={`h-9 rounded-lg px-3 text-sm font-medium transition-all ${purchaseType === option.value ? 'bg-white text-brand-600 shadow-xs dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <Button onClick={openCreate}><Plus size={16} />{isDomain ? copy('新增域名', 'Add domain') : isVps ? copy('新增 VPS', 'Add VPS') : isPhone ? copy('新增电话卡', 'Add phone card') : copy(`新增${config.singular}`, `Add ${assetSingular(config.singular, language)}`)}</Button>
      </>
    );
  }, [config.singular, copy, isDomain, isPhone, isSubscription, isVps, items, phoneType, purchaseType, refreshingVps, checkingAllDomains, setTopbarActions]);

  useEffect(() => {
    return () => setTopbarActions(null);
  }, [setTopbarActions]);

  // "/" focuses search and "n" opens a new entry, unless the user is typing somewhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || drawerOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'n') {
        event.preventDefault();
        openCreate();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="space-y-4">
      {isDomain && domainStats && <DomainCommandPanel stats={domainStats} renewalTotals={meta?.renewalTotals} copy={copy} />}
      {isVps && vpsStats && <VpsCommandPanel stats={vpsStats} autoRefresh={autoRefreshVps} onAutoRefreshChange={setAutoRefreshVps} copy={copy} />}
      {isPhone && !isPhoneVisual && phoneStats && <PhoneCommandPanel stats={phoneStats} copy={copy} />}

      {!isPhoneVisual && <section className="card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-[1_1_240px]">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
            <input ref={searchRef} className={`${inputClass} pl-9`} placeholder={isDomain ? copy('搜索域名 / 标签 / 备注', 'Search domains, tags, notes') : isVps ? copy('搜索节点 / IP / 服务商 / 标签', 'Search nodes, IPs, tags') : copy(`搜索${config.singular} / 标签 / 备注`, `Search ${assetSingular(config.singular, language)}s, tags, notes`)} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {isVps ? (
            <>
              <select className={filterClass} value={vpsType} onChange={(e) => setVpsType(e.target.value)} aria-label={copy('类型', 'Type')}>
                <option value="">{copy('全部类型', 'All types')}</option>
                {vpsTypes.map((option) => <option key={option.value} value={option.value}>{language === 'zh' ? option.labelZh : option.labelEn}</option>)}
              </select>
              <select className={filterClass} value={monitorStatus} onChange={(e) => setMonitorStatus(e.target.value)} aria-label={copy('在线状态', 'Online status')}>
                <option value="">{copy('全部状态', 'Any status')}</option>
                <option value="online">{copy('在线', 'Online')}</option>
                <option value="offline">{copy('离线', 'Offline')}</option>
                <option value="unknown">{copy('未接入探针', 'No probe')}</option>
              </select>
            </>
          ) : (
            <select className={filterClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={copy('状态', 'Status')}>
              <option value="">{copy('未归档', 'Not archived')}</option>
              {statusOptions(copy)}
            </select>
          )}
          {isSubscription && (meta?.categoryOptions?.length ?? 0) > 0 && (
            <select className={filterClass} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={copy('分类', 'Category')}>
              <option value="">{copy('全部分类', 'All categories')}</option>
              {meta?.categoryOptions?.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
          {((meta?.tagOptions?.length ?? 0) > 0 || tag) && (
            <select className={filterClass} value={tag} onChange={(e) => setTag(e.target.value)} aria-label={copy('标签', 'Tag')}>
              <option value="">{copy('全部标签', 'All tags')}</option>
              {tag && !meta?.tagOptions?.some((option) => option.tag === tag) && <option value={tag}>{tag}</option>}
              {meta?.tagOptions?.map((option) => <option key={option.tag} value={option.tag}>{option.tag} ({option.count})</option>)}
            </select>
          )}
          <select className={filterClass} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label={copy('币种', 'Currency')}>
            <option value="">{copy('全部币种', 'All currencies')}</option>
            {currencies.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          {!isDomain && (
            <select className={filterClass} value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} aria-label={copy('周期', 'Cycle')}>
              <option value="">{copy('全部周期', 'All cycles')}</option>
              {cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}
            </select>
          )}
          {isDomain && (
            <>
              <select className={filterClass} value={registrarAccount} onChange={(e) => setRegistrarAccount(e.target.value)} aria-label={copy('账号', 'Account')}>
                <option value="">{copy('全部账号', 'All accounts')}</option>
                {registrarAccount && !registrarAccountOptions.some((option) => option.value === registrarAccount) && (
                  <option value={registrarAccount}>{registrarAccount}</option>
                )}
                {registrarAccountOptions.map((option) => (
                  <option key={option.value} value={option.value}>{formatRegistrarAccountOption(option, copy)}</option>
                ))}
              </select>
              <input className={filterClass} list="domain-extension-options" placeholder={copy('全部后缀', 'All extensions')} value={domainExtension} onChange={(e) => setDomainExtension(e.target.value)} aria-label={copy('后缀', 'Extension')} />
              <datalist id="domain-extension-options">
                {commonDomainExtensions.map((value) => <option key={value} value={value} />)}
              </datalist>
              <select className={filterClass} value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as Currency)} aria-label={copy('统一币种', 'Total currency')}>
                {currencies.map((value) => <option key={value} value={value}>{copy(`统一 ${value}`, `Total in ${value}`)}</option>)}
              </select>
            </>
          )}
          <select className={filterClass} value={sort} onChange={(e) => setSort(e.target.value)} aria-label={copy('排序', 'Sort')}>
            {(isDomain ? domainSortOptions : assetSortOptions).map((item) => <option key={item.value} value={item.value}>{language === 'zh' ? item.labelZh : item.labelEn}</option>)}
          </select>
          <IconButton
            onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
            title={direction === 'asc' ? copy('升序', 'Ascending') : copy('降序', 'Descending')}
          >
            {direction === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
          </IconButton>
          <div className="ml-auto flex gap-1">
            <CsvTools endpoint={config.endpoint} copy={copy} onError={setError} onImported={async (message) => { setNotice(message); await load(); }} />
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
      {notice && !error && (
        <div className="flex items-start gap-2"><div className="flex-1"><StateBanner tone="success">{notice}</StateBanner></div><IconButton onClick={() => setNotice('')} title={copy('关闭', 'Close')}><X size={14} /></IconButton></div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : isPhoneVisual && phoneStats ? (
        <PhoneVisualDashboard items={items} stats={phoneStats} copy={copy} />
      ) : items.length === 0 ? (
        <EmptyState title={copy(`暂无${config.singular}`, `No ${assetSingular(config.singular, language)}s yet`)} description={copy('换个筛选条件，或新增一条资产记录。', 'Try another filter, or add a record.')} action={<Button onClick={openCreate}><Plus size={16} />{copy(`新增${config.singular}`, `Add ${assetSingular(config.singular, language)}`)}</Button>} />
      ) : view === 'card' ? (
        <div className="motion-list grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => isDomain
            ? <DomainCardView key={item.id} item={item} duplicated={duplicatedId === item.id} duplicating={duplicatingId === item.id} renewing={renewals.renewingId === item.id} renewed={false} onDuplicate={duplicateEntry} onRenew={renewItem} checkAction={domainCheckAction(item)} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
            : isVps
              ? <VpsNodeCard key={item.id} item={item} monitorState={monitorById[item.id]} actionState={vpsActionById[item.id]} copiedSsh={copiedSshId === item.id} copiedIp={copiedVpsIpId === item.id} renewing={renewals.renewingId === item.id} onRenew={renewItem} onCopySsh={copySshCommand} onCopyIp={copyVpsIpAddress} onRefresh={refreshVpsMonitor} onTest={testVpsSsh} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
            : isPhone
              ? <PhoneCardView key={item.id} item={item} duplicated={duplicatedId === item.id} duplicating={duplicatingId === item.id} copiedNumber={copiedPhoneNumberId === item.id} onCopyNumber={copyPhoneNumber} onDuplicate={duplicateEntry} renewAction={renewAction(item)} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
            : <AssetCardView key={item.id} item={item} config={config} duplicated={duplicatedId === item.id} duplicating={duplicatingId === item.id} onDuplicate={duplicateEntry} renewAction={renewAction(item)} onEdit={openEdit} onDelete={moveToTrash} copy={copy} />
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
        <>
          <p className="text-xs text-slate-400">{copy('勾选多行可批量标记已付、改状态、打标签或删除。', 'Tick rows to mark paid, change status, tag or delete in bulk.')}</p>
          <DataTable columns={columns} data={items} />
        </>
      )}

      {selectedItems.length > 0 && view === 'table' && (
        <BulkBar
          endpoint={config.endpoint}
          selected={selectedItems}
          copy={copy}
          onClear={() => setSelectedIds(new Set())}
          onError={setError}
          onDone={async (message) => { setError(''); setNotice(message); setHistoryKey((value) => value + 1); await load(); }}
        />
      )}

      {meta && !isPhoneVisual && meta.total > pageSizes[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-ink-900">
          <span className="text-slate-500">{copy(`共 ${meta.total} 项`, `${meta.total} items`)}</span>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputClass} !h-8 !w-auto text-xs`} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label={copy('每页条数', 'Page size')}>
              {pageSizes.map((size) => <option key={size} value={size}>{copy(`每页 ${size}`, `${size} / page`)}</option>)}
            </select>
            <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{copy('上一页', 'Previous')}</Button>
            <select className={`${inputClass} !h-8 !w-auto text-xs`} value={Math.floor(offset / pageSize)} onChange={(e) => setOffset(Number(e.target.value) * pageSize)} aria-label={copy('跳转页码', 'Go to page')}>
              {Array.from({ length: Math.ceil(meta.total / pageSize) }, (_, index) => <option key={index} value={index}>{copy(`第 ${index + 1} / ${Math.ceil(meta.total / pageSize)} 页`, `Page ${index + 1} of ${Math.ceil(meta.total / pageSize)}`)}</option>)}
            </select>
            <Button variant="secondary" size="sm" disabled={offset + pageSize >= meta.total} onClick={() => setOffset(offset + pageSize)}>{copy('下一页', 'Next')}</Button>
          </div>
        </div>
      )}

      {renewals.toast && (
        <RenewalToast
          toast={renewals.toast}
          onUndo={renewals.undo}
          onUpdateAmount={renewals.updateAmount}
          onClose={() => renewals.setToast(null)}
          copy={copy}
        />
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        error={formError}
        dirty={!submitting && JSON.stringify(form) !== formSnapshot.current}
        title={isDomain ? (editing ? copy('编辑域名', 'Edit domain') : copy('新增域名', 'Add domain')) : isVps ? (editing ? copy('编辑 VPS', 'Edit VPS') : copy('新增 VPS', 'Add VPS')) : isPhone ? (editing ? copy('编辑电话卡', 'Edit phone card') : copy('新增电话卡', 'Add phone card')) : (editing ? copy(`编辑${config.singular}`, `Edit ${assetSingular(config.singular, language)}`) : copy(`新增${config.singular}`, `Add ${assetSingular(config.singular, language)}`))}
        footer={<><Button variant="secondary" onClick={() => setDrawerOpen(false)}>{copy('取消', 'Cancel')}</Button><Button type="submit" form="asset-form" disabled={submitting}>{submitting ? copy('保存中', 'Saving') : copy('保存', 'Save')}</Button></>}
      >
        <form id="asset-form" onSubmit={submit} className="motion-stack space-y-6">
          {isDomain ? (
            <DomainFormSections form={form} updateForm={updateForm} copy={copy} />
          ) : isVps ? (
            <VpsFormSections form={form} updateForm={updateForm} copy={copy} language={language} editing={editing} actionState={editing ? vpsActionById[editing.id] : undefined} onTest={(item) => testVpsSsh(item, formToPayload(config, form))} onInstall={(item, probePort) => installVpsProbe(item, probePort, formToPayload(config, form))} onSaveThen={saveVpsThen} />
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
                  <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statusOptions(copy)}</select></Field>
                  <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">{copy('开启', 'On')}</option><option value="false">{copy('关闭', 'Off')}</option></select></Field>
                </div>
                <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
                <Field label={copy('续费链接', 'Renewal URL')}><input className={inputClass} value={String(form.renewalUrl ?? '')} onChange={(e) => updateForm('renewalUrl', e.target.value)} /></Field>
                <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="prod, infra, personal" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
                <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
              </Section>
            </>
          )}
        </form>
        {editing && !(isSubscription && editing.purchaseType === 'buyout') && (
          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/[0.06]">
            <RenewalHistory
              endpoint={config.endpoint}
              itemId={editing.id}
              refreshKey={historyKey}
              copy={copy}
              onUndone={(item) => {
                setEditing(item);
                setForm(assetToForm(config, item));
                formSnapshot.current = JSON.stringify(assetToForm(config, item));
                void load();
              }}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
