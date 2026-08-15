import type { AssetStatus, BillingCycle, Currency } from './types';
import type { Language } from './i18n';
import { getStoredLanguage } from './i18n';

const currencySymbols: Record<Currency, string> = {
  CNY: '¥',
  USD: '$',
  GBP: '£',
  EUR: '€',
  CAD: 'CA$'
};

export const APP_TIME_ZONE = 'Asia/Shanghai';

export function shanghaiDateKey(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function currentShanghaiYear(value: Date = new Date()): number {
  return Number(shanghaiDateKey(value).slice(0, 4));
}

export function formatShanghaiDateTime(value: string | number | Date, language: Language = getStoredLanguage()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

export function formatMoney(amountMinorUnits: number, currency: Currency): string {
  return `${currencySymbols[currency]}${(amountMinorUnits / 100).toFixed(2)}`;
}

export function formatCycle(cycle: BillingCycle, language: Language = getStoredLanguage()): string {
  const zh = {
    monthly: '月付',
    quarterly: '季付',
    annual: '年付',
    biennial: '两年付'
  };
  const en = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Annual',
    biennial: 'Biennial'
  };
  return (language === 'zh' ? zh : en)[cycle];
}

export function formatStatus(status: AssetStatus, language: Language = getStoredLanguage()): string {
  const zh = {
    active: '使用中',
    paused: '暂停',
    expired: '已过期',
    cancelled: '已取消',
    archived: '已归档'
  };
  const en = {
    active: 'Active',
    paused: 'Paused',
    expired: 'Expired',
    cancelled: 'Cancelled',
    archived: 'Archived'
  };
  return (language === 'zh' ? zh : en)[status];
}

export function daysLeft(dateValue: string | null | undefined): number | null {
  if (!dateValue) return null;
  const start = Date.parse(`${shanghaiDateKey()}T00:00:00.000Z`);
  const target = Date.parse(`${dateValue}T00:00:00.000Z`);
  return Math.round((target - start) / 86_400_000);
}

export function dueTone(days: number | null): string {
  if (days === null) return 'text-zinc-500';
  if (days <= 0) return 'text-rose-400';
  if (days <= 3) return 'text-amber-400';
  if (days <= 7) return 'text-yellow-300';
  return 'text-zinc-400';
}

export function compactDate(value: string | null | undefined): string {
  return value || '-';
}
