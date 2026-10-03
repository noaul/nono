-- Durable mobile push outbox: pushable events and one delivery attempt per (event, device). Additive only.
CREATE TABLE "MobileEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "targetPath" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobilePushAttempt" (
    "id" TEXT NOT NULL,
    "eventRowId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileEvent_userId_source_eventId_key" ON "MobileEvent"("userId", "source", "eventId");
CREATE INDEX "MobileEvent_userId_eventId_idx" ON "MobileEvent"("userId", "eventId");
CREATE INDEX "MobileEvent_expiresAt_idx" ON "MobileEvent"("expiresAt");
CREATE UNIQUE INDEX "MobilePushAttempt_eventRowId_deviceId_key" ON "MobilePushAttempt"("eventRowId", "deviceId");
CREATE INDEX "MobilePushAttempt_status_nextAttemptAt_idx" ON "MobilePushAttempt"("status", "nextAttemptAt");
CREATE INDEX "MobilePushAttempt_deviceId_status_idx" ON "MobilePushAttempt"("deviceId", "status");
CREATE INDEX "MobilePushAttempt_userId_updatedAt_idx" ON "MobilePushAttempt"("userId", "updatedAt");

ALTER TABLE "MobileEvent" ADD CONSTRAINT "MobileEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushAttempt" ADD CONSTRAINT "MobilePushAttempt_eventRowId_fkey" FOREIGN KEY ("eventRowId") REFERENCES "MobileEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushAttempt" ADD CONSTRAINT "MobilePushAttempt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
