-- Android push devices bound to a NoNo browser session. Additive only.
CREATE TABLE "MobileDevice" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionId" TEXT,
    "installationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "registrationCiphertext" TEXT NOT NULL,
    "registrationHash" TEXT NOT NULL,
    "revokeTokenHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "appVersion" TEXT NOT NULL,
    "lastRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileDevice_provider_registrationHash_key" ON "MobileDevice"("provider", "registrationHash");
CREATE UNIQUE INDEX "MobileDevice_userId_installationId_key" ON "MobileDevice"("userId", "installationId");
CREATE INDEX "MobileDevice_sessionId_idx" ON "MobileDevice"("sessionId");

ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
