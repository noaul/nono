import type React from 'react';
import { Check, Copy, ExternalLink, Pencil, Phone, Trash2 } from 'lucide-react';
import type { AssetPageConfig } from '../assetConfig';
import type { AssetItem, AssetStatus, BillingCycle, Currency } from '../types';
import { compactDate, daysLeft, dueTone, formatCycle, formatMoney, currencies } from '../format';
import { Field, StatusBadge, inputClass } from '../ui';
import { stringValue } from '../domainRegistrars';

export type FormState = Record<string, string | boolean>;

export const cycles: BillingCycle[] = ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial'];

export const domainCycles: BillingCycle[] = ['annual', 'biennial'];

export const statuses: AssetStatus[] = ['active', 'paused', 'expired', 'cancelled'];

export const vpsTypes = [
  { value: 'website', labelZh: '建站机', labelEn: 'Website' },
  { value: 'route', labelZh: '线路机', labelEn: 'Route' },
  { value: 'residential', labelZh: '家宽', labelEn: 'Residential' }
] as const;

export const subscriptionCategorySuggestions = [
  { zh: '影音娱乐', en: 'Streaming' },
  { zh: '软件工具', en: 'Software' },
  { zh: 'AI 服务', en: 'AI' },
  { zh: '云服务', en: 'Cloud' },
  { zh: '网络 / VPN', en: 'Network' },
  { zh: '学习阅读', en: 'Learning' },
  { zh: '会员', en: 'Membership' }
];

export function SubscriptionFormSections({
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
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('服务商', 'Provider')}><input className={inputClass} value={String(form.provider ?? '')} onChange={(e) => updateForm('provider', e.target.value)} /></Field>
          <Field label={copy('分类', 'Category')}>
            <input className={inputClass} list="subscription-categories" placeholder={copy('如：影音、软件、云服务', 'e.g. Streaming, Software')} value={String(form.category ?? '')} onChange={(e) => updateForm('category', e.target.value)} />
            <datalist id="subscription-categories">
              {subscriptionCategorySuggestions.map((item) => <option key={item.zh} value={copy(item.zh, item.en)} />)}
            </datalist>
          </Field>
        </div>
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
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statusOptions(copy)}</select></Field>
          {!isBuyout && <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">{copy('开启', 'On')}</option><option value="false">{copy('关闭', 'Off')}</option></select></Field>}
        </div>
        <Field label={copy('支付方式', 'Payment method')}><input className={inputClass} value={String(form.paymentMethod ?? '')} onChange={(e) => updateForm('paymentMethod', e.target.value)} /></Field>
        {!isBuyout && <Field label={copy('续费链接', 'Renewal link')}><input className={inputClass} value={String(form.renewalUrl ?? '')} onChange={(e) => updateForm('renewalUrl', e.target.value)} /></Field>}
        <Field label={copy('标签', 'Tags')}><input className={inputClass} value={String(form.tags ?? '')} placeholder="prod, infra, personal" onChange={(e) => updateForm('tags', e.target.value)} /></Field>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

export function ProviderJump({ label, href, empty }: { label: string; href?: string; empty: string }) {
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

export function AssetCardView({
  item,
  config,
  duplicated,
  duplicating,
  onDuplicate,
  renewAction,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  config: AssetPageConfig;
  duplicated: boolean;
  duplicating: boolean;
  onDuplicate: (item: AssetItem) => void;
  renewAction?: React.ReactNode;
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
      <div className="mt-3 flex items-end justify-between gap-4 sm:mt-5">
        <div>
          <p className="font-mono text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</p>
          <p className="mt-1 text-xs text-slate-500">{isBuyout ? copy('一次性买断', 'One-time purchase') : `${copy(formatCycle(item.billingCycle, 'zh'), formatCycle(item.billingCycle, 'en'))} · ${item.autoRenew ? copy('自动续费', 'Auto renew') : copy('手动续费', 'Manual renewal')}`}</p>
        </div>
        {left !== null && (
          <div className={`text-right font-mono text-sm font-semibold ${dueTone(left)}`}>
            {left}d
            <p className="font-sans text-[11px] font-normal text-slate-400">{compactDate(dueDate)}</p>
          </div>
        )}
      </div>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
          {item.tags.map((tag) => <span key={tag} className="rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 dark:border-white/10">{tag}</span>)}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2 sm:mt-5 sm:pt-3 dark:border-white/[0.06]">
        {item.renewalUrl && (
          <a href={item.renewalUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/[0.06]" title={copy('打开续费链接', 'Open renewal link')}>
            <ExternalLink size={14} />
          </a>
        )}
        {renewAction}
        <button
          onClick={() => onDuplicate(item)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${duplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
          title={copy('复制条目', 'Duplicate entry')}
          aria-label={copy('复制条目', 'Duplicate entry')}
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

export const statusLabels: Record<AssetStatus, [string, string]> = {
  active: ['使用中', 'Active'],
  paused: ['暂停', 'Paused'],
  expired: ['已过期', 'Expired'],
  cancelled: ['已取消', 'Cancelled'],
  archived: ['已归档', 'Archived']
};

export function statusOptions(copy: (zh: string, en: string) => string) {
  return statuses.map((value) => <option key={value} value={value}>{copy(...statusLabels[value])}</option>);
}

export const cyclesPerYear: Record<BillingCycle, number> = { weekly: 52, monthly: 12, quarterly: 4, semiannual: 2, annual: 1, biennial: 0.5 };

export function monthlyEquivalent(amountMinorUnits: number, cycle: BillingCycle): number {
  return (amountMinorUnits * (cyclesPerYear[cycle] ?? 12)) / 12;
}

export function nil(value: unknown): string | null | boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim();
  return text || null;
}

export function formatMoneyTotals(values?: Partial<Record<Currency, number>>): string {
  const entries = currencies
    .map((currency) => [currency, Number(values?.[currency] ?? 0)] as const)
    .filter(([, amount]) => amount > 0);
  if (entries.length === 0) return formatMoney(0, 'CNY');
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' / ');
}

export function formatDisplayMoney(item: AssetItem): string {
  if (typeof item.displayAmountMinorUnits === 'number' && item.displayCurrency) {
    return formatMoney(item.displayAmountMinorUnits, item.displayCurrency);
  }
  return formatMoney(item.amountMinorUnits, item.currency);
}

export function countBy(items: AssetItem[], getName: (item: AssetItem) => string): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = getName(item) || '-';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function formatPercent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value * 10) / 10}%`;
}

export function percentColor(value: number | null): string {
  if (value === null) return 'brand';
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'success';
}

export function addBillingCycleToDate(dateValue: string, cycle: BillingCycle): string {
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

export function normalizeBillingCycle(value: unknown): BillingCycle {
  return value === 'quarterly' || value === 'annual' || value === 'biennial' ? value : 'monthly';
}

export function getText(item: AssetItem, key: string) {
  return String(item[key] ?? '-');
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
