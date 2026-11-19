import type { Router } from 'express';
import { collectDueItems, getDashboardSummary } from './dashboard.js';
import { convertTotals } from './exchange-rates.js';
import { asyncHandler } from './http.js';
import { getSettings } from './settings.js';
import { toIsoDate } from './utils.js';
import { requireInternalToken } from './renewals.js';
import { getLegacyChannelSettings } from './settings.js';
import { productAssetTypes, type AppContext } from './types.js';

export function registerInternalNotificationRoutes(router: Router, context: AppContext): void {
  router.get('/internal/notifications/due', requireInternalToken(context), (_req, res) => {
    const items = collectDueItems(context, 30, [...productAssetTypes]).map((item) => ({
      assetType: item.assetType,
      id: item.assetId,
      name: item.name,
      dueDate: item.dueDate,
      kind: item.kind,
      status: item.status,
    }));
    res.json({ items });
  });

  // A compact summary for the NoDesk "today" panel, assembled by NoNo.
  router.get('/internal/overview', requireInternalToken(context), asyncHandler(async (_req, res) => {
    res.json(await buildInternalOverview(context));
  }));

  router.get('/internal/notifications/legacy-channels', requireInternalToken(context), (_req, res) => {
    res.json({ channels: getLegacyChannelSettings(context) });
  });
}

export async function buildInternalOverview(context: AppContext) {
  const settings = getSettings(context);
  const year = Number(toIsoDate(context.now(), settings.timezone).slice(0, 4));
  const summary = getDashboardSummary(context, year, [...productAssetTypes]);
  const due = {
    buckets: summary.dueBuckets,
    next: summary.nextDueItems.map((item) => ({ assetType: item.assetType, id: item.assetId, name: item.name, dueDate: item.dueDate, daysLeft: item.daysLeft }))
  };
  // Exchange rates are fetched from the network; a failure only drops the converted total.
  const monthly = await convertTotals(context.fetch ?? globalThis.fetch, summary.predictedMonthly, settings.defaultCurrency).catch(() => null);
  return {
    product: 'nomoney',
    due,
    assetCounts: { phones: summary.assetCounts.phones, subscriptions: summary.assetCounts.subscriptions, domains: summary.assetCounts.domains },
    spending: {
      predictedMonthly: monthly,
      predictedMonthlyByCurrency: summary.predictedMonthly
    }
  };
}
