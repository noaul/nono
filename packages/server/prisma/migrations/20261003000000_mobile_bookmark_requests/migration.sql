-- Idempotent bookmark saves from the Android share sheet: one row per (user, requestId), holding a
-- hash of the normalized request and the bookmark it produced. Additive only.
CREATE TABLE "MobileBookmarkRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "linkId" INTEGER,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileBookmarkRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileBookmarkRequest_userId_requestId_key" ON "MobileBookmarkRequest"("userId", "requestId");
CREATE INDEX "MobileBookmarkRequest_createdAt_idx" ON "MobileBookmarkRequest"("createdAt");

ALTER TABLE "MobileBookmarkRequest" ADD CONSTRAINT "MobileBookmarkRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
