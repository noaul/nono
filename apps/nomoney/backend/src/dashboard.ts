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

type CurrencyTotals = Partial<Record<Currency, number>>;

type CostSubcategory = {
  key: string;
  label: string;
  count: number;
  predictedMonthly: CurrencyTotals;
  predictedYearly: CurrencyTotals;
  oneTimeCost: CurrencyTotals;
};

type CategoryCost = {
  assetType: AssetType;
  assetCount: number;
  recurringCount: number;
  predictedMonthly: CurrencyTotals;
  predictedYearly: CurrencyTotals;
  actualYearly: CurrencyTotals;
  oneTimeCost: CurrencyTotals;
  dueCount: number;
  subcategories: CostSubcategory[];
};

const assetTypes: AssetType[] = ['phone', 'vps', 'domain', 'subscription'];

const fixedSubcategories: Partial<Record<AssetType, Array<{ key: string; label: string }>>> = {
  phone: [
    { key: 'domestic', label: '国内' },
    { key: 'foreign', label: '国外' }
  ],
  vps: [
    { key: 'website', label: '建站机' },
    { key: 'route', label: '线路机' },
    { key: 'residential', label: '家宽' },
    { key: 'other', label: '未分类' }
  ],
  subscription: [
    { key: 'subscription', label: '订阅制' },
    { key: 'buyout', label: '买断制' }
  ]
};

export function registerDashboardRoutes(router: Router, context: AppContext, allowedTypes: AssetType[] = assetTypes): void {
  router.get('/dashboard/summary', (req, res) => {
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : context.now().getUTCFullYear();
    res.json(getDashboardSummary(context, Number.isFinite(year) ? year : context.now().getUTCFullYear(), allowedTypes));
  });

  router.get('/dashboard/expiring', (req, res) => {
    const days = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
    res.json({ items: collectDueItems(context, Number.isFinite(days) ? days : 30, allowedTypes) });
  });
}

