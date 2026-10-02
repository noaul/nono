import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthUser } from '../types.js';
import {
  acceptsSeverity,
  deliverToChannel,
  encodeChannelConfig,
  type ChannelDeliveryDeps,
  type ChannelMessage,
  type NotificationChannelType,
  type StoredChannel,
} from './notification-channels.service.js';
import type { NotificationItem, NotificationService, NotificationSeverity, NotificationSource } from './notification.service.js';

/** Stop retrying a notification on a channel after this many failed pushes. */
export const MAX_DELIVERY_ATTEMPTS = 3;
const DIGEST_LINE_LIMIT = 20;
/**
 * NoMoney and Yumi push their own reminders and outage alerts through `relay`, with their own lead
 * times and retry rules. Their in-app feed items are therefore never pushed a second time here.
 */
const RELAYED_SOURCES = new Set<NotificationSource>(['nomoney', 'yumi']);

export type RelayProduct = 'nomoney' | 'yumi';

export interface ChannelResult {
  channelId: number;
  name: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface LegacyChannels {
  email: { host: string; port: number; user: string; from: string; to: string } | null;
  webhook: { url: string } | null;
  telegram: { botToken: string; chatId: string } | null;
  bark: { url: string } | null;
}

export interface NotificationDispatcherOptions {
  prisma: PrismaClient;
  notificationService: Pick<NotificationService, 'list'>;
  delivery: ChannelDeliveryDeps;
  /** Absolute origin used to turn in-app links into clickable URLs in pushed messages. */
  publicUrl?: string | null;
  /** Reads a product's pre-NoNo channel settings; null when the product has none. Throws when unreachable. */
  readLegacyChannels?: (product: RelayProduct) => Promise<LegacyChannels | null>;
  /** SMTP settings the products used to read from the environment; they win over saved values. */
  legacySmtpEnv?: { host?: string; port?: string; user?: string; password?: string; from?: string; to?: string };
  now?: () => Date;
}

export interface NotificationDispatcher {
  relay(product: RelayProduct, message: ChannelMessage & { severity: NotificationSeverity }): Promise<ChannelResult[]>;
  dispatchUser(user: AuthUser): Promise<{ sent: number; failed: number }>;
  runDue(): Promise<void>;
  test(channel: StoredChannel, user: Pick<AuthUser, 'role'>): Promise<ChannelResult>;
  importLegacyChannels(): Promise<'imported' | 'skipped' | 'unavailable'>;
}

export function createNotificationDispatcher(options: NotificationDispatcherOptions): NotificationDispatcher {
  const { prisma } = options;
  const now = options.now || (() => new Date());
  const publicUrl = (options.publicUrl || '').replace(/\/+$/, '');

  async function send(channel: StoredChannel, user: Pick<AuthUser, 'role'>, message: ChannelMessage): Promise<ChannelResult> {
    try {
      await deliverToChannel(options.delivery, channel, message, { allowPrivateSmtp: user.role === 'admin' });
      await prisma.notificationChannel.update({ where: { id: channel.id }, data: { lastSuccessAt: now(), lastError: null } });
      return { channelId: channel.id, name: channel.name, ok: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed';
      await prisma.notificationChannel.update({ where: { id: channel.id }, data: { lastError: reason } });
      return { channelId: channel.id, name: channel.name, ok: false, error: reason };
    }
  }

  async function record(channel: StoredChannel, key: string, source: string, title: string, result: ChannelResult) {
    await prisma.notificationDelivery.upsert({
      where: { channelId_key: { channelId: channel.id, key } },
      create: { userId: channel.userId, channelId: channel.id, key, source, title: title.slice(0, 300), status: result.ok ? 'sent' : 'failed', error: result.error ?? null },
      update: { status: result.ok ? 'sent' : 'failed', error: result.error ?? null, attempts: { increment: 1 } },
    });
  }

  async function adminUser() {
    return prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { id: 'asc' }, select: { id: true, role: true } });
  }

