import type { PrismaClient } from '../generated/prisma/client.js';
import type { MobileDeviceRecord, MobileDeviceTx, MobileDeviceWithSession, MobileStore } from './mobile-store.js';

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
      await prisma.mobileDevice.updateMany({ where: { id }, data: { enabled: false, disabledReason: reason } });
      if (revoke) await prisma.mobileDevice.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
    },
    async eligibleDevices(userId, now) {
      return (await prisma.mobileDevice.findMany({ where: { userId, ...eligibleWhere(now) }, orderBy: { createdAt: 'asc' } })).map(toDevice);
    },
    async eligibleDeviceUserIds(now) {
      const rows = await prisma.mobileDevice.findMany({ where: eligibleWhere(now), distinct: ['userId'], select: { userId: true }, orderBy: { userId: 'asc' } });
      return rows.map((row) => row.userId);
    },
  };
}
