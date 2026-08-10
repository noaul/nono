import type { RequestHandler } from 'express';

export type Currency = 'CNY' | 'USD' | 'GBP' | 'EUR' | 'CAD';
export type BillingCycle = 'monthly' | 'quarterly' | 'annual' | 'biennial';
export type AssetStatus = 'active' | 'paused' | 'expired' | 'cancelled' | 'archived';
export type AssetType = 'phone' | 'vps' | 'domain' | 'subscription';

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

export interface AppContext {
  db: DbClient;
  jwtSecret: string;
  internalToken?: string;
  encryptionKey: string;
  cookieSecure: boolean;
  cookiePath: string;
  now: () => Date;
  mailer: Mailer;
  fetch?: typeof fetch;
  privateOutboundHosts?: string[];
  sshRunner?: SshRunner;
}

export type AuthedHandler = RequestHandler;