export function getDashboardSummary(context: AppContext, year: number, allowedTypes: AssetType[] = assetTypes) {
  const predictedMonthlyTotals: Partial<Record<Currency, number>> = {};
  const predictedYearlyTotals: Partial<Record<Currency, number>> = {};
  const categoryCosts = Object.fromEntries(
    allowedTypes.map((assetType) => [assetType, createCategoryCost(assetType)])
  ) as Record<AssetType, CategoryCost>;
  const assetCounts: Record<string, number> = {
    phones: 0,
    vps: 0,
    domains: 0,
    subscriptions: 0
  };

  for (const config of assetConfigs.filter((item) => allowedTypes.includes(item.type))) {
    const rows = context.db.all<Record<string, unknown>>(
      `SELECT * FROM ${config.table} WHERE archived_at IS NULL AND status = 'active'`
    );
    assetCounts[config.route] = rows.length;
    const categoryCost = categoryCosts[config.type];
    categoryCost.assetCount = rows.length;

    for (const row of rows) {
      const amount = Number(row.amount_minor_units ?? 0);
      const currency = normalizeCurrency(row.currency);
      const subcategory = getCostSubcategory(categoryCost, row);
      subcategory.count += 1;

      if (config.type === 'subscription' && row.purchase_type === 'buyout') {
        addCurrencyTotal(categoryCost.oneTimeCost, currency, amount);
        addCurrencyTotal(subcategory.oneTimeCost, currency, amount);
        continue;
      }

      const cycle = normalizeBillingCycle(row.billing_cycle);
      const monthly = predictedMonthly(amount, cycle);
      const yearly = predictedYearly(amount, cycle);
      categoryCost.recurringCount += 1;
      addCurrencyTotal(predictedMonthlyTotals, currency, monthly);
      addCurrencyTotal(predictedYearlyTotals, currency, yearly);
      addCurrencyTotal(categoryCost.predictedMonthly, currency, monthly);
      addCurrencyTotal(categoryCost.predictedYearly, currency, yearly);
      addCurrencyTotal(subcategory.predictedMonthly, currency, monthly);
      addCurrencyTotal(subcategory.predictedYearly, currency, yearly);
    }
  }

  const actualYearly: Partial<Record<Currency, number>> = {};
  const expenseTypePlaceholders = allowedTypes.map(() => '?').join(', ');
  const expenses = context.db.all<{ asset_type: string; currency: Currency; total: number }>(
    `SELECT asset_type, currency, SUM(amount_minor_units) as total
     FROM expenses
     WHERE paid_at >= ? AND paid_at <= ? AND asset_type IN (${expenseTypePlaceholders})
     GROUP BY asset_type, currency`,
    [`${year}-01-01`, `${year}-12-31`, ...allowedTypes]
  );
  for (const row of expenses) {
    const currency = normalizeCurrency(row.currency);
    const amount = Number(row.total ?? 0);
    addCurrencyTotal(actualYearly, currency, amount);
    if (isAssetType(row.asset_type) && allowedTypes.includes(row.asset_type)) {
      addCurrencyTotal(categoryCosts[row.asset_type].actualYearly, currency, amount);
    }
  }

  const dueItems = collectDueItems(context, 30, allowedTypes);
  for (const item of dueItems) {
    categoryCosts[item.assetType].dueCount += 1;
  }
  const phoneStats = collectPhoneStats(context);

  return {
    predictedMonthly: predictedMonthlyTotals,
    predictedYearly: predictedYearlyTotals,
    actualYearly,
    assetCounts,
    categoryCosts,
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

function createCategoryCost(assetType: AssetType): CategoryCost {
  return {
    assetType,
    assetCount: 0,
    recurringCount: 0,
    predictedMonthly: {},
    predictedYearly: {},
    actualYearly: {},
    oneTimeCost: {},
    dueCount: 0,
    subcategories: (fixedSubcategories[assetType] ?? []).map(({ key, label }) => createCostSubcategory(key, label))
  };
}

function createCostSubcategory(key: string, label: string): CostSubcategory {
  return {
    key,
    label,
    count: 0,
    predictedMonthly: {},
    predictedYearly: {},
    oneTimeCost: {}
  };
}

function getCostSubcategory(category: CategoryCost, row: Record<string, unknown>): CostSubcategory {
  const identity = getSubcategoryIdentity(category.assetType, row);
  let subcategory = category.subcategories.find((item) => item.key === identity.key);
  if (!subcategory) {
    subcategory = createCostSubcategory(identity.key, identity.label);
    category.subcategories.push(subcategory);
  }
  return subcategory;
}

function getSubcategoryIdentity(assetType: AssetType, row: Record<string, unknown>): { key: string; label: string } {
  if (assetType === 'phone') {
    return row.phone_type === 'foreign'
      ? { key: 'foreign', label: '国外' }
      : { key: 'domestic', label: '国内' };
  }
  if (assetType === 'vps') {
    const value = typeof row.vps_type === 'string' ? row.vps_type : '';
    const known = fixedSubcategories.vps?.find((item) => item.key === value);
    return known ?? { key: 'other', label: '未分类' };
  }
  if (assetType === 'subscription') {
    return row.purchase_type === 'buyout'
      ? { key: 'buyout', label: '买断制' }
      : { key: 'subscription', label: '订阅制' };
  }

  const registrar = typeof row.registrar === 'string' ? row.registrar.trim() : '';
  return registrar
    ? { key: `registrar:${registrar.toLocaleLowerCase()}`, label: registrar }
    : { key: 'other', label: '未记录注册商' };
}

function isAssetType(value: string): value is AssetType {
  return assetTypes.includes(value as AssetType);
}

export function collectDueItems(context: AppContext, withinDays: number, allowedTypes: AssetType[] = assetTypes): DueItem[] {
  const today = toIsoDate(context.now());
  const items: DueItem[] = [];

  for (const config of assetConfigs.filter((item) => allowedTypes.includes(item.type))) {
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