  function absolute(href: string) {
    if (!href || /^https?:\/\//i.test(href) || !publicUrl) return href;
    return `${publicUrl}${href.startsWith('/') ? '' : '/'}${href}`;
  }

  function digest(items: NotificationItem[]): ChannelMessage {
    const critical = items.filter((item) => item.severity === 'critical').length;
    const lines = items.slice(0, DIGEST_LINE_LIMIT).map((item) => {
      const link = absolute(item.targetUrl || item.href);
      return [`• ${item.title}`, item.description ? `  ${item.description}` : '', link ? `  ${link}` : ''].filter(Boolean).join('\n');
    });
    if (items.length > DIGEST_LINE_LIMIT) lines.push(`…以及另外 ${items.length - DIGEST_LINE_LIMIT} 条，请在 NoDesk 通知中心查看。`);
    return {
      subject: critical ? `[NoNo] ${items.length} 条新通知（${critical} 条紧急）` : `[NoNo] ${items.length} 条新通知`,
      text: lines.join('\n\n'),
    };
  }

  async function dispatchUser(user: AuthUser) {
    const channels = await prisma.notificationChannel.findMany({ where: { userId: user.id, enabled: true }, orderBy: { id: 'asc' } });
    if (!channels.length) return { sent: 0, failed: 0 };
    const feed = await options.notificationService.list(user, { limit: 100 });
    const candidates = feed.items.filter((item) => !item.read && !RELAYED_SOURCES.has(item.source));
    if (!candidates.length) return { sent: 0, failed: 0 };

    const previous = await prisma.notificationDelivery.findMany({
      where: { channelId: { in: channels.map((channel) => channel.id) }, key: { in: candidates.map((item) => item.key) } },
      select: { channelId: true, key: true, status: true, attempts: true },
    });
    const done = new Set(previous
      .filter((entry) => entry.status === 'sent' || entry.attempts >= MAX_DELIVERY_ATTEMPTS)
      .map((entry) => `${entry.channelId}:${entry.key}`));

    let sent = 0;
    let failed = 0;
    for (const channel of channels) {
      const pending = candidates.filter((item) => acceptsSeverity(channel, item.severity) && !done.has(`${channel.id}:${item.key}`));
      if (!pending.length) continue;
      const result = await send(channel, user, digest(pending));
      for (const item of pending) await record(channel, item.key, item.source, item.title, result);
      if (result.ok) sent += pending.length;
      else failed += pending.length;
    }
    return { sent, failed };
  }

  return {
    async relay(product, message) {
      const admin = await adminUser();
      if (!admin) throw Object.assign(new Error('No NoNo administrator exists yet'), { statusCode: 409 });
      const channels = await prisma.notificationChannel.findMany({ where: { userId: admin.id, enabled: true }, orderBy: { id: 'asc' } });
      if (!channels.length) throw Object.assign(new Error('No notification channel is configured in NoNo'), { statusCode: 409 });
      const key = `relay:${product}:${randomUUID()}`;
      const results: ChannelResult[] = [];
      for (const channel of channels) {
        if (!acceptsSeverity(channel, message.severity)) {
          results.push({ channelId: channel.id, name: channel.name, ok: true, skipped: true });
          continue;
        }
        const result = await send(channel, { role: 'admin' }, { subject: message.subject, text: message.text });
        await record(channel, key, product, message.subject, result);
        results.push(result);
      }
      if (!results.some((result) => result.ok)) {
        const reasons = results.map((result) => `${result.name}: ${result.error}`).join('; ');
        throw Object.assign(new Error(`Every notification channel failed (${reasons})`), { statusCode: 502 });
      }
      return results;
    },

    dispatchUser,

    async runDue() {
      const owners = await prisma.notificationChannel.findMany({ where: { enabled: true }, distinct: ['userId'], select: { userId: true } });
      for (const { userId } of owners) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, email: true, displayName: true, role: true } });
        if (user) await dispatchUser(user as AuthUser);
      }
    },

    async test(channel, user) {
      return send(channel, user, {
        subject: '[NoNo] 测试通知',
        text: `这是一条来自 NoDesk 通知中心的测试消息，渠道“${channel.name}”可以正常接收通知。`,
      });
    },

    async importLegacyChannels() {
      const config = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { notificationChannelsImportedAt: true } });
      if (config?.notificationChannelsImportedAt) return 'skipped';
      const admin = await adminUser();
      if (!admin) return 'unavailable';
      const markImported = () => prisma.appConfig.upsert({
        where: { id: 1 },
        create: { id: 1, notificationChannelsImportedAt: now() },
        update: { notificationChannelsImportedAt: now() },
      });
      if (!options.readLegacyChannels || await prisma.notificationChannel.count({ where: { userId: admin.id } })) {
        await markImported();
        return 'skipped';
      }

      const sources: Array<[RelayProduct, LegacyChannels | null]> = [];
      for (const product of ['nomoney', 'yumi'] as const) {
        try {
          sources.push([product, await options.readLegacyChannels(product)]);
        } catch {
          // Try again on the next run rather than recording an import that saw nothing.
          return 'unavailable';
        }
      }

      const env = options.legacySmtpEnv || {};
      const seen = new Set<string>();
      const drafts: Array<{ type: NotificationChannelType; name: string; config: Record<string, unknown> }> = [];
      for (const [product, legacy] of sources) {
        if (!legacy) continue;
        const label = product === 'yumi' ? 'Yumi' : 'NoMoney';
        const add = (type: NotificationChannelType, identity: string, name: string, config: Record<string, unknown>) => {
          if (seen.has(`${type}:${identity}`)) return;
          seen.add(`${type}:${identity}`);
          drafts.push({ type, name: `${name}（从 ${label} 导入）`, config });
        };
        if (legacy.email) {
          // The products' mailer let the environment override saved SMTP values; keep that precedence.
          const email = {
            host: env.host || legacy.email.host,
            port: Number(env.port || legacy.email.port || 587),
            user: env.user || legacy.email.user,
            password: env.password || '',
            from: legacy.email.from || env.from || '',
            to: legacy.email.to,
          };
          add('email', `${email.host}|${email.to}`, '邮件', email);
        }
        if (legacy.webhook) add('webhook', legacy.webhook.url, 'Webhook', legacy.webhook);
        if (legacy.telegram) add('telegram', `${legacy.telegram.botToken}|${legacy.telegram.chatId}`, 'Telegram', legacy.telegram);
        if (legacy.bark) add('bark', legacy.bark.url, 'Bark', legacy.bark);
      }
      for (const draft of drafts) {
        try {
          await prisma.notificationChannel.create({
            data: {
              userId: admin.id,
              type: draft.type,
              name: draft.name,
              // The products pushed every reminder before, whatever its urgency.
              minSeverity: 'info',
              config: encodeChannelConfig(draft.type, draft.config, null, options.delivery.encryptionKey) as object,
            },
          });
        } catch {
          // A legacy value that no longer validates (an email channel without a host) is left out.
        }
      }
      await markImported();
      return 'imported';
    },
  };
}
