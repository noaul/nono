import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { isDeviceEligible, type MobileDeviceRecord, type MobileDeviceWithSession, type MobileProvider, type MobileStore } from './mobile-store.js';

export const MOBILE_PROVIDERS = ['xiaomi'] as const satisfies readonly MobileProvider[];
export const MAX_MOBILE_DEVICES_PER_USER = 10;

export interface RegisterDeviceInput {
  installationId: string;
  provider: MobileProvider;
  registrationId: string;
  appVersion: string;
}

export interface RegisteredDevice {
  deviceId: string;
  /** Shown exactly once; lets the phone disable this binding later without a session. */
  revokeToken: string;
  sessionExpiresAt: Date;
}

export interface MobileDeviceView {
  id: string;
  provider: MobileProvider;
  installationId: string;
  appVersion: string;
  enabled: boolean;
  revokedAt: Date | null;
  disabledReason: string | null;
  lastRegisteredAt: Date;
  createdAt: Date;
  sessionExpiresAt: Date | null;
  currentSession: boolean;
  eligible: boolean;
}

export interface MobileDeviceService {
  register(userId: number, sessionId: string, input: RegisterDeviceInput): Promise<RegisteredDevice>;
  list(userId: number, currentSessionId: string | null): Promise<MobileDeviceView[]>;
  remove(userId: number, id: string): Promise<boolean>;
  /** Disables the device when the token matches; silent either way so callers learn nothing. */
  revoke(deviceId: string, revokeToken: string): Promise<void>;
  getEligibleDevices(userId: number, now: Date): Promise<MobileDeviceRecord[]>;
  decryptRegistration(device: Pick<MobileDeviceRecord, 'registrationCiphertext'>): string;
}

export function registrationHash(provider: MobileProvider, registrationId: string, encryptionKey: string) {
  // Keyed so a database dump alone cannot be used to confirm a guessed vendor token.
  const key = createHash('sha256').update(`nono-mobile-registration:${encryptionKey}`).digest();
  return createHmac('sha256', key).update(`${provider}\n${registrationId}`).digest('hex');
}

export function hashRevokeToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createMobileDeviceService(options: { store: MobileStore; encryptionKey: string; now?: () => Date }): MobileDeviceService {
  const { store, encryptionKey } = options;
  const now = options.now || (() => new Date());

  async function registerOnce(userId: number, sessionId: string, input: RegisterDeviceInput) {
    const current = now();
    const hash = registrationHash(input.provider, input.registrationId, encryptionKey);
    const revokeToken = `nono_mrv_${randomBytes(32).toString('base64url')}`;
    return store.transaction(async (tx) => {
      const sessionExpiresAt = await tx.sessionExpiresAt(sessionId);
      if (!sessionExpiresAt || sessionExpiresAt <= current) throw httpError(401, 'Authentication required');

      const mine = await tx.findDeviceByInstallation(userId, input.installationId);
      const holder = await tx.findDeviceByHash(input.provider, hash);
      if (holder && holder.id !== mine?.id) {
        // Another account may only lose this token once its binding can no longer receive pushes
        // (revoked, disabled or its session ended). Otherwise it must be revoked first.
        if (holder.userId !== userId && isDeviceEligible(holder, current)) {
          throw httpError(409, 'This phone is still bound to another account; sign out there or revoke it first');
        }
        await tx.deleteDevice(holder.id);
      }

      const fields = {
        sessionId,
        provider: input.provider,
        registrationCiphertext: encryptSecret(input.registrationId, encryptionKey),
        registrationHash: hash,
        revokeTokenHash: hashRevokeToken(revokeToken),
        appVersion: input.appVersion,
        lastRegisteredAt: current,
      };
      let device: MobileDeviceRecord;
      if (mine) {
        device = await tx.updateDevice(mine.id, { ...fields, enabled: true, revokedAt: null, disabledReason: null });
      } else {
        if (await tx.countDevices(userId) >= MAX_MOBILE_DEVICES_PER_USER) {
          throw httpError(409, `At most ${MAX_MOBILE_DEVICES_PER_USER} phones can be bound; remove an old one first`);
        }
        device = await tx.createDevice({ ...fields, userId, installationId: input.installationId });
      }
      return { deviceId: device.id, revokeToken, sessionExpiresAt };
    });
  }

  return {
    async register(userId, sessionId, input) {
      try {
        return await registerOnce(userId, sessionId, input);
      } catch (error) {
        // Two concurrent registrations of the same token or installation: the loser retries once
        // and then sees the winner's row.
        if ((error as { code?: string }).code !== 'P2002') throw error;
        return registerOnce(userId, sessionId, input);
      }
    },

    async list(userId, currentSessionId) {
      const current = now();
      return (await store.listDevices(userId)).map((device) => publicDevice(device, currentSessionId, current));
    },

    remove(userId, id) {
      return store.deleteOwnedDevice(userId, id);
    },

    async revoke(deviceId, revokeToken) {
      const supplied = Buffer.from(hashRevokeToken(revokeToken), 'hex');
      const device = await store.getDevice(deviceId);
      const expected = Buffer.from(device?.revokeTokenHash || '0'.repeat(64), 'hex');
      const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
      if (device && matches) await store.disableDevice(device.id, 'revoked', now(), true);
    },

    getEligibleDevices(userId, at) {
      return store.eligibleDevices(userId, at);
    },

    decryptRegistration(device) {
      return decryptSecret(device.registrationCiphertext, encryptionKey);
    },
  };
}

/** Never includes the vendor token, its hash or the revoke credential. */
export function publicDevice(device: MobileDeviceWithSession, currentSessionId: string | null, now: Date): MobileDeviceView {
  return {
    id: device.id,
    provider: device.provider,
    installationId: device.installationId,
    appVersion: device.appVersion,
    enabled: device.enabled,
    revokedAt: device.revokedAt,
    disabledReason: device.disabledReason,
    lastRegisteredAt: device.lastRegisteredAt,
    createdAt: device.createdAt,
    sessionExpiresAt: device.sessionExpiresAt,
    currentSession: Boolean(currentSessionId && device.sessionId === currentSessionId),
    eligible: isDeviceEligible(device, now),
  };
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
