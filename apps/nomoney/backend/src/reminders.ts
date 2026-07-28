import crypto from 'node:crypto';
import type { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from './types.js';
import { collectDueItems, type DueItem } from './dashboard.js';
import { getSettings } from './settings.js';
import { asyncHandler } from './http.js';
import { toIsoDateTime } from './utils.js';

const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export function registerReminderRoutes(router: Router, context: AppContext): void {
  router.post(
    '/reminders/run-now',
    asyncHandler(async (_req, res) => {
      res.json(await runReminderScan(context));
    })
  );

  router.get('/reminders/logs', (req, res) => {
    const query = logQuerySchema.parse(req.query);
    const total = context.db.get<{ count: number }>('SELECT COUNT(*) as count FROM reminder_logs');
    const rows = context.db.all<Record<string, unknown>>(
      'SELECT * FROM reminder_logs ORDER BY sent_at DESC, id DESC LIMIT ? OFFSET ?',
      [query.limit, query.offset]
    );
    res.json({
      items: rows.map(mapReminderLog),
      meta: { total: Number(total?.count ?? 0), limit: query.limit, offset: query.offset }
    });
  });
}

export async function runReminderScan(context: AppContext) {
  const settings = getSettings(context);
  if (!settings.reminderEnabled) {
    return { sent: false, items: [] };
  }

  const maxDays = Math.max(...settings.reminderDays, 0);
  const dueItems = collectDueItems(context, maxDays).filter((item) =>
    settings.reminderDays.includes(item.daysLeft)
  );
  const unsent = dueItems.filter((item) => !hasSentReminder(context, item));

  if (unsent.length === 0) {
    return { sent: false, items: [] };
  }

  const runId = crypto.randomUUID();
  const sentAt = toIsoDateTime(context.now());

  try {
    await context.mailer.send({
      to: settings.smtpTo,
      from: settings.smtpFrom,
      subject: settings.language === 'en'
        ? `[Asset renewals] ${unsent.length} items need attention`
        : `[资产到期提醒] ${unsent.length} 个项目需要关注`,
      text: renderDigest(unsent, settings.language)
    });

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

function hasSentReminder(context: AppContext, item: DueItem): boolean {
  const row = context.db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM reminder_logs
     WHERE asset_type = ? AND asset_id = ? AND due_date = ? AND days_before = ? AND status = 'sent'`,
    [item.assetType, item.assetId, item.dueDate, item.daysLeft]
  );
  return Number(row?.count ?? 0) > 0;
}

function insertReminderLog(
  context: AppContext,
  runId: string,
  item: DueItem,
  sentAt: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
): void {
  context.db.run(
    `INSERT OR IGNORE INTO reminder_logs (
      run_id, asset_type, asset_id, due_date, days_before, sent_at, status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [runId, item.assetType, item.assetId, item.dueDate, item.daysLeft, sentAt, status, errorMessage]
  );
}

function renderDigest(items: DueItem[], language: 'zh' | 'en'): string {
  const label = (zh: string, en: string) => (language === 'en' ? en : zh);
  const lines = [label('NoMoney 资产到期提醒', 'NoMoney asset renewals'), ''];
  for (const item of items) {
    lines.push(
      `- ${item.assetType}: ${item.name}`,
      `  ${label('到期/扣费日期', 'Due date')}: ${item.dueDate}`,
      `  ${label('剩余天数', 'Days left')}: ${item.daysLeft}`,
      `  ${label('金额', 'Amount')}: ${item.currency} ${item.amountMinorUnits}`,
      item.renewalUrl ? `  ${label('续费链接', 'Renewal link')}: ${item.renewalUrl}` : ''
    );
  }
  return lines.filter(Boolean).join('\n');
}

function mapReminderLog(row: Record<string, unknown>) {
  return {
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
