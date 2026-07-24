import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../types.js';
import type { BackupService, BackupCommandRunner } from './backup.service.js';
import { runBackupCommand } from './backup.service.js';
import type { BackupAutomationService, BackupAutomationSnapshot } from './backup-automation.service.js';

export type NotificationSource = 'nodesk' | 'nomoney' | 'nostar' | 'links' | 'backup';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface NotificationItem {
  key: string;
  source: NotificationSource;
  severity: NotificationSeverity;
  title: string;
  description: string;
  href: string;
  occurredAt: string;
  dueAt: string | null;
  read: boolean;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unreadCount: number;
  urgentUnreadCount: number;
  generatedAt: string;
}

export interface NoMoneyDueItem {
  assetType: 'domain' | 'vps' | 'subscription';
  id: number;
  name: string;
  dueDate: string;
  status: string;
}

export interface NotificationService {
  list(user: AuthUser, options?: { limit?: number; sources?: NotificationSource[] }): Promise<NotificationFeed>;
  markRead(user: AuthUser, key: string, read: boolean): Promise<void>;
  markAllRead(user: AuthUser, options?: { sources?: NotificationSource[] }): Promise<number>;
  dismiss(user: AuthUser, key: string): Promise<void>;
}

export interface NotificationServiceOptions {
  prisma: PrismaClient;
  nodeskReader: () => Promise<unknown>;
  noMoneyReader: () => Promise<NoMoneyDueItem[]>;
  backupService: Pick<BackupService, 'list'>;
  backupAutomationService?: Pick<BackupAutomationService, 'get'>;
  now?: () => Date;
  timeZone?: string;
  backupStaleHours?: number;
}

type RawNotification = Omit<NotificationItem, 'read'>;

export function createNotificationService(options: NotificationServiceOptions): NotificationService {
  const now = options.now || (() => new Date());
  const timeZone = options.timeZone || process.env.TZ || 'Asia/Shanghai';
  const backupStaleHours = options.backupStaleHours;

  async function collect(user: AuthUser, sources?: NotificationSource[]): Promise<RawNotification[]> {
    const requested = sources?.length ? new Set(sources) : null;
    const includes = (source: NotificationSource) => !requested || requested.has(source);
    const [links, releases] = await Promise.all([
      includes('links') ? collectLinkNotifications(options.prisma, user.id, now()) : Promise.resolve([]),
      includes('nostar') ? collectReleaseNotifications(options.prisma, user.id) : Promise.resolve([]),
    ]);
    const globalCollectors: Array<Promise<RawNotification[]>> = [];
    if (user.role === 'admin') {
      if (includes('nodesk')) globalCollectors.push(collectNodeskNotifications(options.nodeskReader, now(), timeZone));
      if (includes('nomoney')) globalCollectors.push(collectNoMoneyNotifications(options.noMoneyReader, now(), timeZone));
      if (includes('backup')) globalCollectors.push(collectBackupNotifications(options.backupService, options.backupAutomationService, now(), backupStaleHours));
    }
    const global = (await Promise.all(globalCollectors)).flat();
    return [...links, ...releases, ...global].sort(compareNotifications);
  }

  async function currentItem(user: AuthUser, key: string) {
    assertNotificationKey(key);
    const item = (await collect(user)).find((entry) => entry.key === key);
    if (!item) throw httpError(404, 'Notification not found');
    return item;
  }

  return {
    async list(user, listOptions = {}) {
      const generatedAt = now().toISOString();
      const rawItems = filterNotificationSources(await collect(user, listOptions.sources), listOptions.sources);
      const states = rawItems.length
        ? await options.prisma.notificationState.findMany({
            where: { userId: user.id, key: { in: rawItems.map((item) => item.key) } },
            select: { key: true, readAt: true, dismissedAt: true },
          })
        : [];
      const stateByKey = new Map(states.map((state) => [state.key, state]));
      const visible = rawItems
        .filter((item) => !stateByKey.get(item.key)?.dismissedAt)
        .map((item) => ({ ...item, read: Boolean(stateByKey.get(item.key)?.readAt) }));
      const limit = Math.max(1, Math.min(100, listOptions.limit || 50));
      return {
        items: visible.slice(0, limit),
        unreadCount: visible.filter((item) => !item.read).length,
        urgentUnreadCount: visible.filter((item) => !item.read && item.severity !== 'info').length,
        generatedAt,
      };
    },

    async markRead(user, key, read) {
      await currentItem(user, key);
      const readAt = read ? now() : null;
      await options.prisma.notificationState.upsert({
        where: { userId_key: { userId: user.id, key } },
        update: { readAt },
        create: { userId: user.id, key, readAt },
      });
    },

    async markAllRead(user, markOptions = {}) {
      const items = filterNotificationSources(await collect(user, markOptions.sources), markOptions.sources);
      const readAt = now();
      await Promise.all(items.map((item) => options.prisma.notificationState.upsert({
        where: { userId_key: { userId: user.id, key: item.key } },
        update: { readAt },
        create: { userId: user.id, key: item.key, readAt },
      })));
      return items.length;
    },

    async dismiss(user, key) {
      await currentItem(user, key);
      const dismissedAt = now();
      await options.prisma.notificationState.upsert({
        where: { userId_key: { userId: user.id, key } },
        update: { readAt: dismissedAt, dismissedAt },
        create: { userId: user.id, key, readAt: dismissedAt, dismissedAt },
      });
    },
  };
}

