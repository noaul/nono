import type { RequestHandler } from 'express';

export type Currency = 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR' | 'CAD' | 'SGD' | 'AUD';
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'biennial';
export type AssetStatus = 'active' | 'paused' | 'expired' | 'cancelled' | 'archived';
export type AssetType = 'phone' | 'domain' | 'subscription';

/** Every asset type NoMoney manages, in navigation order. */
export const productAssetTypes: readonly AssetType[] = ['phone', 'domain', 'subscription'];

export type DbValue = string | number | null;

export interface DbClient {
  exec(sql: string): void;
  run(sql: string, params?: DbValue[]): void;
  get<T extends Record<string, unknown>>(sql: string, params?: DbValue[]): T | undefined;
  all<T extends Record<string, unknown>>(sql: string, params?: DbValue[]): T[];
  insert(sql: string, params?: DbValue[]): number;
  save(): void;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface RelayMessage {
  subject: string;
  text: string;
  severity: NotificationSeverity;
}

/**
 * Hands a message to NoNo, which owns the notification channels. Resolves once at least one channel
 * accepted it and rejects otherwise, so callers can keep the message queued and retry.
 */
export interface Notifier {
  sent: RelayMessage[];
  send(message: RelayMessage): Promise<void>;
}

export interface SessionUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

export type SessionVerifier = (token: string) => Promise<SessionUser | null>;

export interface AppContext {
  db: DbClient;
  /** Resolves a forwarded NoNo session cookie to its user, or null when it is not a live session. */
  verifySession: SessionVerifier;
  internalToken?: string;
  publicOrigin?: string;
  encryptionKey: string;
  now: () => Date;
  notifier: Notifier;
  fetch?: typeof fetch;
  privateOutboundHosts?: string[];
  /** Reads a host's TLS certificate; injectable for tests. */
  certificateProbe?: (hostname: string) => Promise<{ validTo: string; issuer: string | null }>;
}

export type AuthedHandler = RequestHandler;
