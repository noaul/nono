import crypto from 'node:crypto';
import type { Router } from 'express';
import { z } from 'zod';
import type { AppContext, AssetType } from './types.js';
import { assetConfigs } from './assets.js';
import { collectDueItems, type DueItem } from './dashboard.js';
import { getSettings } from './settings.js';
import { notify } from './notifier.js';
import { asyncHandler } from './http.js';
import { toIsoDateTime } from './utils.js';

const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export function registerReminderRoutes(router: Router, context: AppContext, allowedTypes?: AssetType[]): void {
  router.post(
    '/reminders/run-now',
    asyncHandler(async (_req, res) => {
      res.json(await runReminderScan(context, allowedTypes));
    })
  );

  router.get('/reminders/logs', (req, res) => {
    const query = logQuerySchema.parse(req.query);
    const types = allowedTypes ?? ['phone', 'vps', 'domain', 'subscription'];
    const placeholders = types.map(() => '?').join(', ');
    const total = context.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM reminder_logs WHERE asset_type IN (${placeholders})`, types);
    const rows = context.db.all<Record<string, unknown>>(
      `SELECT * FROM reminder_logs WHERE asset_type IN (${placeholders}) ORDER BY sent_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...types, query.limit, query.offset]
    );
    res.json({
      items: rows.map((row) => mapReminderLog(context, row)),
      meta: { total: Number(total?.count ?? 0), limit: query.limit, offset: query.offset }
    });
  });
}

export async function runReminderScan(context: AppContext, allowedTypes?: AssetType[]) {
  const settings = getSettings(context);
  if (!settings.reminderEnabled) {
    return { sent: false, items: [] };
  }

  const thresholds = settings.reminderDays;
  const maxDays = Math.max(...thresholds, 0);
  const dueItems: ReminderItem[] = [];
  for (const item of collectDueItems(context, maxDays, allowedTypes)) {
    const threshold = activeThreshold(item.daysLeft, thresholds);
    if (threshold !== null) dueItems.push({ ...item, threshold });
  }
  const unsent = dueItems.filter((item) => !hasSentReminder(context, item));

  if (unsent.length === 0) {
    return { sent: false, items: [] };
  }

  const runId = crypto.randomUUID();
  const sentAt = toIsoDateTime(context.now());

  try {
    const results = await notify(context, {
      subject: settings.language === 'en'
        ? `[${productName(context)}] ${unsent.length} renewals need attention`
        : `[${productName(context)} 到期提醒] ${unsent.length} 个项目需要关注`,
      text: renderDigest(unsent, settings.language, productName(context))
    });
    // Delivered if any channel got it; a dead webhook should not block email.
    if (!results.some((result) => result.ok)) {
      throw new Error(results.map((result) => `${result.channel}: ${result.error}`).join('; ') || 'No notification channel is configured');
    }

    for (const item of unsent) {
      insertReminderLog(context, runId, item, sentAt, 'sent', null);
    }
    return { sent: true, items: unsent };
  } catch (error) {
    for (const item of unsent) {
      insertReminderLog(
        context,
        runId,
        item,
        sentAt,
        'failed',
        error instanceof Error ? error.message : 'Unknown email error'
      );
    }
    return { sent: false, items: unsent };
  }
}

type ReminderItem = DueItem & { threshold: number };

// Overdue items are re-sent once per mark, then left alone.
const overdueMarks = [-1, -7, -14, -30];

/**
 * The reminder mark an item currently sits in: the smallest configured lead
 * time that is still >= daysLeft. Matching a range rather than the exact day
 * means a missed daily run is caught up on the next one.
 */
export function activeThreshold(daysLeft: number, thresholds: number[]): number | null {
  if (daysLeft < 0) {
    if (daysLeft < overdueMarks[overdueMarks.length - 1]) return null;
    return overdueMarks.filter((mark) => daysLeft <= mark).at(-1) ?? null;
  }
  return [...thresholds].sort((a, b) => a - b).find((days) => days >= daysLeft) ?? null;
}

function productName(context: AppContext) {
  return context.product === 'yumi' ? 'Yumi' : 'NoMoney';
}