function filterNotificationSources(items: RawNotification[], sources?: NotificationSource[]) {
  if (!sources?.length) return items;
  const allowed = new Set(sources);
  return items.filter((item) => allowed.has(item.source));
}

export function createNoMoneyDueReader(
  nomoneyDataDir: string,
  run: BackupCommandRunner = runBackupCommand,
): () => Promise<NoMoneyDueItem[]> {
  const databasePath = path.join(nomoneyDataDir, 'app.db');
  return async () => {
    if (!fs.existsSync(databasePath)) return [];
    const result = await run('sqlite3', ['-readonly', '-json', databasePath, NO_MONEY_DUE_QUERY]);
    if (!result.stdout.trim()) return [];
    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      const assetType = String(row.asset_type || '');
      const id = Number(row.id);
      const name = String(row.name || '').trim();
      const dueDate = String(row.due_date || '');
      if (!['domain', 'vps', 'subscription'].includes(assetType) || !Number.isSafeInteger(id) || !name || !isDateKey(dueDate)) return [];
      return [{ assetType: assetType as NoMoneyDueItem['assetType'], id, name, dueDate, status: String(row.status || '') }];
    });
  };
}

const NO_MONEY_DUE_QUERY = `
SELECT 'domain' AS asset_type, id, domain_name AS name,
       COALESCE(NULLIF(next_due_date, ''), NULLIF(expire_date, '')) AS due_date, status
FROM domains
WHERE archived_at IS NULL AND status NOT IN ('cancelled', 'archived')
UNION ALL
SELECT 'vps' AS asset_type, id, name,
       COALESCE(NULLIF(next_due_date, ''), NULLIF(expire_date, '')) AS due_date, status
FROM vps
WHERE archived_at IS NULL AND status NOT IN ('cancelled', 'archived')
UNION ALL
SELECT 'subscription' AS asset_type, id, name, NULLIF(next_due_date, '') AS due_date, status
FROM subscriptions
WHERE archived_at IS NULL AND status NOT IN ('cancelled', 'archived');
`;

