CREATE TABLE "NotificationState" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationState_userId_key_key" ON "NotificationState"("userId", "key");
CREATE INDEX "NotificationState_userId_updatedAt_idx" ON "NotificationState"("userId", "updatedAt");

ALTER TABLE "NotificationState"
ADD CONSTRAINT "NotificationState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
