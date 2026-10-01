import type { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parseBody } from './http.js';
import { requestOutbound } from './outbound-request.js';
import { getSettings, type Settings } from './settings.js';
import type { AppContext } from './types.js';

export type NotificationChannel = 'email' | 'webhook' | 'telegram' | 'bark';
export type NotificationResult = { channel: NotificationChannel; ok: boolean; error?: string };
export type NotificationMessage = { subject: string; text: string };

const testSchema = z.object({ channel: z.enum(['email', 'webhook', 'telegram', 'bark']).optional() });

export function registerNotifyRoutes(router: Router, context: AppContext): void {
  router.post('/settings/test-notify', asyncHandler(async (req, res) => {
    const body = parseBody(testSchema, req.body ?? {});
    const name = context.product === 'yumi' ? 'Yumi' : 'NoMoney';
    const results = await notify(context, {
      subject: `${name} test notification`,
      text: `${name} can deliver notifications to this channel.`
    }, body.channel ? [body.channel] : undefined);
    res.json({ results });
  }));
}

/** Channels that have enough configuration to attempt a delivery. */
export function configuredChannels(settings: Settings): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (settings.smtpTo) channels.push('email');
  if (settings.webhookUrl) channels.push('webhook');
  if (settings.telegramBotToken && settings.telegramChatId) channels.push('telegram');
  if (settings.barkUrl) channels.push('bark');
  return channels;
}

/**
 * Sends one message to every configured channel. A failing channel does not
 * stop the others; callers decide what counts as delivered.
 */
export async function notify(context: AppContext, message: NotificationMessage, only?: NotificationChannel[]): Promise<NotificationResult[]> {
  const settings = getSettings(context);
  const channels = configuredChannels(settings).filter((channel) => !only || only.includes(channel));
  return Promise.all(channels.map(async (channel) => {
    try {
      await deliver(context, settings, channel, message);
      return { channel, ok: true };
    } catch (error) {
      return { channel, ok: false, error: error instanceof Error ? error.message : 'Delivery failed' };
    }
  }));
}

async function deliver(context: AppContext, settings: Settings, channel: NotificationChannel, message: NotificationMessage) {
  if (channel === 'email') {
    await context.mailer.send({ to: settings.smtpTo, from: settings.smtpFrom, subject: message.subject, text: message.text });
    return;
  }
  if (channel === 'webhook') {
    await post(context, settings.webhookUrl, {
      product: context.product ?? 'nomoney',
      subject: message.subject,
      text: message.text,
      // Lets Slack/Discord-style incoming webhooks render the message as-is.
      content: `${message.subject}\n\n${message.text}`
    });
    return;
  }
  if (channel === 'telegram') {
    const url = `https://api.telegram.org/bot${encodeURIComponent(settings.telegramBotToken)}/sendMessage`;
    await post(context, url, {
      chat_id: settings.telegramChatId,
      text: `${message.subject}\n\n${message.text}`.slice(0, 4000),
      disable_web_page_preview: true
    });
    return;
  }
  // Bark: https://api.day.app/<key>, which accepts a JSON POST with title/body.
  await post(context, settings.barkUrl.replace(/\/+$/, ''), {
    title: message.subject,
    body: message.text.slice(0, 3000),
    group: context.product === 'yumi' ? 'Yumi' : 'NoMoney'
  });
}

async function post(context: AppContext, url: string, body: unknown) {
  const response = await requestOutbound(context, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }, { timeoutMs: 8_000, maxBytes: 64 * 1024, maxRedirects: 0 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