async function collectLinkNotifications(prisma: PrismaClient, userId: number, fallbackNow: Date): Promise<RawNotification[]> {
  const links = await prisma.link.findMany({
    where: {
      folder: { userId },
      healthStatus: { in: ['broken', 'timeout', 'invalid', 'redirected'] },
    },
    select: {
      id: true,
      name: true,
      url: true,
      healthStatus: true,
      healthStatusCode: true,
      healthReason: true,
      healthFinalUrl: true,
      healthCheckedAt: true,
      folder: { select: { name: true } },
    },
    orderBy: [{ healthCheckedAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
  return links.map((link) => {
    const status = link.healthStatus || 'broken';
    const statusLabel = status === 'redirected' ? '发生重定向' : status === 'timeout' ? '检测超时' : status === 'invalid' ? '链接无效' : '访问异常';
    return {
      key: stableKey('links', `${link.id}:${status}`),
      source: 'links',
      severity: status === 'redirected' || status === 'timeout' ? 'warning' : 'critical',
      title: `${link.name} ${statusLabel}`,
      description: link.healthReason || (link.healthStatusCode ? `HTTP ${link.healthStatusCode}` : `${link.folder.name} · ${link.url}`),
      href: '/admin/links',
      occurredAt: (link.healthCheckedAt || fallbackNow).toISOString(),
      dueAt: null,
    };
  });
}

async function collectReleaseNotifications(prisma: PrismaClient, userId: number): Promise<RawNotification[]> {
  const releases = await prisma.noStarRelease.findMany({
    where: { userId, isRead: false },
    select: {
      githubId: true,
      repoFullName: true,
      tagName: true,
      name: true,
      htmlUrl: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  return releases.map((release) => ({
    key: stableKey('nostar', release.githubId.toString()),
    source: 'nostar',
    severity: 'info',
    title: `${release.repoFullName} 发布 ${release.tagName}`,
    description: release.name || 'NoStar 发现新的 GitHub Release',
    href: release.htmlUrl || '/nostar/',
    occurredAt: (release.publishedAt || release.createdAt).toISOString(),
    dueAt: null,
  }));
}

async function collectNodeskNotifications(reader: () => Promise<unknown>, current: Date, timeZone: string): Promise<RawNotification[]> {
  const content = await reader().catch(() => null);
  const record = asRecord(content);
  const events = Array.isArray(record?.calendarEvents) ? record.calendarEvents : [];
  const today = dateKeyInTimeZone(current, timeZone);
  const lastDay = addDateDays(today, 3);
  return events.flatMap((value) => {
    const event = asRecord(value);
    const id = typeof event?.id === 'string' ? event.id.trim() : '';
    const date = typeof event?.date === 'string' ? event.date : '';
    const title = typeof event?.title === 'string' ? event.title.trim() : '';
    const time = typeof event?.time === 'string' && /^\d{2}:\d{2}$/.test(event.time) ? event.time : '';
    if (!id || !title || !isDateKey(date) || date < today || date > lastDay) return [];
    const note = typeof event?.note === 'string' ? event.note.trim() : '';
    const dueAt = `${date}T${time || '23:59'}:00`;
    return [{
      key: stableKey('nodesk', `${id}:${date}`),
      source: 'nodesk' as const,
      severity: date === today ? 'warning' as const : 'info' as const,
      title,
      description: [date, time, note].filter(Boolean).join(' · '),
      href: '/nodesk',
      occurredAt: dueAt,
      dueAt,
    }];
  });
}

async function collectNoMoneyNotifications(reader: () => Promise<NoMoneyDueItem[]>, current: Date, timeZone: string): Promise<RawNotification[]> {
  const items = await reader().catch(() => []);
  const today = dateKeyInTimeZone(current, timeZone);
  const firstDay = addDateDays(today, -30);
  const lastDay = addDateDays(today, 30);
  const sourceNames = { domain: '域名', vps: 'VPS', subscription: '订阅' } as const;
  const hrefs = { domain: '/nomoney/domains', vps: '/nomoney/vps', subscription: '/nomoney/subscriptions' } as const;
  return items
    .filter((item) => isDateKey(item.dueDate) && item.dueDate >= firstDay && item.dueDate <= lastDay)
    .map((item) => {
      const daysLeft = daysBetween(today, item.dueDate);
      const timing = daysLeft < 0 ? `已逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今天到期' : `${daysLeft} 天后到期`;
      return {
        key: stableKey('nomoney', `${item.assetType}:${item.id}:${item.dueDate}`),
        source: 'nomoney' as const,
        severity: daysLeft < 0 ? 'critical' as const : daysLeft <= 7 ? 'warning' as const : 'info' as const,
        title: `${sourceNames[item.assetType]} ${item.name} ${timing}`,
        description: `到期日期 ${item.dueDate}`,
        href: hrefs[item.assetType],
        occurredAt: `${item.dueDate}T23:59:00`,
        dueAt: `${item.dueDate}T23:59:00`,
      };
    });
}

async function collectBackupNotifications(
  service: Pick<BackupService, 'list'>,
  automationService: Pick<BackupAutomationService, 'get'> | undefined,
  current: Date,
  configuredStaleHours?: number,
): Promise<RawNotification[]> {
  const automation = await automationService?.get().catch(() => null) || null;
  const notifications = activeBackupFailure(automation);
  const backups = await service.list().catch(() => []);
  if (!backups.length) {
    notifications.push({
      key: stableKey('backup', 'missing'),
      source: 'backup',
      severity: 'critical',
      title: '尚无可用的全站备份',
      description: '请创建并校验一次全站备份',
      href: '/admin/backups',
      occurredAt: current.toISOString(),
      dueAt: null,
    });
    return notifications;
  }
  const latest = backups.reduce((left, right) => left.createdAt > right.createdAt ? left : right);
  const staleHours = configuredStaleHours ?? cadenceStaleHours(automation);
  const ageHours = (current.getTime() - new Date(latest.createdAt).getTime()) / 3_600_000;
  if (Number.isFinite(ageHours) && ageHours > staleHours) {
    notifications.push({
      key: stableKey('backup', `stale:${latest.id}`),
      source: 'backup',
      severity: 'warning',
      title: '全站备份已过期',
      description: `最近备份创建于 ${latest.createdAt}`,
      href: '/admin/backups',
      occurredAt: latest.createdAt,
      dueAt: null,
    });
  }
  return notifications;
}

function activeBackupFailure(automation: BackupAutomationSnapshot | null): RawNotification[] {
  const failureAt = automation?.status.lastFailureAt;
  const successAt = automation?.status.lastSuccessAt;
  const error = automation?.status.lastError;
  if (!failureAt || !error || (successAt && successAt >= failureAt)) return [];
  return [{
    key: stableKey('backup', `failure:${failureAt}`),
    source: 'backup',
    severity: 'critical',
    title: '自动备份失败',
    description: error,
    href: '/admin/backups',
    occurredAt: failureAt,
    dueAt: null,
  }];
}

function cadenceStaleHours(automation: BackupAutomationSnapshot | null) {
  if (!automation?.settings.enabled) return 72;
  return automation.settings.cadence === 'weekly' ? 24 * 8 : 48;
}

function stableKey(source: NotificationSource, identity: string) {
  return `${source}:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function assertNotificationKey(key: string) {
  if (!/^(nodesk|nomoney|nostar|links|backup):[a-f0-9]{24}$/.test(key)) throw httpError(404, 'Notification not found');
}

function compareNotifications(left: RawNotification, right: RawNotification) {
  const severity = { critical: 0, warning: 1, info: 2 };
  const severityDifference = severity[left.severity] - severity[right.severity];
  if (severityDifference) return severityDifference;
  if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
  if (left.dueAt) return -1;
  if (right.dueAt) return 1;
  return right.occurredAt.localeCompare(left.occurredAt);
}

function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDateDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string) {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000);
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
