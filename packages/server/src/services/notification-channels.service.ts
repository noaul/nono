import nodemailer from 'nodemailer';
import { z } from 'zod';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import type { requestSafeResource, resolvePublicAddress } from '../utils/safe-fetch.js';
import type { NotificationSeverity } from './notification.service.js';

export const NOTIFICATION_CHANNEL_TYPES = ['email', 'webhook', 'telegram', 'bark'] as const;
export type NotificationChannelType = typeof NOTIFICATION_CHANNEL_TYPES[number];
export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'critical'] as const;

const configSchemas = {
  email: z.object({
    host: z.string().trim().min(1).max(255),
    port: z.coerce.number().int().min(1).max(65535).default(587),
    user: z.string().trim().max(255).default(''),
    password: z.string().max(1024).default(''),
    from: z.string().trim().max(320).default(''),
    to: z.string().trim().min(3).max(1000),
  }),
  webhook: z.object({ url: z.url({ protocol: /^https?$/ }).max(2048) }),
  telegram: z.object({ botToken: z.string().trim().max(200).default(''), chatId: z.string().trim().min(1).max(100) }),
  bark: z.object({ url: z.string().trim().max(2048).default('') }),
} satisfies Record<NotificationChannelType, z.ZodType>;

/** Fields stored encrypted and never returned; a blank value on update keeps the stored one. */
const secretFields: Record<NotificationChannelType, string[]> = {
  email: ['password'],
  webhook: [],
  telegram: ['botToken'],
  bark: ['url'],
};

export interface StoredChannel {
  id: number;
  userId: number;
  type: string;
  name: string;
  enabled: boolean;
  minSeverity: string;
  config: unknown;
  lastSuccessAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelMessage {
  subject: string;
  text: string;
}

export interface ChannelDeliveryDeps {
  encryptionKey: string;
  safeRequester: typeof requestSafeResource;
  publicAddressResolver: typeof resolvePublicAddress;
  privateOutboundHosts: string[];
  /** Replaced in tests; defaults to a real SMTP transport. */
  sendMail?: (transport: { host: string; port: number; user: string; password: string }, mail: { from: string; to: string; subject: string; text: string }) => Promise<void>;
}

export function isChannelType(value: string): value is NotificationChannelType {
  return (NOTIFICATION_CHANNEL_TYPES as readonly string[]).includes(value);
}

export function severityRank(severity: string) {
  return Math.max(0, (NOTIFICATION_SEVERITIES as readonly string[]).indexOf(severity));
}

export function acceptsSeverity(channel: Pick<StoredChannel, 'minSeverity'>, severity: NotificationSeverity) {
  return severityRank(severity) >= severityRank(channel.minSeverity);
}

/**
 * Validates submitted config for a channel type, encrypts its secret fields and keeps stored secrets
 * the caller left blank. Throws a 400 when a required secret is still missing.
 */
export function encodeChannelConfig(type: NotificationChannelType, input: unknown, previous: unknown, encryptionKey: string) {
  const parsed = configSchemas[type].parse(input ?? {}) as Record<string, unknown>;
  const stored = (previous && typeof previous === 'object' ? previous : {}) as Record<string, unknown>;
  for (const field of secretFields[type]) {
    const value = String(parsed[field] ?? '').trim();
    parsed[field] = value ? encryptSecret(value, encryptionKey) : (stored[field] ?? '');
  }
  if (type === 'telegram' && !parsed.botToken) throw badRequest('Telegram bot token is required');
  if (type === 'bark' && !parsed.url) throw badRequest('Bark URL is required');
  return parsed;
}

export function decodeChannelConfig(channel: Pick<StoredChannel, 'type' | 'config'>, encryptionKey: string) {
  const config = { ...((channel.config && typeof channel.config === 'object' ? channel.config : {}) as Record<string, unknown>) };
  for (const field of secretFields[channel.type as NotificationChannelType] || []) {
    config[field] = config[field] ? decryptSecret(String(config[field]), encryptionKey) || '' : '';
  }
  return config;
}

export function publicChannel(channel: StoredChannel) {
  const config = { ...((channel.config && typeof channel.config === 'object' ? channel.config : {}) as Record<string, unknown>) };
  for (const field of secretFields[channel.type as NotificationChannelType] || []) {
    config[`${field}Set`] = Boolean(config[field]);
    config[field] = '';
  }
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    enabled: channel.enabled,
    minSeverity: channel.minSeverity,
    config,
    lastSuccessAt: channel.lastSuccessAt,
    lastError: channel.lastError,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

/** Sends one message to one channel, throwing with a readable reason when it is not accepted. */
export async function deliverToChannel(deps: ChannelDeliveryDeps, channel: StoredChannel, message: ChannelMessage, options: { allowPrivateSmtp: boolean }) {
  const config = decodeChannelConfig(channel, deps.encryptionKey);
  if (channel.type === 'email') {
    const host = String(config.host || '');
    if (!options.allowPrivateSmtp && !deps.privateOutboundHosts.includes(host.toLowerCase())) {
      // Other accounts must not point SMTP at the server's own network.
      await deps.publicAddressResolver(host);
    }
    const send = deps.sendMail || sendSmtpMail;
    await send(
      { host, port: Number(config.port || 587), user: String(config.user || ''), password: String(config.password || '') },
      { from: String(config.from || config.user || config.to), to: String(config.to), subject: message.subject, text: message.text },
    );
    return;
  }
  if (channel.type === 'webhook') {
    await postJson(deps, String(config.url), {
      source: 'nono',
      subject: message.subject,
      text: message.text,
      // Lets Slack/Discord-style incoming webhooks render the message as-is.
      content: `${message.subject}\n\n${message.text}`,
    });
    return;
  }
  if (channel.type === 'telegram') {
    const url = `https://api.telegram.org/bot${encodeURIComponent(String(config.botToken))}/sendMessage`;
    for (const text of splitMessage(`${message.subject}\n\n${message.text}`, 4000)) {
      await postJson(deps, url, { chat_id: config.chatId, text, disable_web_page_preview: true });
    }
    return;
  }
  if (channel.type === 'bark') {
    // https://api.day.app/<key> accepts a JSON POST with title/body.
    for (const body of splitMessage(message.text, 3000)) {
      await postJson(deps, String(config.url).replace(/\/+$/, ''), { title: message.subject, body, group: 'NoNo' });
    }
    return;
  }
  throw new Error(`Unsupported channel type: ${channel.type}`);
}

async function postJson(deps: ChannelDeliveryDeps, url: string, body: unknown) {
  const response = await deps.safeRequester(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 8_000,
    maxBytes: 64 * 1024,
    maxRedirects: 0,
    allowPrivateHosts: deps.privateOutboundHosts,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`HTTP ${response.statusCode}`);
}

async function sendSmtpMail(transport: { host: string; port: number; user: string; password: string }, mail: { from: string; to: string; subject: string; text: string }) {
  const transporter = nodemailer.createTransport({
    host: transport.host,
    port: transport.port,
    secure: transport.port === 465,
    auth: transport.user && transport.password ? { user: transport.user, pass: transport.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transporter.sendMail(mail);
}

/** Bound UTF-16 length without splitting a Unicode code point. */
export function splitMessage(text: string, limit: number): string[] {
  const parts: string[] = [];
  let part = '';
  for (const character of text) {
    if (part.length + character.length > limit) { parts.push(part); part = ''; }
    part += character;
  }
  if (part || !parts.length) parts.push(part);
  return parts;
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}
