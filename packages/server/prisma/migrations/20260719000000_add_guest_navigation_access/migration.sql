ALTER TABLE "Site"
ADD COLUMN "guestAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "guestAccessPasswordHash" TEXT;
