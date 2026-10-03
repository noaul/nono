import { createHash } from 'node:crypto';
import type { NotificationItem, NotificationSeverity, NotificationSource } from './notification.service.js';

/** Shared contract from docs/superpowers/plans/2026-10-02-android-app.md §4. */
export type MobileSource = NotificationSource;
export type MobileSeverity = NotificationSeverity;

export type MobileEvent = {
  eventId: string;
  userId: number;
  source: MobileSource;
  severity: MobileSeverity;
  targetPath: string;
  occurredAt: Date;
  expiresAt: Date;
  /** Server-side summary shown only to the signed-in owner; never sent to the push vendor. */
  title?: string;
};

/** Android notification channel; mirrors the three stable channel ids the app creates. */
export type MobileChannel = 'alerts' | 'reminders' | 'updates';

export type PushEnvelope = {
  eventId: string;
  title: 'NoNo';
  body: '有一条新的提醒，点击查看';
  targetPath: string;
  expiresAt: Date;
  channel: MobileChannel;
  /** Stable per (event, device) so a retry after an uncertain send keeps the vendor's dedupe identity. */
  dedupeKey: string;
};

export type PushResult =
  | { status: 'accepted'; providerMessageId: string }
  | { status: 'retryable'; code: string }
  | { status: 'invalid-token' | 'configuration-error'; code: string };

export interface MobilePushProvider {
  readonly name: string;
  send(registrationId: string, message: PushEnvelope): Promise<PushResult>;
}

export const MOBILE_SOURCES: readonly MobileSource[] = ['nodesk', 'nomoney', 'yumi', 'nostar', 'links', 'backup'];
export const PUSH_TITLE = 'NoNo' as const;
export const PUSH_BODY = '有一条新的提醒，点击查看' as const;
/** Alerts are worthless after an hour; reminders and updates for a day. */
export const ALERT_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_EVENT_ID_LENGTH = 200;

const SEVERITY_RANK: Record<MobileSeverity, number> = { info: 0, warning: 1, critical: 2 };

const SOURCE_FALLBACK_PATH: Record<MobileSource, string> = {
  nodesk: '/nodesk',
  nomoney: '/nomoney/',
  yumi: '/yumi/',
  nostar: '/nostar/',
  links: '/admin/links',
  backup: '/nodesk/?settings=backups',
};

export function eventTtlMs(severity: MobileSeverity) {
  return severity === 'critical' ? ALERT_TTL_MS : DEFAULT_TTL_MS;
}

export function channelFor(severity: MobileSeverity): MobileChannel {
  if (severity === 'critical') return 'alerts';
  if (severity === 'warning') return 'reminders';
  return 'updates';
}

export function atLeastSeverity(severity: MobileSeverity, minimum: MobileSeverity) {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}

export function isEventId(value: string) {
  return value.length > 0 && value.length <= MAX_EVENT_ID_LENGTH && /^[A-Za-z0-9:._\/-]+$/.test(value);
}

/**
 * Only same-origin absolute paths reach the phone. Anything else (external release URLs, protocol
 * relative or backslash tricks) falls back to the source's own page.
 */
export function internalTargetPath(source: MobileSource, href: string | null | undefined) {
  const value = (href || '').trim();
  if (value.length <= 500 && /^\/(?![\/\\])[^\s\\]*$/.test(value)) return value;
  return SOURCE_FALLBACK_PATH[source];
}

/** Maps a notification-center item to a push event. The stable item key is the event id. */
export function eventFromNotification(userId: number, item: NotificationItem, now: Date): MobileEvent {
  const occurred = new Date(item.occurredAt);
  return {
    eventId: item.key,
    userId,
    source: item.source,
    severity: item.severity,
    targetPath: internalTargetPath(item.source, item.href),
    occurredAt: Number.isNaN(occurred.getTime()) ? now : occurred,
    expiresAt: new Date(now.getTime() + eventTtlMs(item.severity)),
    title: item.title.slice(0, 300),
  };
}

/** Vendor-facing dedupe identity for one (event, device) pair: 20 hex characters. */
export function pushDedupeKey(eventRowId: number | string, deviceId: string) {
  return createHash('sha256').update(`${eventRowId}:${deviceId}`).digest('hex').slice(0, 20);
}

export function buildEnvelope(event: { eventId: string; targetPath: string; expiresAt: Date; severity: MobileSeverity }, dedupeKey: string): PushEnvelope {
  return {
    eventId: event.eventId,
    title: PUSH_TITLE,
    body: PUSH_BODY,
    targetPath: event.targetPath,
    expiresAt: event.expiresAt,
    channel: channelFor(event.severity),
    dedupeKey,
  };
}

/** Error codes are stored and shown; keep them short and free of anything a vendor echoed back. */
export function sanitizeErrorCode(code: string) {
  return code.replace(/[^A-Za-z0-9:._-]/g, '').slice(0, 64) || 'unknown';
}
