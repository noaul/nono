ALTER TABLE "Link"
ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastClickedAt" TIMESTAMP(3);

CREATE INDEX "Link_clickCount_lastClickedAt_idx" ON "Link"("clickCount", "lastClickedAt");
