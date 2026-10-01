import type React from 'react';
import { useEffect, useState } from 'react';
import { CalendarClock, Check, Copy, ExternalLink, Link2, Pencil, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import type { AssetItem, Currency, ListMeta } from '../types';
import { compactDate, daysLeft, dueTone, formatCycle, formatMoney, currencies } from '../format';
import { Field, StatusBadge, inputClass } from '../ui';
import { commonDomainExtensions, composeDomainName, dnsProviderLink, dnsProviderProfiles, domainLink, domainPrefix, findDnsProviderProfile, findRegistrarProfile, inferDomainExtension, normalizeDomainExtension, registrarProfiles, stringValue } from '../domainRegistrars';
import { domainCycles, statusOptions, formatMoneyTotals, formatDisplayMoney, getText, Section, normalizeBillingCycle, addBillingCycleToDate, ProviderJump, type FormState } from './shared';

export type RenewalTotals = NonNullable<ListMeta['renewalTotals']>;

export type RegistrarAccountOption = NonNullable<ListMeta['registrarAccounts']>[number];

export type RenewalTotalMode = 'monthly' | 'yearly';

export type DomainCheckResponse = {
  item: AssetItem;
  rdap: { ok: boolean; updated?: boolean; registryExpireDate?: string; error?: string };
  certificate: { ok: boolean; expiresAt?: string; issuer?: string | null; error?: string };
};

export const domainSortOptions = [
  { value: 'expireDate', labelZh: '到期时间', labelEn: 'Expiry date' },
  { value: 'renewalDate', labelZh: '续费日期', labelEn: 'Renewal date' },
  { value: 'registerDate', labelZh: '注册时间', labelEn: 'Registration date' },
  { value: 'name', labelZh: '域名', labelEn: 'Domain' },
  { value: 'amount', labelZh: '费用', labelEn: 'Cost' },
  { value: 'rarity', labelZh: '稀有度', labelEn: 'Rarity' }
];

export function DomainCommandPanel({
  stats,
  renewalTotals,
  copy
}: {
  stats: { registrarCount: number; accountCount: number; topSuffix: string; autoRenewCount: number; riskWithin30Days: number };
  renewalTotals?: RenewalTotals;
  copy: (zh: string, en: string) => string;
}) {
  return (
    <section className="motion-list grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DomainPeriodTotalCard totals={renewalTotals} copy={copy} />
      <DomainStat icon={<ShieldCheck size={17} />} label={copy('注册商', 'Registrars')} value={stats.registrarCount} detail={copy(`${stats.accountCount} 个服务商账号`, `${stats.accountCount} registrar accounts`)} />
      <DomainStat icon={<CalendarClock size={17} />} label={copy('30 天风险', '30-day risk')} value={stats.riskWithin30Days} detail={copy('按续费/到期日期合并判断', 'Calculated from renewal or expiry dates')} />
      <DomainStat icon={<Link2 size={17} />} label={copy('主力后缀', 'Top suffix')} value={stats.topSuffix} detail={copy(`${stats.autoRenewCount} 个域名开启自动续费`, `${stats.autoRenewCount} domains on auto renew`)} mono />
    </section>
  );
}

export function DomainPeriodTotalCard({ totals, copy }: { totals?: RenewalTotals; copy: (zh: string, en: string) => string }) {
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] dark:border-white/10 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => setMode('monthly')}
            className={`rounded-md px-2 py-0.5 transition-all ${mode === 'monthly' ? 'bg-white text-brand-600 shadow-xs dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {copy('按月', 'Month')}
          </button>
          <button
            type="button"
            onClick={() => setMode('yearly')}
            className={`rounded-md px-2 py-0.5 transition-all ${mode === 'yearly' ? 'bg-white text-brand-600 shadow-xs dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
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

export function DomainStat({ icon, label, value, detail, mono = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-ink-850">
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

export function DomainCardView({
  item,
  duplicated,
  duplicating,
  renewing,
  renewed,
  onDuplicate,
  onRenew,
  checkAction,
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
  checkAction?: React.ReactNode;
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
          <CertificateLine item={item} copy={copy} />
        </div>
        <div className="muted-panel p-3">
          <p className="text-xs text-slate-500">{copy('周期费用', 'Cycle cost')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-950 dark:text-white">{formatDisplayMoney(item)}</p>
          <p className="text-xs text-slate-400">{copy(formatCycle(item.billingCycle, 'zh'), formatCycle(item.billingCycle, 'en'))}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <UserRound size={13} />
          <span className="truncate">{stringValue(item.dnsProvider) || stringValue(item.purpose) || copy('未记录 DNS/用途', 'No DNS or purpose recorded')}</span>
        </div>
        <div className="flex shrink-0 justify-end gap-1">
          {checkAction}
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

export function describeDomainCheck(response: DomainCheckResponse, copy: (zh: string, en: string) => string): string {
  const name = stringValue(response.item.domainName);
  const rdap = response.rdap.ok
    ? response.rdap.updated
      ? copy(`注册局到期日为 ${response.rdap.registryExpireDate}，已更新本地记录`, `registry expiry ${response.rdap.registryExpireDate}, local record updated`)
      : copy(`注册局到期日 ${response.rdap.registryExpireDate}，与记录一致或更早`, `registry expiry ${response.rdap.registryExpireDate}, not ahead of the record`)
    : copy(`注册局查询失败：${response.rdap.error}`, `registry lookup failed: ${response.rdap.error}`);
  const certificate = response.certificate.ok
    ? copy(`SSL 证书 ${response.certificate.expiresAt} 到期`, `TLS certificate expires ${response.certificate.expiresAt}`)
    : copy(`未读取到 SSL 证书（${response.certificate.error}）`, `no TLS certificate (${response.certificate.error})`);
  return `${name}：${rdap}；${certificate}`;
}

/** Free-text suffix with suggestions; committed on blur so clearing the field mid-edit is harmless. */
export function ExtensionInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const normalized = normalizeDomainExtension(draft);
    if (normalized && normalized !== value) onCommit(normalized);
    else setDraft(value);
  };
  return (
    <>
      <input
        className={`${inputClass} font-mono`}
        list="domain-extension-suggestions"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      <datalist id="domain-extension-suggestions">
        {commonDomainExtensions.map((item) => <option key={item} value={item} />)}
      </datalist>
    </>
  );
}

export function CertificateLine({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const expiresAt = stringValue(item.sslExpiresAt);
  const error = stringValue(item.sslError);
  if (!expiresAt && !error) return null;
  if (error) return <p className="mt-1 truncate text-[11px] text-slate-400" title={error}>{copy('SSL 未检测到', 'No TLS certificate')}</p>;
  const left = daysLeft(expiresAt);
  return (
    <p className="mt-1 truncate text-[11px] text-slate-400" title={stringValue(item.sslIssuer)}>
      SSL <span className={`font-mono ${dueTone(left)}`}>{left === null ? '-' : `${left}d`}</span>
      {stringValue(item.sslIssuer) && <> · {stringValue(item.sslIssuer)}</>}
    </p>
  );
}

export function DomainMiniCardView({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const dueDate = stringValue(item.nextDueDate) || stringValue(item.expireDate);
  const left = daysLeft(dueDate || null);

  return (
    <div className="motion-card rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-soft dark:border-white/10 dark:bg-ink-850">
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

export function DomainFormSections({
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
            <ExtensionInput value={extension} onCommit={(value) => updateForm('domainExtension', value)} />
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
            <input className={inputClass} list="registrar-options" placeholder={copy('选择或输入注册商', 'Pick or type a registrar')} value={String(form.registrar ?? '')} onChange={(e) => updateForm('registrar', e.target.value)} />
            <datalist id="registrar-options">
              {registrarProfiles.map((profile) => <option key={profile.name} value={profile.name} />)}
            </datalist>
          </Field>
          <Field label={copy('DNS 托管商', 'DNS host')}>
            <input className={inputClass} list="dns-provider-options" placeholder={copy('选择或输入 DNS 托管商', 'Pick or type a DNS host')} value={String(form.dnsProvider ?? '')} onChange={(e) => updateForm('dnsProvider', e.target.value)} />
            <datalist id="dns-provider-options">
              {dnsProviderProfiles.map((profile) => <option key={profile.name} value={profile.name} />)}
            </datalist>
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
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statusOptions(copy)}</select></Field>
          <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">{copy('开启', 'On')}</option><option value="false">{copy('关闭', 'Off')}</option></select></Field>
        </div>
        <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
        <Field label={copy('用途', 'Purpose')}><input className={inputClass} value={String(form.purpose ?? '')} onChange={(e) => updateForm('purpose', e.target.value)} placeholder={copy('主站 / 邮箱 / 停放 / 转售', 'Main site / email / parking / resale')} /></Field>
        <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="brand, infra, rare" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

export function formatRegistrarAccountOption(option: RegistrarAccountOption, copy: (zh: string, en: string) => string): string {
  const registrar = option.registrar || copy('未记录服务商', 'No registrar');
  const suffix = option.count > 1 ? ` (${option.count})` : '';
  return `${registrar}-${option.account}${suffix}`;
}

export function getDomainPrefixFromForm(form: FormState, extension: string): string {
  return typeof form.domainPrefix === 'string' ? form.domainPrefix : domainPrefix(form.domainName, extension);
}

export function updateDomainLifecycleFields(current: FormState, next: FormState, key: string): void {
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

export function applyDomainLifecycleDefaults(form: FormState): void {
  const lifecycle = getDomainLifecycle(form);
  form.lastRenewDate = lifecycle.lastRenewDate;
  form.expireDate = lifecycle.expireDate;
  form.nextDueDate = lifecycle.nextDueDate;
}

export function getDomainLifecycle(form: FormState) {
  const lastRenewDate = stringValue(form.lastRenewDate) || stringValue(form.registerDate);
  const calculatedExpireDate = calculateDomainExpireDate({ ...form, lastRenewDate });
  const expireDate = stringValue(form.expireDate) || calculatedExpireDate;
  const nextDueDate = stringValue(form.nextDueDate) || expireDate;
  return { lastRenewDate, expireDate, nextDueDate };
}

export function calculateDomainExpireDate(form: FormState): string {
  const anchorDate = stringValue(form.lastRenewDate) || stringValue(form.registerDate);
  return anchorDate ? addBillingCycleToDate(anchorDate, normalizeBillingCycle(form.billingCycle)) : '';
}
