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

  // Outbox
  /** Inserts the event unless (userId, source, eventId) already exists; returns the stored row. */
  upsertEvent(input: MobileEventCreate): Promise<{ event: MobileEventRecord; created: boolean }>;
  /** One pending attempt per device; existing (event, device) pairs are left alone. Returns how many were created. */
  createAttempts(event: MobileEventRecord, deviceIds: string[], now: Date): Promise<number>;
  /**
   * Atomically claims up to `limit` due attempts (pending and due, or sending with an expired
   * lease), marks them sending under `leaseToken` until `leaseUntil` and counts the attempt.
   */
  leaseAttempts(now: Date, limit: number, leaseUntil: Date, leaseToken: string): Promise<LeasedAttempt[]>;
  /** Applies the outcome only while the caller still holds the lease; false when it was lost. */
  finishAttempt(id: string, leaseToken: string, patch: AttemptOutcome, now: Date): Promise<boolean>;
  /** Pending attempts whose event has expired become expired. */
  expireAttempts(now: Date): Promise<number>;
  /** Cancels pending attempts of `userId`'s events from `sources` whose eventId is not in `activeEventIds`. */
  cancelInactiveEvents(userId: number, sources: string[], activeEventIds: string[], now: Date, code: string): Promise<number>;
  /** Deletes events (and their attempts) that expired before the cutoff. */
  purgeEvents(expiredBefore: Date): Promise<number>;
  findEvent(userId: number, eventId: string): Promise<MobileEventRecord | null>;
  findAttempt(eventRowId: number, deviceId: string): Promise<MobilePushAttemptRecord | null>;
  /** Records the first open; later calls are no-ops. */
  markOpened(attemptId: string, at: Date): Promise<void>;
  listAttempts(userId: number, limit: number): Promise<Array<MobilePushAttemptRecord & { event: MobileEventRecord }>>;
  countAttempts(userId: number): Promise<Record<MobilePushStatus, number>>;
}

export const MOBILE_PUSH_STATUSES = ['pending', 'sending', 'accepted', 'failed', 'canceled', 'expired'] as const;
export type MobilePushStatus = typeof MOBILE_PUSH_STATUSES[number];

