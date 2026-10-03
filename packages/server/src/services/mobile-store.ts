import { randomUUID } from 'node:crypto';
import type { AuthSessionRecord, UserRecord } from './repository.js';

/**
 * Storage for the mobile push feature. Kept apart from the main Repository so the mobile tables
 * can evolve without touching every repository implementation. Two implementations exist:
 * MemoryMobileStore (tests, paired with MemoryRepository's sessions) and the Prisma store in
 * mobile-store.prisma.ts. Concurrency-sensitive behaviour (leases) is verified against real
 * PostgreSQL in tests/integration/postgres.mts.
 */

export type MobileProvider = 'xiaomi';

export interface MobileDeviceRecord {
  id: string;
  userId: number;
  sessionId: string | null;
  installationId: string;
  provider: MobileProvider;
  registrationCiphertext: string;
  registrationHash: string;
  revokeTokenHash: string;
  enabled: boolean;
  revokedAt: Date | null;
  disabledReason: string | null;
  appVersion: string;
  lastRegisteredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MobileDeviceWithSession extends MobileDeviceRecord {
  /** Expiry of the linked browser session; null once that session is gone. */
  sessionExpiresAt: Date | null;
}

export type MobileDeviceCreate = Omit<MobileDeviceRecord, 'id' | 'createdAt' | 'updatedAt' | 'revokedAt' | 'disabledReason' | 'enabled'>;
export type MobileDevicePatch = Partial<Omit<MobileDeviceRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;

/** Operations available inside a device registration transaction. */
export interface MobileDeviceTx {
  sessionExpiresAt(sessionId: string): Promise<Date | null>;
  findDeviceByHash(provider: MobileProvider, registrationHash: string): Promise<MobileDeviceWithSession | null>;
  findDeviceByInstallation(userId: number, installationId: string): Promise<MobileDeviceRecord | null>;
  countDevices(userId: number): Promise<number>;
  createDevice(input: MobileDeviceCreate): Promise<MobileDeviceRecord>;
  updateDevice(id: string, patch: MobileDevicePatch): Promise<MobileDeviceRecord>;
  deleteDevice(id: string): Promise<void>;
}

export interface MobileStore {
  transaction<T>(action: (tx: MobileDeviceTx) => Promise<T>): Promise<T>;
  getDevice(id: string): Promise<MobileDeviceWithSession | null>;
  listDevices(userId: number): Promise<MobileDeviceWithSession[]>;
  /** Deletes a device owned by userId; false when it does not exist or belongs to someone else. */
  deleteOwnedDevice(userId: number, id: string): Promise<boolean>;
  /** Disables (and optionally revokes) a device. */
  disableDevice(id: string, reason: string, at: Date, revoke: boolean): Promise<void>;
  /** Enabled, unrevoked devices whose linked session still exists and has not expired. */
  eligibleDevices(userId: number, now: Date): Promise<MobileDeviceRecord[]>;
  /** Users that own at least one eligible device. */
  eligibleDeviceUserIds(now: Date): Promise<number[]>;
}

export function isDeviceEligible(device: Pick<MobileDeviceWithSession, 'enabled' | 'revokedAt' | 'sessionExpiresAt'>, now: Date) {
  return device.enabled && !device.revokedAt && Boolean(device.sessionExpiresAt && device.sessionExpiresAt > now);
}

type MemoryAuthState = { sessions: AuthSessionRecord[]; users: UserRecord[] };

/**
 * In-memory store for tests. Session links are resolved against the MemoryRepository it is given,
 * which mirrors the database's ON DELETE SET NULL: a device whose session row is gone has no
 * session.
 */
export class MemoryMobileStore implements MobileStore {
  devices: MobileDeviceRecord[] = [];

  constructor(protected readonly auth: MemoryAuthState) {}

  protected session(sessionId: string | null) {
    if (!sessionId) return null;
    return this.auth.sessions.find((session) => session.id === sessionId) || null;
  }

  protected userExists(userId: number) {
    return this.auth.users.some((user) => user.id === userId);
  }

  protected withSession(device: MobileDeviceRecord): MobileDeviceWithSession {
    const session = this.session(device.sessionId);
    return { ...device, sessionId: session ? device.sessionId : null, sessionExpiresAt: session?.expiresAt ?? null };
  }

  protected liveDevices() {
    return this.devices.filter((device) => this.userExists(device.userId));
  }

  private readonly tx: MobileDeviceTx = {
    sessionExpiresAt: async (sessionId) => this.session(sessionId)?.expiresAt ?? null,
    findDeviceByHash: async (provider, registrationHash) => {
      const device = this.liveDevices().find((item) => item.provider === provider && item.registrationHash === registrationHash);
      return device ? this.withSession(device) : null;
    },
    findDeviceByInstallation: async (userId, installationId) => this.liveDevices().find((item) => item.userId === userId && item.installationId === installationId) || null,
    countDevices: async (userId) => this.liveDevices().filter((item) => item.userId === userId).length,
    createDevice: async (input) => {
      const now = new Date();
      if (this.devices.some((item) => item.provider === input.provider && item.registrationHash === input.registrationHash)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      const device: MobileDeviceRecord = { ...input, id: randomUUID(), enabled: true, revokedAt: null, disabledReason: null, createdAt: now, updatedAt: now };
      this.devices.push(device);
      return { ...device };
    },
    updateDevice: async (id, patch) => {
      const device = this.devices.find((item) => item.id === id);
      if (!device) throw Object.assign(new Error('Mobile device not found'), { statusCode: 404 });
      Object.assign(device, patch, { updatedAt: new Date() });
      return { ...device };
    },
    deleteDevice: async (id) => {
      this.devices = this.devices.filter((item) => item.id !== id);
    },
  };

  async transaction<T>(action: (tx: MobileDeviceTx) => Promise<T>) {
    return action(this.tx);
  }

  async getDevice(id: string) {
    const device = this.liveDevices().find((item) => item.id === id);
    return device ? this.withSession(device) : null;
  }

  async listDevices(userId: number) {
    return this.liveDevices()
      .filter((device) => device.userId === userId)
      .sort((left, right) => right.lastRegisteredAt.getTime() - left.lastRegisteredAt.getTime())
      .map((device) => this.withSession(device));
  }

  async deleteOwnedDevice(userId: number, id: string) {
    const device = this.liveDevices().find((item) => item.id === id && item.userId === userId);
    if (!device) return false;
    await this.tx.deleteDevice(id);
    return true;
  }

  async disableDevice(id: string, reason: string, at: Date, revoke: boolean) {
    const device = this.devices.find((item) => item.id === id);
    if (!device) return;
    Object.assign(device, { enabled: false, disabledReason: reason, updatedAt: at }, revoke && !device.revokedAt ? { revokedAt: at } : {});
  }

  async eligibleDevices(userId: number, now: Date) {
    return this.liveDevices()
      .filter((device) => device.userId === userId && isDeviceEligible(this.withSession(device), now))
      .map((device) => ({ ...device }));
  }

  async eligibleDeviceUserIds(now: Date) {
    const ids = new Set(this.liveDevices().filter((device) => isDeviceEligible(this.withSession(device), now)).map((device) => device.userId));
    return [...ids].sort((left, right) => left - right);
  }
}
