import type { Router } from 'express';
import { collectDueItems } from './dashboard.js';
import { requireInternalToken } from './renewals.js';
import type { AppContext, AssetType } from './types.js';

const productAssetTypes: Record<'nomoney' | 'yumi', AssetType[]> = {
  nomoney: ['phone', 'subscription'],
  yumi: ['vps', 'domain'],
};

export function registerInternalNotificationRoutes(router: Router, context: AppContext): void {
  router.get('/internal/notifications/due', requireInternalToken(context), (_req, res) => {
    const product = context.product === 'yumi' ? 'yumi' : 'nomoney';
    const items = collectDueItems(context, 30, productAssetTypes[product]).map((item) => ({
      assetType: item.assetType,
      id: item.assetId,
      name: item.name,
      dueDate: item.dueDate,
      status: item.status,
    }));
    res.json({ items });
  });
}
