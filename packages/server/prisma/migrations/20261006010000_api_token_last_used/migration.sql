ALTER TABLE "ApiToken" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");
