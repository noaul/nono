import type { AppContext, Notifier, RelayMessage } from './types.js';

export type NotificationResult = { channel: 'nono'; ok: boolean; error?: string };
export type NotificationMessage = Omit<RelayMessage, 'severity'> & { severity?: RelayMessage['severity'] };

/**
 * Sends one message through NoNo's notification center. Email, webhook, Telegram and Bark are
 * configured there once for every product; a failure is reported rather than thrown so the caller
 * can leave reminders and alerts queued for the next run.
 */
export async function notify(context: AppContext, message: NotificationMessage): Promise<NotificationResult[]> {
  try {
    await context.notifier.send({ severity: 'warning', ...message });
    return [{ channel: 'nono', ok: true }];
  } catch (error) {
    return [{ channel: 'nono', ok: false, error: error instanceof Error ? error.message : 'Delivery failed' }];
  }
}

interface NonoNotifierOptions {
  baseUrl: string;
  internalToken: string;
  product: 'nomoney' | 'yumi';
  fetch?: typeof fetch;
}

export function createNonoNotifier(options: NonoNotifierOptions): Notifier {
  const fetcher = options.fetch ?? fetch;
  const sent: RelayMessage[] = [];
  return {
    sent,
    async send(message) {
      const response = await fetcher(`${options.baseUrl}/api/internal/notifications/relay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nono-internal-token': options.internalToken },
        body: JSON.stringify({ product: options.product, ...message }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message || `NoNo notification relay failed with HTTP ${response.status}`);
      }
      sent.push(message);
    }
  };
}
