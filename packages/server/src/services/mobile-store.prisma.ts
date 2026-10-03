import type { PrismaClient } from '../generated/prisma/client.js';
import { emptyStatusCounts, outcomePatch, type MobileDeviceRecord, type MobileDeviceTx, type MobileDeviceWithSession, type MobilePushStatus, type MobileStore } from './mobile-store.js';

type Db = Pick<PrismaClient, 'mobileDevice' | 'authSession'>;

const withSession = { session: { select: { expiresAt: true } } } as const;

function toDevice(row: any): MobileDeviceRecord {
  const { session: _session, ...device } = row;
  return device as MobileDeviceRecord;
}

function toDeviceWithSession(row: any): MobileDeviceWithSession {
  return { ...toDevice(row), sessionExpiresAt: row.session?.expiresAt ?? null };
}

function deviceTx(db: Db): MobileDeviceTx {
  return {
    async sessionExpiresAt(sessionId) {
      return (await db.authSession.findUnique({ where: { id: sessionId }, select: { expiresAt: true } }))?.expiresAt ?? null;
    },
    async findDeviceByHash(provider, registrationHash) {
      const row = await db.mobileDevice.findUnique({ where: { provider_registrationHash: { provider, registrationHash } }, include: withSession });
      return row ? toDeviceWithSession(row) : null;
    },
    async findDeviceByInstallation(userId, installationId) {
      const row = await db.mobileDevice.findUnique({ where: { userId_installationId: { userId, installationId } } });
      return row ? toDevice(row) : null;
    },
    async countDevices(userId) {
      return db.mobileDevice.count({ where: { userId } });
    },
    async createDevice(input) {
      return toDevice(await db.mobileDevice.create({ data: input }));
    },
    async updateDevice(id, patch) {
      return toDevice(await db.mobileDevice.update({ where: { id }, data: patch }));
    },
    async deleteDevice(id) {
      await db.mobileDevice.deleteMany({ where: { id } });
    },
  };
}

/** The relation filter excludes devices whose session was deleted (sessionId SET NULL) or expired. */
function eligibleWhere(now: Date) {
  return { enabled: true, revokedAt: null, session: { is: { expiresAt: { gt: now } } } };
}