function hasSentReminder(context: AppContext, item: ReminderItem): boolean {
  const row = context.db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM reminder_logs
     WHERE asset_type = ? AND asset_id = ? AND due_date = ? AND days_before = ? AND status = 'sent'`,
    [item.assetType, item.assetId, item.dueDate, item.threshold]
  );
  return Number(row?.count ?? 0) > 0;
}

function insertReminderLog(
  context: AppContext,
  runId: string,
  item: ReminderItem,
  sentAt: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
): void {
  context.db.run(
    `INSERT OR IGNORE INTO reminder_logs (
      run_id, asset_type, asset_id, due_date, days_before, sent_at, status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [runId, item.assetType, item.assetId, item.dueDate, item.threshold, sentAt, status, errorMessage]
  );
}

const typeLabels: Record<AssetType, { zh: string; en: string }> = {
  phone: { zh: '电话卡', en: 'Phone card' },
  subscription: { zh: '订阅', en: 'Subscription' },
  vps: { zh: 'VPS', en: 'VPS' },
  domain: { zh: '域名', en: 'Domain' }
};

const currencySymbols: Record<string, string> = { CNY: '¥', USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', HKD: 'HK$', JPY: 'JP¥', SGD: 'S$', AUD: 'A$' };

// Every currency, JPY included, is stored in hundredths.
export function formatMoney(amountMinorUnits: number, currency: string): string {
  return `${currencySymbols[currency] ?? ''}${(amountMinorUnits / 100).toFixed(2)} ${currency}`;
}

function renderDigest(items: DueItem[], language: 'zh' | 'en', product: string): string {
  const label = (zh: string, en: string) => (language === 'en' ? en : zh);
  const lines = [label(`${product} 到期提醒`, `${product} renewals`), ''];
  for (const item of items) {
    const type = typeLabels[item.assetType]?.[language] ?? item.assetType;
    const days = item.daysLeft < 0
      ? label(`已逾期 ${-item.daysLeft} 天`, `${-item.daysLeft} days overdue`)
      : item.daysLeft === 0 ? label('今天', 'today') : String(item.daysLeft);
    const keepalive = item.kind === 'keepalive';
    const certificate = item.kind === 'certificate';
    const suffix = keepalive ? label('（保号）', ' (keep-alive)') : certificate ? label('（SSL 证书）', ' (TLS certificate)') : '';
    const dateLabel = keepalive ? label('保号截止', 'Keep-alive deadline') : certificate ? label('证书到期', 'Certificate expires') : label('到期/扣费日期', 'Due date');
    lines.push(
      `- ${type}: ${item.name}${suffix}`,
      `  ${dateLabel}: ${item.dueDate}`,
      `  ${label('剩余天数', 'Days left')}: ${days}`,
      certificate || (keepalive && !item.amountMinorUnits) ? '' : `  ${keepalive ? label('最低保号金额', 'Minimum top-up') : label('金额', 'Amount')}: ${formatMoney(item.amountMinorUnits, item.currency)}`,
      item.autoRenew ? `  ${label('已开启自动续费', 'Auto-renew is on')}` : '',
      !certificate && item.renewalUrl ? `  ${label('续费链接', 'Renewal link')}: ${item.renewalUrl}` : ''
    );
  }
  return lines.filter(Boolean).join('\n');
}

function mapReminderLog(context: AppContext, row: Record<string, unknown>) {
  const config = assetConfigs.find((item) => item.type === row.asset_type);
  const asset = config
    ? context.db.get<Record<string, unknown>>(`SELECT ${config.displayField} AS name FROM ${config.table} WHERE id = ?`, [Number(row.asset_id)])
    : undefined;
  return {
    assetName: typeof asset?.name === 'string' ? asset.name : null,
    id: Number(row.id),
    runId: row.run_id,
    assetType: row.asset_type,
    assetId: Number(row.asset_id),
    dueDate: row.due_date,
    daysBefore: Number(row.days_before),
    sentAt: row.sent_at,
    status: row.status,
    errorMessage: row.error_message ?? null
  };
}
