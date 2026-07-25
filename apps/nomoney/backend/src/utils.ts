import type { BillingCycle, Currency } from './types.js';

export const currencies = ['CNY', 'USD', 'GBP', 'EUR', 'CAD'] as const satisfies readonly Currency[];

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toIsoDateTime(date: Date): string {
  return date.toISOString();
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export function predictedMonthly(amountMinorUnits: number, billingCycle: BillingCycle): number {
  if (billingCycle === 'monthly') return amountMinorUnits;
  if (billingCycle === 'quarterly') return Math.round(amountMinorUnits / 3);
  if (billingCycle === 'biennial') return Math.round(amountMinorUnits / 24);
  return Math.round(amountMinorUnits / 12);
}

export function predictedYearly(amountMinorUnits: number, billingCycle: BillingCycle): number {
  if (billingCycle === 'monthly') return amountMinorUnits * 12;
  if (billingCycle === 'quarterly') return amountMinorUnits * 4;
  if (billingCycle === 'biennial') return Math.round(amountMinorUnits / 2);
  return amountMinorUnits;
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