export interface MobileEventRecord {
  id: number;
  userId: number;
  source: string;
  eventId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  targetPath: string;
  occurredAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export type MobileEventCreate = Omit<MobileEventRecord, 'id' | 'createdAt'>;

export interface MobilePushAttemptRecord {
  id: string;
  eventRowId: number;
  deviceId: string;
  userId: number;
  status: MobilePushStatus;
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil: Date | null;
  leaseToken: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  acceptedAt: Date | null;
  openedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeasedAttempt {
  attempt: MobilePushAttemptRecord;
  event: MobileEventRecord;
  device: MobileDeviceWithSession;
}

export type AttemptOutcome =
  | { status: 'accepted'; providerMessageId: string }
  | { status: 'pending'; nextAttemptAt: Date; errorCode: string }
  | { status: 'failed' | 'canceled' | 'expired'; errorCode: string };

export function emptyStatusCounts(): Record<MobilePushStatus, number> {
  return Object.fromEntries(MOBILE_PUSH_STATUSES.map((status) => [status, 0])) as Record<MobilePushStatus, number>;
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
  events: MobileEventRecord[] = [];
  attempts: MobilePushAttemptRecord[] = [];

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
      this.attempts = this.attempts.filter((item) => item.deviceId !== id);
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
    for (const attempt of this.attempts) {
      if (attempt.deviceId === id && ['pending', 'sending'].includes(attempt.status)) Object.assign(attempt, { status: 'canceled', errorCode: `device-${reason}`, leaseToken: null, leaseUntil: null, updatedAt: at });
    }
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

  private liveEvents() {
    return this.events.filter((event) => this.userExists(event.userId));
  }

  async upsertEvent(input: MobileEventCreate) {
    const existing = this.liveEvents().find((event) => event.userId === input.userId && event.source === input.source && event.eventId === input.eventId);
    if (existing) return { event: { ...existing }, created: false };
    const event: MobileEventRecord = { ...input, id: this.events.reduce((max, item) => Math.max(max, item.id), 0) + 1, createdAt: new Date() };
    this.events.push(event);
    return { event: { ...event }, created: true };
  }

  async createAttempts(event: MobileEventRecord, deviceIds: string[], now: Date) {
    let created = 0;
    for (const deviceId of new Set(deviceIds)) {
      if (this.attempts.some((attempt) => attempt.eventRowId === event.id && attempt.deviceId === deviceId)) continue;
      this.attempts.push({
        id: randomUUID(), eventRowId: event.id, deviceId, userId: event.userId, status: 'pending', attempts: 0, nextAttemptAt: now,
        leaseUntil: null, leaseToken: null, providerMessageId: null, errorCode: null, acceptedAt: null, openedAt: null, createdAt: now, updatedAt: now,
      });
      created += 1;
    }
    return created;
  }

  async leaseAttempts(now: Date, limit: number, leaseUntil: Date, leaseToken: string) {
    const due = this.attempts
      .filter((attempt) => (attempt.status === 'pending' && attempt.nextAttemptAt <= now) || (attempt.status === 'sending' && attempt.leaseUntil !== null && attempt.leaseUntil < now))
      .sort((left, right) => left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime() || left.id.localeCompare(right.id))
      .slice(0, limit);
    const leased: LeasedAttempt[] = [];
    for (const attempt of due) {
      Object.assign(attempt, { status: 'sending', leaseUntil, leaseToken, attempts: attempt.attempts + 1, updatedAt: now });
      const event = this.events.find((item) => item.id === attempt.eventRowId)!;
      const device = this.devices.find((item) => item.id === attempt.deviceId)!;
      leased.push({ attempt: { ...attempt }, event: { ...event }, device: this.withSession(device) });
    }
    return leased;
  }

  async finishAttempt(id: string, leaseToken: string, outcome: AttemptOutcome, now: Date) {
    const attempt = this.attempts.find((item) => item.id === id && item.status === 'sending' && item.leaseToken === leaseToken && item.leaseUntil !== null && item.leaseUntil > now);
    if (!attempt) return false;
    Object.assign(attempt, outcomePatch(outcome, now));
    return true;
  }

  async expireAttempts(now: Date) {
    let count = 0;
    for (const attempt of this.attempts) {
      const event = this.events.find((item) => item.id === attempt.eventRowId);
      if (attempt.status === 'pending' && event && event.expiresAt <= now) {
        Object.assign(attempt, { status: 'expired', errorCode: 'expired', updatedAt: now });
        count += 1;
      }
    }
    return count;
  }

  async cancelInactiveEvents(userId: number, sources: string[], activeEventIds: string[], now: Date, code: string) {
    const active = new Set(activeEventIds);
    const stale = new Set(this.events.filter((event) => event.userId === userId && sources.includes(event.source) && !active.has(event.eventId)).map((event) => event.id));
    for (const event of this.events) if (stale.has(event.id) && event.expiresAt > now) event.expiresAt = now;
    let count = 0;
    for (const attempt of this.attempts) {
      if (['pending', 'sending'].includes(attempt.status) && stale.has(attempt.eventRowId)) {
        Object.assign(attempt, { status: 'canceled', errorCode: code, leaseToken: null, leaseUntil: null, updatedAt: now });
        count += 1;
      }
    }
    return count;
  }

  async purgeEvents(expiredBefore: Date) {
    const doomed = new Set(this.events.filter((event) => event.expiresAt < expiredBefore).map((event) => event.id));
    this.events = this.events.filter((event) => !doomed.has(event.id));
    this.attempts = this.attempts.filter((attempt) => !doomed.has(attempt.eventRowId));
    return doomed.size;
  }

  async findEvent(userId: number, eventId: string) {
    const event = this.liveEvents().filter((item) => item.userId === userId && item.eventId === eventId).sort((left, right) => right.id - left.id)[0];
    return event ? { ...event } : null;
  }

  async findAttempt(eventRowId: number, deviceId: string) {
    const attempt = this.attempts.find((item) => item.eventRowId === eventRowId && item.deviceId === deviceId);
    return attempt ? { ...attempt } : null;
  }

  async markOpened(attemptId: string, at: Date) {
    const attempt = this.attempts.find((item) => item.id === attemptId);
    if (attempt && !attempt.openedAt) Object.assign(attempt, { openedAt: at, updatedAt: at });
  }

  async listAttempts(userId: number, limit: number) {
    return this.attempts
      .filter((attempt) => attempt.userId === userId && this.userExists(userId))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, limit)
      .map((attempt) => ({ ...attempt, event: { ...this.events.find((event) => event.id === attempt.eventRowId)! } }));
  }

  async countAttempts(userId: number) {
    const counts = emptyStatusCounts();
    for (const attempt of this.attempts) if (attempt.userId === userId) counts[attempt.status] += 1;
    return counts;
  }
}

/** Shared by both stores so a finished attempt always drops its lease the same way. */
export function outcomePatch(outcome: AttemptOutcome, now: Date) {
  const base = { status: outcome.status, leaseUntil: null, leaseToken: null, updatedAt: now };
  if (outcome.status === 'accepted') return { ...base, providerMessageId: outcome.providerMessageId, acceptedAt: now, errorCode: null };
  if (outcome.status === 'pending') return { ...base, nextAttemptAt: outcome.nextAttemptAt, errorCode: outcome.errorCode };
  return { ...base, errorCode: outcome.errorCode };
}