export function createPrismaMobileStore(prisma: PrismaClient): MobileStore {
  return {
    async transaction(action) {
      return prisma.$transaction((tx) => action(deviceTx(tx as unknown as Db)));
    },
    async getDevice(id) {
      const row = await prisma.mobileDevice.findUnique({ where: { id }, include: withSession });
      return row ? toDeviceWithSession(row) : null;
    },
    async listDevices(userId) {
      const rows = await prisma.mobileDevice.findMany({ where: { userId }, include: withSession, orderBy: [{ lastRegisteredAt: 'desc' }, { id: 'asc' }] });
      return rows.map(toDeviceWithSession);
    },
    async deleteOwnedDevice(userId, id) {
      return (await prisma.mobileDevice.deleteMany({ where: { id, userId } })).count > 0;
    },
    async disableDevice(id, reason, at, revoke) {
      await prisma.$transaction([
        prisma.mobileDevice.updateMany({ where: { id }, data: { enabled: false, disabledReason: reason } }),
        ...(revoke ? [prisma.mobileDevice.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } })] : []),
        prisma.mobilePushAttempt.updateMany({ where: { deviceId: id, status: { in: ['pending', 'sending'] } }, data: { status: 'canceled', errorCode: `device-${reason}`, leaseToken: null, leaseUntil: null } }),
      ]);
    },
    async eligibleDevices(userId, now) {
      return (await prisma.mobileDevice.findMany({ where: { userId, ...eligibleWhere(now) }, orderBy: { createdAt: 'asc' } })).map(toDevice);
    },
    async eligibleDeviceUserIds(now) {
      const rows = await prisma.mobileDevice.findMany({ where: eligibleWhere(now), distinct: ['userId'], select: { userId: true }, orderBy: { userId: 'asc' } });
      return rows.map((row) => row.userId);
    },

    async upsertEvent(input) {
      const where = { userId_source_eventId: { userId: input.userId, source: input.source, eventId: input.eventId } };
      const existing = await prisma.mobileEvent.findUnique({ where });
      if (existing) return { event: existing as any, created: false };
      try {
        return { event: (await prisma.mobileEvent.create({ data: input })) as any, created: true };
      } catch (error) {
        // A concurrent enqueue of the same event won the insert.
        if ((error as { code?: string }).code !== 'P2002') throw error;
        return { event: (await prisma.mobileEvent.findUniqueOrThrow({ where })) as any, created: false };
      }
    },
    async createAttempts(event, deviceIds, now) {
      if (!deviceIds.length) return 0;
      const result = await prisma.mobilePushAttempt.createMany({
        data: [...new Set(deviceIds)].map((deviceId) => ({ eventRowId: event.id, deviceId, userId: event.userId, status: 'pending', nextAttemptAt: now })),
        skipDuplicates: true,
      });
      return result.count;
    },
    async leaseAttempts(now, limit, leaseUntil, leaseToken) {
      // One statement: rows another worker has locked are skipped, and the claimed rows are
      // re-checked by the UPDATE itself, so two workers never lease the same attempt.
      const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
        WITH due AS (
          SELECT "id" FROM "MobilePushAttempt"
          WHERE ("status" = 'pending' AND "nextAttemptAt" <= ${now})
             OR ("status" = 'sending' AND "leaseUntil" < ${now})
          ORDER BY "nextAttemptAt" ASC, "id" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "MobilePushAttempt" AS attempt
        SET "status" = 'sending', "leaseUntil" = ${leaseUntil}, "leaseToken" = ${leaseToken},
            "attempts" = attempt."attempts" + 1, "updatedAt" = ${now}
        FROM due WHERE attempt."id" = due."id"
        RETURNING attempt."id"`;
      if (!claimed.length) return [];
      const rows = await prisma.mobilePushAttempt.findMany({
        where: { id: { in: claimed.map((row) => row.id) }, leaseToken },
        include: { event: true, device: { include: withSession } },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(({ event, device, ...attempt }) => ({ attempt: attempt as any, event: event as any, device: toDeviceWithSession(device) }));
    },
    async finishAttempt(id, leaseToken, outcome, now) {
      const result = await prisma.mobilePushAttempt.updateMany({ where: { id, leaseToken, status: 'sending', leaseUntil: { gt: now } }, data: outcomePatch(outcome, now) });
      return result.count === 1;
    },
    async expireAttempts(now) {
      return (await prisma.mobilePushAttempt.updateMany({ where: { status: 'pending', event: { expiresAt: { lte: now } } }, data: { status: 'expired', errorCode: 'expired' } })).count;
    },
    async cancelInactiveEvents(userId, sources, activeEventIds, now, code) {
      return prisma.$transaction(async tx => {
        const eventFilter = { userId, source: { in: sources }, eventId: { notIn: activeEventIds } };
        await tx.mobileEvent.updateMany({ where: { ...eventFilter, expiresAt: { gt: now } }, data: { expiresAt: now } });
        return (await tx.mobilePushAttempt.updateMany({
          where: { userId, status: { in: ['pending', 'sending'] }, event: eventFilter },
          data: { status: 'canceled', errorCode: code, leaseToken: null, leaseUntil: null },
        })).count;
      });
    },
    async purgeEvents(expiredBefore) {
      return (await prisma.mobileEvent.deleteMany({ where: { expiresAt: { lt: expiredBefore } } })).count;
    },
    async findEvent(userId, eventId) {
      return (await prisma.mobileEvent.findFirst({ where: { userId, eventId }, orderBy: { id: 'desc' } })) as any;
    },
    async findAttempt(eventRowId, deviceId) {
      return (await prisma.mobilePushAttempt.findUnique({ where: { eventRowId_deviceId: { eventRowId, deviceId } } })) as any;
    },
    async markOpened(attemptId, at) {
      await prisma.mobilePushAttempt.updateMany({ where: { id: attemptId, openedAt: null }, data: { openedAt: at } });
    },
    async listAttempts(userId, limit) {
      return (await prisma.mobilePushAttempt.findMany({ where: { userId }, include: { event: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: limit })) as any;
    },
    async countAttempts(userId) {
      const counts = emptyStatusCounts();
      const groups = await prisma.mobilePushAttempt.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } });
      for (const group of groups) if (group.status in counts) counts[group.status as MobilePushStatus] = group._count._all;
      return counts;
    },
  };
}
