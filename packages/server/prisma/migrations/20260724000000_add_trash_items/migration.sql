CREATE TABLE "TrashItem" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrashItem_userId_deletedAt_idx" ON "TrashItem"("userId", "deletedAt");

ALTER TABLE "TrashItem" ADD CONSTRAINT "TrashItem_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
