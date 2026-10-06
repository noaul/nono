ALTER TABLE "Link" ADD COLUMN "readLaterAt" TIMESTAMP(3),
ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "Link_readLaterAt_idx" ON "Link"("readLaterAt");
