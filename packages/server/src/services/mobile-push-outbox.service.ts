import { randomUUID } from 'node:crypto';
import { buildEnvelope, eventTtlMs, internalTargetPath, isEventId, MOBILE_SOURCES, pushDedupeKey, sanitizeErrorCode, type MobileEvent, type MobilePushProvider, type PushResult } from './mobile-events.service.js';
import { isDeviceEligible, type MobileStore, type AttemptOutcome } from './mobile-store.js';
import type { MobileDeviceService } from './mobile-devices.service.js';

const RETRY_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
export const PUSH_TIMEOUT_MS = 10_000;
export const PUSH_LEASE_MS = 60_000;
export interface MobilePushOutbox {
  readonly enabled: boolean;
  enqueue(event: MobileEvent): Promise<{ created: number }>;
  runBatch(): Promise<{ accepted: number; failed: number }>;
}

/** No provider is configured in production until a supported push service is available. */
export function createMobilePushOutbox(options: { store: MobileStore; devices: MobileDeviceService; provider?: MobilePushProvider; now?: () => Date }): MobilePushOutbox {
  const { store, devices, provider } = options;
  const now = options.now || (() => new Date());
  return {
    enabled: Boolean(provider),
    async enqueue(input) {
      if (!isEventId(input.eventId) || !MOBILE_SOURCES.includes(input.source) || !['info', 'warning', 'critical'].includes(input.severity)) throw new Error('Invalid mobile event');
      const at = now();
      const occurredAt = new Date(Math.min(input.occurredAt.getTime(), at.getTime()));
      const expiresAt = new Date(Math.min(input.expiresAt.getTime(), occurredAt.getTime() + eventTtlMs(input.severity)));
      if (!Number.isFinite(occurredAt.getTime()) || !Number.isFinite(expiresAt.getTime())) throw new Error('Invalid mobile event dates');
      const { event } = await store.upsertEvent({ ...input, occurredAt, expiresAt, title: (input.title || 'NoNo').slice(0, 300), targetPath: internalTargetPath(input.source, input.targetPath) });
      if (event.expiresAt <= at) return { created: 0 };
      const eligible = await store.eligibleDevices(input.userId, at);
      return { created: await store.createAttempts(event, eligible.map(device => device.id), at) };
    },
    async runBatch() {
      const counts = { accepted: 0, failed: 0 };
      await store.expireAttempts(now());
      if (!provider) return counts;
      // Claim one immediately before each send. A sequential batch must never let the leases of
      // later rows expire while it waits on earlier network requests.
      for (let index = 0; index < 20; index++) {
        const at = now();
        const token = randomUUID();
        const [leased] = await store.leaseAttempts(at, 1, new Date(at.getTime() + PUSH_LEASE_MS), token);
        if (!leased) break;
        const { attempt, event } = leased;
        let outcome: AttemptOutcome;
        let invalidRegistrationHash: string | null = null;
        const currentAttempt = await store.findAttempt(event.id, attempt.deviceId);
        if (currentAttempt?.status !== 'sending' || currentAttempt.leaseToken !== token) continue;
        const device = await store.getDevice(attempt.deviceId);
        if (event.expiresAt <= now()) outcome = { status: 'expired', errorCode: 'expired' };
        else if (!device || device.userId !== event.userId || !isDeviceEligible(device, now())) outcome = { status: 'canceled', errorCode: 'device-ineligible' };
        else {
          let result: PushResult;
          let timer: NodeJS.Timeout | undefined;
          try {
            const registration = devices.decryptRegistration(device);
            result = await Promise.race([
              provider.send(registration, buildEnvelope(event, pushDedupeKey(event.id, device.id))),
              new Promise<PushResult>(resolve => { timer = setTimeout(() => resolve({ status: 'retryable', code: 'timeout' }), PUSH_TIMEOUT_MS); }),
            ]);
          } catch { result = { status: 'retryable', code: 'provider-unavailable' }; }
          finally { if (timer) clearTimeout(timer); }
          if (result.status === 'accepted') outcome = { status: 'accepted', providerMessageId: result.providerMessageId.slice(0, 200) };
          else {
            const errorCode = sanitizeErrorCode(result.code);
            if (result.status === 'invalid-token') invalidRegistrationHash = device.registrationHash;
            const delay = RETRY_MS[attempt.attempts - 1];
            if (result.status === 'retryable' && delay !== undefined) {
              const nextAttemptAt = new Date(now().getTime() + delay);
              outcome = nextAttemptAt >= event.expiresAt ? { status: 'expired', errorCode } : { status: 'pending', nextAttemptAt, errorCode };
            } else outcome = { status: 'failed', errorCode };
          }
        }
        if (await store.finishAttempt(attempt.id, token, outcome, now())) {
          if (outcome.status === 'accepted') counts.accepted++;
          if (outcome.status === 'failed') counts.failed++;
          if (invalidRegistrationHash) {
            const current = await store.getDevice(attempt.deviceId);
            if (current?.registrationHash === invalidRegistrationHash) await store.disableDevice(current.id, 'invalid-token', now(), false);
          }
        }
      }
      return counts;
    },
  };
}
