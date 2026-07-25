import type { Router } from 'express';
import { assetConfigs, getDueDate, normalizeBillingCycle, normalizeCurrency } from './assets.js';
import type { AppContext, AssetType, Currency } from './types.js';
import {
  addCurrencyTotal,
  daysBetween,
  predictedMonthly,
  predictedYearly,
  toIsoDate
} from './utils.js';

export interface DueItem {
  assetType: AssetType;
  assetId: number;
  name: string;
  dueDate: string;
  daysLeft: number;
  amountMinorUnits: number;
  currency: Currency;
  billingCycle: string;
  autoRenew: boolean;
  renewalUrl: string | null;
  status: string;
}

type PhoneStats = {
  total: number;
  domestic: number;
  foreign: number;
  monthlyRentByCurrency: Partial<Record<Currency, number>>;
  carriers: Array<{ carrier: string; count: number }>;
};

export function registerDashboardRoutes(router: Router, context: AppContext): void {
  router.get('/dashboard/summary', (req, res) => {
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : context.now().getUTCFullYear();
    res.json(getDashboardSummary(context, Number.isFinite(year) ? year : context.now().getUTCFullYear()));
  });

  router.get('/dashboard/expiring', (req, res) => {
    const days = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
    res.json({ items: collectDueItems(context, Number.isFinite(days) ? days : 30) });
  });
}

export function getDashboardSummary(context: AppContext, year: number) {
  const predictedMonthlyTotals: Partial<Record<Currency, number>> = {};
  const predictedYearlyTotals: Partial<Record<Currency, number>> = {};
  const assetCounts: Record<string, number> = {
    phones: 0,
    vps: 0,
    domains: 0,
    subscriptions: 0
  };

  for (const config of assetConfigs) {
    const rows = context.db.all<Record<string, unknown>>(
      `SELECT * FROM ${config.table} WHERE archived_at IS NULL AND status = 'active'`
    );
    assetCounts[config.route] = rows.length;

    for (const row of rows) {
      if (config.type === 'subscription' && row.purchase_type === 'buyout') continue;
      const amount = Number(row.amount_minor_units ?? 0);
      const currency = normalizeCurrency(row.currency);
      const cycle = normalizeBillingCycle(row.billing_cycle);
      addCurrencyTotal(predictedMonthlyTotals, currency, predictedMonthly(amount, cycle));
      addCurrencyTotal(predictedYearlyTotals, currency, predictedYearly(amount, cycle));
    }
  }

  const actualYearly: Partial<Record<Currency, number>> = {};
  const expenses = context.db.all<{ currency: Currency; total: number }>(
    `SELECT currency, SUM(amount_minor_units) as total
     FROM expenses
     WHERE paid_at >= ? AND paid_at <= ?
     GROUP BY currency`,
    [`${year}-01-01`, `${year}-12-31`]
  );
  for (const row of expenses) {
    addCurrencyTotal(actualYearly, normalizeCurrency(row.currency), Number(row.total ?? 0));
  }

  const dueItems = collectDueItems(context, 30);
  const phoneStats = collectPhoneStats(context);

  return {
    predictedMonthly: predictedMonthlyTotals,
    predictedYearly: predictedYearlyTotals,
    actualYearly,
    assetCounts,
    expiringCount: dueItems.length,
    dueBuckets: {
      overdue: dueItems.filter((item) => item.daysLeft < 0).length,
      today: dueItems.filter((item) => item.daysLeft === 0).length,
      week: dueItems.filter((item) => item.daysLeft > 0 && item.daysLeft <= 7).length,
      month: dueItems.filter((item) => item.daysLeft > 7 && item.daysLeft <= 30).length
    },
    nextDueItems: dueItems.slice(0, 5),
    phoneStats,
    currencyTotals: {
      predictedMonthly: predictedMonthlyTotals,
      predictedYearly: predictedYearlyTotals,
      actualYearly
    }
  };
}

export function collectDueItems(context: AppContext, withinDays: number): DueItem[] {
  const today = toIsoDate(context.now());
  const items: DueItem[] = [];

  for (const config of assetConfigs) {
    const rows = context.db.all<Record<string, unknown>>(
      `SELECT * FROM ${config.table} WHERE archived_at IS NULL AND status IN ('active', 'paused', 'expired')`
    );
    for (const row of rows) {
      if (config.type === 'subscription' && row.purchase_type === 'buyout') continue;
      const dueDate = getDueDate(row, config.dueFields);
      if (!dueDate) continue;
      const daysLeft = daysBetween(today, dueDate);
      if (daysLeft > withinDays) continue;

      items.push({
        assetType: config.type,
        assetId: Number(row.id),
        name: String(row[config.displayField] ?? ''),
        dueDate,
        daysLeft,
        amountMinorUnits: Number(row.amount_minor_units ?? 0),
        currency: normalizeCurrency(row.currency),
        billingCycle: String(row.billing_cycle ?? ''),
        autoRenew: Boolean(row.auto_renew),
        renewalUrl: typeof row.renewal_url === 'string' ? row.renewal_url : null,
        status: String(row.status ?? '')
      });
    }
  }

  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

function collectPhoneStats(context: AppContext): PhoneStats {
  const rows = context.db.all<{
    phone_type: string | null;
    carrier: string | null;
    amount_minor_units: number | null;
    currency: Currency | null;
  }>("SELECT phone_type, carrier, amount_minor_units, currency FROM phones WHERE archived_at IS NULL AND status = 'active'");
  const monthlyRentByCurrency: Partial<Record<Currency, number>> = {};
  const carrierCounts = new Map<string, number>();
  let domestic = 0;
  let foreign = 0;

  for (const row of rows) {
    const phoneType = row.phone_type === 'foreign' ? 'foreign' : 'domestic';
    if (phoneType === 'foreign') foreign += 1;
    else domestic += 1;

    const currency = normalizeCurrency(row.currency);
    addCurrencyTotal(monthlyRentByCurrency, currency, Number(row.amount_minor_units ?? 0));

    const carrier = (row.carrier || '').trim() || '未记录运营商';
    carrierCounts.set(carrier, (carrierCounts.get(carrier) ?? 0) + 1);
  }

  const carriers = Array.from(carrierCounts.entries())
    .map(([carrier, count]) => ({ carrier, count }))
    .sort((a, b) => b.count - a.count || a.carrier.localeCompare(b.carrier));

  return {
    total: rows.length,
    domestic,
    foreign,
    monthlyRentByCurrency,
    carriers
  };
}
