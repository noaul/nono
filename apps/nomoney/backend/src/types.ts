import type { RequestHandler } from 'express';

export type Currency = 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR' | 'CAD' | 'SGD' | 'AUD';
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'biennial';
export type AssetStatus = 'active' | 'paused' | 'expired' | 'cancelled' | 'archived';
export type AssetType = 'phone' | 'vps' | 'domain' | 'subscription';
export type ProductMode = 'nomoney' | 'yumi';

export type DbValue = string | number | null;

export interface DbClient {
  exec(sql: string): void;
  run(sql: string, params?: DbValue[]): void;
  get<T extends Record<string, unknown>>(sql: string, params?: DbValue[]): T | undefined;
  all<T extends Record<string, unknown>>(sql: string, params?: DbValue[]): T[];
  insert(sql: string, params?: DbValue[]): number;
  save(): void;
}

export interface MailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface Mailer {
  sent: MailMessage[];
  send(message: MailMessage): Promise<void>;
}

export type SshAuthType = 'password' | 'privateKey';

export interface SshExecOptions {
  host: string;
  port: number;
  username: string;
  authType: SshAuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  expectedHostFingerprint?: string;
  command: string;
  timeoutMs?: number;
}

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string;
  hostFingerprint?: string;
}

export type SshRunner = (options: SshExecOptions) => Promise<SshExecResult>;

export interface SessionUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

export type SessionVerifier = (token: string) => Promise<SessionUser | null>;

export interface AppContext {
  db: DbClient;
  product?: ProductMode;
  /** Resolves a forwarded NoNo session cookie to its user, or null when it is not a live session. */
  verifySession: SessionVerifier;
  internalToken?: string;
  publicOrigin?: string;
  encryptionKey: string;
  now: () => Date;
  mailer: Mailer;
  fetch?: typeof fetch;
  privateOutboundHosts?: string[];
  sshRunner?: SshRunner;
  /** Reads a host's TLS certificate; injectable for tests. */
  certificateProbe?: (hostname: string) => Promise<{ validTo: string; issuer: string | null }>;
}

export type AuthedHandler = RequestHandler;
