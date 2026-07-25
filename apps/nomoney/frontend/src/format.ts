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
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
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
