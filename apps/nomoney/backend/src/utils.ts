import type { BillingCycle, Currency } from './types.js';

export const currencies = ['CNY', 'USD', 'HKD', 'JPY', 'GBP', 'EUR', 'CAD', 'SGD', 'AUD'] as const satisfies readonly Currency[];
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export function toIsoDate(date: Date, timeZone = process.env.TZ || DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function toIsoDateTime(date: Date): string {
  return date.toISOString();
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export const billingCycles = ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial'] as const satisfies readonly BillingCycle[];

const cyclesPerYear: Record<BillingCycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
  biennial: 0.5
};

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === 'string' && (billingCycles as readonly string[]).includes(value);
}

export function predictedMonthly(amountMinorUnits: number, billingCycle: BillingCycle): number {
  return Math.round((amountMinorUnits * (cyclesPerYear[billingCycle] ?? 12)) / 12);
}

export function predictedYearly(amountMinorUnits: number, billingCycle: BillingCycle): number {
  return Math.round(amountMinorUnits * (cyclesPerYear[billingCycle] ?? 12));
}

/** Advances an ISO date by `count` billing cycles, clamping to the last day of short months. */
export function addBillingCycle(dateValue: string, cycle: BillingCycle, count = 1): string {
  if (cycle === 'weekly') return addDays(dateValue, 7 * count);
  const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, biennial: 24 }[cycle] ?? 1;
  return addMonths(dateValue, months * count);
}

export function addDays(dateValue: string, days: number): string {
  const time = Date.parse(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(time)) return dateValue;
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10);
}

export function addMonths(dateValue: string, months: number): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return [
    targetYear,
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0')
  ].join('-');
}

export function addCurrencyTotal(
  totals: Partial<Record<Currency, number>>,
  currency: Currency,
  amount: number
): void {
  totals[currency] = (totals[currency] ?? 0) + amount;
}

export function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
