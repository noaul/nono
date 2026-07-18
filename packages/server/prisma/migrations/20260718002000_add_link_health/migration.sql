ALTER TABLE "Link"
ADD COLUMN "healthStatus" TEXT,
ADD COLUMN "healthStatusCode" INTEGER,
ADD COLUMN "healthReason" TEXT,
ADD COLUMN "healthFinalUrl" TEXT,
ADD COLUMN "healthCheckedAt" TIMESTAMP(3);

CREATE INDEX "Link_healthCheckedAt_idx" ON "Link"("healthCheckedAt");
